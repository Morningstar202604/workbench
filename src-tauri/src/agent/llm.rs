//! LLM 客户端：OpenAI 兼容的 /chat/completions，支持流式与 function calling。
//!
//! 兼容面：绝大多数国产与自建网关（new-api、vLLM、Ollama、LM Studio、
//! 官方 OpenAI/DeepSeek/Moonshot…）都实现同一套 chat completions 协议，
//! 因此这里只做一套实现，靠「base_url + model 名」适配。
//!
//! 密钥策略：**只在进程内存里**，从不落盘、从不进日志。
//! 前端通过 `agent_set_provider` 传进来，退出即失效。

use serde::{Deserialize, Serialize};

/// 一次会话里模型的配置。
#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct ProviderConfig {
    pub base_url: String,
    pub model: String,
    /// 只存在于运行时内存；序列化时跳过，避免被写进任何配置文件
    #[serde(skip_serializing)]
    pub api_key: String,
    /// 采样温度
    pub temperature: f32,
    /// 单次回复的 token 上限
    pub max_tokens: u32,
    /// 备用提供商：主服务超时/排队/报错时按顺序尝试。
    /// 每个条目都是完整的 base_url + model + api_key，便于跨厂商兜底。
    pub fallbacks: Vec<FallbackProvider>,
}

/// 备用提供商。
#[derive(Serialize, Deserialize, Clone, Debug, Default, ts_rs::TS)]
pub struct FallbackProvider {
    pub base_url: String,
    pub model: String,
    #[serde(skip_serializing)]
    pub api_key: String,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            base_url: String::new(),
            model: String::new(),
            api_key: String::new(),
            temperature: 0.2,
            max_tokens: 2048,
            fallbacks: Vec::new(),
        }
    }
}

/// 对话消息（OpenAI 协议）。
#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
#[serde(tag = "role", rename_all = "lowercase")]
pub enum ChatMessage {
    System {
        content: String,
    },
    User {
        content: String,
    },
    Assistant {
        #[serde(skip_serializing_if = "Option::is_none")]
        content: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_calls: Option<Vec<ToolCallWire>>,
    },
    Tool {
        tool_call_id: String,
        content: String,
    },
}

/// 模型发起的工具调用（协议格式）。
#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct ToolCallWire {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub function: FunctionCall,
}

#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

/// 模型回复。
#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct ChatReply {
    pub content: String,
    pub tool_calls: Vec<ToolCallWire>,
    /// 用量（部分网关不返回，缺省 0）
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

/// 把 base_url 归一成 chat/completions 端点。
///
/// 用户可能填 `https://api.x.com`、`https://api.x.com/`、
/// `https://api.x.com/v1`、甚至完整端点。统一处理，避免「必须粘贴精确 URL」的坑。
pub fn endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.ends_with("/chat/completions") {
        return trimmed.to_string();
    }
    if trimmed.ends_with("/v1") || trimmed.ends_with("/v3") || trimmed.ends_with("/openai") {
        return format!("{trimmed}/chat/completions");
    }
    format!("{trimmed}/v1/chat/completions")
}

/// base_url 必须是 http(s)，且不能是明显的内网探测目标之外的东西。
/// 这里只做协议校验；真正连不连得通由请求本身决定。
pub fn validate_base_url(base_url: &str) -> Result<(), String> {
    let lower = base_url.trim().to_ascii_lowercase();
    if lower.is_empty() {
        return Err("base_url 不能为空".to_string());
    }
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return Err("base_url 必须以 http:// 或 https:// 开头".to_string());
    }
    if lower.starts_with("http://") && !lower.contains("://localhost") && !lower.contains("://127.0.0.1")
    {
        // 允许本机明文（Ollama/LM Studio），但提示远程用 http 会让密钥裸奔
        log::warn!("base_url 使用明文 http，若为远程地址请改用 https: {base_url}");
    }
    Ok(())
}

/// 一次请求失败的性质，决定要不要换备用提供商。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureKind {
    /// 超时 / 连接失败 / 5xx / 429 —— 换下一个
    Transient,
    /// 4xx（鉴权失败、模型名错、参数错）—— 换也没用，直接报给用户
    Permanent,
}

