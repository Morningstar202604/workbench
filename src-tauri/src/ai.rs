//! AI 会话感知：识别本机 AI 编码代理进程、拉取 opencode 在线会话、扫描本地会话记录文件。
//! 新增：获取 opencode 会话详情、解析 .jsonl 会话预览。

use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

/// AI 代理关键词（小写匹配 name / cmdline / exe 路径）。
pub const AI_AGENT_KEYWORDS: &[&str] = &[
    "opencode",
    "claude",
    "codex",
    "cursor",
    "windsurf",
    "aider",
    "copilot",
    "gemini",
    "qwen",
    "iflow",
    "crush",
    "openhands",
    "goose",
    "continue",
    "cline",
    "roo",
    "kilo",
    "amp",
    "zed",
];

/// 把字符串按非字母数字切成 token（词边界），避免 "amp" 误命中 "sample" 这类子串。
fn ascii_tokens(hay: &str) -> impl Iterator<Item = &str> {
    hay.split(|c: char| !c.is_ascii_alphanumeric())
}

/// 返回命中的 AI 关键词（token 精确匹配 name / cmdline / exe 三段）。
pub fn find_ai_keyword(name_lower: &str, cmd_lower: &str, exe_lower: &str) -> Option<&'static str> {
    AI_AGENT_KEYWORDS.iter().copied().find(|kw| {
        [name_lower, cmd_lower, exe_lower]
            .iter()
            .any(|hay| ascii_tokens(hay).any(|t| t == *kw))
    })
}

#[derive(Serialize, Clone, Debug, ts_rs::TS)]
pub struct AiProcess {
    pub pid: u32,
    pub name: String,
    pub exe_path: String,
    pub cmd_line: String,
    pub matched: String,
    #[ts(type = "number")]
    pub memory: u64,
    #[ts(type = "number")]
    pub start_time: u64,
}

#[derive(Serialize, Clone, Debug, ts_rs::TS)]
pub struct OpencodeSession {
    pub id: String,
    pub title: String,
    #[ts(type = "number")]
    pub created: i64,
    #[ts(type = "number")]
    pub updated: i64,
}

/// opencode 会话详情（消息摘要）。
#[derive(Serialize, Clone, Debug, ts_rs::TS)]
pub struct SessionDetail {
    pub id: String,
    pub title: String,
    pub message_count: usize,
    pub first_message: String,
    pub last_message: String,
    #[ts(type = "number")]
    pub duration_seconds: i64,
    pub tools_used: Vec<String>,
    pub error: String,
}

/// opencode 会话 id 只允许这些字符：id 会被拼进 URL 路径段，
/// 放行 `/`、`?`、`#`、`%` 就等于让前端能改写请求路径与查询串。
fn is_safe_session_id(raw: &str) -> bool {
    !raw.is_empty()
        && raw.len() <= 128
        && raw
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ':'))
}

