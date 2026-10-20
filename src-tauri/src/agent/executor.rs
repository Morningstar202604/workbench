//! 工具执行器：把模型发起的工具调用落到工作台的真实能力上。
//!
//! 安全边界（按重要性）：
//! 1. **只执行注册表里的工具**，名字对不上直接拒绝，模型不能编造能力。
//! 2. **风险分级审批**：Mutate/Dangerous 必须持有一次性通行证，
//!    通行证由前端用户的真实点击换取，后端不复用、不重放。
//! 3. **参数不进入命令行**：所有实现都是结构化调用（sysinfo / 白名单路径 / 内部 API）。
//! 4. **输出截断**：防止一次全量进程列表把模型上下文撑爆。

use serde_json::Value;
use tauri::AppHandle;

use super::tools::{find_spec, truncate_output, Approvals, ToolResult, ToolRisk};

/// 工具执行上下文。
pub struct ToolContext<'a> {
    pub app: &'a AppHandle,
    pub approvals: &'a Approvals,
}

impl ToolContext<'_> {
    /// 执行一次工具调用。`call_id` 用于审批匹配。
    pub fn execute(&self, call_id: &str, name: &str, arguments: &str) -> ToolResult {
        let fail = |err: String, needs_approval: bool| ToolResult {
            call_id: call_id.to_string(),
            tool: name.to_string(),
            ok: false,
            content: String::new(),
            error: err,
            needs_approval,
        };

        let Some(spec) = find_spec(name) else {
            return fail(
                format!("未知工具「{name}」。只能调用工具清单里列出的工具。"),
                false,
            );
        };

        // 审批闸门：必须在解析参数之前，避免「先产生副作用再要求审批」
        if spec.risk != ToolRisk::Read && !self.approvals.consume(call_id) {
            return fail(
                format!(
                    "工具「{name}」需要用户批准后才能执行。请等待用户在界面上确认，\
                     不要重复调用或尝试绕过。"
                ),
                true,
            );
        }

        let args: Value = match serde_json::from_str(arguments) {
            Ok(v) => v,
            Err(_) if arguments.trim().is_empty() => Value::Object(Default::default()),
            Err(e) => return fail(format!("参数不是合法 JSON: {e}"), false),
        };

        let outcome = match name {
            "list_processes" => self.list_processes(&args),
            "list_ports" => self.list_ports(&args),
            "list_dev_servers" => self.list_dev_servers(),
            "list_ai_sessions" => self.list_ai_sessions(&args),
            "cost_overview" => self.cost_overview(),
            "cost_trend" => self.cost_trend(&args),
            "system_info" => self.system_info(),
            "list_projects" => self.list_projects(),
            "list_tasks" => self.list_tasks(&args),
            "create_task" => self.create_task(&args),
            "scan_session_costs" => self.scan_costs(),
            "open_project_dir" => self.open_project_dir(&args),
            "terminate_process" => self.terminate_process(&args),
            // find_spec 已保证不会到这里；留兜底避免以后新增工具忘记接线
            other => Err(format!("工具「{other}」尚未接线")),
        };

        match outcome {
            Ok(content) => ToolResult {
                call_id: call_id.to_string(),
                tool: name.to_string(),
                ok: true,
                content: truncate_output(&content),
                error: String::new(),
                needs_approval: false,
            },
            Err(e) => fail(e, false),
        }
    }

    fn list_processes(&self, args: &Value) -> Result<String, String> {
        let filter = args
            .get("filter")
            .and_then(|v| v.as_str())
            .map(|s| s.to_ascii_lowercase());
        let sort = args
            .get("sort")
            .and_then(|v| v.as_str())
            .unwrap_or("cpu")
            .to_string();
        let limit = args
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(20)
            .clamp(1, 100) as usize;

        let mut procs = crate::procs::snapshot_processes();
        if let Some(f) = filter {
            procs.retain(|p| {
                p.name.to_ascii_lowercase().contains(&f)
                    || p.cmd_line.to_ascii_lowercase().contains(&f)
            });
        }
        match sort.as_str() {
            "memory" => procs.sort_by_key(|p| std::cmp::Reverse(p.memory)),
            "pid" => procs.sort_by_key(|p| p.pid),
            "name" => procs.sort_by(|a, b| a.name.cmp(&b.name)),
            _ => procs.sort_by(|a, b| b.cpu.total_cmp(&a.cpu)),
        }
        procs.truncate(limit);
        serde_json::to_string_pretty(&procs).map_err(|e| e.to_string())
    }

    fn list_ports(&self, args: &Value) -> Result<String, String> {
        let listening_only = args
            .get("listening_only")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let mut ports = crate::ports::collect()?;
        if listening_only {
            ports.retain(|p| p.state.eq_ignore_ascii_case("LISTEN") || p.protocol == "UDP");
        }
        ports.sort_by_key(|p| p.local_port);
        serde_json::to_string_pretty(&ports).map_err(|e| e.to_string())
    }

    fn list_dev_servers(&self) -> Result<String, String> {
        let ports = crate::ports::collect()?;
        let procs = crate::procs::snapshot_processes();
        let index: std::collections::HashMap<u32, _> =
            procs.into_iter().map(|p| (p.pid, p)).collect();
        let mut out = Vec::new();
        for entry in ports.iter().filter(|e| {
            e.protocol == "TCP" && e.state.eq_ignore_ascii_case("LISTENING")
        }) {
            let Some(proc) = index.get(&entry.pid) else {
                continue;
            };
            let cmd_lower = proc.cmd_line.to_ascii_lowercase();
            let exe_lower = std::path::Path::new(&proc.exe_path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if let Some((framework, confidence)) =
                crate::devserver::classify_dev_server(&cmd_lower, &exe_lower)
            {
                out.push(serde_json::json!({
                    "port": entry.local_port,
                    "pid": entry.pid,
                    "process": proc.name,
                    "framework": framework,
                    "confidence": confidence,
                    "project_dir": crate::devserver::guess_project_dir(
                        &proc.argv, &proc.exe_path, &proc.cwd
                    ),
                    "cmd_line": proc.cmd_line,
                }));
            }
        }
        out.sort_by_key(|v| v["port"].as_u64().unwrap_or(0));
        serde_json::to_string_pretty(&out).map_err(|e| e.to_string())
    }

    fn list_ai_sessions(&self, args: &Value) -> Result<String, String> {
        let limit = args
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(10)
            .clamp(1, 50) as usize;
        let home = crate::commands::home_dir().ok_or_else(|| "无法定位用户主目录".to_string())?;
        let mut files = crate::ai::collect_all_session_files(&home);
        files.truncate(limit);
        serde_json::to_string_pretty(&files).map_err(|e| e.to_string())
    }

    fn cost_overview(&self) -> Result<String, String> {
        let o = crate::cost_store::build_overview(self.app)?;
        serde_json::to_string_pretty(&o).map_err(|e| e.to_string())
    }

    fn cost_trend(&self, args: &Value) -> Result<String, String> {
        let days = args
            .get("days")
            .and_then(|v| v.as_u64())
            .unwrap_or(14)
            .clamp(1, 90) as usize;
        let rows = crate::cost_store::build_trend(self.app, days)?;
        serde_json::to_string_pretty(&rows).map_err(|e| e.to_string())
    }

    fn system_info(&self) -> Result<String, String> {
        use sysinfo::System;
        let info = serde_json::json!({
            "hostname": System::host_name().unwrap_or_default(),
            "os": System::long_os_version().or_else(System::os_version).unwrap_or_default(),
            "cpu_cores": std::thread::available_parallelism().map(|n| n.get()).unwrap_or(0),
            "total_memory_bytes": System::new_with_specifics(
                sysinfo::RefreshKind::nothing()
                    .with_memory(sysinfo::MemoryRefreshKind::nothing().with_ram())
            ).total_memory(),
            "uptime_seconds": System::uptime(),
        });
        Ok(info.to_string())
    }

    fn list_projects(&self) -> Result<String, String> {
        let data = crate::data::load_from_disk(self.app)?;
        serde_json::to_string_pretty(&data.projects).map_err(|e| e.to_string())
    }

    fn list_tasks(&self, args: &Value) -> Result<String, String> {
        let data = crate::data::load_from_disk(self.app)?;
        let status = args.get("status").and_then(|v| v.as_str());
        let project_id = args.get("project_id").and_then(|v| v.as_str());
        let tasks: Vec<_> = data
            .tasks
            .into_iter()
            .filter(|t| status.map_or(true, |s| t.status == s))
            .filter(|t| project_id.map_or(true, |p| t.project_id.as_deref() == Some(p)))
            .collect();
        serde_json::to_string_pretty(&tasks).map_err(|e| e.to_string())
    }

    fn create_task(&self, args: &Value) -> Result<String, String> {
        let title = args
            .get("title")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "title 不能为空".to_string())?;
        let mut data = crate::data::load_from_disk(self.app)?;
        let now = chrono::Utc::now().timestamp() as u64;
        let task = crate::data::Task {
            id: format!("t-{now}-{}", data.tasks.len()),
            title: title.to_string(),
            status: args
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("todo")
                .to_string(),
            priority: args
                .get("priority")
                .and_then(|v| v.as_str())
                .unwrap_or("normal")
                .to_string(),
            due: args.get("due").and_then(|v| v.as_str()).map(String::from),
            project_id: args
                .get("project_id")
                .and_then(|v| v.as_str())
                .map(String::from),
            tags: Vec::new(),
            created_at: now,
            updated_at: now,
        };
        data.tasks.insert(0, task.clone());
        crate::data::save_to_disk(self.app, &data)?;
        Ok(format!("已创建任务「{}」（id={}）", task.title, task.id))
    }

    fn scan_costs(&self) -> Result<String, String> {
        // 复用扫描链路的核心：收集文件 → 计算 → 落库 + 聚合
        let home = crate::commands::home_dir().ok_or_else(|| "无法定位用户主目录".to_string())?;
        let files = crate::ai::collect_all_session_files(&home);
        let entries: Vec<crate::session_meter::SessionFileEntry> = files
            .iter()
            .map(|f| crate::session_meter::SessionFileEntry {
                path: f.path.clone(),
                tool: f.tool.clone(),
                project: f.project.clone(),
                modified: f.modified,
                size: f.size,
            })
            .collect();
        let existing = crate::cost_store::existing_keys(self.app)?;
        let table = crate::pricing::PricingTable::default();
        let records = crate::session_meter::scan_sessions_to_records(&entries, &table, &existing);
        let outcome = crate::cost_store::import_and_aggregate(self.app, &records, 14)?;
        Ok(format!(
            "扫描完成：新增 {} 条记录，库内共 {} 条，总花费 ${:.4}",
            outcome.net_new, outcome.overview.record_count, outcome.overview.total_cost
        ))
    }

    fn open_project_dir(&self, args: &Value) -> Result<String, String> {
        let id = args
            .get("project_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "缺少 project_id".to_string())?;
        let data = crate::data::load_from_disk(self.app)?;
        let project = data
            .projects
            .iter()
            .find(|p| p.id == id)
            .ok_or_else(|| format!("找不到项目 {id}"))?;
        if project.path.trim().is_empty() {
            return Err("该项目没有绑定目录".to_string());
        }
        tauri_plugin_opener::open_path(&project.path, None::<&str>)
            .map_err(|e| format!("打开失败: {e}"))?;
        Ok(format!("已用系统文件管理器打开 {}", project.path))
    }

    fn terminate_process(&self, args: &Value) -> Result<String, String> {
        let pid = args
            .get("pid")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| "缺少 pid".to_string())? as u32;
        let reason = args.get("reason").and_then(|v| v.as_str()).unwrap_or("");
        log::warn!("Agent 请求终止 PID={pid}，理由: {reason}");
        crate::procs::terminate_process(pid)?;
        Ok(format!("已终止进程 {pid}"))
    }
}
