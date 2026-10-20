//! Agent 工具注册表：把工作台的只读能力暴露给模型，并给危险能力加上审批闸门。
//!
//! 设计要点：
//! - **模型只能调用这里注册的工具**，不能凭空产生命令。每个工具都有明确 schema。
//! - **按风险分级**：`Read` 直接执行；`Mutate` 与 `Dangerous` 必须经过前端确认，
//!   后端在缺少确认令牌时一律拒绝 —— 审批判定不放在前端，因为前端是被约束方。
//! - **不引入 shell**：工具实现全部是结构化调用（sysinfo / 白名单命令），
//!   模型给的参数永远不进入命令行拼接。
//!
//! 为什么审批必须在后端：WebView 一旦被注入，前端弹出的「确认框」可以被脚本
//! 直接点掉。后端的 `approved` 标志只能由 `agent_approve_tool` 命令设置，
//! 而该命令由用户在界面上的真实点击触发。

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Mutex;

/// 工具风险等级。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
pub enum ToolRisk {
    /// 只读，直接执行
    Read,
    /// 改变本机状态，需要用户逐次确认
    Mutate,
    /// 不可逆或影响系统稳定性，需要用户逐次确认并给出更强提示
    Dangerous,
}

/// 工具的 JSON Schema（OpenAI function calling 的 parameters 字段）。
#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub risk: ToolRisk,
    /// JSON Schema 对象，直接透传给模型。
    /// 用字符串承载：serde_json::Value 没有 ts_rs 实现，而前端只需要原样展示。
    #[ts(type = "unknown")]
    pub parameters: serde_json::Value,
}

/// 一次工具调用请求（来自模型）。
#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    /// 模型返回的参数字符串（通常是 JSON）
    pub arguments: String,
}

/// 工具执行结果，回灌给模型。
#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct ToolResult {
    pub call_id: String,
    pub tool: String,
    pub ok: bool,
    /// 成功时的结果（已截断到安全长度）
    pub content: String,
    /// 失败原因（ok=false 时给模型看，便于它换策略）
    pub error: String,
    /// 是否需要用户先批准
    pub needs_approval: bool,
}

/// 工具执行上限：结果回灌给模型前截断，避免一次进程列表就把上下文撑爆。
pub const MAX_TOOL_OUTPUT_CHARS: usize = 8_000;

/// 只读工具的清单。工具名是模型侧的契约，改名等于破坏提示词。
pub fn tool_specs() -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: "list_processes".into(),
            description: "List running processes on this machine. Returns pid, name, cpu%, \
                          memory, command line, working directory. Optionally filter by name \
                          substring or sort order."
                .into(),
            risk: ToolRisk::Read,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "filter": {
                        "type": "string",
                        "description": "Case-insensitive substring to match against process name or command line"
                    },
                    "sort": {
                        "type": "string",
                        "enum": ["cpu", "memory", "pid", "name"],
                        "description": "Sort key, defaults to cpu"
                    },
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 100,
                        "description": "Maximum rows to return, defaults to 20"
                    }
                },
                "required": []
            }),
        },
        ToolSpec {
            name: "list_ports".into(),
            description: "List listening TCP/UDP ports with the owning process id. \
                          Use it to find which process occupies a port."
                .into(),
            risk: ToolRisk::Read,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "listening_only": {"type": "boolean", "description": "Only LISTEN state, defaults to true"}
                },
                "required": []
            }),
        },
        ToolSpec {
            name: "list_dev_servers".into(),
            description: "List detected development servers (Vite, Next.js, uvicorn, Django, \
                          Go, .NET …) with framework, port, project directory and command line."
                .into(),
            risk: ToolRisk::Read,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        ToolSpec {
            name: "list_ai_sessions".into(),
            description: "List recent local AI coding session files (Claude Code / Codex) \
                          with tool name, project, message count and modified time."
                .into(),
            risk: ToolRisk::Read,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "minimum": 1, "maximum": 50, "description": "Defaults to 10"}
                },
                "required": []
            }),
        },
        ToolSpec {
            name: "cost_overview".into(),
            description: "Current AI token cost summary: today / this month / total spend, \
                          token counts per category, and budget usage percentages."
                .into(),
            risk: ToolRisk::Read,
            parameters: serde_json::json!({"type": "object", "properties": {}, "required": []}),
        },
        ToolSpec {
            name: "cost_trend".into(),
            description: "Daily AI cost and token trend for the last N days."
                .into(),
            risk: ToolRisk::Read,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "minimum": 1, "maximum": 90, "description": "Defaults to 14"}
                },
                "required": []
            }),
        },
        ToolSpec {
            name: "system_info".into(),
            description: "Host name, OS, logical core count, total memory and uptime."
                .into(),
            risk: ToolRisk::Read,
            parameters: serde_json::json!({"type": "object", "properties": {}, "required": []}),
        },
        ToolSpec {
            name: "list_projects".into(),
            description: "Projects tracked in the workbench board, with status, path and tags."
                .into(),
            risk: ToolRisk::Read,
            parameters: serde_json::json!({"type": "object", "properties": {}, "required": []}),
        },
        ToolSpec {
            name: "list_tasks".into(),
            description: "Tasks on the workbench board. Filter by status to see what is todo, \
                          doing or done."
                .into(),
            risk: ToolRisk::Read,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["todo", "doing", "done"]},
                    "project_id": {"type": "string"}
                },
                "required": []
            }),
        },
        ToolSpec {
            name: "create_task".into(),
            description: "Create a task on the workbench board. Requires user approval."
                .into(),
            risk: ToolRisk::Mutate,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Task title"},
                    "status": {"type": "string", "enum": ["todo", "doing", "done"]},
                    "priority": {"type": "string", "enum": ["low", "normal", "high"]},
                    "due": {"type": "string", "description": "Due date YYYY-MM-DD, optional"},
                    "project_id": {"type": "string"}
                },
                "required": ["title"]
            }),
        },
        ToolSpec {
            name: "scan_session_costs".into(),
            description: "Re-scan local AI session files to refresh the cost ledger. \
                          Can take a few seconds on large histories. Requires user approval."
                .into(),
            risk: ToolRisk::Mutate,
            parameters: serde_json::json!({"type": "object", "properties": {}, "required": []}),
        },
        ToolSpec {
            name: "open_project_dir".into(),
            description: "Open a tracked project directory in the system file manager. \
                          Only directories the user has added to the board are allowed."
                .into(),
            risk: ToolRisk::Mutate,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "Id from list_projects"}
                },
                "required": ["project_id"]
            }),
        },
        ToolSpec {
            name: "terminate_process".into(),
            description: "Terminate a process by pid. IRREVERSIBLE. Requires explicit user \
                          confirmation every time; never call it speculatively."
                .into(),
            risk: ToolRisk::Dangerous,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "pid": {"type": "integer", "description": "Process id from list_processes"},
                    "reason": {"type": "string", "description": "Why this process must be terminated"}
                },
                "required": ["pid", "reason"]
            }),
        },
    ]
}

