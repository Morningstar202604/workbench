//! 无界面模式：同一个可执行文件既是桌面应用，也是命令行工具。
//!
//! 为什么需要它：这台机器上有大量「一次性看一眼」的需求——端口被谁占了、
//! 哪个进程在烧 CPU、成本库现在多少条。为这些打开一个 1440×900 的窗口是浪费。
//! 竞品里 ccusage（`--json`）和 Glances（REST）都把「可被脚本消费」当作一等能力，
//! 这里先补最小的一层：`ps` / `ports` / `diag`，都支持 `--json`。
//!
//! 设计边界：CLI **只读**。不提供 kill / 改配置，避免把不可逆操作藏进脚本里；
//! 需要写入的路径继续走桌面 UI 的确认流程。

use crate::diagnostics;
use crate::ports;
use crate::procs;
use serde_json::json;

const HELP: &str = "\
workbench — local-first desktop workbench

USAGE:
    workbench <command> [--json]

COMMANDS:
    ps        List every process (pid, name, cpu%, memory, parent, status)
    ports     List listening TCP/UDP ports with the owning PID
    diag      Environment self-check (platform, data dir, session folders, port tools)
    --version Print the version
    --help    Print this help

OPTIONS:
    --json    Machine-readable output (one JSON document on stdout)

NOTES:
    With no arguments the desktop app starts as usual.
    The CLI is read-only: killing processes stays in the GUI confirmation flow.
";

fn data_dir() -> std::path::PathBuf {
    // 与 Tauri 的 app_data_dir 保持一致：Windows 是 %APPDATA%/<identifier>，
    // Linux 是 ~/.local/share/<identifier>，macOS 是 ~/Library/Application Support/<identifier>。
    let id = "com.workbench.desktop";
    if let Some(v) = std::env::var_os("WORKBENCH_DATA_DIR") {
        return std::path::PathBuf::from(v);
    }
    #[cfg(windows)]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            return std::path::PathBuf::from(appdata).join(id);
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            return std::path::PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join(id);
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(data) = std::env::var_os("XDG_DATA_HOME") {
            return std::path::PathBuf::from(data).join(id);
        }
        if let Some(home) = std::env::var_os("HOME") {
            return std::path::PathBuf::from(home)
                .join(".local")
                .join("share")
                .join(id);
        }
    }
    std::env::temp_dir().join(id)
}

/// 写 stdout。
///
/// Windows 上主程序是 `windows_subsystem = "windows"`，双击启动时没有控制台；
/// 从终端启动时父进程有控制台但本进程没附着到它，`println!` 会被丢弃。
/// 三种情况都要正确写出，否则 `--version > out.txt` 会得到空文件：
/// 1) 输出被重定向到文件 / 管道 —— 标准句柄有效，直接写；
/// 2) 从 cmd / PowerShell 启动 —— 附着父控制台后写 `CONOUT$`；
/// 3) mintty 等无控制台环境 —— 没有句柄可写，放弃（进程仍以正确码退出）。
fn emit(text: &str) {
    #[cfg(windows)]
    {
        use std::io::Write;
        extern "system" {
            fn GetStdHandle(n_std_handle: u32) -> *mut core::ffi::c_void;
            fn GetFileType(h_file: *mut core::ffi::c_void) -> u32;
            fn AttachConsole(dw_process_id: u32) -> i32;
        }
        const STD_OUTPUT_HANDLE: u32 = 0xFFFF_FFF5;
        const ATTACH_PARENT_PROCESS: u32 = 0xFFFF_FFFF;
        const FILE_TYPE_UNKNOWN: u32 = 0;
        const INVALID_HANDLE_VALUE: isize = -1;

        let handle = unsafe { GetStdHandle(STD_OUTPUT_HANDLE) };
        let valid = !handle.is_null()
            && handle as isize != INVALID_HANDLE_VALUE
            && unsafe { GetFileType(handle) } != FILE_TYPE_UNKNOWN;
        if valid {
            let mut out = std::io::stdout();
            let _ = out.write_all(text.as_bytes());
            let _ = out.write_all(
                b"
",
            );
            let _ = out.flush();
            return;
        }
        unsafe {
            AttachConsole(ATTACH_PARENT_PROCESS);
        }
        if let Ok(mut con) = std::fs::OpenOptions::new().write(true).open("CONOUT$") {
            let _ = con.write_all(text.as_bytes());
            let _ = con.write_all(
                b"
",
            );
            return;
        }
    }
    println!("{text}");
}

fn ps_text(rows: &[procs::ProcInfo]) -> String {
    let mut out = format!(
        "{:>7}  {:<24} {:>7} {:>10}  {:<10} {}\n",
        "PID", "NAME", "CPU%", "MEM", "STATUS", "COMMAND"
    );
    for p in rows {
        let cmd = if p.cmd_line.is_empty() {
            p.exe_path.clone()
        } else {
            p.cmd_line.clone()
        };
        let cmd = if cmd.chars().count() > 70 {
            let tail: String = cmd
                .chars()
                .rev()
                .take(67)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect();
            format!("...{tail}")
        } else {
            cmd
        };
        out.push_str(&format!(
            "{:>7}  {:<24} {:>7.1} {:>10}  {:<10} {}\n",
            p.pid,
            truncate(&p.name, 24),
            p.cpu,
            p.memory,
            truncate(&p.status, 10),
            cmd
        ));
    }
    out.trim_end().to_string()
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        return s.to_string();
    }
    let head: String = s.chars().take(n.saturating_sub(1)).collect();
    format!("{head}…")
}