/// 路径段 percent-encode。校验通过后再编码属于双保险。
fn encode_path_segment(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for byte in raw.as_bytes() {
        let c = *byte as char;
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
            out.push(c);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// 统一构造失败详情，避免每个错误分支重复一遍结构体。
fn detail_error(id: &str, title: &str, error: String) -> SessionDetail {
    SessionDetail {
        id: id.to_string(),
        title: title.to_string(),
        message_count: 0,
        first_message: String::new(),
        last_message: String::new(),
        duration_seconds: 0,
        tools_used: Vec::new(),
        error,
    }
}

/// 从本地 opencode server 拉会话列表（GET /session）。
pub fn fetch_opencode_sessions(port: u16) -> Result<Vec<OpencodeSession>, String> {
    let url = format!("http://127.0.0.1:{port}/session");
    let resp = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        // 本机服务的 3xx 会把请求带到任意外网地址：跟随重定向等于开放出站口子
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("客户端创建失败: {e}"))?
        .get(&url)
        .send()
        .map_err(|e| format!("请求失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let body: serde_json::Value = resp.json().map_err(|e| format!("响应解析失败: {e}"))?;
    let arr = match body.as_array() {
        Some(a) => a,
        None => return Err("响应不是会话数组".to_string()),
    };
    let mut sessions = Vec::new();
    for item in arr {
        let id = item
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let title = item
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("(未命名会话)")
            .to_string();
        let (created, updated) = match item.get("time") {
            Some(t) => (
                t.get("created").and_then(|v| v.as_i64()).unwrap_or_default(),
                t.get("updated").and_then(|v| v.as_i64()).unwrap_or_default(),
            ),
            None => (0, 0),
        };
        // id 之后会被前端原样传回拼进详情 URL，这里就按同一规则过滤
        if !id.is_empty() && is_safe_session_id(&id) {
            sessions.push(OpencodeSession {
                id,
                title,
                created,
                updated,
            });
        }
    }
    Ok(sessions)
}

/// 拉取单个 opencode 会话详情（GET /session/{id}）。
pub fn fetch_session_detail(port: u16, session_id: &str) -> SessionDetail {
    if !is_safe_session_id(session_id) {
        log::warn!("拒绝非法会话 id（长度 {}）", session_id.len());
        return detail_error(session_id, "(非法会话 id)", "会话 id 含不允许的字符".to_string());
    }
    if !(1..=65535).contains(&port) {
        return detail_error(session_id, "(非法端口)", "端口不在允许范围".to_string());
    }

    let url = format!(
        "http://127.0.0.1:{port}/session/{}",
        encode_path_segment(session_id)
    );
    let resp = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(2000))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .and_then(|c| c.get(&url).send());

    let resp = match resp {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => return detail_error(session_id, "(获取失败)", format!("HTTP {}", r.status().as_u16())),
        Err(e) => return detail_error(session_id, "(获取失败)", e.to_string()),
    };

    let body: serde_json::Value = match resp.json() {
        Ok(v) => v,
        Err(e) => return detail_error(session_id, "(解析失败)", e.to_string()),
    };

    // 解析消息列表
    let messages = body
        .get("messages")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let message_count = messages.len();

    let extract_text = |v: &serde_json::Value| -> String {
        v.get("content")
            .and_then(|c| {
                if c.is_string() {
                    c.as_str().map(|s| s.to_string())
                } else if c.is_array() {
                    // 多部分内容：提取所有 text 类型
                    c.as_array().map(|parts| {
                        parts
                            .iter()
                            .filter_map(|p| {
                                if p.get("type").and_then(|t| t.as_str()) == Some("text") {
                                    p.get("text").and_then(|t| t.as_str()).map(|s| s.to_string())
                                } else {
                                    None
                                }
                            })
                            .collect::<Vec<_>>()
                            .join(" ")
                    })
                } else {
                    None
                }
            })
            .unwrap_or_default()
    };

    let first_message = messages
        .first()
        .map(extract_text)
        .unwrap_or_default();
    let last_message = messages
        .last()
        .map(extract_text)
        .unwrap_or_default();

    // 提取使用的工具（不去重：前端按次数做分布统计）
    let tools_used: Vec<String> = messages
        .iter()
        .filter_map(|m| {
            m.get("content")
                .and_then(|c| c.as_array())
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(|p| {
                            if p.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                                p.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())
                            } else {
                                None
                            }
                        })
                        .collect::<Vec<_>>()
                })
        })
        .flatten()
        .collect();

    // 持续时间（从消息时间戳推算）
    let get_ts = |v: &serde_json::Value| -> Option<i64> {
        v.get("time")
            .or_else(|| v.get("timestamp"))
            .and_then(|t| t.as_i64())
    };
    let duration_seconds = match (messages.first().and_then(get_ts), messages.last().and_then(get_ts)) {
        (Some(start), Some(end)) => (end - start) / 1000,
        _ => 0,
    };

    let title = body
        .get("title")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "(未命名会话)".to_string());

    SessionDetail {
        id: session_id.to_string(),
        title,
        message_count,
        first_message: first_message.chars().take(200).collect(),
        last_message: last_message.chars().take(200).collect(),
        duration_seconds,
        tools_used,
        error: String::new(),
    }
}

#[derive(Serialize, Clone, Debug, ts_rs::TS)]
pub struct SessionFile {
    pub tool: String,
    pub project: String,
    pub path: String,
    #[ts(type = "number")]
    pub modified: u64,
    #[ts(type = "number")]
    pub size: u64,
}

