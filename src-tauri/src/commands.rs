//! IPC 命令层：前端 invoke 的唯一入口。阻塞工作全部丢进 spawn_blocking。

use tauri::{AppHandle, Manager};

use crate::ai::{self, AiProcess, OpencodeSession, SessionDetail, SessionFilePreview};
use crate::cost_store::{self, CostOverview, CostSettings, CostTrendRow, ModelBreakdownRow};
use crate::data::{self, WorkbenchData};
use crate::devserver::{self, DevServer};
use crate::ipc_guard::{AllowedPorts, KnownDirs};
use crate::ports::{self, PortEntry};
use crate::pricing::PricingTable;
use crate::procs::{self, ProcInfo};
use crate::session_meter::{self, SessionFileEntry};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;

/// 派生外部命令（Windows 上不闪控制台窗口）。
///
/// 目前只有 git 探测走这里；端口采集已统一到 procs::run_quiet
/// （按平台选 netstat / ss）。
fn silent(cmd: Command) -> Command {
    #[cfg(windows)]
    let mut cmd = cmd;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // 0x08000000 = CREATE_NO_WINDOW
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

/// 端口采样短缓存。`list_ports` 与 `list_dev_servers` 在一次前端刷新里
/// 各要一份端口表，原先各起一次采集子进程；这里让同一刷新周期共享。
const PORTS_TTL: std::time::Duration = std::time::Duration::from_millis(400);

fn cached_port_entries() -> Result<Vec<PortEntry>, String> {
    use std::sync::Mutex;
    use std::time::Instant;
    static CACHE: Mutex<Option<(Instant, Vec<PortEntry>)>> = Mutex::new(None);

    let mut guard = CACHE.lock().unwrap_or_else(|p| p.into_inner());
    if let Some((at, entries)) = guard.as_ref() {
        if at.elapsed() < PORTS_TTL {
            return Ok(entries.clone());
        }
    }
    let entries = ports::collect()?;
    *guard = Some((Instant::now(), entries.clone()));
    Ok(entries)
}

/// 构建 PID 索引哈希表（消除 O(n*m) 端口→进程扫描）
fn build_pid_index(procs: Vec<ProcInfo>) -> HashMap<u32, ProcInfo> {
    procs.into_iter().map(|p| (p.pid, p)).collect()
}

#[tauri::command(async)]
pub async fn list_processes() -> Result<Vec<ProcInfo>, String> {
    tauri::async_runtime::spawn_blocking(procs::snapshot_processes)
        .await
        .map_err(|e| format!("任务执行失败: {e}"))
}

#[tauri::command(async)]
pub async fn terminate_process(pid: u32) -> Result<(), String> {
    log::info!("请求终止进程 PID={pid}");
    let result = tauri::async_runtime::spawn_blocking(move || procs::terminate_process(pid))
        .await
        .map_err(|e| format!("任务执行失败: {e}"))?;
    // 终止后强制刷新快照，否则前端立刻刷新时可能读到 400ms 内的旧快照
    if result.is_ok() {
        let _ = tauri::async_runtime::spawn_blocking(procs::snapshot_processes_fresh).await;
    }
    result
}

#[tauri::command(async)]
pub async fn list_ports() -> Result<Vec<PortEntry>, String> {
    tauri::async_runtime::spawn_blocking(cached_port_entries)
        .await
        .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 开发服务器 = LISTENING 的 TCP 端口 + 命令行命中框架规则的进程。
#[tauri::command(async)]
pub async fn list_dev_servers(dirs: tauri::State<'_, KnownDirs>) -> Result<Vec<DevServer>, String> {
    let servers = tauri::async_runtime::spawn_blocking(|| -> Result<Vec<DevServer>, String> {
        let ports = cached_port_entries()?;
        let procs = procs::snapshot_processes();
        let pid_index = build_pid_index(procs);

        let mut servers = Vec::new();
        for entry in ports.iter().filter(|e| e.protocol == "TCP") {
            if !ports::is_listening(&entry.state) || entry.local_port == 0 {
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
                // 用结构化 argv 而不是把 cmd_line 按空格重切：含空格的路径
                // 会被切碎，推出一个不存在的相对目录并被登记进白名单。
                let project_dir =
                    devserver::guess_project_dir(&proc.argv, &proc.exe_path, &proc.cwd);
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
        Ok(servers)
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))??;

    // 这些目录会以 project_dir 的形式回到前端，再被 git_branch / open_path 传回来，
    // 因此同步登记为「后端主动展示过的目录」。
    dirs.record(
        servers
            .iter()
            .filter_map(|s| s.project_dir.as_deref())
            .filter(|d| !d.is_empty()),
    );
    Ok(servers)
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
#[derive(serde::Serialize, ts_rs::TS)]
pub struct OpencodeSessionsResult {
    pub port: u16,
    pub sessions: Vec<OpencodeSession>,
}

/// 拉取 opencode 在线会话。端口发现：默认 4096 + AI 进程命令行里的 --port；
/// 逐个尝试直到成功，全部失败才报错。
#[tauri::command(async)]
pub async fn opencode_sessions(
    ports_state: tauri::State<'_, AllowedPorts>,
) -> Result<OpencodeSessionsResult, String> {
    let result = tauri::async_runtime::spawn_blocking(|| {
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
    .map_err(|e| format!("任务执行失败: {e}"))??;

    // 只允许详情请求复用刚刚探测成功的端口
    ports_state.record([result.port]);
    Ok(result)
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

// ── AI 会话详情 ──────────────────────────────────────────

/// 拉取单个 opencode 会话详情（消息数量、预览、工具使用等）。
/// 端口必须是上一次 opencode_sessions 真正探测成功的端口。
#[tauri::command(async)]
pub async fn opencode_session_detail(
    ports_state: tauri::State<'_, AllowedPorts>,
    port: u16,
    session_id: String,
) -> Result<SessionDetail, String> {
    if !ports_state.contains(port) {
        log::warn!("拒绝未探测过的端口上的会话详情请求: {port}");
        return Err("端口不在允许列表内，请刷新会话列表".to_string());
    }
    let detail =
        tauri::async_runtime::spawn_blocking(move || ai::fetch_session_detail(port, &session_id))
            .await
            .map_err(|e| format!("任务执行失败: {e}"))?;
    Ok(detail)
}

#[tauri::command(async)]
pub async fn recent_sessions_preview() -> Result<Vec<SessionFilePreview>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let home = dirs_home().ok_or_else(|| "无法定位用户主目录".to_string())?;
        Ok(ai::scan_session_files_with_preview(&home))
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 探测项目的 git 分支信息。只接受后端此前展示过的目录 —— `git -C <任意目录>`
/// 会执行该仓库配置的 fsmonitor / filter 钩子，恶意目录即等于本机代码执行。
#[tauri::command(async)]
pub async fn git_branch(dirs: tauri::State<'_, KnownDirs>, dir: String) -> Result<String, String> {
    if !dirs.contains(&dir) {
        log::warn!("拒绝未登记的目录 git 探测: {dir}");
        return Err("该目录不在允许列表内".to_string());
    }
    let output = tauri::async_runtime::spawn_blocking(move || {
        silent(Command::new("git"))
            .args(["-C", &dir, "branch", "--show-current"])
            .output()
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
    .map_err(|e| format!("git 执行失败: {e}"))?;
    if !output.status.success() {
        return Ok(String::new());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// 切换主窗口置顶。前端在标题栏提供开关；失败时前端回滚状态。
#[tauri::command]
pub fn set_always_on_top(window: tauri::Window, on: bool) -> Result<(), String> {
    window
        .set_always_on_top(on)
        .map_err(|e| format!("设置置顶失败: {e}"))
}

/// 用系统默认程序打开目录。同样只允许后端展示过的目录，等价于把
/// opener 的 `allow-open-path` 从 WebView 权限面里彻底拿掉。
#[tauri::command]
pub fn open_known_path(dirs: tauri::State<'_, KnownDirs>, path: String) -> Result<(), String> {
    if path.is_empty() || !dirs.contains(&path) {
        log::warn!("拒绝打开未登记的路径: {path}");
        return Err("该路径不在允许列表内".to_string());
    }
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| format!("打开失败: {e}"))
}

/// 用户主目录。Windows 用 USERPROFILE，Unix 用 HOME。
pub fn home_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("USERPROFILE")
        .filter(|v| !v.is_empty())
        .or_else(|| std::env::var_os("HOME").filter(|v| !v.is_empty()))
        .map(std::path::PathBuf::from)
}

fn dirs_home() -> Option<std::path::PathBuf> {
    home_dir()
}

// ── 系统信息 ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
pub struct SystemInfo {
    pub hostname: String,
    pub os_name: String,
    pub cpu_cores: usize,
    #[ts(type = "number")]
    pub total_memory: u64,
    #[ts(type = "number")]
    pub uptime_seconds: u64,
}

/// 系统静态信息。这些值在一次运行里几乎不变，缓存起来避免重复枚举进程表。
///
/// 原先每次刷新都 `System::new_all()`（实测 380–830ms，会枚举全部进程、
/// 环境变量、可执行路径），只为拿核数/总内存/uptime —— 每 3 秒白烧一次
/// 全量进程枚举。现在只用 memory-only 刷新（微秒级）+ 静态 API。
fn cached_system_info() -> SystemInfo {
    use std::sync::OnceLock;
    static CACHE: OnceLock<SystemInfo> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            use sysinfo::{MemoryRefreshKind, RefreshKind, System};
            // 只刷新内存总量：不需要进程、磁盘、网络信息
            let system = System::new_with_specifics(
                RefreshKind::nothing().with_memory(MemoryRefreshKind::nothing().with_ram()),
            );
            SystemInfo {
                hostname: System::host_name().unwrap_or_else(|| "Unknown".to_string()),
                os_name: System::long_os_version()
                    .or_else(System::os_version)
                    .unwrap_or_else(|| "Windows".to_string()),
                cpu_cores: std::thread::available_parallelism()
                    .map(|n| n.get())
                    .unwrap_or(0),
                total_memory: system.total_memory(),
                uptime_seconds: System::uptime(),
            }
        })
        .clone()
}

#[tauri::command(async)]
pub async fn system_info() -> Result<SystemInfo, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut info = cached_system_info();
        // uptime 会随时间走，单独刷新；其余字段（主机名/OS/核数/总内存）进程内不变
        info.uptime_seconds = sysinfo::System::uptime();
        Ok(info)
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

// ── 磁盘信息 ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
pub struct DiskInfo {
    pub label: String,
    pub mount_point: String,
    #[ts(type = "number")]
    pub total_bytes: u64,
    #[ts(type = "number")]
    pub available_bytes: u64,
    #[ts(type = "number")]
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
            let label = d.name().to_string_lossy().into_owned();
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

#[tauri::command(async)]
pub async fn load_data(
    app: AppHandle,
    dirs: tauri::State<'_, KnownDirs>,
) -> Result<WorkbenchData, String> {
    let data = data::load_from_disk(&app)?;
    // data.json 可能被外部编辑过，回灌白名单时同样要过存在性校验。
    // 校验含 Path::is_dir()：断开的 UNC / 映射盘会阻塞数秒，
    // 因此必须在 spawn_blocking 里做（这两个命令原先是非 async，跑在主线程）。
    let paths: Vec<String> = data.projects.iter().map(|p| p.path.clone()).collect();
    let total = paths.len();
    let accepted = dirs.record_validated_blocking(paths).await?;
    log::debug!("从 data.json 登记 {accepted} 个有效项目目录（共 {total} 个）");
    Ok(data)
}

#[tauri::command(async)]
pub async fn save_data(
    app: AppHandle,
    dirs: tauri::State<'_, KnownDirs>,
    data: WorkbenchData,
) -> Result<(), String> {
    log::debug!(
        "持久化数据: {} 项目 {} 任务",
        data.projects.len(),
        data.tasks.len()
    );
    // 入参来自 WebView：只登记真实存在的绝对目录，避免注入脚本借 save_data
    // 把任意目录灌进白名单后，再用 git_branch / open_known_path 触达它。
    // 存在性校验会触碰文件系统，放进阻塞线程，避免断网盘卡住主线程。
    let paths: Vec<String> = data.projects.iter().map(|p| p.path.clone()).collect();
    let accepted = dirs.record_validated_blocking(paths).await?;
    log::debug!("save_data 登记 {accepted} 个项目目录");
    // 与 Agent 的 create_task 共用一把锁：前端防抖保存是整文件替换，
    // 不加锁会盖掉另一个线程刚做的读-改-写。
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || data::save_to_disk(&app2, &data))
        .await
        .map_err(|e| format!("任务执行失败: {e}"))?
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

        // 已有记录快照仅用于跳过未变化的文件（纯加速，不影响正确性：
        // 入库按 file_path 整组替换，重复扫描同一文件不会叠加）。
        let existing_keys = cost_store::existing_keys(&app)?;
        let pricing_table = build_pricing_table(&app);
        let records =
            session_meter::scan_sessions_to_records(&entries, &pricing_table, &existing_keys);
        let total_scanned = records.len();

        // 落库 + 三个聚合视图在同一次加锁/读写下完成
        let outcome = cost_store::import_and_aggregate(&app, &records, 14)?;

        Ok(ScanCostResult {
            new_records: outcome.net_new,
            total_scanned,
            overview: outcome.overview,
            trend: outcome.trend,
            model_breakdown: outcome.breakdown,
        })
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

// 成本读取全部走 spawn_blocking：这几个命令一次要读并解析整个 cost_data.json
// （上万条记录时单次数十毫秒），而 Tauri 的非 async 命令在主线程执行 ——
// 前端进入 AI 页时用 Promise.all 同时发 4 个，等于把主线程冻结数百毫秒。

/// 获取成本总览（不重新扫描）
#[tauri::command(async)]
pub async fn get_cost_overview(app: AppHandle) -> Result<CostOverview, String> {
    tauri::async_runtime::spawn_blocking(move || cost_store::build_overview(&app))
        .await
        .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 获取成本趋势
#[tauri::command(async)]
pub async fn get_cost_trend(app: AppHandle, days: usize) -> Result<Vec<CostTrendRow>, String> {
    tauri::async_runtime::spawn_blocking(move || cost_store::build_trend(&app, days))
        .await
        .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 按模型分解成本
#[tauri::command(async)]
pub async fn get_model_breakdown(app: AppHandle) -> Result<Vec<ModelBreakdownRow>, String> {
    tauri::async_runtime::spawn_blocking(move || cost_store::build_model_breakdown(&app))
        .await
        .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 获取 / 保存成本设置（预算 / 告警阈值 / 是否计入估算）
#[tauri::command(async)]
pub async fn get_cost_settings_cmd(app: AppHandle) -> Result<CostSettings, String> {
    tauri::async_runtime::spawn_blocking(move || cost_store::get_cost_settings(&app))
        .await
        .map_err(|e| format!("任务执行失败: {e}"))?
}

#[tauri::command(async)]
pub async fn save_cost_settings_cmd(app: AppHandle, settings: CostSettings) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || cost_store::save_cost_settings(&app, settings))
        .await
        .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 清空全部成本记录
#[tauri::command(async)]
pub async fn clear_cost_records(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || cost_store::clear_records(&app))
        .await
        .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 扫描结果回传
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
pub struct ScanCostResult {
    pub new_records: usize,
    pub total_scanned: usize,
    pub overview: CostOverview,
    pub trend: Vec<CostTrendRow>,
    pub model_breakdown: Vec<ModelBreakdownRow>,
}

/// 一次完整备份：把三份数据文件复制到用户选的目录，带时间戳。
///
/// 为什么需要：`data.json` / `cost_data.json` 目前只有「损坏时保全」这一层保护，
/// 没有任何用户可用的显式备份。删除成本记录、清空数据都是不可逆的，
/// 而备份只需要三次复制。
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
pub struct BackupResult {
    pub dir: String,
    pub files: Vec<String>,
    /// 被跳过（不存在）的文件名，不算错误
    pub skipped: Vec<String>,
}

#[tauri::command(async)]
pub async fn backup_data(app: AppHandle) -> Result<BackupResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 备份写到应用自己的数据目录下，而不是让用户选路径：
        // 选目录需要额外的对话框插件（新依赖），而备份的价值在于「一键且不丢」。
        // 目标目录固定 → 不需要权限对话框，也不会因为用户选到只读盘而失败。
        let base = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("无法定位数据目录: {e}"))?;
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
        let out_dir = base.join("backups").join(&stamp);
        std::fs::create_dir_all(&out_dir).map_err(|e| format!("创建备份目录失败: {e}"))?;

        let mut files = Vec::new();
        let mut skipped = Vec::new();
        let sources: Vec<(&str, Result<std::path::PathBuf, String>)> = vec![
            ("data.json", data::data_file_path(&app)),
            ("cost_data.json", cost_store::cost_data_path_public(&app)),
            (
                "pricing_overrides.json",
                cost_store::cost_data_path_overrides(&app),
            ),
        ];
        for (name, path) in sources {
            match path {
                Ok(src) if src.exists() => {
                    // 先复制到临时名再改名：备份中途失败不会留下半个文件
                    let dst = out_dir.join(name);
                    let tmp = out_dir.join(format!("{name}.tmp"));
                    std::fs::copy(&src, &tmp).map_err(|e| format!("复制 {name} 失败: {e}"))?;
                    std::fs::rename(&tmp, &dst).map_err(|e| format!("落盘 {name} 失败: {e}"))?;
                    files.push(name.to_string());
                }
                Ok(_) => skipped.push(name.to_string()),
                Err(e) => return Err(format!("定位 {name} 失败: {e}")),
            }
        }
        log::info!(
            "数据备份完成: {} 个文件 -> {}",
            files.len(),
            out_dir.display()
        );
        Ok(BackupResult {
            dir: out_dir.to_string_lossy().to_string(),
            files,
            skipped,
        })
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 打开备份目录（只允许应用数据目录下的 `backups`）。
///
/// 不接受任意路径：这个命令的唯一用途是「备份完成后带用户去看一眼」，
/// 若允许任意路径就等于把 open_path 暴露给 WebView。
#[tauri::command(async)]
pub async fn open_backup_dir(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let base = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("无法定位数据目录: {e}"))?;
        let dir = base.join("backups");
        std::fs::create_dir_all(&dir).map_err(|e| format!("创建备份目录失败: {e}"))?;
        tauri_plugin_opener::open_path(&dir, None::<&str>).map_err(|e| format!("打开失败: {e}"))?;
        Ok(dir.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 定价覆盖：读取（含每条的校验错误）
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
pub struct PricingView {
    pub rows: Vec<crate::pricing::PricingRow>,
    /// 覆盖文件里被拒绝的条目及原因（例如单价为负）
    pub problems: Vec<String>,
    /// 覆盖文件路径，便于用户手动备份/编辑
    pub path: String,
}

#[tauri::command(async)]
pub async fn get_pricing(app: AppHandle) -> Result<PricingView, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let table = build_pricing_table(&app);
        let problems = cost_store::read_pricing_overrides(&app)?.problems;
        let path = cost_store::cost_data_path_overrides(&app)?
            .to_string_lossy()
            .to_string();
        Ok(PricingView {
            rows: table.rows(),
            problems,
            path,
        })
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 保存定价覆盖。整体替换：UI 传什么就是什么（含删除某条覆盖）。
///
/// 这里是**全部校验后才写**：任一条非法就整体拒绝，不做「跳过坏的、写入好的」——
/// 部分成功会让界面上的价格表和磁盘上的不一致，用户无法判断到底生效了什么。
#[tauri::command(async)]
pub async fn save_pricing(
    app: AppHandle,
    overrides: HashMap<String, (f64, f64)>,
) -> Result<PricingView, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut clean: HashMap<String, (f64, f64)> = HashMap::new();
        let mut problems: Vec<String> = Vec::new();
        for (model, (input, output)) in overrides {
            match crate::pricing::PricingTable::validate_override(&model, input, output) {
                Ok((key, pair)) => {
                    clean.insert(key, pair);
                }
                Err(e) => problems.push(format!("{model}: {e}")),
            }
        }
        if !problems.is_empty() {
            return Err(problems.join("；"));
        }
        cost_store::save_pricing_overrides(&app, &clean)?;
        let table = build_pricing_table(&app);
        let path = cost_store::cost_data_path_overrides(&app)?
            .to_string_lossy()
            .to_string();
        Ok(PricingView {
            rows: table.rows(),
            problems: Vec::new(),
            path,
        })
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
}

/// 构造当前定价表 = 内置快照 + 用户覆盖文件 pricing_overrides.json。
/// 覆盖文件是可选增强：损坏时降级为内置表并告警，不能让整个成本扫描失败
/// （data.json 才是用户核心数据，那里才该「保全后上抛」）。
pub fn build_pricing_table(app: &AppHandle) -> PricingTable {
    let mut table = PricingTable::default();
    // 走与 get_pricing 相同的读取路径：坏条目被逐条拒绝并记日志，
    // 而不是整个文件被静默忽略（那会让用户以为改价生效了）。
    match cost_store::read_pricing_overrides(app) {
        Ok(read) => {
            if !read.problems.is_empty() {
                log::warn!(
                    "pricing_overrides.json 有 {} 条被拒绝: {}",
                    read.problems.len(),
                    read.problems.join("; ")
                );
            }
            table.overrides = read.overrides;
        }
        Err(e) => log::warn!("pricing_overrides.json 不可用，忽略覆盖价: {e}"),
    }
    table
}
