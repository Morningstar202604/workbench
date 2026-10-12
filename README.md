# 工作台 Workbench

> Tauri 2 桌面端 · 系统运维仪表盘 · AI 会话成本计量

一个本地优先、隐私可控的桌面运维工作台。数据仅存本机，双主题。
**当前只在 Windows 上开发与打包**（端口采集走 `netstat -ano`，安装目标为 NSIS）；
macOS / Linux 尚未接入采集与打包，属未验证状态。

## 界面预览

> 以下截图截自**浏览器演示模式**（`npm run preview`）：非 Tauri 环境会注入
> `src/lib/demo.ts` 的静态演示数据，所有路径均为占位串，不含任何真实机器信息。

| 概览 | 进程监控 |
|------|----------|
| ![概览](docs/screenshots/01-overview.png) | ![进程监控](docs/screenshots/02-processes.png) |
| CPU / 内存趋势、磁盘与进程分类 | 全进程快照、虚拟滚动、杀进程二次确认 |

| 服务与端口 | AI 会话与成本计量 |
|------------|-------------------|
| ![服务与端口](docs/screenshots/03-servers.png) | ![AI 会话](docs/screenshots/04-ai-sessions.png) |
| netstat 端口识别与开发框架标注 | 会话预览、token 计量、预算与模型分解 |

| 项目管理 | 任务看板 |
|----------|----------|
| ![项目管理](docs/screenshots/05-projects.png) | ![任务看板](docs/screenshots/06-tasks.png) |
| 本地项目、Git 分支检测、卡片/表格双视图 | 拖拽看板，待办 / 进行中 / 已完成 |

| 设置 | 运行日志 |
|------|----------|
| ![设置](docs/screenshots/07-settings.png) | ![运行日志](docs/screenshots/08-logs.png) |
| 主题、刷新间隔、预算与数据导入导出 | 内置日志查看器，按需尾部读取 |

截图可自行重生成（需先 `npm run build` 并启动 `npm run preview`，另开一个
`chrome --headless=new --remote-debugging-port=9222`，然后
`node scripts/shoot_docs.mjs`）。脚本内置演示模式断言，页面未出现演示标记时
直接拒绝截图，避免把真实数据写进仓库。

## 功能概览

| 模块 | 能力 |
|------|------|
| 🖥 **概览** | CPU / 内存趋势图、磁盘占用环形图、进程分类统计 |
| ⚙ **进程** | 全进程快照、CPU / 内存排序、虚拟滚动（只渲染视口内的行）、杀进程二次确认、AI 代理识别 |
| 🌐 **服务与端口** | netstat 端口监听识别、开发框架标注（Vite/Next/Django…） |
| 🤖 **AI 会话** | opencode 在线会话、本地 Claude/Codex 会话预览 |
| 💰 **成本计量** | token 消耗统计、按日/月趋势、预算告警、Anthropic 缓存折扣计价 |
| 📁 **项目** | 本地项目管理、Git 分支自动检测 |
| ✅ **任务** | 看板式任务板（拖拽切换） |
| ⚙ **设置** | 主题/刷新间隔可调、预算告警自定义、JSON 数据导入导出 |
| 📋 **运行日志** | 内置日志查看器、自动刷新 |

## 成本计量

- **三级降级**：measured（API 上报 usage）→ estimated（字符数启发式）→ zero_pricing
- **40+ 模型价格内置**；`pricing_overrides.json` 覆盖当前**只读**（需手工放置文件，UI 未提供编辑入口）
- **Anthropic 缓存语义**：`input_tokens` 不含缓存，`cache_read_input_tokens` 按 0.1×、`cache_creation_input_tokens` 按 1.25× 独立计价
- **按日归属**：measured 与 estimated 记录都按 JSONL 行级 `timestamp` 落到各自那一天（无时间戳时回退上一天 / 文件 mtime 日），会话追加只改最新一天，趋势图不会重写历史
- **未定价不冒充消费**：型号推断失败标 `unknown` 并记为 `zero_pricing`，不会按某个具体型号编造单价
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
- [Rust](https://www.rust-lang.org/tools/install) ≥ 1.77（`Cargo.toml` 的 `rust-version`）
- Windows：WebView2 Runtime

### 安装依赖

```bash
npm install
```

### IPC 契约类型生成

前端引用的跨 IPC 类型不在 `src/types.ts` 手写，而是由 Rust 结构体生成：

```bash
cd src-tauri
cargo test --test export_bindings   # 重新生成 src/generated/*.ts
```

`src/types.ts` 只做 re-export，`src/generated/` 作为契约快照入库。
改完 Rust 结构体必须重跑上面这条命令，否则 CI 的漂移门禁会直接拦下。

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
| 虚拟滚动 | @tanstack/react-virtual 3（展开行高度可变，进入视口后实测回写行高） |
| 状态订阅 | Zustand 5 `useShallow` 选择器 + 页面组件 `memo`（自身切片不变不重渲染） |
| IPC 通道 | Tauri IPC + spawn_blocking |
| IPC 契约 | ts-rs 10 由 Rust 结构体生成 `src/generated/*.ts`，CI 校验无漂移 |
| 进程采集 | sysinfo |
| 端口解析 | netstat 解析器（POSIX / Windows 双方言兼容） |

## 项目结构

```
workbench/
├── src/                    # 前端源码
│   ├── pages/              # 8 个功能页面（按需 lazy 加载）
│   ├── lib/                # store / api / echarts / util
│   ├── generated/          # ts-rs 生成的 IPC 契约类型（勿手改）
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
├── LICENSE
├── README.md
└── package.json
```

## 开发与质量

```bash
npm install                # 前端依赖
npm run test               # 前端单测（vitest，47 个用例）
npm run build              # tsc --noEmit + vite build
npm run tauri dev          # 桌面开发模式
npm run tauri build        # 产出 NSIS 安装包

cd src-tauri
cargo test                 # 后端单测 + IPC 契约导出
cargo clippy --all-targets -- -D warnings   # 零警告门禁
```

Rust 侧纯逻辑（netstat 解析、框架识别、价格匹配、token 提取、JSON 存储、IPC 守卫）
都有 `#[cfg(test)]` 单测；前端有 vitest 单测覆盖 util / store / 共享组件 / 错误边界。
CI 跑类型检查、构建、两侧单测、clippy 零警告，并校验 `src/generated/` 与 Rust 结构体一致。

## 已知限制

- 仅 Windows 验证：端口采集写死 `cmd /c netstat -ano`，`ports.rs` 的 POSIX 分支当前不会被执行
- 前端渲染行为仍以人工验证为主：vitest 覆盖 util / store / 共享组件 / 错误边界，8 个页面的交互路径尚无端到端测试
- 成本账本落在单个 `cost_data.json`（写操作已串行化），记录数很大时全量读写会开始吃力
- `pricing_overrides.json` 只有读取路径，没有写入入口

## 数据存储

| 文件 | 用途 | 位置 |
|------|------|------|
| `data.json` | 项目与任务 | `app data dir` |
| `cost_data.json` | 成本记录 + 定价设置 | `app data dir` |
| `pricing_overrides.json` | 用户自定义模型价格覆盖（只读，需手工放置） | `app data dir` |
| `workbench.log` | 运行日志 | `app data dir` |
| `*.corrupt-<时间戳>` | 数据文件解析失败时的原样备份（不会被下次保存覆盖） | `app data dir` |

## License

MIT —— 见 [LICENSE](LICENSE)。