/// 本地文件增强预览：消息条数、首条内容、最近一条内容。
#[derive(Serialize, Clone, Debug, ts_rs::TS)]
pub struct SessionFilePreview {
    pub tool: String,
    pub project: String,
    pub path: String,
    #[ts(type = "number")]
    pub modified: u64,
    #[ts(type = "number")]
    pub size: u64,
    pub message_count: usize,
    pub first_line: String,
    pub last_line: String,
    pub human_preview: String,
}

/// 扫描 ~/.claude/projects 与 ~/.codex/sessions 下的全部会话记录（*.jsonl），按修改时间倒序。
/// 目录不存在时返回空。成本计量必须用全量，不能只看最近几条。
pub fn collect_all_session_files(home: &Path) -> Vec<SessionFile> {
    let mut files: Vec<SessionFile> = Vec::new();
    let roots = [
        ("Claude Code", home.join(".claude").join("projects")),
        ("Codex CLI", home.join(".codex").join("sessions")),
    ];
    for (tool, root) in roots {
        collect_jsonl(&root, tool, &mut files);
    }
    files.sort_by_key(|f| std::cmp::Reverse(f.modified));
    files
}

/// UI 预览只取最近 N 条（成本计量走 collect_all_session_files 全量，不受此限制）。
pub const PREVIEW_LIMIT: usize = 10;

/// 最近 N 条（UI 预览用）。
pub fn scan_session_files(home: &Path) -> Vec<SessionFile> {
    let mut files = collect_all_session_files(home);
    files.truncate(PREVIEW_LIMIT);
    files
}

/// 增强扫描：包含消息条数和内容预览。
pub fn scan_session_files_with_preview(home: &Path) -> Vec<SessionFilePreview> {
    let basic = scan_session_files(home);
    basic
        .into_iter()
        .map(|f| {
            let (message_count, first_line, last_line) = parse_jsonl_preview(&f.path);
            let human_preview = if message_count == 0 {
                "(空文件)"
            } else {
                if !last_line.is_empty() {
                    &last_line
                } else {
                    &first_line
                }
            };
            SessionFilePreview {
                tool: f.tool,
                project: f.project,
                path: f.path,
                modified: f.modified,
                size: f.size,
                message_count,
                first_line: first_line.chars().take(200).collect(),
                last_line: last_line.chars().take(200).collect(),
                human_preview: human_preview.chars().take(200).collect(),
            }
        })
        .collect()
}

fn parse_jsonl_preview(path: &str) -> (usize, String, String) {
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return (0, String::new(), String::new()),
    };
    use std::io::{BufRead, BufReader};
    let reader = BufReader::new(file);
    let mut count = 0;
    let mut first = String::new();
    let mut last = String::new();
    for line in reader.lines().map_while(Result::ok) {
        if line.trim().is_empty() {
            continue;
        }
        count += 1;
        if first.is_empty() {
            first = line.clone();
        }
        last = line;
    }
    // 从 JSON 提取可读文本（Claude Code 格式）
    let extract_text = |s: &str| -> String {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(s) {
            // Claude Code session 格式
            if let Some(msg) = v.get("message").cloned().filter(|m| !m.is_null()) {
                if let Some(content) = msg.get("content") {
                    return extract_content_text(content);
                }
            }
            // 顶层 type + content
            if let Some(t) = v.get("type").and_then(|t| t.as_str()) {
                if t == "summary" {
                    return v.get("summary")
                        .and_then(|s| s.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_default();
                }
            }
            // 直接 Content 数组
            if let Some(content) = v.get("content") {
                return extract_content_text(content);
            }
        }
        // 前 100 字符兜底
        s.chars().take(100).collect()
    };
    let first_text = extract_text(&first);
    let last_text = extract_text(&last);
    (count, first_text, last_text)
}

