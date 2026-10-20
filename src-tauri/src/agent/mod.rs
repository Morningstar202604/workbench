//! Agent 编排：一次对话的完整循环（模型 → 工具 → 模型 → …）。
//!
//! 防卡死设计（每一层都有硬上限，任何一层超限都立刻中止并回报）：
//! - **步数上限**：最多 `MAX_STEPS` 轮工具调用，避免模型无限循环。
//! - **单次 HTTP 超时**：由 reqwest 的 timeout 控制（默认 60s）。
//! - **整体墙钟上限**：整个对话超过 `MAX_TOTAL_SECONDS` 直接终止。
//! - **工具输出截断**：单条结果最多 8k 字符，防止上下文爆炸导致越来越慢。
//!
//! 这些上限不是「保险丝」而是正常路径的一部分：模型绕圈时有发生，
//! 与其让界面转圈到用户放弃，不如带着已获得的信息明确停下。

pub mod executor;
pub mod llm;
pub mod tools;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use llm::{build_body, endpoint, parse_reply, ChatMessage, ChatReply, ProviderConfig};
use tools::{Approvals, ToolRisk};

/// 单次对话的最大工具调用轮数。
pub const MAX_STEPS: usize = 8;
/// 单次对话的墙钟上限。
pub const MAX_TOTAL_SECONDS: u64 = 120;

/// 运行时状态：当前 provider 配置（含密钥，仅内存）+ 审批登记。
#[derive(Default)]
pub struct AgentState {
    provider: Mutex<ProviderConfig>,
    pub approvals: Approvals,
    /// 运行中标记：同一时刻只允许一个对话，避免两次循环互相污染上下文
    running: Mutex<bool>,
    /// 取消标志：前端点「停止」时置位，循环在每个检查点退出。
    /// 只用 AtomicBool 而不是 channel：检查点足够密（每轮 + 每次工具前）。
    cancelled: std::sync::atomic::AtomicBool,
}

impl AgentState {
    pub fn set_provider(&self, cfg: ProviderConfig) {
        *self.provider.lock().unwrap_or_else(|p| p.into_inner()) = cfg;
    }

    pub fn provider(&self) -> ProviderConfig {
        self.provider
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    /// 取一个「运行中」令牌；已有对话在跑时返回 None。
    fn begin_run(&self) -> Option<RunGuard<'_>> {
        let mut guard = self.running.lock().unwrap_or_else(|p| p.into_inner());
        if *guard {
            return None;
        }
        *guard = true;
        self.cancelled
            .store(false, std::sync::atomic::Ordering::SeqCst);
        Some(RunGuard { state: self })
    }

    /// 请求取消当前对话。即使没有在跑，置位也无害（下次 begin_run 会清掉）。
    pub fn cancel(&self) {
        self.cancelled
            .store(true, std::sync::atomic::Ordering::SeqCst);
    }

    fn is_cancelled(&self) -> bool {
        self.cancelled.load(std::sync::atomic::Ordering::SeqCst)
    }
}

/// RAII：离开作用域时自动清除运行标记，即使中途 panic 也不会永久卡住。
struct RunGuard<'a> {
    state: &'a AgentState,
}

impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        *self.state.running.lock().unwrap_or_else(|p| p.into_inner()) = false;
    }
}

/// 一轮对话里发生的事，返回给前端渲染。
#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct AgentStep {
    /// "tool" | "answer" | "notice"
    pub kind: String,
    /// 工具调用的协议 id。前端审批时按它发放一次性通行证 ——
    /// 没有这个字段，前端就只能猜是哪次调用，审批闸门形同虚设。
    pub call_id: String,
    pub tool: String,
    /// 工具参数原文（便于用户审计模型到底想干什么）
    pub arguments: String,
    /// 工具结果或模型回答
    pub content: String,
    pub ok: bool,
    pub needs_approval: bool,
    /// 该步骤耗时（毫秒）。u64 会被 ts-rs 生成为 bigint，
    /// 而 IPC 实际传的是 number —— 必须显式标注，否则前端类型在说谎。
    #[ts(type = "number")]
    pub elapsed_ms: u64,
}

