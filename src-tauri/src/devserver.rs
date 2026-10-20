//! 开发服务器识别：按进程命令行特征把「监听中的端口」标注成 Vite / Next / uvicorn 等。
//! 纯函数分类，先测试后接入。

use serde::Serialize;

#[derive(Serialize, Clone, Debug, ts_rs::TS)]
pub struct DevServer {
    pub port: u16,
    pub protocol: String,
    pub pid: u32,
    pub process_name: String,
    pub framework: String,
    pub project_dir: Option<String>,
    pub cmd_line: String,
    pub confidence: String,
}

/// 关键字表：顺序即优先级（先具体后宽泛，小写匹配）。
const FRAMEWORK_RULES: &[(&str, &str, &str)] = &[
    ("next-server", "Next.js", "high"),
    ("next dev", "Next.js", "high"),
    ("vite", "Vite", "high"),
    ("nuxt", "Nuxt", "high"),
    ("@vue/cli-service", "Vue CLI", "high"),
    ("ng serve", "Angular", "high"),
    ("react-scripts", "CRA", "high"),
    ("webpack-dev-server", "webpack-dev-server", "high"),
    ("webpack serve", "webpack-dev-server", "high"),
    ("parcel", "Parcel", "high"),
    ("astro dev", "Astro", "high"),
    ("remix-serve", "Remix", "high"),
    ("uvicorn", "uvicorn (FastAPI/Starlette)", "high"),
    ("manage.py runserver", "Django", "high"),
    ("flask", "Flask", "medium"),
    ("gunicorn", "gunicorn", "high"),
    ("artisan serve", "Laravel", "high"),
    ("symfony", "Symfony", "high"),
    ("rails s", "Rails", "high"),
    ("puma", "Rails/Puma", "medium"),
    ("dotnet watch", ".NET watch", "high"),
    ("dotnet run", ".NET", "medium"),
    ("nodemon", "nodemon", "high"),
    ("http-server", "http-server", "high"),
    ("live-server", "live-server", "high"),
    ("ts-node-dev", "ts-node-dev", "high"),
    ("svelte-kit dev", "SvelteKit", "high"),
    ("deno", "Deno", "medium"),
    ("bun", "Bun", "medium"),
    ("esbuild", "esbuild", "medium"),
    ("serve", "serve (静态服务)", "low"),
];

/// 判断一个监听端口背后的进程是否是开发服务器。
/// 返回 (框架名, 置信度)；不是则 None。
pub fn classify_dev_server(
    cmd_lower: &str,
    exe_name_lower: &str,
) -> Option<(&'static str, String)> {
    let haystack = format!("{cmd_lower} {exe_name_lower}");
    for (needle, label, confidence) in FRAMEWORK_RULES {
        if haystack.contains(needle) {
            return Some((*label, confidence.to_string()));
        }
    }
    None
}