fn extract_content_text(content: &serde_json::Value) -> String {
    if content.is_string() {
        content.as_str().unwrap_or("").chars().take(200).collect()
    } else if let Some(arr) = content.as_array() {
        arr.iter()
            .filter_map(|p| {
                if p.get("type").and_then(|t| t.as_str()) == Some("text") {
                    p.get("text").and_then(|t| t.as_str()).map(|s| s.to_string())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(200)
            .collect()
    } else {
        String::new()
    }
}

fn collect_jsonl(dir: &Path, tool: &str, out: &mut Vec<SessionFile>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl(&path, tool, out);
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or_default();
        let project = path
            .parent()
            .and_then(|p| p.file_name())
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        out.push(SessionFile {
            tool: tool.to_string(),
            project,
            path: path.to_string_lossy().to_string(),
            modified,
            size: meta.len(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn detects_agents_and_ignores_normal_apps() {
        assert_eq!(find_ai_keyword("claude.exe", "claude", ""), Some("claude"));
        assert_eq!(
            find_ai_keyword(
                "node.exe",
                "node c:\\users\\me\\appdata\\roaming\\npm\\node_modules\\opencode\\bin\\opencode",
                ""
            ),
            Some("opencode")
        );
        assert_eq!(find_ai_keyword("chrome.exe", "chrome --type=renderer", ""), None);
        assert_eq!(find_ai_keyword("code.exe", "code", ""), None);
    }

    #[test]
    fn token_boundary_avoids_substring_false_positives() {
        // "amp" / "roo" / "zed" 不应被子串（sample / classroom / lazy）命中
        assert_eq!(find_ai_keyword("sample.exe", "sample --run", "c:\\ramp\\bin"), None);
        assert_eq!(find_ai_keyword("classroom.exe", "open classroom app", ""), None);
        // 真正的词边界命中
        assert_eq!(find_ai_keyword("amp.exe", "amp", ""), Some("amp"));
        assert_eq!(find_ai_keyword("node.exe", "npx claude-code run", ""), Some("claude"));
    }

    #[test]
    fn session_id_gate_blocks_url_path_injection() {
        assert!(is_safe_session_id("ses_abc123"));
        assert!(is_safe_session_id("ses:123-45"));
        // 路径穿越 / 查询串注入 / 空 id / 超长
        assert!(!is_safe_session_id("../../../etc/passwd"));
        assert!(!is_safe_session_id("abc?port=9"));
        assert!(!is_safe_session_id("abc#frag"));
        assert!(!is_safe_session_id("abc%2fdef"));
        assert!(!is_safe_session_id(""));
        assert!(!is_safe_session_id(&"s".repeat(129)));
    }

    #[test]
    fn path_segment_encoding_keeps_unreserved_only() {
        assert_eq!(encode_path_segment("ses_abc-123.X~"), "ses_abc-123.X~");
        assert_eq!(encode_path_segment("a b"), "a%20b");
        assert_eq!(encode_path_segment("a/b?c"), "a%2Fb%3Fc");
    }

    #[test]
    fn illegal_session_id_never_reaches_the_network() {
        // 端口 1 上没有服务：合法 id 会走请求并返回连接错误，非法 id 必须在发请求前被拒
        let blocked = fetch_session_detail(1, "../../windows/system32");
        assert_eq!(blocked.title, "(非法会话 id)");
        assert!(blocked.error.contains("不允许的字符"));
    }

    #[test]
    fn scan_missing_dirs_returns_empty() {
        let dir = std::env::temp_dir().join("workbench-test-nonexistent-home");
        assert!(scan_session_files(&dir).is_empty());
        assert!(scan_session_files_with_preview(&dir).is_empty());
    }

    #[test]
    fn parses_jsonl_preview() {
        let tmp = std::env::temp_dir().join("wb-test-session.jsonl");
        let mut f = std::fs::File::create(&tmp).unwrap();
        let line1 = r#"{"type":"user","message":{"content":[{"type":"text","text":"Hello world"}]}}"#;
        let line2 = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Hi there!"}]}}"#;
        writeln!(f, "{}", line1).unwrap();
        writeln!(f, "{}", line2).unwrap();
        let (count, first, last) = parse_jsonl_preview(tmp.to_str().unwrap());
        assert_eq!(count, 2);
        assert!(first.contains("Hello"));
        assert!(last.contains("Hi"));
    }
}