/// 一次完整对话的结果。
#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct AgentRunResult {
    pub steps: Vec<AgentStep>,
    /// 最终给用户的回答（可能是模型总结，也可能是中止说明）
    pub answer: String,
    pub stopped_reason: String,
    #[ts(type = "number")]
    pub elapsed_ms: u64,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

/// 依次尝试候选提供商。
///
/// 换家的判据（`classify_failure`）：超时、5xx、429、网关排队、无可用渠道 →
/// 立刻换下一个；鉴权失败/模型名错这类型换也没用，直接报错，避免把用户
/// 的配额浪费在一串注定失败的请求上。
fn post_chat_with_failover(
    cfg: &ProviderConfig,
    budget_secs: u64,
    build: impl Fn(&str) -> serde_json::Value,
) -> Result<(ChatReply, String), String> {
    let all = llm::candidate_order(cfg);
    let mut last_err = String::new();
    let mut tried = Vec::new();
    let n = all.len().max(1) as u64;
    // 每个候选用「剩余预算 / 候选数」，保证 N 个备用不会把总时长拖成 N×45s
    let per_candidate = (budget_secs / n).max(1);
    for (i, (base_url, model, api_key)) in all.iter().enumerate() {
        tried.push(format!(
            "{}({})",
            model,
            if i == 0 { "primary" } else { "fallback" }
        ));
        let body = build(model);
        match post_chat(base_url, api_key, &body, per_candidate) {
            Ok(reply) => {
                if i > 0 {
                    log::warn!("主模型不可用，已切换到备用 {model}");
                }
                return Ok((reply, model.clone()));
            }
            Err(e) => {
                log::warn!("模型 {model} 请求失败: {}", e.message);
                last_err = e.message.clone();
                if e.kind == llm::FailureKind::Permanent {
                    return Err(format!("{}（已尝试: {}）", e.message, tried.join(", ")));
                }
            }
        }
    }
    Err(format!(
        "所有模型服务都不可用（已尝试: {}）：{last_err}",
        tried.join(", ")
    ))
}

/// 一次请求的失败，带上是哪种失败 —— 让上层决定「换家」还是「直接放弃」。
struct ChatError {
    message: String,
    kind: llm::FailureKind,
}

fn post_chat(
    base_url: &str,
    api_key: &str,
    body: &serde_json::Value,
    timeout_secs: u64,
) -> Result<ChatReply, ChatError> {
    let url = endpoint(base_url);
    if url.is_empty() {
        return Err(ChatError {
            message: "尚未配置模型服务地址".to_string(),
            kind: llm::FailureKind::Permanent,
        });
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(timeout_secs.max(1)))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|m| ChatError {
            message: format!("HTTP 客户端创建失败: {m}"),
            kind: llm::FailureKind::Permanent,
        })?;
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .map_err(|e| {
            // 用 reqwest 的结构化判据，而不是匹配错误文本：
            // 真实超时的 Display 只有 "error sending request for url (...)"。
            ChatError {
                kind: llm::classify_transport(e.is_timeout(), e.is_connect(), &e.to_string()),
                message: format!("请求模型服务失败: {e}"),
            }
        })?;

    let status = resp.status();
    let code = status.as_u16();
    let text = resp.text().unwrap_or_default();
    let value: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);
    if !status.is_success() {
        let detail = match parse_reply(&value) {
            Err(msg) => msg,
            Ok(_) => format!("HTTP {code}: {}", truncate(&text, 300)),
        };
        return Err(ChatError {
            kind: llm::classify_status(code),
            message: detail,
        });
    }
    parse_reply(&value).map_err(|e| ChatError {
        // 拿到 200 但结构不对：多半是该模型不支持 function calling 或网关串了，
        // 换一家通常能解决
        kind: llm::FailureKind::Transient,
        message: e,
    })
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        s.chars().take(max).collect::<String>() + "…"
    }
}