/// 审批登记：用户在前端点「允许」后，为该次调用发放一次性通行证。
#[derive(Default)]
pub struct Approvals(Mutex<HashSet<String>>);

impl Approvals {
    /// 用户批准一次调用（由前端命令调用，只能由真实点击触发）。
    pub fn grant(&self, call_id: &str) {
        let mut guard = self.0.lock().unwrap_or_else(|p| p.into_inner());
        guard.insert(call_id.to_string());
    }

    /// 消费一次性通行证：取走即失效，同一个 call_id 不能复用。
    pub fn consume(&self, call_id: &str) -> bool {
        let mut guard = self.0.lock().unwrap_or_else(|p| p.into_inner());
        guard.remove(call_id)
    }

    /// 前端撤销（用户点了拒绝）。
    pub fn revoke(&self, call_id: &str) {
        let mut guard = self.0.lock().unwrap_or_else(|p| p.into_inner());
        guard.remove(call_id);
    }

    pub fn pending_count(&self) -> usize {
        self.0.lock().unwrap_or_else(|p| p.into_inner()).len()
    }
}

/// 按名字查工具规格，执行前用它校验「模型没有编造工具名」。
pub fn find_spec(name: &str) -> Option<ToolSpec> {
    tool_specs().into_iter().find(|s| s.name == name)
}

/// 截断工具输出，保护模型上下文。
pub fn truncate_output(s: &str) -> String {
    if s.chars().count() <= MAX_TOOL_OUTPUT_CHARS {
        return s.to_string();
    }
    let kept: String = s.chars().take(MAX_TOOL_OUTPUT_CHARS).collect();
    format!("{kept}\n…[truncated at {MAX_TOOL_OUTPUT_CHARS} chars]")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_tool_has_a_valid_object_schema() {
        for spec in tool_specs() {
            assert_eq!(
                spec.parameters["type"], "object",
                "工具 {} 的参数必须是 object schema",
                spec.name
            );
            assert!(
                !spec.description.trim().is_empty(),
                "工具 {} 缺少描述，模型无法判断何时使用",
                spec.name
            );
        }
    }

    #[test]
    fn tool_names_are_unique() {
        let mut seen = HashSet::new();
        for spec in tool_specs() {
            assert!(seen.insert(spec.name.clone()), "工具名重复: {}", spec.name);
        }
    }

    #[test]
    fn dangerous_tools_are_marked_and_require_reason() {
        let term = find_spec("terminate_process").expect("必须注册 terminate_process");
        assert_eq!(term.risk, ToolRisk::Dangerous);
        let required = term.parameters["required"].as_array().unwrap();
        assert!(
            required.iter().any(|v| v == "reason"),
            "危险工具必须强制模型给出理由"
        );
    }

    #[test]
    fn unknown_tool_is_rejected() {
        assert!(find_spec("rm_rf_everything").is_none());
    }

    #[test]
    fn approval_is_single_use() {
        let approvals = Approvals::default();
        approvals.grant("call-1");
        assert_eq!(approvals.pending_count(), 1);
        assert!(approvals.consume("call-1"));
        // 第二次必须失败：通行证已被消费，防止重放
        assert!(!approvals.consume("call-1"));
        assert_eq!(approvals.pending_count(), 0);
    }

    #[test]
    fn revoke_removes_pending_approval() {
        let approvals = Approvals::default();
        approvals.grant("call-2");
        approvals.revoke("call-2");
        assert!(!approvals.consume("call-2"));
    }

    #[test]
    fn output_truncation_is_applied() {
        let long = "x".repeat(MAX_TOOL_OUTPUT_CHARS + 500);
        let out = truncate_output(&long);
        assert!(out.chars().count() < long.chars().count());
        assert!(out.contains("truncated"));

        let short = "ok";
        assert_eq!(truncate_output(short), "ok");
    }
}
