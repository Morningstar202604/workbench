# 计划对照与实现审计

> 审计日期：2026-10-21。对照对象：README Roadmap、`CHANGELOG`、`docs/design-references.md`、
> 以及代码里实际生效的行为（不是注释里声称的行为）。

## 一、原来的 Roadmap 逐项状态

| 项目 | 状态 | 证据 / 说明 |
|---|---|---|
| 实时进程 / 端口 / 开发服务器监控 | 完成 | `src-tauri/src/procs.rs`、`ports.rs`、`devserver.rs`；Playwright 页面截图覆盖 |
| AI 会话成本计量与预算告警 | 完成 | `cost_store.rs` + `CostDashboard.tsx`；成本数字仍未与真实 `~/.claude/projects` 核对（本机为空） |
| 项目与任务看板 | 完成 | `Projects.tsx`、`Tasks.tsx`（dnd-kit 拖拽换列） |
| 深/浅主题、日志查看器 | 完成（本轮重做） | 主题从「5 个写死的 CSS 块」升级为数据驱动，见下节 |
| 三语界面 | 完成 | `src/lib/i18n/*`，默认简体中文；`dict.test.ts` 强制三语 key/占位符对齐 |
| 跨平台（macOS） | **未做** | 只验证过 Windows + Linux；macOS 未构建、未测试 |
| 安装包代码签名 | **未做** | 需要证书，当前 NSIS 未签名，SmartScreen 会拦 |
| `pricing_overrides.json` 的 UI 编辑器 | **本轮完成** | 成本页内置编辑器：可搜索、逐条改价、新增型号、恢复内置价、保存前整表校验 |
| 分片成本账本（10 万条以上） | **未做** | 单文件 `cost_data.json`，全量读写在记录极多时会变慢 |
| 页面级端到端测试 | 部分完成 | Playwright（浏览器构建）覆盖 5 布局 × 8 主题 × 3 外壳 + 4 个关键页 + 设置页 + 窄屏；**新增** `scripts/e2e-desktop.mjs` 在真实打包 exe 上跑真实 IPC；仍未覆盖 Agent 对话全流程与导入导出 |

## 二、本轮发现的「假实现」（代码说做了，实际没生效）

这几条都不是审美问题，是行为和声明不一致：

| # | 声明 | 实际 | 处理 |
|---|---|---|---|
| 1 | 五套主题「改变间距密度」 | `--space-card` 定义了 5 个值，但 39 张卡片里 23 张显式写了 `p-4`，Tailwind utilities 层优先，实测所有主题卡片内边距**都是 16px** | `.t-card` 的 padding 移入 `@layer components`，并删除多余的 `p-4`；实测 Midnight 16px / Terminal 12px |
| 2 | `StyleDef.shell`（dense/airy/reading/glass/mono） | 只用于设置页那张迷你预览卡的圆角，**从未影响真实外壳** | 删除该字段，换成真实的 `shell`（侧栏/顶部坞/专注）+ `layout`（5 种概览版面） |
| 3 | 主题「不只是换色」 | 圆角、字体、阴影确实变了；但**间距密度**没变（见 #1），**材质**只在 Aurora 一个 `[data-theme="aurora"]` 块里，用户自定义主题永远拿不到玻璃效果 | 材质、圆角、密度全部变成主题数据，`applyTheme` 写 `data-material` / `data-radius`，CSS 只读变量与属性 |
| 4 | 环形图扇区间隙 = 面板色 | `chartGapColor()` 返回的是**页面底色** bg；浅色主题下卡片是纯白、bg 是浅灰，缝隙露出一圈灰线（Frost 实测可见） | 改为返回 `panel`；浅色主题的缝隙现在是白的 |
| 5 | 设置页有「外观」区 | 三个词条 `settings.dark` / `settings.light` / `settings.styleHint` / `settings.appearanceHint` **没有任何引用**，是死代码 | 删除；换成主题编辑器、外壳/版面选择器、组件摆放面板的全部新词条 |
| 6 | 图标契约门禁 | CI 上每次都在 `ModuleNotFoundError`（无 Pillow）和 `UnicodeEncodeError`（cp1252 控制台）里失败，**从未真正检查过图标** | 已在上轮修复并验证 CI 绿 |
| 7 | 打包后的 exe 用新图标 | `tauri-build` 不跟踪 `icon.ico`，换图标后 exe 仍嵌旧图标（白角） | 已在 `build.rs` 声明图标为构建输入 |
| 8 | 组件「可自定义」 | 无任何自定义能力：页面结构写死在 `Overview.tsx` 的 JSX 里 | 概览拆成 9 个独立组件 + 布局引擎 + 排序/隐藏/持久化 |
| 9 | 视觉基线可靠 | 截图用 `mask` 遮时间戳，`mask` 会把整块区域涂成品红，基线里看不到那部分的真实排版；且时钟不冻结，同一份代码两次截图不同（第一次跑假失败、重跑又绿） | 改用 `visibility:hidden` + `page.clock.install()` 冻结时钟；连续三次复跑全绿 |
| 10 | 开发服务器识别 | `serve` 规则是**子串**匹配，而 `server` 里含 `serve`：真机上 42 个 node 进程被全部标成「开发服务器」（`dist-server/server/main.js`、`apps/server/main.js` 全中） | 改为按「独立命令词」匹配 + 排除 `node_modules/serve/` 路径；真机复测 42 → 29，只剩真实 `vite` / `uvicorn` |
| 11 | 开发服务器识别（二） | 排除子串后仍有一条：`opencode-cli.exe serve --service` —— opencode 自带的常驻 API，不是用户项目 | 增加守护进程标记（`--service` / `--daemon` / `--background`）直接排除；真机复测 29 条全部为真实项目 |
| 12 | 定价可自定义 | 只能手工把 `pricing_overrides.json` 放进数据目录，界面上完全不可见；坏条目被静默忽略（用户以为改价生效了） | 新增 `get_pricing` / `save_pricing` 两个 IPC + 成本页编辑器；坏条目逐条报原因；保存整表校验 |

