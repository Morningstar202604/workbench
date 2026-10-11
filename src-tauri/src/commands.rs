//! IPC 命令层：前端 invoke 的唯一入口。阻塞工作全部丢进 spawn_blocking。

use tauri::AppHandle;

use crate::ai::{self, AiProcess, OpencodeSession, SessionDetail, SessionFile, SessionFilePreview};
use crate::cost_store::{
    self, CostData, CostOverview, CostSettings, CostTrendRow, ModelBreakdownRow,
};
use crate::data::{self, WorkbenchData};
use crate::devserver::{self, DevServer};
use crate::ports::{self, PortEntry};
use crate::pricing::PricingTable;
use crate::procs::{self, ProcInfo};
use crate::session_meter::{self, SessionFileEntry};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;

/// 构建 PID 索引哈希表（消除 O(n*m) 端口→进程扫描）
fn build_pid_index(procs: Vec<ProcInfo>) -> HashMap<u32, ProcInfo> {
    procs.into_iter().map(|p| (p.pid, p)).collect()
}

#[tauri::command(async)]
pub async fn list_processes() -> Result<Vec<ProcInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let result = procs::snapshot_processes();
        log::debug!("list_processes 返回 {} 条", result.len());
        result
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))
}

#[tauri::command(async)]
pub async fn terminate_process(pid: u32) -> Result<(), String> {
    log::info!("请求终止进程 PID={pid}");
    tauri::async_runtime::spawn_blocking(move || procs::terminate_process(pid))
        .await
        .map_err(|e| format!("任务执行失败: {e}"))?
}