/// 从进程的 argv / exe 路径 / 工作目录猜项目根。
///
/// 优先 `node_modules` 之前的前缀（Node 项目最精确）；否则退回进程 cwd ——
/// 这修好了此前完全失效的一类：Python(uvicorn/django)、Go、.NET 的命令行里
/// 没有 node_modules，原来永远推出 None，UI 上既没有「打开目录」也永远显示
/// 「未运行」（Projects 页的 isRunning 依赖这个目录）。
pub fn guess_project_dir(argv: &[String], exe_path: &str, cwd: &str) -> Option<String> {
    // 1) node_modules 前缀：取所有参数（含 exe）里最靠前的一处
    for c in std::iter::once(exe_path.to_string()).chain(argv.iter().cloned()) {
        if let Some(idx) = c.to_ascii_lowercase().find("node_modules") {
            let prefix = &c[..idx];
            let trimmed = prefix.trim_end_matches(['\\', '/']);
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    // 2) 参数里形如 <dir>/main:app 的模块路径（uvicorn main:app）。
    // 先把分隔符统一：POSIX 上反斜杠不是分隔符，不统一的话
    // c:\proj\api\main:app 在 Linux 上拆不出目录。
    for arg in argv {
        let norm = arg.replace('\\', "/");
        let is_drive_colon = {
            let b = norm.as_bytes();
            b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':'
        };
        // 只处理「模块:对象」，跳过盘符里的冒号
        if !is_drive_colon && norm.contains(':') {
            if let Some(before) = norm.split(':').next() {
                if let Some(idx) = before.rfind('/') {
                    let dir = &before[..idx];
                    if !dir.trim().is_empty() {
                        return Some(dir.to_string());
                    }
                }
            }
            // 无目录前缀（uvicorn main:app）：交给 cwd 兜底
        }
    }

    // 3) 兜底：进程 cwd。只接受绝对路径，避免把相对串塞进白名单。
    // 用跨平台判断：POSIX 上 Path::is_absolute 会拒绝 Windows 风格路径。
    let trimmed = cwd.trim().trim_end_matches(['\\', '/']);
    if !trimmed.is_empty() && crate::ipc_guard::is_absolute_path(trimmed) {
        return Some(trimmed.to_string());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_vite_next_and_uvicorn() {
        let (f, c) = classify_dev_server(
            "node c:\\proj\\myapp\\node_modules\\.bin\\vite --port 5173",
            "node.exe",
        )
        .unwrap();
        assert_eq!(f, "Vite");
        assert_eq!(c, "high");

        let (f, _) = classify_dev_server("next-server (v15.0.0)", "node.exe").unwrap();
        assert_eq!(f, "Next.js");

        let (f, _) =
            classify_dev_server("python -m uvicorn main:app --port 8000", "python.exe").unwrap();
        assert_eq!(f, "uvicorn (FastAPI/Starlette)");
    }

    #[test]
    fn non_dev_server_returns_none() {
        assert!(classify_dev_server("chrome.exe --type=renderer", "chrome.exe").is_none());
        assert!(classify_dev_server("code.exe", "code.exe").is_none());
    }

    #[test]
    fn guesses_project_dir_from_node_modules_path() {
        let argv = vec!["node".to_string(), "vite".to_string()];
        assert_eq!(
            guess_project_dir(&argv, "c:\\proj\\myapp\\node_modules\\.bin\\vite", ""),
            Some("c:\\proj\\myapp".to_string())
        );
    }

    /// 回归：非 Node 项目原来永远推出 None（命令行里没有 node_modules），
    /// 导致 UI 不显示「打开目录」、Projects 页永远判定「未运行」。
    #[test]
    fn non_node_projects_fall_back_to_cwd_or_module_path() {
        // uvicorn 模块路径 c:\proj\api\main:app → 项目根 c:\proj\api
        let argv = vec![
            "python".to_string(),
            "-m".to_string(),
            "uvicorn".to_string(),
            "c:\\proj\\api\\main:app".to_string(),
        ];
        assert_eq!(
            guess_project_dir(&argv, "c:\\python\\python.exe", "c:\\proj\\api"),
            Some("c:\\proj\\api".to_string())
        );

        // go run：只能靠 cwd
        let argv = vec!["go".to_string(), "run".to_string(), "main.go".to_string()];
        assert_eq!(
            guess_project_dir(&argv, "c:\\Go\\bin\\go.exe", "c:\\proj\\gosvc"),
            Some("c:\\proj\\gosvc".to_string())
        );

        // 相对 cwd 不被接受（会随 CWD 漂移）
        assert_eq!(
            guess_project_dir(&argv, "c:\\Go\\bin\\go.exe", "proj\\gosvc"),
            None
        );
    }

    /// 含空格的路径不能被空格切碎后推出一个相对目录。
    #[test]
    fn paths_with_spaces_are_not_split() {
        let argv = vec![
            "node".to_string(),
            "C:\\My Projects\\app\\node_modules\\vite\\bin\\vite.js".to_string(),
        ];
        assert_eq!(
            guess_project_dir(&argv, "C:\\nodejs\\node.exe", ""),
            Some("C:\\My Projects\\app".to_string())
        );
    }
}
