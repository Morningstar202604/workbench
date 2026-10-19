//! IPC 反向入参守卫：前端传回来的路径 / 端口必须是后端确实展示给它的那些。
//!
//! 为什么要白名单：WebView 一旦被注入（或未来引入任何富文本渲染 bug），
//! 它就能把任意字符串塞进 `git_branch`、`open_path` 这类命令 —— `git -C <任意目录>`
//! 会执行该仓库的 fsmonitor/filter 钩子，`open_path` 会交给系统默认程序，
//! 两者都等价于本机代码执行。只允许「后端确认过存在的目录」可把攻击面压到零。

use std::collections::HashSet;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

/// Windows 路径大小写不敏感、分隔符混用，统一成一个可比较的键。
/// 同时做词法归一（吃掉 `.` 与 `..`）：否则 `C:/apps/../Windows` 会作为
/// 独立键被登记，`contains` 再用同样的拼写查询时就绕过了真实目录的约束。
/// 越过根（或相对路径往上跳）的输入一律归一为空串 —— 空键永远不会被登记/命中。
pub fn normalize_path(raw: &str) -> String {
    let unified = raw.trim().replace('\\', "/");
    let mut out: Vec<&str> = Vec::new();
    for seg in unified.split('/') {
        match seg {
            "" | "." => continue,
            ".." => {
                // 盘符前缀（c:）或根的上一层不可弹出：弹出就等于越界
                if out.is_empty() || (out.len() == 1 && out[0].ends_with(':')) {
                    return String::new();
                }
                out.pop();
            }
            s => out.push(s),
        }
    }
    out.join("/").to_ascii_lowercase()
}

fn lock<T>(slot: &Mutex<T>) -> MutexGuard<'_, T> {
    slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// 后端确认过的目录集合（必须真实存在才登记）。
#[derive(Default)]
pub struct KnownDirs(Mutex<HashSet<String>>);

impl KnownDirs {
    /// 登记后端自己观察到的目录（进程命令行解析出的项目根等）。
    /// 这类值不需要 `save_data` 那样的存在性校验 —— 它们来自正在运行的进程。
    pub fn record(&self, dirs: impl IntoIterator<Item = impl AsRef<str>>) {
        let mut guard = lock(&self.0);
        for dir in dirs {
            let key = normalize_path(dir.as_ref());
            if !key.is_empty() {
                guard.insert(key);
            }
        }
    }

    /// 登记前端提交的目录（用户手填的项目路径、以及 data.json 回灌）。
    /// 只接受「绝对路径且当前确实是目录」的值：`save_data` 的入参来自 WebView，
    /// 若照单全收，注入脚本就能把任意目录塞进白名单，再用 `git_branch` 触达它。
    pub fn record_validated(&self, dirs: impl IntoIterator<Item = impl AsRef<str>>) -> usize {
        let mut guard = lock(&self.0);
        let mut accepted = 0;
        for dir in dirs {
            let raw = dir.as_ref();
            if !is_absolute_dir(raw) {
                continue;
            }
            let key = normalize_path(raw);
            if !key.is_empty() {
                guard.insert(key);
                accepted += 1;
            }
        }
        accepted
    }

    pub fn contains(&self, raw: &str) -> bool {
        let key = normalize_path(raw);
        !key.is_empty() && lock(&self.0).contains(&key)
    }
}

/// 绝对路径 + 存在 + 是目录。相对路径一律拒绝：它会随进程工作目录漂移。
fn is_absolute_dir(raw: &str) -> bool {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return false;
    }
    let path = Path::new(trimmed);
    if !path.is_absolute() {
        return false;
    }
    path.is_dir()
}

/// `opencode_sessions` 实际命中的服务端口。会话详情只允许复用这些端口，
/// 否则前端可以拿本应用当跳板逐个端口探测本机服务。
#[derive(Default)]
pub struct AllowedPorts(Mutex<HashSet<u16>>);

impl AllowedPorts {
    pub fn record(&self, ports: impl IntoIterator<Item = u16>) {
        let mut guard = lock(&self.0);
        guard.extend(ports);
    }

    pub fn contains(&self, port: u16) -> bool {
        lock(&self.0).contains(&port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn separators_case_and_trailing_slash_are_equivalent() {
        let dirs = KnownDirs::default();
        dirs.record(["C:\\Users\\me\\proj\\"]);
        assert!(dirs.contains("c:/users/me/proj"));
        assert!(dirs.contains("  C:\\Users\\me\\proj  "));
        assert!(!dirs.contains("C:\\Users\\me\\proj-secret"));
        assert!(!dirs.contains(""));
        assert!(!dirs.contains("\\"));
    }

    #[test]
    fn prefix_of_a_known_dir_is_not_allowed() {
        let dirs = KnownDirs::default();
        dirs.record(["C:/apps"]);
        assert!(!dirs.contains("C:/apps/../windows"));
        assert!(dirs.contains("C:/apps"));
    }

    #[test]
    fn normalize_collapses_dot_segments_and_escapes_to_empty() {
        // 「..」先被词法吃掉，才谈「是否等于已登记目录」
        assert_eq!(normalize_path("C:\\apps\\sub\\..\\apps"), "c:/apps/apps");
        assert_eq!(normalize_path("C:\\apps\\sub\\.."), "c:/apps");
        assert_eq!(normalize_path("C:/apps/./"), "c:/apps");
        // 越过盘符根 / 相对路径往上跳：归一为空，永不命中
        assert_eq!(normalize_path("C:\\..\\Windows"), "");
        assert_eq!(normalize_path("../etc/passwd"), "");
        assert_eq!(normalize_path(""), "");
    }

    #[test]
    fn save_path_registration_rejects_nonexistent_or_relative_dirs() {
        let dirs = KnownDirs::default();
        let missing = std::env::temp_dir().join("wb-guard-definitely-absent-dir");
        std::fs::remove_dir_all(&missing).ok();

        // 前端塞进来的不存在目录 / 相对路径：一律不登记
        let accepted = dirs.record_validated([
            missing.to_string_lossy().to_string(),
            "relative/proj".to_string(),
            "".to_string(),
        ]);
        assert_eq!(accepted, 0);
        assert!(!dirs.contains(&missing.to_string_lossy()));

        // 真实存在的绝对目录才放行
        let real = std::env::temp_dir().join(format!("wb-guard-real-{}", std::process::id()));
        std::fs::create_dir_all(&real).unwrap();
        assert_eq!(dirs.record_validated([real.to_string_lossy().to_string()]), 1);
        assert!(dirs.contains(&real.to_string_lossy()));
        std::fs::remove_dir_all(&real).ok();
    }

    #[test]
    fn ports_are_exact_membership() {
        let ports = AllowedPorts::default();
        ports.record([4096, 3000]);
        assert!(ports.contains(4096));
        assert!(!ports.contains(4097));
        assert!(!ports.contains(80));
    }
}