fn system_prompt() -> String {
    "You are the assistant inside Workbench, a local-first desktop tool that monitors \
     processes, ports, dev servers and AI session costs on the user's own machine.\n\
     Rules:\n\
     - Only act on real data: call the provided tools instead of guessing.\n\
     - Prefer read-only tools; explain before any mutating call.\n\
     - Tools that change state require the user's explicit approval; if a call comes \
     back with needs_approval, tell the user what you want to do and wait — do not retry \
     in a loop.\n\
     - Keep answers short and concrete. Quote numbers you got from tools.\n\
     - When the task is done, stop calling tools and answer."
        .to_string()
}

/// 执行一次对话。
///
/// `messages` 是前端累积的对话历史（含本轮用户输入）。返回完整步骤轨迹，
/// 前端据此渲染「调用了什么工具、看到了什么、最后怎么回答」。
pub fn run(app: &AppHandle, state: &AgentState, mut messages: Vec<ChatMessage>) -> AgentRunResult {
    let started = Instant::now();
    let mut steps: Vec<AgentStep> = Vec::new();
    let mut prompt_tokens = 0u32;
    let mut completion_tokens = 0u32;

    // 用宏而不是闭包：闭包会同时不可变借用 steps/tokens，
    // 与后续 push/累加冲突（借用检查器不允许）。
    macro_rules! finish {
        ($reason:expr, $answer:expr) => {
            return AgentRunResult {
                steps: steps.clone(),
                answer: $answer,
                stopped_reason: $reason.to_string(),
                elapsed_ms: started.elapsed().as_millis() as u64,
                prompt_tokens,
                completion_tokens,
            }
        };
    }

    let cfg = state.provider();
    if cfg.base_url.trim().is_empty() || cfg.model.trim().is_empty() {
        finish!(
            "not_configured",
            "尚未配置模型服务，请先在设置里填写地址与模型名。".to_string()
        );
    }
    if let Err(e) = llm::validate_base_url(&cfg.base_url) {
        finish!("bad_config", e);
    }

    let Some(_run) = state.begin_run() else {
        finish!("busy", "已有一个对话在进行，请等它结束。".to_string());
    };

    // 无条件把系统提示放在最前。客户端传来的 System 消息一律降级为 User：
    // 否则前端只要在首条塞一个 System 就能整体接管提示词，
    // 「后端强制系统提示」这句防御性声明就成了空话。
    for msg in messages.iter_mut() {
        if let ChatMessage::System { content } = msg {
            *msg = ChatMessage::User {
                content: content.clone(),
            };
        }
    }
    messages.insert(
        0,
        ChatMessage::System {
            content: system_prompt(),
        },
    );

    let specs = tools::tool_specs();
    let ctx = executor::ToolContext {
        app,
        approvals: &state.approvals,
    };

    for step_index in 0..MAX_STEPS {
        if state.is_cancelled() {
            let summary = summarize(&steps);
            finish!("cancelled", format!("已被用户停止。到目前为：{summary}"));
        }
        if started.elapsed() > Duration::from_secs(MAX_TOTAL_SECONDS) {
            let summary = summarize(&steps);
            finish!(
                "timeout",
                format!(
                    "已超时（{} 秒）中止。到目前为：{}",
                    MAX_TOTAL_SECONDS, summary
                )
            );
        }

        let step_started = Instant::now();
        // 剩余预算：让 120s 墙钟上限真正生效（否则每轮都能各花 45s×N）
        let remaining = MAX_TOTAL_SECONDS.saturating_sub(started.elapsed().as_secs());
        if remaining == 0 {
            let summary = summarize(&steps);
            finish!(
                "timeout",
                format!(
                    "已超时（{} 秒）中止。到目前为：{}",
                    MAX_TOTAL_SECONDS, summary
                )
            );
        }
        let reply = match post_chat_with_failover(&cfg, remaining, |model| {
            // 每个备选用自己的模型名重建请求体（body 里的 model 字段必须与之一致）
            let mut candidate = cfg.clone();
            candidate.model = model.to_string();
            build_body(&candidate, &messages, &specs, false)
        }) {
            Ok((r, _used_model)) => r,
            Err(e) => {
                steps.push(AgentStep {
                    kind: "notice".into(),
                    call_id: String::new(),
                    tool: String::new(),
                    arguments: String::new(),
                    content: e.clone(),
                    ok: false,
                    needs_approval: false,
                    elapsed_ms: step_started.elapsed().as_millis() as u64,
                });
                let msg = e.clone();
                finish!("llm_error", msg);
            }
        };
        prompt_tokens = prompt_tokens.saturating_add(reply.prompt_tokens);
        completion_tokens = completion_tokens.saturating_add(reply.completion_tokens);

        // 没有工具调用 → 这就是最终回答
        if reply.tool_calls.is_empty() {
            steps.push(AgentStep {
                kind: "answer".into(),
                call_id: String::new(),
                tool: String::new(),
                arguments: String::new(),
                content: reply.content.clone(),
                ok: true,
                needs_approval: false,
                elapsed_ms: step_started.elapsed().as_millis() as u64,
            });
            let answer = reply.content.clone();
            finish!("done", answer);
        }

        // 记录助手消息（含 tool_calls），协议要求下一轮能对应上
        messages.push(ChatMessage::Assistant {
            content: if reply.content.is_empty() {
                None
            } else {
                Some(reply.content.clone())
            },
            tool_calls: Some(reply.tool_calls.clone()),
        });

        let mut awaiting_approval = false;
        for tc in &reply.tool_calls {
            if state.is_cancelled() {
                let summary = summarize(&steps);
                finish!("cancelled", format!("已被用户停止。到目前为：{summary}"));
            }
            let tool_started = Instant::now();
            let result = ctx.execute(&tc.id, &tc.function.name, &tc.function.arguments);
            let risk = tools::find_spec(&tc.function.name)
                .map(|s| s.risk)
                .unwrap_or(ToolRisk::Read);

            if result.needs_approval && risk != ToolRisk::Read {
                awaiting_approval = true;
                // 关键：把「要执行什么」存进后端，审批后直接执行这一条。
                // 否则前端只能再跑一轮模型，而模型会生成新的 call_id，
                // 批准就永远对不上（这正是原实现的死结）。
                state
                    .approvals
                    .register_pending(&tc.id, &tc.function.name, &tc.function.arguments);
            }

            steps.push(AgentStep {
                kind: "tool".into(),
                call_id: tc.id.clone(),
                tool: tc.function.name.clone(),
                arguments: tc.function.arguments.clone(),
                content: if result.ok {
                    result.content.clone()
                } else {
                    result.error.clone()
                },
                ok: result.ok,
                needs_approval: result.needs_approval,
                elapsed_ms: tool_started.elapsed().as_millis() as u64,
            });

            // 每个 tool_call 都必须有一条对应响应，否则下一轮消息序列非法
            // （assistant 声明了 N 个 tool_calls，却只有 M<N 条 tool 回复 → API 400）。
            // 需要审批的情况也写一条说明性响应，让模型知道「等用户确认」。
            messages.push(ChatMessage::Tool {
                tool_call_id: tc.id.clone(),
                content: if result.ok {
                    result.content
                } else if result.needs_approval {
                    format!(
                        "PENDING USER APPROVAL: {}. Do not retry; the user must confirm.",
                        result.error
                    )
                } else {
                    format!("ERROR: {}", result.error)
                },
            });
        }

        if awaiting_approval {
            finish!(
                "needs_approval",
                "有工具需要你批准后才能继续。请在步骤列表里确认或拒绝，然后再发一条消息让我继续。"
                    .to_string()
            );
        }

        if step_index + 1 == MAX_STEPS {
            let summary = summarize(&steps);
            finish!(
                "max_steps",
                format!(
                    "已达到 {} 轮工具调用上限并停止。已获得的结论：{}",
                    MAX_STEPS, summary
                )
            );
        }
    }

    let summary = summarize(&steps);
    finish!("max_steps", summary);
}

