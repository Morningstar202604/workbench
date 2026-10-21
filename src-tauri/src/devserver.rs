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
    // `serve` 是最容易误判的一条：子串匹配会让 server / dist-server /
    // *.server.js 全部命中，实测把一台机器上的 42 个 node 进程全标成
    // 「开发服务器」。因此这条单独走 token 匹配（见 TOKEN_RULES）。
];

/// 需要「独立单词」匹配的规则：命令行里必须出现一个正好等于这些词的 token
/// （允许带 .exe / .cmd 后缀）。
///
/// 为什么不能用子串：`serve` 是 `server` 的前五个字母，而 Node 项目的
/// 入口常叫 `main.js`、`dist-server/server/main.js`、`x.server.js`。
/// 子串匹配会把它们全部算成静态服务器，用户看到 42 个「开发服务器」。
/// 这类短词必须按 token 精确匹配。
const TOKEN_RULES: &[(&str, &str, &str)] = &[
    ("serve", "serve (静态服务)", "medium"),
    ("http-server", "http-server", "high"),
    ("live-server", "live-server", "high"),
];

/// 守护进程标记：带这些参数时，即使出现 serve 也不是开发服务器。
///
/// 真实反例：opencode-cli.exe serve --service —— opencode 的本地服务端，
/// 它确实跑在端口上，但那是应用自带的常驻 API，不是用户在写的项目。
const DAEMON_FLAGS: &[&str] = &["--service", "--daemon", "--background"];

/// 把命令行切成「命令词」候选：按空白与常见 shell 分隔符切，去掉引号与路径前缀。
/// 返回每个 token 的 basename（小写、去 .exe/.cmd/.bat/.js 后缀）。
fn command_tokens(haystack: &str) -> Vec<String> {
    haystack
        .split(|c: char| {
            c.is_whitespace() || c == '&' || c == '|' || c == ';' || c == '(' || c == ')'
        })
        .filter_map(|raw| {
            let t = raw.trim_matches(|c| c == '"' || c == '\'' || c == ',');
            if t.is_empty() {
                return None;
            }
            let base = t.rsplit(['\\', '/']).next().unwrap_or(t);
            let lower = base.to_ascii_lowercase();
            let stem = lower
                .strip_suffix(".exe")
                .or_else(|| lower.strip_suffix(".cmd"))
                .or_else(|| lower.strip_suffix(".bat"))
                .or_else(|| lower.strip_suffix(".js"))
                .unwrap_or(&lower);
            Some(stem.to_string())
        })
        .collect()
}

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
    // 守护进程不是用户项目：带 --service/--daemon 的一律不算开发服务器
    if DAEMON_FLAGS.iter().any(|f| haystack.contains(f)) {
        return None;
    }
    // 短词按独立命令匹配，避免 serve ⊂ server
    let tokens = command_tokens(&haystack);
    for (needle, label, confidence) in TOKEN_RULES {
        if tokens.iter().any(|t| t == needle) {
            return Some((*label, confidence.to_string()));
        }
    }
    // 全局安装的 serve 包入口是 node_modules/serve/build/main.js：
    // token 是 main，但路径里带 node_modules/serve/ —— 这个组合无歧义。
    if haystack.contains("node_modules/serve/") || haystack.contains(r"node_modules\serve\") {
        return Some(("serve (静态服务)", "medium".to_string()));
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

    /// 真实回归：`serve` 是 `server` 的前缀，子串匹配把
    /// `dist-server/server/main.js`、`main.js` 这类入口全标成开发服务器。
    /// 实测一台机器 42 个「开发服务器」，全是误报。
    #[test]
    fn serve_must_be_a_standalone_command() {
        // 含 server 但不是 serve 命令：不应命中
        for cmd in [
            "node dist-server/server/main.js",
            "node apps/server/dist/apps/server/src/main.js",
            "node C:/proj/webpack.server.js",
            "node server.js",
        ] {
            assert!(
                classify_dev_server(cmd, "node.exe").is_none(),
                "误判为开发服务器: {cmd}"
            );
        }

        // 真正的 serve 命令（全局安装的静态服务器，入口在 npm 的 node_modules 下）
        let (f, c) = classify_dev_server(
            "node C:/Users/u/AppData/Roaming/npm/node_modules/serve/build/main.js --port 3000",
            "node.exe",
        )
        .unwrap();
        assert_eq!(f, "serve (静态服务)");
        assert_eq!(c, "medium");

        // npx serve / serve 直接调用
        assert!(classify_dev_server("serve -s dist", "node.exe").is_some());
        assert!(classify_dev_server("npx serve dist", "node.exe").is_some());
        // Windows 的 serve.cmd
        assert!(classify_dev_server(r"C:\npm\serve.cmd dist", "cmd.exe").is_some());
    }

    /// 真实反例：opencode 的常驻服务端 `opencode-cli.exe serve --service`
    /// 会被 serve 规则命中，但它不是用户项目。
    #[test]
    fn daemon_flag_disqualifies_serve() {
        let cmd = concat!(
            "C:\\Users\\u\\AppData\\Roaming\\ai.opencode.desktop\\cli\\\\",
            "opencode-cli.exe serve --service"
        );
        assert!(classify_dev_server(cmd, "opencode-cli.exe").is_none());
        assert!(classify_dev_server("mydaemon serve --daemon", "mydaemon.exe").is_none());
        // 不带守护参数时仍然识别
        assert!(classify_dev_server("serve dist --port 3000", "node.exe").is_some());
    }

    #[test]
    fn high_confidence_rules_still_win_over_token_rules() {
        // vite 命令行里同时出现 serve 时，仍应判 Vite（先匹配强规则）
        let (f, _) = classify_dev_server(
            "node node_modules/vite/bin/vite.js --mode serve",
            "node.exe",
        )
        .unwrap();
        assert_eq!(f, "Vite");
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
