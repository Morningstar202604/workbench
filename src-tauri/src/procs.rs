//! 进程快照：sysinfo 双次采样拿 CPU%，阻塞调用放在 spawn_blocking 里，不卡 UI 线程。

use serde::Serialize;
use sysinfo::{Pid, ProcessesToUpdate, System};

#[derive(Serialize, Clone, Debug)]
pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
    pub exe_path: String,
    pub cmd_line: String,
    pub cpu: f32,
    pub memory: u64,
    pub parent_pid: Option<u32>,
    pub status: String,
    pub start_time: u64,
}

/// 把 sysinfo 的 ProcessStatus 枚举映射成中文状态标签。
fn status_label(status: &sysinfo::ProcessStatus) -> String {
    match status {
        sysinfo::ProcessStatus::Run => "运行中".to_string(),
        sysinfo::ProcessStatus::Sleep => "休眠".to_string(),
        sysinfo::ProcessStatus::Idle => "空闲".to_string(),
        sysinfo::ProcessStatus::Stop => "已停止".to_string(),
        sysinfo::ProcessStatus::Zombie => "僵尸".to_string(),
        sysinfo::ProcessStatus::Dead => "已终止".to_string(),
        sysinfo::ProcessStatus::Tracing => "追踪中".to_string(),
        sysinfo::ProcessStatus::Wakekill => "唤醒中".to_string(),
        sysinfo::ProcessStatus::Waking => "正在唤醒".to_string(),
        sysinfo::ProcessStatus::Parked => "已停放".to_string(),
        sysinfo::ProcessStatus::LockBlocked => "锁阻塞".to_string(),
        sysinfo::ProcessStatus::UninterruptibleDiskSleep => "磁盘休眠".to_string(),
        _ => format!("{:?}", status),
    }
}

/// 阻塞式进程快照（含 CPU 两次刷新，约 220ms）。
pub fn snapshot_processes() -> Vec<ProcInfo> {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_processes(ProcessesToUpdate::All, true);

    sys.processes()
        .values()
        .map(|p| ProcInfo {
            pid: p.pid().as_u32(),
            name: p.name().to_string_lossy().to_string(),
            exe_path: p
                .exe()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default(),
            cmd_line: p
                .cmd()
                .iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join(" "),
            cpu: p.cpu_usage(),
            memory: p.memory(),
            parent_pid: p.parent().map(|pid| pid.as_u32()),
            status: status_label(&p.status()),
            start_time: p.start_time(),
        })
        .collect()
}

/// 不允许结束的系统关键进程（小写名）。
const PROTECTED_PROCESSES: &[&str] = &[
    "system",
    "registry",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "services.exe",
    "lsass.exe",
    "winlogon.exe",
];

/// 结束指定进程（不可逆，前端必须二次确认后才调用）。
/// 目标身份先刷新再校验：拿到的是旧快照时，PID 可能已被系统复用给别的进程，
/// 直接 kill 等于误杀。刷新后重新确认名字不是关键进程才动手。
pub fn terminate_process(pid: u32) -> Result<(), String> {
    if matches!(pid, 0 | 4) {
        return Err(format!("拒绝终止系统关键进程 PID={pid}"));
    }
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let target = Pid::from_u32(pid);
    match sys.process(target) {
        Some(p) => {
            let name = p.name().to_string_lossy().to_ascii_lowercase();
            if PROTECTED_PROCESSES.contains(&name.as_str()) {
                return Err(format!("拒绝终止系统关键进程「{name}」"));
            }
            if p.kill() {
                Ok(())
            } else {
                Err("进程拒绝终止或已退出".to_string())
            }
        }
        None => Err(format!("找不到进程 {pid}")),
    }
}
