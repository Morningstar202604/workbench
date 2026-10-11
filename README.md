# 工作台 Workbench

> Tauri 2 桌面端 · 系统运维仪表盘 · AI 会话成本计量

一个本地优先、隐私可控的桌面运维工作台。支持 Windows / macOS / Linux，双主题，数据仅存本机。

## 功能概览

| 模块 | 能力 |
|------|------|
| 🖥 **概览** | CPU / 内存趋势图、磁盘占用环形图、进程分类统计 |
| ⚙ **进程** | 全进程快照、CPU / 内存排序、杀进程二次确认、AI 代理识别 |
| 🌐 **服务与端口** | netstat 端口监听识别、开发框架标注（Vite/Next/Django…） |
| 🤖 **AI 会话** | opencode 在线会话、本地 Claude/Codex 会话预览 |
| 💰 **成本计量** | token 消耗统计、按日/月趋势、预算告警、Anthropic 缓存折扣计价 |
| 📁 **项目** | 本地项目管理、Git 分支自动检测 |
| ✅ **任务** | 看板式任务板（拖拽切换） |
| ⚙ **设置** | 主题/刷新间隔可调、预算告警自定义、JSON 数据导入导出 |
| 📋 **运行日志** | 内置日志查看器、自动刷新 |

## 成本计量

- **三级降级**：measured（API 上报 usage）→ estimated（字符数启发式）→ zero_pricing
- **40+ 模型价格内置**，支持 `pricing_overrides.json` 自定义覆盖
- **Anthropic 缓存语义**：`input_tokens` 不含缓存，`cache_read_input_tokens` 按 0.1×、`cache_creation_input_tokens` 按 1.25× 独立计价
- **按日归属**：measured 记录按 JSONL 行级 `timestamp` 拆分到对应日期（无时间戳时回退文件 mtime 日）
- **幂等且防重复**：每个会话文件在库中只保留最新一组记录（按 `file_path` 整组替换），文件变化不会叠加旧快照
- **估算可关闭**：设置页 `计入估算记录` 开关实时影响总览 / 趋势 / 模型分解聚合
- **预算告警**：系统通知，防重复打扰
- **扫描范围**：成本扫描覆盖 `~/.claude/projects` 与 `~/.codex/sessions` 全部会话文件（UI 预览仍只展示最近 10 条）

## 桌面行为

- 关闭窗口 = 隐藏到托盘；托盘左键切换显示，托盘菜单「退出工作台」真正结束进程
- 全局快捷键 `Ctrl+Shift+W` 切换窗口可见性（被占用时降级为警告，不影响启动）
- 日志按启动滚动（>5MB 归档为 `workbench.log.1`），运行日志页按需尾部读取
- 终止进程对 PID 0/4 与关键系统进程（csrss/lsass/services 等）直接拒绝

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) ≥ 20
- [Rust](https://www.rust-lang.org/tools/install) ≥ 1.70
- 平台 Webview（Windows: WebView2 Runtime / macOS: WebKit / Linux: webkit2gtk）

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run tauri dev
```

### 生产构建

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`。

## 技术栈

| 层 | 选型 |
|------|------|
| 运行时 | Tauri 2 (Rust + OS Webview) |
| 前端框架 | React 18 + TypeScript + Vite 6 |
| 状态管理 | Zustand 5 (persist) |
| 样式 | Tailwind CSS 4 + 双主题 CSS 变量 |
| 图表 | ECharts 5（按需引入 + 暗/亮双主题注册） |
| IPC 通道 | Tauri IPC + spawn_blocking |
| 进程采集 | sysinfo |
| 端口解析 | netstat 解析器（POSIX / Windows 双方言兼容） |

## 项目结构

```
workbench/
├── src/                    # 前端源码
│   ├── pages/              # 8 个功能页面（按需 lazy 加载）
│   ├── lib/                # store / api / echarts / util
│   ├── ui.tsx              # 共享组件库
│   ├── types.ts            # 类型定义
│   ├── App.tsx             # 主应用入口
│   └── styles/global.css   # 全局样式
├── src-tauri/              # Rust 后端
│   └── src/
│       ├── commands.rs     # IPC 命令层
│       ├── procs.rs        # 进程快照 + 终止
│       ├── ports.rs        # netstat 解析
│       ├── devserver.rs    # 开发框架识别
│       ├── ai.rs           # AI 会话拉取
│       ├── pricing.rs      # 模型价格匹配
│       ├── session_meter.rs # JSONL token 成本解析
│       ├── cost_store.rs   # 成本数据持久化
│       └── lib.rs          # Tauri 启动入口
├── docs/                   # 文档截图（需自行添加）
├── README.md
└── package.json
```

## 数据存储

| 文件 | 用途 | 位置 |
|------|------|------|
| `data.json` | 项目与任务 | `app data dir` |
| `cost_data.json` | 成本记录 + 定价设置 | `app data dir` |
| `pricing_overrides.json` | 用户自定义模型价格覆盖 | `app data dir` |
| `workbench.log` | 运行日志 | `app data dir` |

## 截图

> 请运行 `npm run tauri dev` 后自行截图，放置于 `docs/` 目录。建议至少包含以下界面：
>
> - overview.png — 概览（趋势图 + 磁盘占用）
> - processes.png — 进程列表
> - ai-sessions.png — AI 会话 + 成本仪表盘
> - settings.png — 设置页（含成本计量）
> - tasks.png — 任务看板

## License

MIT