fn ports_text(rows: &[ports::PortEntry]) -> String {
    let mut out = format!(
        "{:<5} {:>6} {:<24} {:<12} {}\n",
        "PROTO", "PORT", "ADDRESS", "STATE", "PID"
    );
    for p in rows {
        out.push_str(&format!(
            "{:<5} {:>6} {:<24} {:<12} {}\n",
            p.protocol, p.local_port, p.local_addr, p.state, p.pid
        ));
    }
    out.trim_end().to_string()
}

fn diag_text(report: &diagnostics::DiagnosticsReport) -> String {
    let mut out = format!(
        "workbench {} · {}\n{}\n\n",
        report.app_version, report.platform, report.data_dir
    );
    for c in &report.checks {
        out.push_str(&format!(
            "[{:<4}] {:<22} {}{}\n",
            c.level.to_uppercase(),
            c.id,
            c.detail,
            if c.hint.is_empty() {
                String::new()
            } else {
                format!("  → {}", c.hint)
            }
        ));
    }
    out.push_str(&format!(
        "\n{} ok · {} warn · {} fail",
        report.ok_count, report.warn_count, report.fail_count
    ));
    out
}

/// 解析参数并执行。返回 `None` 表示「不是 CLI 调用，应该启动桌面窗口」。
pub fn try_run() -> Option<i32> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        return None;
    }
    let cmd = args[0].as_str();
    // Tauri 自身会带参数启动（如 --tauri-...），不能被当成未知命令。
    if cmd.starts_with("--tauri") || cmd.starts_with("tauri://") {
        return None;
    }
    let json_out = args.iter().any(|a| a == "--json");
    let text = match cmd {
        "-V" | "--version" => format!("workbench {}", env!("CARGO_PKG_VERSION")),
        "-h" | "--help" | "help" => HELP.trim_end().to_string(),
        "ps" => {
            let rows = procs::snapshot_processes();
            if json_out {
                serde_json::to_string_pretty(&rows)
                    .unwrap_or_else(|e| format!("{{\"error\":\"{e}\"}}"))
            } else {
                ps_text(&rows)
            }
        }
        "ports" => match ports::collect() {
            Ok(rows) => {
                if json_out {
                    serde_json::to_string_pretty(&rows)
                        .unwrap_or_else(|e| format!("{{\"error\":\"{e}\"}}"))
                } else {
                    ports_text(&rows)
                }
            }
            Err(e) => {
                if json_out {
                    json!({ "error": e }).to_string()
                } else {
                    format!("端口采集失败: {e}")
                }
            }
        },
        "diag" => {
            let report = diagnostics::collect(env!("CARGO_PKG_VERSION"), &data_dir());
            if json_out {
                serde_json::to_string_pretty(&report)
                    .unwrap_or_else(|e| format!("{{\"error\":\"{e}\"}}"))
            } else {
                diag_text(&report)
            }
        }
        other => {
            let msg = format!("未知命令: {other}\n\n{HELP}");
            emit(&msg);
            return Some(2);
        }
    };
    emit(&text);
    Some(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn help_lists_every_command() {
        for cmd in ["ps", "ports", "diag", "--version", "--json"] {
            assert!(HELP.contains(cmd), "help 缺少 {cmd}");
        }
    }

    #[test]
    fn truncate_keeps_width_and_marks_cut() {
        assert_eq!(truncate("node", 10), "node");
        let cut = truncate("a-very-long-process-name", 8);
        assert_eq!(cut.chars().count(), 8);
        assert!(cut.ends_with('…'));
    }

    #[test]
    fn data_dir_honours_override() {
        std::env::set_var("WORKBENCH_DATA_DIR", "/tmp/wb-cli-test");
        assert_eq!(data_dir(), std::path::PathBuf::from("/tmp/wb-cli-test"));
        std::env::remove_var("WORKBENCH_DATA_DIR");
    }

    #[test]
    fn ps_text_has_a_header_and_one_line_per_row() {
        use crate::procs::ProcInfo;
        let row = ProcInfo {
            pid: 42,
            name: "demo".into(),
            exe_path: "/bin/demo".into(),
            cmd_line: "demo --flag".into(),
            argv: vec!["demo".into()],
            cwd: "/".into(),
            cpu: 1.5,
            memory: 1024,
            parent_pid: None,
            status: "Run".into(),
            start_time: 0,
        };
        let text = ps_text(&[row]);
        assert!(text.lines().next().unwrap().contains("PID"));
        assert_eq!(text.lines().count(), 2);
        assert!(text.contains("demo --flag"));
    }
}
