//! 日志系统：写日志到 app_data_dir/workbench.log。
//! - 启动时滚动：文件超过 5MB 则 rename 为 workbench.log.1（旧 .1 删除），防止无限增长。
//! - 读取采用尾部倒读（tail），日志再大也只按需读取最后几块，避免整文件载入。
use chrono::Local;
use log::LevelFilter;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
const TAIL_CHUNK: u64 = 64 * 1024;

pub fn init_logging(app: &AppHandle) {
    let log_path = match log_file_path(app) {
        Some(p) => p,
        None => return,
    };
    rotate_on_startup(&log_path);

    let config = fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{}] [{}]: {}",
                Local::now().format("%Y-%m-%d %H:%M:%S"),
                record.level(),
                message
            ))
        })
        .level(LevelFilter::Debug)
        .chain(fern::log_file(&log_path).unwrap_or_else(|e| {
            panic!("无法初始化日志文件 {}: {e}", log_path.display())
        }));

    if config.apply().is_err() {
        eprintln!("日志初始化失败");
    }
}

/// 启动时检查大小，超限滚动一份备份。
fn rotate_on_startup(path: &std::path::Path) {
    let Ok(meta) = fs::metadata(path) else { return };
    if meta.len() <= MAX_LOG_BYTES {
        return;
    }
    let backup = path.with_extension("log.1");
    fs::remove_file(&backup).ok();
    fs::rename(path, &backup).ok();
}

fn log_file_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("workbench.log"))
}

/// 读取最近 max_lines 行日志（尾部倒读，前端调用）。
pub fn read_recent_logs(app: &AppHandle, max_lines: usize) -> String {
    let path = match log_file_path(app) {
        Some(p) => p,
        None => return String::new(),
    };
    let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(_) => return String::new(),
    };
    let len = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => return String::new(),
    };
    if len == 0 {
        return String::new();
    }

    // 从文件尾向前按块读取，直到凑够 max_lines+1 个换行或到文件头
    let mut chunks: Vec<Vec<u8>> = Vec::new();
    let mut pos = len;
    let mut newlines = 0usize;
    while pos > 0 && newlines <= max_lines {
        let take = TAIL_CHUNK.min(pos);
        pos -= take;
        let mut buf = vec![0u8; take as usize];
        if file.seek(SeekFrom::Start(pos)).is_err() || file.read_exact(&mut buf).is_err() {
            break;
        }
        newlines += buf.iter().filter(|b| **b == b'\n').count();
        chunks.push(buf);
    }
    chunks.reverse(); // 恢复文件顺序
    let bytes: Vec<u8> = chunks.concat();
    let text = String::from_utf8_lossy(&bytes);
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].join("\n")
}

/// 清空日志文件。
pub fn clear_logs(app: &AppHandle) -> Result<(), String> {
    let path = log_file_path(app).ok_or("无法定位日志路径")?;
    fs::write(&path, "").map_err(|e| format!("清空日志失败: {e}"))
}