/// 把错误文本归类。网关的「排队中」「无可用渠道」都算 transient。
pub fn classify_failure(err: &str) -> FailureKind {
    let lower = err.to_ascii_lowercase();
    let transient_markers = [
        "timeout",
        "timed out",
        "connection",
        "429",
        "500",
        "502",
        "503",
        "504",
        "no available channel",
        "无可用渠道",
        "rate limit",
        "overloaded",
        "busy",
        "请稍后",
    ];
    if transient_markers.iter().any(|m| lower.contains(m)) {
        FailureKind::Transient
    } else {
        FailureKind::Permanent
    }
}

/// 候选顺序（主 + 备用），空配置会被跳过。
/// 抽成纯函数是为了能脱离网络单测「故障切换的选路逻辑」。
pub fn candidate_order(cfg: &ProviderConfig) -> Vec<(String, String, String)> {
    let mut out = Vec::new();
    if !cfg.base_url.trim().is_empty() && !cfg.model.trim().is_empty() {
        out.push((cfg.base_url.clone(), cfg.model.clone(), cfg.api_key.clone()));
    }
    for f in &cfg.fallbacks {
        if !f.base_url.trim().is_empty() && !f.model.trim().is_empty() {
            out.push((f.base_url.clone(), f.model.clone(), f.api_key.clone()));
        }
    }
    out
}

/// 构造请求体（不含密钥）。
pub fn build_body(
    cfg: &ProviderConfig,
    messages: &[ChatMessage],
    tools: &[super::tools::ToolSpec],
    stream: bool,
) -> serde_json::Value {
    let mut body = serde_json::json!({
        "model": cfg.model,
        "messages": messages,
        "temperature": cfg.temperature,
        "max_tokens": cfg.max_tokens,
        "stream": stream,
    });
    if !tools.is_empty() {
        let tools_json: Vec<serde_json::Value> = tools
            .iter()
            .map(|t| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    }
                })
            })
            .collect();
        body["tools"] = serde_json::Value::Array(tools_json);
        body["tool_choice"] = serde_json::json!("auto");
    }
    body
}

