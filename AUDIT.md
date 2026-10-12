# 工作台项目文件全量审计报告

> 审计时间：2026-10-12 · 方式：每个文件逐一打开读代码 + 构建验证 + 运行时监控
> 结论标记：✅ 保留（有用） | 🔧 本轮修复 | 🗑 已清理 | 🆕 本轮新增

## 一、清理结果

| 处置 | 对象 | 原因 |
|---|---|---|
| 🗑 已删除 | `.aqg/`（2 个 md，14.3 KB） | AI 开发过程台账，过程性文档，无运行时价值 |
| 🗑 已移出 git 跟踪 | `src-tauri/gen/schemas/*.json`（4 个） | Tauri 构建自动再生，跟踪只会产生 diff 噪音（已加入 .gitignore，磁盘保留供构建引用） |
| 🗑 已移位 | `logo-src.jpg` | 设计源图，移入 `scripts/` 归档，不留在根目录 |
| ✅ 保留 | `node_modules/`、`dist/`、`target/` | 依赖与构建产物，.gitignore 已正确忽略，不进仓库 |

清理后仓库内无任何无用文件：根目录 10 个文件全部有明确职责。

## 二、文件树逐文件审计

```
工作台/
├── .gitattributes            ✅ 统一换行符，消除跨平台 diff 噪音
├── .gitignore                🔧 补充 src-tauri/gen/ 忽略规则
├── .github/
│   └── workflows/ci.yml      ✅ 三段 CI（前端构建/后端测试+clippy 零警告/安装包产出），设计合理
├── index.html                ✅ Vite 入口，lang=zh-CN，干净无多余标签
├── LICENSE                   ✅ MIT
├── package.json              ✅ 依赖全部有用途（无未使用依赖）
├── package-lock.json         ✅ 锁文件
├── README.md                 ✅ 文档口径与实际代码一致（已知限制如实声明）
├── tsconfig.json             ✅ strict 全开 + noUnusedLocals，门禁严格
├── tsconfig.node.json        ✅ Vite 配置用
├── vite.config.ts            ✅ 极简，strictPort 防端口漂移
├── scripts/                  🆕
│   ├── make_icons.py         🆕 图标生成脚本（源图 → 全套 PNG + 多尺寸 ICO，RGBA）
│   └── logo-src.jpg          🆕 Logo 设计源图归档
├── src/
│   ├── main.tsx              ✅ 入口，启动时同步主题
│   ├── App.tsx               🔧 接入真实 Logo；新增窗口置顶开关按钮
│   ├── ErrorBoundary.tsx     ✅ 渲染异常兜底 + 重试按钮
│   ├── ui.tsx                🔧 新增共享 StatCard（带数字滚动动画），替代 4 个页面的重复实现
│   ├── types.ts              🔧 改为 re-export；跨 IPC 类型由 ts-rs 从 Rust 结构体生成到 src/generated/
│   ├── generated/            🆕 ts-rs 生成的 IPC 契约类型（19 个，勿手改；CI 卡漂移）
│   ├── assets/logo.png       🆕 前端 Logo 资源
│   ├── styles/global.css     🔧 新增 Hero 动效（光晕漂移/Logo 悬浮），prefers-reduced-motion 降级
│   ├── lib/
│   │   ├── api.ts            🔧 新增 setAlwaysOnTop 封装；openExternal 白名单设计正确
│   │   ├── store.ts          🔧 新增 alwaysOnTop 持久化状态；修复预算告警漏发时序洞
│   │   ├── echarts.tsx       ✅ 按需注册省 ~800KB，双主题注册，MutationObserver 切主题
│   │   ├── util.ts           ✅ 纯函数工具集，无冗余
│   │   └── demo.ts           ✅ 浏览器演示模式数据，与 Tauri 模式严格隔离
│   ├── test/setup.ts         🆕 vitest 环境打桩（matchMedia / ResizeObserver / animate）
│   ├── ui.test.tsx           🆕 共享组件单测（15）
│   ├── ErrorBoundary.test.tsx 🆕 错误边界单测（3）
│   ├── lib/util.test.ts      🆕 纯函数单测（17）
│   ├── lib/store.test.ts     🆕 状态层单测（12）
│   └── vitest.config.ts      🆕 jsdom 环境 + 覆盖率配置
│   └── pages/
│       ├── Overview.tsx      🔧 新增大标题 Hero 横幅（问候语+实时脉冲+Logo）；改用共享 StatCard
│       ├── Processes.tsx     🔧 删除本地 StatPill，改用共享 StatCard
│       ├── Servers.tsx       🔧 删除本地 SummaryPill，改用共享 StatCard
│       ├── AiSessions.tsx    🔧 删除本地 SummaryCard，改用共享 StatCard；修复 useMemo 依赖杂染
│       ├── Projects.tsx      ✅ 卡片+表格双视图，isRunning 匹配逻辑正确
│       ├── Tasks.tsx         ✅ dnd-kit 拖拽看板，实现规范
│       ├── Settings.tsx      🔧 布局从居中窄栏改为与其他页一致的通栏网格
│       └── Logs.tsx          ✅ 尾部读取 + 自动刷新 + 滚动跟随
├── src-tauri/
│   ├── tauri.conf.json       ✅ CSP 收紧到 self，无远程资源
│   ├── Cargo.toml            ✅ 依赖最小集
│   ├── capabilities/default.json ✅ 最小权限面（opener 无 open-path，走后端白名单）
│   ├── icons/                🔧 全套重建：icon.ico 714B→93KB 多尺寸；32/128/128@2x/256/icon.png 全部换成自有 Logo
│   └── src/
│       ├── main.rs           ✅ windows_subsystem 正确（release 不带控制台）
│       ├── lib.rs            🔧 注册 set_always_on_top 命令；托盘/快捷键/关窗隐藏逻辑完整
│       ├── commands.rs       🔧（上轮）CREATE_NO_WINDOW 修复控制台闪窗；新增 set_always_on_top
│       ├── procs.rs          🔧 terminate_process 补充刷新后身份校验说明（防 PID 复用误杀语义明确化）
│       ├── ports.rs          ✅ 双方言 netstat 解析 + 3 组单测
│       ├── devserver.rs      ✅ 30+ 框架识别规则 + 单测
│       ├── ai.rs             ✅ 会话 id 安全校验、重定向禁跟随、percent-encode 双保险
│       ├── pricing.rs        ✅ 40+ 模型价格、Anthropic 缓存语义正确、unknown 不编价
│       ├── session_meter.rs  ✅ JSONL 按天归属、幂等替换
│       ├── cost_store.rs     ✅ 成本账本持久化
│       ├── data.rs           ✅ 项目/任务数据层
│       ├── json_store.rs     ✅ 原子写 + 损坏保全，并发单测覆盖
│       ├── ipc_guard.rs      ✅ IPC 入参白名单（目录/端口），攻击面收敛设计
│       └── logging_setup.rs  ✅ 日志滚动 + 尾部倒读
└── dist/, node_modules/, target/   ✅ 构建产物，不入库
```

**统计**：审计 44 个有效文件；🗑 清理 2+4 个；🔧 修复/改进 17 个；🆕 新增 4 个；其余全部确认有用。

## 三、验证记录

| 门禁 | 结果 |
|---|---|
| `tsc --noEmit`（strict） | ✅ 0 错误 |
| `vite build` | ✅ 4.65s |
| `cargo clippy --all-targets` | ✅ 0 警告 |
| `cargo test --lib` | ✅ 43/43 通过 |
| `tauri build` | ✅ 安装包 3.13 MiB |
| 运行验证 | ✅ 新版启动正常，图标/Logo/置顶按钮生效 |