## 三、本轮新增能力

### 3.1 主题 = 可编辑数据

- `src/lib/theme/tokens.ts`：`ThemeInput`（6 个颜色 + 6 个形状旋钮）→ `buildTheme()` 展开成
  26 个 CSS 变量 + 图表色板。派生规则单调，改 accent 不会破坏对比度层级。
- `src/lib/theme/presets.ts`：8 套内置主题（Midnight / Frost / Paper / Aurora / Terminal /
  Ink / Void / Jade），全部走同一条渲染管线 —— 内置主题能被「复制为新主题」后随意改，
  不存在二等公民。
- 设置页可直接改：底色、面板、文字、强调色、卡片圆角、按钮圆角、密度、字体、材质、网格强度、
  面板不透明度、深浅基底。改完点「保存并应用」才落盘（编辑中的草稿不会闪屏）。
- 导入 / 导出主题 JSON。导入是 fail-closed：缺字段、颜色非法、未知枚举一律拒绝，不做
  「尽量修一修」——半修好的主题会产生不可读的低对比文本。与已有 id 冲突时自动改名，不覆盖。
- 持久化版本升到 3，迁移把旧 `dark`/`light` 映射到 `midnight`/`frost`，并清洗
  自定义主题、外壳、布局、组件顺序。

### 3.2 外壳（全局骨架）

| 外壳 | 形态 |
|---|---|
| Rail | 经典左侧栏（可折叠成图标条） |
| Dock | 导航收进顶部坞：品牌 + 横排导航 + 控制簇一行，画布全宽 |
| Zen | 侧栏压成图标条，内容单列居中（`max-width:1080px`），去掉侧边装饰 |

窄屏（<768px）一律退回 Rail 抽屉：顶部坞在 390px 下会把导航挤成横滚条。

### 3.3 概览版面（同一批组件的五种编排）

| 版面 | 编排 |
|---|---|
| Bento | 12 栅格，组件按自身 span 占位 |
| Ledger | 单列通栏，逐行扫读 |
| Orbit | 以圆心仪表为轴，模块绕环分布（保留太极「一圆心 + 一圈卫星」的结构，但卡片不扭成弧形、文字不旋转——那在工具里立刻不可读） |
| Dense | 两列紧排，去掉装饰间距 |
| Zen | 只留关键指标与资源曲线 |

环形布局的卫星卡只放「标题 + 一个主数字 + 一行注脚」：完整组件最小可读宽度约 320px，
8 个围一圈每块只能分到 200px，表格和图表会被压成不可读的窄条（实测溢出）。

### 3.4 组件摆放

概览 9 个组件（关键指标 / 资源曲线 / 进程分类 / 磁盘 / 端口 / CPU 前列 / 运行服务 /
临期任务 / 会话文件）可以：

- 在设置页拖动排序，或点上下箭头微调；
- 逐个隐藏；
- 在概览页直接拖动卡片排序（右上角把手，仅悬停可见）；
- 恢复默认顺序；
- 顺序与可见性按设备持久化，不影响其他页面。

布局引擎只认组件 id，不认实现：新增布局不需要改任何组件，新增组件也不需要改布局。

## 四、仍未做（按性价比排序）

1. **macOS 构建**：需要真机或 CI runner，代码层面 `cfg` 分支已按平台分开，但没有验证过。
2. **代码签名 / 自动更新**：需要证书与发布通道。
3. **分片成本账本**：10 万条以上需要按日分片 + 增量索引。
4. **Agent 对话全流程 E2E**：桌面 E2E 已覆盖 IPC 与定价；对话需要真实模型，尚未脚本化。
5. **导入导出 E2E**：需要文件选择器，WebView2 下自动化成本高。
5. **主题市场**：当前只支持导入导出单个 JSON；可扩展为本地主题库 + 一键分享链接。
6. **更多版面**：已留出扩展点（`lib/layout.ts` 的 `OverviewLayoutId` 与 `orbitSlots`），
   可加「时间轴」「看板式分区」等编排。

## 五、真实环境验证（不是浏览器演示）

`scripts/e2e-desktop.mjs` 连接**打包后的 exe**（WebView2 远程调试端口），跑真实 Tauri 命令：

```
ok   运行在真实 Tauri 窗口内
ok   定价表返回 56 个型号，gpt-4o = 2.5 / 10
ok   覆盖文件路径：%APPDATA%\com.workbench.desktop\pricing_overrides.json
ok   save_pricing 写入覆盖并回读生效
ok   非法单价被拒绝：bad: 单价必须是有限的非负数
ok   非法保存是整表拒绝，之前的覆盖仍在
ok   成本页渲染定价编辑器，并显示已覆盖状态
ok   清空覆盖回到内置价
```

这条验证抓到两个只有真机才暴露的问题（#10、#11），浏览器演示数据永远测不出来。

用法：

```bash
# 1. 构建打包版
npm run tauri build
# 2. 带调试端口启动
WEBVIEW2_USER_DATA_FOLDER=%TEMP%\wb-ud ^
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=21777 ^
  src-tauri\target\release\workbench.exe
# 3. 跑脚本
node scripts/e2e-desktop.mjs 21777
```