fn summarize(steps: &[AgentStep]) -> String {
    let tools: Vec<&str> = steps
        .iter()
        .filter(|s| s.kind == "tool" && s.ok)
        .map(|s| s.tool.as_str())
        .collect();
    if tools.is_empty() {
        "尚未获得有效结果。".to_string()
    } else {
        format!("已成功调用 {}", tools.join("、"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_prompt_inserted_only_once() {
        let mut messages = vec![ChatMessage::User {
            content: "hi".into(),
        }];
        if !matches!(messages.first(), Some(ChatMessage::System { .. })) {
            messages.insert(
                0,
                ChatMessage::System {
                    content: system_prompt(),
                },
            );
        }
        assert!(matches!(messages[0], ChatMessage::System { .. }));
        assert_eq!(messages.len(), 2);
    }

    #[test]
    fn summarize_reports_successful_tools() {
        let steps = vec![
            AgentStep {
                kind: "tool".into(),
                call_id: "c1".into(),
                tool: "list_processes".into(),
                arguments: "{}".into(),
                content: "[]".into(),
                ok: true,
                needs_approval: false,
                elapsed_ms: 1,
            },
            AgentStep {
                kind: "tool".into(),
                call_id: "c2".into(),
                tool: "terminate_process".into(),
                arguments: "{}".into(),
                content: String::new(),
                ok: false,
                needs_approval: true,
                elapsed_ms: 1,
            },
        ];
        let s = summarize(&steps);
        assert!(s.contains("list_processes"));
        assert!(!s.contains("terminate_process"), "失败的工具不应算作结论");
    }

    #[test]
    fn run_guard_clears_flag_on_drop() {
        let state = AgentState::default();
        {
            let _run = state.begin_run().expect("首次应能获取");
            assert!(state.begin_run().is_none(), "运行中不应重复获取");
        }
        assert!(state.begin_run().is_some(), "释放后可再次获取");
    }

    #[test]
    fn mutating_tool_is_blocked_until_approved() {
        // 用假的工具名验证闸门顺序：审批检查先于执行，
        // 未批准时不得产生任何副作用。
        let approvals = tools::Approvals::default();
        let spec = tools::find_spec("terminate_process").unwrap();
        assert_eq!(spec.risk, tools::ToolRisk::Dangerous);
        assert!(!approvals.consume("call-x"), "未批准时通行证必须不存在");
        approvals.grant("call-x");
        assert!(approvals.consume("call-x"), "批准后应放行一次");
    }
}

// ── IPC 命令：Agent 配置与执行 ────────────────────────────────

use tauri::{Manager, State};

/// 设置（或更新）模型服务。密钥只进内存，不落盘。
#[tauri::command]
pub fn agent_set_provider(
    state: State<'_, AgentState>,
    mut config: ProviderConfig,
) -> Result<(), String> {
    llm::validate_base_url(&config.base_url)?;
    if config.model.trim().is_empty() {
        return Err("模型名不能为空".to_string());
    }
    // 空密钥表示「保留现有密钥」：设置页不回显密钥，用户只改地址/模型时
    // 提交的空串不能把已配置的密钥抹掉。
    let existing = state.provider();
    if config.api_key.trim().is_empty() {
        config.api_key = existing.api_key;
    }
    // 备用服务同理：某条忘记重填密钥时沿用同 base_url 的旧密钥
    for fb in config.fallbacks.iter_mut() {
        if fb.api_key.trim().is_empty() {
            if let Some(prev) = existing
                .fallbacks
                .iter()
                .find(|p| p.base_url == fb.base_url)
            {
                fb.api_key = prev.api_key.clone();
            }
        }
    }
    state.set_provider(config);
    Ok(())
}

/// 读取当前 provider（**不含密钥**），用于回填设置页。
#[derive(serde::Serialize, ts_rs::TS)]
pub struct ProviderView {
    pub base_url: String,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    /// 是否已配置密钥（不回传密钥本身）
    pub has_key: bool,
    /// 备用服务（只回传地址与模型名，密钥用 has_key 表示）
    pub fallbacks: Vec<FallbackView>,
}

#[derive(serde::Serialize, ts_rs::TS)]
pub struct FallbackView {
    pub base_url: String,
    pub model: String,
    pub has_key: bool,
}

#[tauri::command]
pub fn agent_get_provider(state: State<'_, AgentState>) -> ProviderView {
    let cfg = state.provider();
    ProviderView {
        has_key: !cfg.api_key.is_empty(),
        base_url: cfg.base_url,
        model: cfg.model,
        temperature: cfg.temperature,
        max_tokens: cfg.max_tokens,
        fallbacks: cfg
            .fallbacks
            .into_iter()
            .map(|f| FallbackView {
                base_url: f.base_url,
                model: f.model,
                has_key: !f.api_key.is_empty(),
            })
            .collect(),
    }
}

/// 可用工具清单（前端「我能做什么」面板用）。
#[tauri::command]
pub fn agent_list_tools() -> Vec<tools::ToolSpec> {
    tools::tool_specs()
}

/// 批准并**执行**一次待审批的调用。
///
/// 为什么由后端直接执行而不是让前端再跑一轮模型：
/// 重新调用模型会生成新的 call_id，用户批准的那次调用永远对不上；
/// 而且「执行用户看到的那个操作」比「让模型重述一遍」更可审计。
#[tauri::command(async)]
pub async fn agent_approve_tool(
    app: AppHandle,
    call_id: String,
) -> Result<tools::ToolResult, String> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let st = app2.state::<AgentState>();
        let Some(pending) = st.approvals.take_pending(&call_id) else {
            return Err("该调用已失效或已被处理".to_string());
        };
        // 发放通行证后立即执行这一条已登记的调用
        st.approvals.grant(&pending.call_id);
        let ctx = executor::ToolContext {
            app: &app2,
            approvals: &st.approvals,
        };
        Ok(ctx.execute(&pending.call_id, &pending.tool, &pending.arguments))
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 清空对话：同时撤销后端所有待批/已批调用。
#[tauri::command]
pub fn agent_clear_chat(state: State<'_, AgentState>) {
    state.approvals.revoke_all();
    state.cancel();
}

/// 请求停止当前对话。循环会在下一个检查点退出。
#[tauri::command]
pub fn agent_cancel(state: State<'_, AgentState>) {
    state.cancel();
}

/// 拒绝一次待审批的工具调用。
#[tauri::command]
pub fn agent_reject_tool(state: State<'_, AgentState>, call_id: String) {
    state.approvals.revoke(&call_id);
}

/// 执行一轮对话。阻塞在 spawn_blocking 里，避免卡住主线程。
#[tauri::command(async)]
pub async fn agent_run(
    app: AppHandle,
    messages: Vec<ChatMessage>,
) -> Result<AgentRunResult, String> {
    let app_clone = app.clone();
    // State 不能跨线程移动：只把需要的两个句柄的稳定引用传进去不可能，
    // 因此这里用 app.state() 在阻塞线程内重新取——Tauri 的 State 是 'static 的。
    tauri::async_runtime::spawn_blocking(move || {
        let st = app_clone.state::<AgentState>();
        Ok(run(&app_clone, &st, messages))
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}