/// 解析非流式响应。
pub fn parse_reply(body: &serde_json::Value) -> Result<ChatReply, String> {
    // 网关常见的错误形态：{"error": {"message": "..."}}
    if let Some(err) = body.get("error") {
        let msg = err
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("未知错误");
        return Err(format!("模型服务返回错误: {msg}"));
    }
    let choice = body
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|a| a.first())
        .ok_or_else(|| "响应缺少 choices".to_string())?;
    let message = choice
        .get("message")
        .ok_or_else(|| "响应缺少 message".to_string())?;

    let content = message
        .get("content")
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    let tool_calls = message
        .get("tool_calls")
        .and_then(|t| t.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|tc| {
                    let id = tc.get("id")?.as_str()?.to_string();
                    let f = tc.get("function")?;
                    Some(ToolCallWire {
                        id,
                        kind: "function".to_string(),
                        function: FunctionCall {
                            name: f.get("name")?.as_str()?.to_string(),
                            arguments: f
                                .get("arguments")
                                .and_then(|a| a.as_str())
                                .unwrap_or("{}")
                                .to_string(),
                        },
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let usage = body.get("usage");
    Ok(ChatReply {
        content,
        tool_calls,
        prompt_tokens: usage
            .and_then(|u| u.get("prompt_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
        completion_tokens: usage
            .and_then(|u| u.get("completion_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_normalization_covers_common_shapes() {
        assert_eq!(
            endpoint("https://api.openai.com"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            endpoint("https://api.openai.com/"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            endpoint("https://api.deepseek.com/v1"),
            "https://api.deepseek.com/v1/chat/completions"
        );
        assert_eq!(
            endpoint("https://x.com/v1/chat/completions"),
            "https://x.com/v1/chat/completions"
        );
        assert_eq!(endpoint(""), "");
    }

    #[test]
    fn rejects_invalid_base_url() {
        assert!(validate_base_url("").is_err());
        assert!(validate_base_url("ftp://x").is_err());
        assert!(validate_base_url("api.example.com").is_err());
        assert!(validate_base_url("https://api.example.com").is_ok());
        assert!(validate_base_url("http://localhost:11434").is_ok());
    }

    #[test]
    fn body_includes_tools_only_when_present() {
        let cfg = ProviderConfig {
            base_url: "https://x/v1".into(),
            model: "m".into(),
            api_key: "secret".into(),
            ..Default::default()
        };
        let no_tools = build_body(&cfg, &[], &[], false);
        assert!(no_tools.get("tools").is_none());

        let tools = super::super::tools::tool_specs();
        let with_tools = build_body(&cfg, &[], &tools, true);
        assert!(!with_tools["tools"].as_array().unwrap().is_empty());
        assert_eq!(with_tools["tool_choice"], "auto");
        // 密钥绝不能出现在请求体里（走 header）
        assert!(!with_tools.to_string().contains("secret"));
    }

    #[test]
    fn parses_plain_text_reply() {
        let body = serde_json::json!({
            "choices": [{"message": {"role": "assistant", "content": "hello"}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 3}
        });
        let reply = parse_reply(&body).unwrap();
        assert_eq!(reply.content, "hello");
        assert!(reply.tool_calls.is_empty());
        assert_eq!(reply.prompt_tokens, 10);
    }

    #[test]
    fn parses_tool_call_reply() {
        let body = serde_json::json!({
            "choices": [{"message": {
                "role": "assistant",
                "content": null,
                "tool_calls": [{
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "list_processes", "arguments": "{\"limit\":5}"}
                }]
            }}]
        });
        let reply = parse_reply(&body).unwrap();
        assert_eq!(reply.tool_calls.len(), 1);
        assert_eq!(reply.tool_calls[0].function.name, "list_processes");
    }

    /// 换家的判据必须对着**真实网关错误文本**验证：
    /// 这些字符串都是从 hcnsec / agnes 实际响应里抄下来的。
    #[test]
    fn classifies_real_gateway_errors() {
        // 排队 / 无渠道 / 限流 → 应该换下一个
        for transient in [
            "请求模型服务失败: operation timed out",
            "模型服务返回错误: No available channel for model gpt-4o-mini under group auto",
            "模型服务返回错误: 分组 default 下模型 x 无可用渠道（distributor）",
            "HTTP 503: upstream overloaded",
            "HTTP 429: rate limit exceeded",
        ] {
            assert_eq!(
                classify_failure(transient),
                FailureKind::Transient,
                "应判为可重试: {transient}"
            );
        }
        // 鉴权 / 模型名错 → 换也没用
        for permanent in [
            "模型服务返回错误: auth error: header param Authorization api_key invalid",
            "模型服务返回错误: 无效的令牌",
            "模型服务返回错误: model not found",
            "HTTP 400: invalid request",
        ] {
            assert_eq!(
                classify_failure(permanent),
                FailureKind::Permanent,
                "应判为不可重试: {permanent}"
            );
        }
    }

    #[test]
    fn fallback_config_never_leaks_keys_through_serialization() {
        let cfg = ProviderConfig {
            base_url: "https://a/v1".into(),
            model: "m".into(),
            api_key: "SECRET_PRIMARY".into(),
            fallbacks: vec![FallbackProvider {
                base_url: "https://b/v1".into(),
                model: "bm".into(),
                api_key: "SECRET_FALLBACK".into(),
            }],
            ..Default::default()
        };
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(!json.contains("SECRET_PRIMARY"), "主密钥不得出现在序列化结果里");
        assert!(!json.contains("SECRET_FALLBACK"), "备用密钥不得出现在序列化结果里");
        assert!(json.contains("https://b/v1"), "非敏感字段应保留");
    }

    #[test]
    fn candidate_order_skips_incomplete_entries() {
        let cfg = ProviderConfig {
            base_url: "https://primary/v1".into(),
            model: "pm".into(),
            api_key: "pk".into(),
            fallbacks: vec![
                FallbackProvider::default(), // 空条目应被跳过
                FallbackProvider {
                    base_url: "https://b/v1".into(),
                    model: "bm".into(),
                    api_key: "bk".into(),
                },
                FallbackProvider {
                    base_url: "https://c/v1".into(),
                    model: "".into(), // 缺模型名，跳过
                    api_key: "ck".into(),
                },
            ],
            ..Default::default()
        };
        let order = candidate_order(&cfg);
        assert_eq!(order.len(), 2, "只有完整条目的主服务与 b 参与");
        assert_eq!(order[0].1, "pm");
        assert_eq!(order[1].1, "bm");
    }

    #[test]
    fn surfaces_gateway_error_message() {
        let body = serde_json::json!({"error": {"message": "invalid api key"}});
        let err = parse_reply(&body).unwrap_err();
        assert!(err.contains("invalid api key"));
    }
}