#[tauri::command(async)]
pub async fn list_ports() -> Result<Vec<PortEntry>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        // chcp 65001 确保中文 Windows 下 netstat 表头用 UTF-8 输出，避免表头行解析出替换字符
        let output = Command::new("cmd")
            .args(["/c", "chcp", "65001", ">", "nul", "&&", "netstat", "-ano"])
            .output();
        let output = match output {
            Ok(o) => o,
            Err(e) => return Err(format!("netstat 执行失败: {e}")),
        };
        let text = String::from_utf8_lossy(&output.stdout);
        Ok(ports::parse_netstat(&text))
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 开发服务器 = LISTENING 的 TCP 端口 + 命令行命中框架规则的进程。
#[tauri::command(async)]
pub async fn list_dev_servers() -> Result<Vec<DevServer>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = Command::new("cmd")
            .args(["/c", "chcp", "65001", ">", "nul", "&&", "netstat", "-ano"])
            .output();
        let output = match output {
            Ok(o) => o,
            Err(e) => return Err(format!("netstat 执行失败: {e}")),
        };
        let text = String::from_utf8_lossy(&output.stdout);
        let ports = ports::parse_netstat(&text);
        let procs = procs::snapshot_processes();
        let pid_index = build_pid_index(procs);

        let mut servers = Vec::new();
        for entry in ports.iter().filter(|e| e.protocol == "TCP") {
            let is_listening = entry.state.eq_ignore_ascii_case("LISTENING");
            if !is_listening || entry.local_port == 0 {
                continue;
            }
            let proc = match pid_index.get(&entry.pid) {
                Some(p) => p,
                None => continue,
            };
            let cmd_lower = proc.cmd_line.to_ascii_lowercase();
            let exe_name_lower = std::path::Path::new(&proc.exe_path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default()
                .to_ascii_lowercase();
            let classified = devserver::classify_dev_server(&cmd_lower, &exe_name_lower);
            if let Some((framework, confidence)) = classified {
                let cmd_parts: Vec<String> =
                    proc.cmd_line.split(' ').map(|s| s.to_string()).collect();
                let project_dir = devserver::guess_project_dir(&cmd_parts, &proc.exe_path);
                servers.push(DevServer {
                    port: entry.local_port,
                    protocol: entry.protocol.clone(),
                    pid: entry.pid,
                    process_name: proc.name.clone(),
                    framework: framework.to_string(),
                    project_dir,
                    cmd_line: proc.cmd_line.clone(),
                    confidence,
                });
            }
        }
        servers.sort_by_key(|s| s.port);
        servers.dedup_by_key(|s| s.port);
        log::debug!("list_dev_servers 返回 {} 条", servers.len());
        Ok(servers)
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

#[tauri::command(async)]
pub async fn list_ai_processes() -> Result<Vec<AiProcess>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let procs = procs::snapshot_processes();
        let mut out = Vec::new();
        for p in procs {
            let name_lower = p.name.to_ascii_lowercase();
            let cmd_lower = p.cmd_line.to_ascii_lowercase();
            let exe_lower = p.exe_path.to_ascii_lowercase();
            let Some(kw) = ai::find_ai_keyword(&name_lower, &cmd_lower, &exe_lower) else {
                continue;
            };
            out.push(AiProcess {
                pid: p.pid,
                name: p.name.clone(),
                exe_path: p.exe_path.clone(),
                cmd_line: p.cmd_line.clone(),
                matched: kw.to_string(),
                memory: p.memory,
                start_time: p.start_time,
            });
        }
        out.sort_by_key(|a| a.name.clone());
        Ok(out)
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// opencode 会话列表 + 实际命中的服务端口（前端详情请求必须复用该端口）。
#[derive(serde::Serialize)]
pub struct OpencodeSessionsResult {
    pub port: u16,
    pub sessions: Vec<OpencodeSession>,
}

/// 拉取 opencode 在线会话。端口发现：默认 4096 + AI 进程命令行里的 --port；
/// 逐个尝试直到成功，全部失败才报错。
#[tauri::command(async)]
pub async fn opencode_sessions() -> Result<OpencodeSessionsResult, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let procs = procs::snapshot_processes();
        let mut ports = vec![4096u16];
        ports.extend(discover_opencode_ports(&procs));
        ports.sort();
        ports.dedup();
        let mut last_err = String::new();
        for port in ports {
            match ai::fetch_opencode_sessions(port) {
                Ok(sessions) => return Ok(OpencodeSessionsResult { port, sessions }),
                Err(e) => last_err = e,
            }
        }
        log::warn!("opencode 服务未检测到（默认端口 4096）: {last_err}");
        Err(format!(
            "未检测到运行中的 opencode 服务（默认端口 4096）：{last_err}"
        ))
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

fn discover_opencode_ports(procs: &[ProcInfo]) -> Vec<u16> {
    let mut ports = Vec::new();
    for p in procs {
        let hay = p.cmd_line.to_ascii_lowercase();
        let name = p.name.to_ascii_lowercase();
        let exe = p.exe_path.to_ascii_lowercase();
        if !name.contains("opencode") && !exe.contains("opencode") {
            continue;
        }
        let tokens: Vec<&str> = hay.split_whitespace().collect();
        for (i, t) in tokens.iter().enumerate() {
            if let Some(rest) = t.strip_prefix("--port=") {
                if let Ok(v) = rest.parse::<u16>() {
                    ports.push(v);
                }
            } else if (*t == "--port" || *t == "-p") && i + 1 < tokens.len() {
                if let Ok(v) = tokens[i + 1].parse::<u16>() {
                    ports.push(v);
                }
            }
        }
    }
    ports.sort_unstable();
    ports.dedup();
    ports
}

#[tauri::command(async)]
pub async fn recent_sessions() -> Result<Vec<SessionFile>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let home = dirs_home().ok_or_else(|| "无法定位用户主目录".to_string())?;
        Ok(ai::scan_session_files(&home))
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

// ── AI 会话详情 ──────────────────────────────────────────

/// 拉取单个 opencode 会话详情（消息数量、预览、工具使用等）。
#[tauri::command(async)]
pub async fn opencode_session_detail(port: u16, session_id: String) -> Result<SessionDetail, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(ai::fetch_session_detail(port, &session_id))
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 增强扫描本地会话文件，附带消息条数和内容预览。
#[tauri::command(async)]
pub async fn recent_sessions_preview() -> Result<Vec<SessionFilePreview>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let home = dirs_home().ok_or_else(|| "无法定位用户主目录".to_string())?;
        Ok(ai::scan_session_files_with_preview(&home))
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 探测项目的 git 分支信息。
#[tauri::command(async)]
pub async fn git_branch(dir: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("git")
            .args(["-C", &dir, "branch", "--show-current"])
            .output();
        match output {
            Ok(o) if o.status.success() => {
                let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                Ok(s)
            }
            Ok(_) => Ok(String::new()),
            Err(_) => Ok(String::new()),
        }
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

fn dirs_home() -> Option<std::path::PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(std::path::PathBuf::from)
}

// ── 系统信息 ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub hostname: String,
    pub os_name: String,
    pub cpu_cores: usize,
    pub total_memory: u64,
    pub uptime_seconds: u64,
}

