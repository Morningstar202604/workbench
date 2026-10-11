//! 开发服务器识别：按进程命令行特征把「监听中的端口」标注成 Vite / Next / uvicorn 等。
//! 纯函数分类，先测试后接入。

use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
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
pub fn classify_dev_server(cmd_lower: &str, exe_name_lower: &str) -> Option<(&'static str, String)> {
    let haystack = format!("{cmd_lower} {exe_name_lower}");
    for (needle, label, confidence) in FRAMEWORK_RULES {
        if haystack.contains(needle) {
            return Some((*label, confidence.to_string()));
        }
    }
    None
}

/// 从命令行/可执行路径猜项目根目录：优先截 `node_modules` 之前的部分。
pub fn guess_project_dir(cmd_parts: &[String], exe_path: &str) -> Option<String> {
    let candidates = std::iter::once(exe_path.to_string()).chain(cmd_parts.iter().cloned());
    for c in candidates {
        if let Some(idx) = c.to_ascii_lowercase().find("node_modules") {
            let prefix = &c[..idx];
            let trimmed = prefix.trim_end_matches(['\\', '/']);
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
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

        let (f, _) = classify_dev_server(
            "python -m uvicorn main:app --port 8000",
            "python.exe",
        )
        .unwrap();
        assert_eq!(f, "uvicorn (FastAPI/Starlette)");
    }

    #[test]
    fn non_dev_server_returns_none() {
        assert!(classify_dev_server("chrome.exe --type=renderer", "chrome.exe").is_none());
        assert!(classify_dev_server("code.exe", "code.exe").is_none());
    }

    #[test]
    fn guesses_project_dir_from_node_modules_path() {
        let parts = vec!["node".to_string(), "vite".to_string()];
        assert_eq!(
            guess_project_dir(&parts, "c:\\proj\\myapp\\node_modules\\.bin\\vite"),
            Some("c:\\proj\\myapp".to_string())
        );
        let parts = vec![
            "python".to_string(),
            "-m".to_string(),
            "uvicorn".to_string(),
            "c:\\proj\\api\\main:app".to_string(),
        ];
        assert_eq!(
            guess_project_dir(&parts, "c:\\python\\python.exe"),
            None
        );
    }
}
