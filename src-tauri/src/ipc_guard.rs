//! IPC 反向入参守卫：前端传回来的路径 / 端口必须是后端确实展示给它的那些。
//!
//! 为什么要白名单：WebView 一旦被注入（或未来引入任何富文本渲染 bug），
//! 它就能把任意字符串塞进 `git_branch`、`open_path` 这类命令 —— `git -C <任意目录>`
//! 会执行该仓库的 fsmonitor/filter 钩子，`open_path` 会交给系统默认程序，
//! 两者都等价于本机代码执行。只允许「刚被列给前端的目录」可把攻击面压到零。

use std::collections::HashSet;
use std::sync::{Mutex, MutexGuard};

/// Windows 路径大小写不敏感、分隔符混用，统一成一个可比较的键。
pub fn normalize_path(raw: &str) -> String {
    raw.trim()
        .trim_end_matches(['/', '\\'])
        .replace('\\', "/")
        .to_ascii_lowercase()
}

fn lock<T>(slot: &Mutex<T>) -> MutexGuard<'_, T> {
    slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// 后端向前端展示过的目录集合。
#[derive(Default)]
pub struct KnownDirs(Mutex<HashSet<String>>);

impl KnownDirs {
    pub fn record(&self, dirs: impl IntoIterator<Item = impl AsRef<str>>) {
        let mut guard = lock(&self.0);
        for dir in dirs {
            let key = normalize_path(dir.as_ref());
            if !key.is_empty() {
                guard.insert(key);
            }
        }
    }

    pub fn contains(&self, raw: &str) -> bool {
        let key = normalize_path(raw);
        !key.is_empty() && lock(&self.0).contains(&key)
    }
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
    fn ports_are_exact_membership() {
        let ports = AllowedPorts::default();
        ports.record([4096, 3000]);
        assert!(ports.contains(4096));
        assert!(!ports.contains(4097));
        assert!(!ports.contains(80));
    }
}