#[tauri::command(async)]
pub async fn system_info() -> Result<SystemInfo, String> {
    tauri::async_runtime::spawn_blocking(|| {
        use sysinfo::System;
        let system = System::new_all();

        let hostname = System::host_name().unwrap_or_else(|| "Unknown".to_string());
        let os_name = System::long_os_version()
            .or_else(System::os_version)
            .unwrap_or_else(|| "Windows".to_string());
        let cpu_cores = system.cpus().len();
        let total_memory = system.total_memory();
        let uptime_seconds = System::uptime();

        Ok(SystemInfo {
            hostname,
            os_name,
            cpu_cores,
            total_memory,
            uptime_seconds,
        })
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

// ── 磁盘信息 ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo {
    pub label: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_bytes: u64,
    pub is_removable: bool,
}

#[tauri::command(async)]
pub async fn disk_info() -> Result<Vec<DiskInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        use sysinfo::Disks;
        let disks_list = Disks::new_with_refreshed_list();

        let mut disks = Vec::new();
        for d in disks_list.list() {
            let total = d.total_space();
            if total == 0 {
                continue;
            }
            let available = d.available_space();
            let label = d
                .name()
                .to_string_lossy()
                .into_owned();
            if label.is_empty() {
                let mp = d.mount_point();
                if mp == std::path::Path::new("/") {
                    continue;
                }
            }
            disks.push(DiskInfo {
                label: if label.is_empty() {
                    d.mount_point().to_string_lossy().into_owned()
                } else {
                    label
                },
                mount_point: d.mount_point().to_string_lossy().into_owned(),
                total_bytes: total,
                available_bytes: available,
                used_bytes: total.saturating_sub(available),
                is_removable: d.is_removable(),
            });
        }
        Ok(disks)
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

#[tauri::command]
pub fn load_data(app: AppHandle) -> WorkbenchData {
    data::load_from_disk(&app)
}

#[tauri::command]
pub fn save_data(app: AppHandle, data: WorkbenchData) -> Result<(), String> {
        log::debug!("持久化数据: {} 项目 {} 任务", data.projects.len(), data.tasks.len());
        data::save_to_disk(&app, &data)
}

// ── 日志读取 ──────────────────────────────────────────────

#[tauri::command]
pub fn read_logs(app: AppHandle, max_lines: usize) -> String {
    crate::logging_setup::read_recent_logs(&app, max_lines)
}

#[tauri::command]
pub fn clear_logs(app: AppHandle) -> Result<(), String> {
    crate::logging_setup::clear_logs(&app)
}

// ════════════════════════════════════════════════════════════
// 成本计量相关 IPC 命令
// ════════════════════════════════════════════════════════════

/// 扫描 session JSONL 文件 → 提取 usage → 计算成本 → 持久化到 cost_data.json
/// 注意：成本计量必须全量扫描（不受 UI 预览的 10 条上限影响）。
#[tauri::command(async)]
pub async fn scan_session_costs(app: AppHandle) -> Result<ScanCostResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let home = dirs_home().ok_or_else(|| "无法定位用户主目录".to_string())?;
        let session_files = ai::collect_all_session_files(&home);

        // 已有的记录 key 集合（(path, mtime, size) 未变化的文件跳过重算）
        let existing = cost_store::load_cost_data(&app);
        let existing_keys: HashMap<(String, u64, u64), ()> = existing
            .records
            .iter()
            .map(|r| ((r.file_path.clone(), r.file_mtime, r.file_size), ()))
            .collect();

        // 组装 entry
        let entries: Vec<SessionFileEntry> = session_files
            .iter()
            .map(|f| SessionFileEntry {
                path: f.path.clone(),
                tool: f.tool.clone(),
                project: f.project.clone(),
                modified: f.modified,
                size: f.size,
            })
            .collect();

        // 获取当前定价表（用户自定价覆盖内置快照）
        let pricing_table = build_pricing_table(&app, &existing);

        // 扫描
        let records = session_meter::scan_sessions_to_records(&entries, &pricing_table, &existing_keys);

        let new_count = records.len();
        let added = cost_store::import_records(&app, &records)?;

        // 构建聚合视图
        let overview = cost_store::build_overview(&app);
        let trend = cost_store::build_trend(&app, 14);
        let model_breakdown = cost_store::build_model_breakdown(&app);

        Ok(ScanCostResult {
            new_records: added,
            total_scanned: new_count,
            overview,
            trend,
            model_breakdown,
        })
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 获取成本总览（不重新扫描）
#[tauri::command]
pub fn get_cost_overview(app: AppHandle) -> CostOverview {
    cost_store::build_overview(&app)
}

/// 获取成本趋势
#[tauri::command]
pub fn get_cost_trend(app: AppHandle, days: usize) -> Vec<CostTrendRow> {
    cost_store::build_trend(&app, days)
}

/// 按模型分解成本
#[tauri::command]
pub fn get_model_breakdown(app: AppHandle) -> Vec<ModelBreakdownRow> {
    cost_store::build_model_breakdown(&app)
}

/// 获取 / 保存成本设置（预算 / 自定价 / 告警阈值）
#[tauri::command]
pub fn get_cost_settings_cmd(app: AppHandle) -> CostSettings {
    cost_store::get_cost_settings(&app)
}

#[tauri::command]
pub fn save_cost_settings_cmd(app: AppHandle, settings: CostSettings) -> Result<(), String> {
    cost_store::save_cost_settings(&app, settings)
}

/// 清空全部成本记录
#[tauri::command]
pub fn clear_cost_records(app: AppHandle) -> Result<(), String> {
    cost_store::clear_records(&app)
}

/// 扫描结果回传
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanCostResult {
    pub new_records: usize,
    pub total_scanned: usize,
    pub overview: CostOverview,
    pub trend: Vec<CostTrendRow>,
    pub model_breakdown: Vec<ModelBreakdownRow>,
}

/// 构造当前定价表 = 内置快照 + 用户覆盖（自定价放在 cost_data.json 内的 settings 里）
/// 目前简单实现：用户覆盖单独存一个 pricing_overrides.json 文件。
fn build_pricing_table(app: &AppHandle, _cost_data: &CostData) -> PricingTable {
    let mut table = PricingTable::default();
    // 读取覆盖文件
    if let Ok(path) = cost_store::cost_data_path_overrides(app) {
        if let Ok(text) = std::fs::read_to_string(&path) {
            if let Ok(overrides) = serde_json::from_str::<HashMap<String, (f64, f64)>>(&text) {
                table.overrides = overrides;
            }
        }
    }
    table
}
