# Workbench 设计参考清单

- 适用对象：Workbench（Tauri 2 + React 19，深色为主、高信息密度、含图表/表格/看板/聊天）
- 整理日期：2026-10-21
- 抓取方式：WebFetch 逐站抓取页面文本/结构，每站最多一次；失败即标注，不补抓
- 覆盖结果：26 个参考对象，其中 15 个抓取成功、11 个未抓取（403 / 超时 / TLS 失败 / 主动停止）
- 读法约定：**「可验证事实」列只写抓取到的原文或结构**；**「可借鉴手法」列是给 Workbench 的落地建议参数，不是对原站实测值的声称**。未抓取项的事实列明确标注，仅保留公开设计常识层面的描述，不写具体数值
- 现有基线（2026-10-21 重设后）：`src/styles/global.css` 的 5 套主题与 tokens —— bg `#07080b`、panel `#0c0f15`、panel2 `#11151d`、line `#1b212c`、text `#e8ecf2`、dim `#8a93a6`、faint `#596173`、accent `#22d3ee`、ok `#3ecf8e`、warn `#f5b544`、danger `#ff6b6b`；圆角 `--radius-card 10px` / `--radius-btn 7px`；字号 13px 基准。本文建议一律映射到既有变量，不另起一套平行体系

必选覆盖核对：Apple MacBook Pro、Apple 官网首页、Tesla 车型页、Qoder、Linear、Vercel、Stripe、Raycast、Arc、Cursor、Figma、Resend、v0、Tailwind CSS、Tauri、Vite、Notion、Supabase、Framer、ElevenLabs、Anthropic、OpenAI、GitHub Copilot，共 23 项全部在列（R01–R26）。

---

## 一、参考清单

### A. 消费品牌与硬件站

| 编号 | 参考 / URL | 可验证的设计事实（WebFetch） | 可借鉴手法（≤3 条，可落地） |
|---|---|---|---|
| R01 | Apple MacBook Pro<br>https://www.apple.com/macbook-pro/ | 抓取成功。全局导航 12 项：Apple、Store、Mac、iPad、iPhone、Watch、Vision、AirPods、Home、Entertainment、Accessories、Support；产品局部导航 4 项：Overview、Tech Specs、Compare、Switch from PC to Mac；H1「MacBook Pro」，副标「Fast runs in the family.」，「Now with M5, M5 Pro, and M5 Max.」；正文 25 个章节，含「Get the highlights.」「Take a closer look.」「Performance」「AI」「Battery」，以及 8 个购买/服务章节（Ways to Buy、Trade In、Education、Personal Setup 等）；页脚 11 列（Shop and Learn … About Apple）；无 hex / theme-color，仅颜色名 Space Black、Silver；页面含 AR 3D 模型与产品影片 | 1）双层导航：全局 12 项压缩为「文字 + 图标」，产品层 4 项做 36px 高 tab，激活态 2px 下划线；工作台顶栏只保留一级，页面内二级用 tab。<br>2）一节只讲一件事：短标题 1 行 + 说明 ≤2 行 + 1 个主视觉；卡片标题同样限制 1 行、说明 2 行截断。<br>3）页脚按用户任务分组（购买/换购/教育/设置），设置页分组照此命名，不按内部模块名 |
| R02 | Apple 官网首页<br>https://www.apple.com/ | 抓取成功。9 个 hero tile，每块固定 3 行结构：产品名 + 一句 tagline + 可选上市时间。例：iPhone 18 Pro「Pro further.」；Apple Card「Get up to 3% Daily Cash back with every purchase.」；Apple HomeView「Designed for life at home.」；iPad Air「Now supercharged by M4.」；Apple Watch Ultra 4「A battery you can't outrun.」；随后是「Endless entertainment.」、法务披露、11 列页脚 | 1）入口卡统一 3 行（名称/一句价值/状态），高度固定 148–168px，禁止卡片行数不一致。<br>2）法务与数据口径独立成 12px、60% 透明度区块，与正文间距 24px。<br>3）9 宫格只用于「模块入口」，数据卡另立规范，不混用 |
| R03 | Tesla Model 3<br>https://www.tesla.com/model3 | **未抓取（HTTP 403）**。基于公开设计常识：按车型分栏的顶部导航、全视口车型主视觉、页面上叠加车型名与「订购/试驾」两个 CTA、下方参数条与配置入口。未抓取到具体文案、数值与颜色 | 1）设备/项目切换用顶部横向 segmented（高 44px、激活项 1px accent 边 + panel2 底），不用下拉。<br>2）全屏主视觉只允许出现在 onboarding，高度 ≤60vh。<br>3）参数条用 3–4 个「值 + 单位 + 标签」等宽列，值 18px/600、标签 10px/dim |

### B. AI 编程与 Agent 工具

| 编号 | 参考 / URL | 可验证的设计事实（WebFetch） | 可借鉴手法（≤3 条，可落地） |
|---|---|---|---|
| R04 | Qoder<br>https://qoder.com/ | 抓取成功。导航：Product、Enterprise、Pricing、Marketplace、Resource、Activities、Visit China Site、Sign in、Download；hero「The New Qoder: An Agentic Coding Platform for Everyone」，副标「The all-new Qoder, powered by agentic coding」，tagline「Bring your idea. Qoder gets it done.」；9 个功能章节：Desktop、Mobile、IDE、JetBrains Plugin、CLI、Qoder Agent SDK、Qoder Cloud Agents、QoderWake、Qoder Enterprise；页脚 8 组；数字：6,000,000+ builders、Pro 试用 2 周、基准 bugfix 约 30 分钟；认证 SOC 2 / ISO27001 | 1）功能按「载体」分组：Desktop/Mobile/IDE/Plugin/CLI/SDK/Cloud；工作台侧栏同构（本机/远程/CLI/插件）。<br>2）单页只放 1 个主数字 + 1 组认证徽标；关于页照此，不铺数字墙。<br>3）页脚 8 列压成 3 簇：产品线 / 资源 / 法务 |
| R05 | Cursor<br>https://cursor.com/ | 抓取成功。一级导航 20+ 项（Models、Grok、Evals、Product、Agents、Cloud、Automations、CLI、Marketplace、Review、Enterprise、Pricing、Resources…）；hero「Cursor is your coding agent for building ambitious software.」，3 个 CTA：Download for macOS / Get started / Request a demo；功能章节标题全为动词句，如「Agents turn ideas into code」「Works autonomously, runs in parallel」「Hand work to AI teammates」「Use the best model for every task」；页脚 5 列；认证 SOC 2、ISO27001、ISO42001、AIUC-1；10 种语言 | 1）CTA 三级：主按钮实心、次按钮 1px 边、第三级纯文字链；空状态同样只给这三级。<br>2）卡片标题动词开头（「连接…」「导出…」），不堆名词。<br>3）认证/版本信息集中在页脚上方一行 10–11px，不散落 |
| R06 | v0<br>https://v0.app/<br>（v0.dev 307 跳转） | 抓取成功，但抓到的是文档型页面而非营销首页。meta：「v0 is an AI agent that helps anyone create real code and full-stack apps and agents.」；首句「Ship features, refine designs, update copy, and create live prototypes, all with a prompt.」；章节：What can you do with v0? / Examples / Who is v0 for? / 8 类角色（Product Managers、Designers、Engineers、Data Scientists、Marketing Teams、Content Creators and Educators、Customer Support、Founders）/ What makes v0 different?；无导航与页脚，末尾给出 `/docs/sitemap.md`、`/docs/llms.txt`、`/docs/agents.md` | 1）onboarding 按角色给 4–8 个预设（布局/看板列/默认图表），选完直进主界面。<br>2）关于/集成页暴露机器可读入口（llms.txt / agents.md / JSON schema），本地服务照此提供 `/api/manifest`。<br>3）价值主张一句话必须含「输入 → 产物」两个名词（prompt → 可运行代码） |
| R07 | GitHub Copilot<br>https://github.com/features/copilot | **未抓取（TLS handshake 失败）**。基于公开设计常识：深色 hero + 代码补全演示、按 IDE/场景分 tab 的功能区、个人/团队/企业三档定价、FAQ。未抓取到具体文案与数值 | 1）功能演示用「左代码、右结果」双栏，比例 3:2，代码块最高 320px 内滚。<br>2）套餐用 3 列卡，推荐列 1px accent 边 + 10px「推荐」标签，不放大卡片。<br>3）FAQ 用 details/summary，行高 40px、箭头 12px |
| R08 | OpenAI<br>https://openai.com/ | **未抓取（连接超时）**。基于公开设计常识：黑白极简、大字号品牌主张、产品卡（ChatGPT/Sora/API）网格、编辑式内容区、多列页脚。未抓取到具体文案与数值 | 1）产品入口用等宽同高卡（1:1 或 4:3），卡内仅 logo + 名称 + 一句说明 + 箭头。<br>2）黑白灰体系只配 1 个强调色（链接/焦点），不引入第二品牌色。<br>3）内容左对齐、最大宽 1200px，禁止整页居中 |
| R09 | Anthropic<br>https://www.anthropic.com/ | 抓取成功。导航仅 4 项：News、Research、Policy、Commitments，另有 Try Claude 与搜索；无独立 hero 标题，首屏为两句使命陈述（「Our mission is to help humankind chart a safe course through the evolution of intelligence…」）；内容为卡片流：Claude Opus 5.5、Introducing Claude Haiku 5.5（Oct 7, 2026）、Sonnet 5.5（Sep 28）、Opus 5.5（Sep 22）、Learn more 4 项（The Anthropic Institute、Claude's Constitution、Responsible scaling policy、Core views on AI safety）；页脚 10 列 | 1）一级导航 ≤5 项，其余进 ⌘K 命令面板。<br>2）首屏用 2 句说明 + 最新 4 条动态，不用大图。<br>3）动态列表统一「标题 13px/600 + 日期 11px/dim」，日期右对齐 |
| R10 | ElevenLabs<br>https://elevenlabs.io/ | 抓取成功。导航分产品（ElevenCreative、ElevenAgents、ElevenAPI）与用途（AI Voice Generator、Text to Speech、Music、Speech to Text、Voice Cloning、Dubbing）；hero「Bringing technology to life」；10 个章节；页面含可交互语音 demo（语言选择、音色「Spuds Oxley」、播放按钮、带 [sarcastically]/[giggles]/[whispers] 指令的示例文本）；分析图「Resolution Rate」V1 87.37% / V2 61.71%；模型标注 75ms latency、98% accuracy | 1）可交互 demo 放二级页/空状态，首屏只留一个「试听/试跑」按钮。<br>2）A/B 对比图固定两位小数并直接标差值；图例用 8px 色点。<br>3）产品线三分法（创作/代理/API）可映射为工作台「本地/云端/接口」信息架构 |

### C. 设计、协作与内容工具

| 编号 | 参考 / URL | 可验证的设计事实（WebFetch） | 可借鉴手法（≤3 条，可落地） |
|---|---|---|---|
| R11 | Linear<br>https://linear.app/ | 抓取成功。导航：Product、Resources、Customers、Pricing、Now、Contact，右侧 Docs、Open app、Log in、Sign up；hero 标题「The product development system for teams and agents」（页面重复 3 次），副标「Purpose-built for planning and building products. Designed for the AI era.」；4 个功能章节：Intake and integrations、Planning and monitoring、AI and automations、Build, review, and ship；页脚 6 列：Product / Features / Company / Resources / Connect / Legal | 1）功能按工作流阶段排序（采集→计划→自动化→交付），侧栏同序。<br>2）「Open app」与「Log in」并列右侧；桌面端顶栏放「打开/切换工作区」主操作。<br>3）hero 只保留 1 标题 + 1 副标 + 2 CTA，桌面应用内高度压到 200px 以内 |
| R12 | Figma<br>https://www.figma.com/ | **未抓取（60s 超时）**。基于公开设计常识：黑白营销底 + 高饱和品牌插画、产品界面浮层截图、按角色/团队分栏、模板与社区入口、多列页脚。未抓取到具体数值 | 1）截图展示用「设备框 + 2px 外描边 + 24px 阴影」，不做倾斜/3D 透视。<br>2）角色入口做 4 列 chip，选中态 accent 边 + accentsoft 底。<br>3）社区/模板区用瀑布流时限制 3 列，卡片高差 ≤1.5 倍 |
| R13 | Framer<br>https://www.framer.com/ | 抓取成功。hero「Framer is the design agent for every step from idea to launch」；12 个章节，连续同一句式：「Design with an agent」「Run your CMS with an agent」「Code with an agent」；导航含 Compare 竞品列表（Webflow、Figma、Wix、Squarespace、WordPress、Lovable、Claude Code、ChatGPT、Codex、Replit、v0 等）；模板区分「Trending Templates」与「Suggested for you」两段 | 1）功能列表统一句式（「用 X 做 Y」），每项 ≤12 字，便于扫读。<br>2）模板/预设分「最近使用」「推荐」两栏，各限 6 个，横向滚动两端 1px 渐隐。<br>3）设置页给「从…迁移」导入向导入口 |
| R14 | Notion<br>https://www.notion.com/ | **未抓取（60s 超时）**。基于公开设计常识：暖白底、大标题 + 插画、模板库、按团队/用途分区、多列页脚、强调 all-in-one workspace。未抓取到具体数值 | 1）空状态用 96px 插画 + 1 句说明 + 2 个模板按钮，插画不做循环动画。<br>2）模板卡显示「名称 + 用途标签 + 作者」，标签 10px。<br>3）编辑区正文最大宽 720px，工具栏吸顶 40px |
| R15 | Arc<br>https://arc.net/ | **未抓取（HTTP 403）**。基于公开设计常识：侧边栏式浏览器、垂直标签、Spaces 分组、命令栏、彩色渐变品牌。未抓取到具体数值 | 1）垂直侧栏 240px，可拖拽 200–320px，折叠后 48px 只留图标。<br>2）工作区分组行高 28px、组间距 8px，组标题 10px uppercase。<br>3）命令栏覆盖层宽 560px、距顶 20vh、blur 16px |

### D. 开发者基础设施与文档站

| 编号 | 参考 / URL | 可验证的设计事实（WebFetch） | 可借鉴手法（≤3 条，可落地） |
|---|---|---|---|
| R16 | Vercel<br>https://vercel.com/ | **未抓取（60s 超时）**。基于公开设计常识：黑白高对比、几何无衬线、三角标、渐变网格 hero、部署卡片与预览缩略、等宽数字。未抓取到具体数值 | 1）部署/构建卡四段：「状态点 + 项目名 + 分支 + 时长」，时长右对齐等宽。<br>2）黑白底上靠 1px 边框分层，阴影不超过 2 档。<br>3）预览缩略统一 16:10、圆角 8px，hover 只变边框 |
| R17 | Stripe<br>https://stripe.com/ | 抓取成功（中文站）。导航「产品/解决方案/开发者/资源/定价/登录」，次级「立即开始/联系销售」；hero「金融基础设施，托举营收增长。」+ 两句说明；6 个章节：解决方案 / 全球商务的金融底座 / 赋能各种规模的企业 / 可靠、可扩展的基础设施 / 最新动态 / 本周好书推荐；数字：135+ 币种、US$1.9 万亿 2025 交易额、99.999% 可用性、5 亿+ 日 API 请求、15 万+ 每分钟交易、50% Fortune 100；页脚 7 列 | 1）KPI 三行：值 24px/600 tabular-nums + 标签 11px + 口径 10px；单屏 ≤4 个。<br>2）商业与开发者入口并列，工作台顶栏保留「API/文档」入口。<br>3）案例按规模分组（初创/企业），每组 3 条，不铺 10+ logo 墙 |
| R18 | Supabase<br>https://supabase.com/ | 抓取成功。hero「Build in a weekend. Scale to millions.」；章节：Use it as just a Postgres database / Products / Data APIs / Key Differentiators / Setup for agents / What do you want to do? / Machine interfaces / Links；数字：20+ 登录方式、285+ CDN 城市、2M+ NPM 模块、40+ 扩展、16+ 区域、免费项目 7 天低活跃暂停 | 1）能力卡统一「名称 + 1 个量化事实」（20+/285+/2M+），无数字的能力不进首页。<br>2）双尺度 hero 句式（周末/百万）用于空状态标题，正文压到 1 行。<br>3）为 agent 单设「Machine interfaces」区块；工作台提供只读 JSON + MCP 说明入口 |
| R19 | Resend<br>https://resend.com/ | 抓取成功，抓到文档型首页：H1「Resend」，副标「Resend is the email API for developers. Send transactional and marketing emails at scale with a simple, modern API.」；章节 19 个（When to use Resend、Setup、Command line tool、MCP Server、Skills、Documentation、Support、OpenAPI spec、Pricing、Enterprise、Blog、Guides、Changelog、Handbook、Customers、Legal、Migrate、Security、SDKs）；API `POST https://api.resend.com/emails`，MCP `https://mcp.resend.com/mcp`；SDK 9 种：Node.js、Python、PHP、Ruby、Go、Java、Laravel、Rust、.NET；未见导航与页脚 | 1）集成页直接给可复制端点 + 语言 chip 网格，复制后 1.5s「已复制」反馈。<br>2）文档左栏 13px、行高 32px，当前项 2px 左竖线。<br>3）代码块深底单色高亮，右上角复制按钮 28px |
| R20 | Tailwind CSS<br>https://tailwindcss.com/ | 抓取成功。导航 Docs、Play、Blog、Showcase、Partners、Plus，另有 ⌘K 搜索与 GitHub；版本 v4.3；hero 实际类名 `text-4xl text-5xl text-6xl text-8xl text-gray-950 text-white tracking-tighter text-balance`；标题「Rapidly build modern websites without ever leaving your HTML.」；章节 Sponsors / Why Tailwind CSS? / How it works / Tailwind in the wild；12 个特性含 Responsive design、Dark mode、CSS variables、P3 colors、Container queries；`@theme` 示例使用 oklch 色阶与 `--text-tiny` 成对行高；称多数项目 CSS <10kB；页脚 3 列 | 1）tokens 用 oklch + 字号/行高成对变量（`--text-xs` 与 `--text-xs--line-height`），主题切换只换值。<br>2）暗色模式作为一级特性，顶栏放主题切换图标，不埋进设置深层。<br>3）文档直接展示实际 class/变量名，作为「活文档」 |
| R21 | Tauri<br>https://tauri.app/ | 抓取成功。导航 Guides、References、Blog、Releases + 6 种语言；hero「Tauri 2.0」/「Create small, fast, secure, cross-platform applications」；章节：Create a Project、4 张特性卡（Frontend Independent、Cross Platform、Maximum Security、Minimal Size）、Supported by、Open Collective Sponsors、GitHub Sponsors；数字「little as 600KB」，平台 Linux/macOS/Windows/Android/iOS；Ctrl K 搜索；页脚仅 2 个赞助链接 + CC-BY / MIT | 1）2×2 四点价值卡，每卡标题 2 词、说明 ≤2 行，用于关于页。<br>2）性能用单数字徽章（600KB）替代形容词；工作台显示包体/内存/启动耗时实测值。<br>3）文档站顶栏 4 项 + ⌘K，设置页照此极简 |
| R22 | Vite<br>https://vite.dev/ | **未抓取（60s 超时）**。基于公开设计常识：闪电标 + 紫黄渐变、深色 hero、Next Generation Frontend Tooling 主张、文档优先导航、框架图标网格、赞助商区。未抓取到具体数值 | 1）品牌渐变只用于 logo/启动画面，界面内不超过 1 处。<br>2）框架/运行时选择用 6 列 logo 网格，单元 72px，hover accentsoft 底。<br>3）启动画面 ≤800ms，淡出 200ms，不阻塞交互 |

### E. 桌面效率工具与数据密集产品

| 编号 | 参考 / URL | 可验证的设计事实（WebFetch） | 可借鉴手法（≤3 条，可落地） |
|---|---|---|---|
| R23 | Raycast<br>https://www.raycast.com/ | 抓取成功。导航 Store、Pro、AI、iOS、Windows、Teams、Enterprise、Blog、Pricing、Log in；hero「Your shortcut to everything.」，副标「A collection of powerful productivity tools all within an extendable launcher. Fast, ergonomic and reliable.」；11 个章节，标题两段式：「Fast. Think in milliseconds.」「Ergonomic. Keyboard First.」「Personal. Your tools, your way.」「Reliable. 99.8% crash-free rate.」；页面展示键帽 esc/F1–F12/control/option/command 与快捷键 option+command+L、「Quick AI ⇥」；页脚 6 列 | 1）设置项标题用「能力词. 一句解释.」两段式，解释 ≤14 字。<br>2）键帽组件：高 20px、圆角 4px、1px 底边、11px 等宽；快捷键提示统一右对齐。<br>3）可靠性指标（99.8% crash-free）放关于页单行，不夸大 |
| R24 | Zed<br>https://zed.dev/ | **未抓取（按要求停止抓取）**。基于公开设计常识：深色原生编辑器、极简 chrome、命令面板、协作光标与 presence、项目/缓冲区双栏。未抓取到具体数值 | 1）编辑器/终端区去掉多余边框，仅 1px 分栏线 + 8px 内边距。<br>2）命令面板分组（文件/命令/符号），组标题 10px uppercase，结果行 28px。<br>3）协作者光标用 2px 竖线 + 10px 姓名标签，颜色不超过 6 种 |
| R25 | Warp<br>https://www.warp.dev/ | **未抓取（按要求停止抓取）**。基于公开设计常识：块状终端、左侧状态槽、深色高对比、AI 建议内联、命令块可折叠/分享。未抓取到具体数值 | 1）日志/命令输出按「块」组织：块头 28px 含状态点、命令、耗时；块体 12px/1.55 等宽。<br>2）成功/失败用左侧 2px 竖条 + 6px 圆点，不整块染色。<br>3）长输出默认折叠到最后 200 行，顶部给「展开全部」 |
| R26 | Datadog<br>https://www.datadoghq.com/ | **未抓取（按要求停止抓取）**。基于公开设计常识：高密度 dashboard、统一图表色板、small multiples、可拖拽 widget、深浅主题、告警色克制。未抓取到具体数值 | 1）看板 12 列网格，widget 最小 3×2，间距 8px，标题栏 28px。<br>2）图表固定 8 色，按系列顺序取，同指标跨图同色。<br>3）阈值线 1px 虚线 + 右侧 10px 标签，不用大面积红底 |

---

## 二、跨站共性规律（16 条）

### 排版（3 条）

| 编号 | 规律与证据 | CSS / 组件落地 |
|---|---|---|
| T1 | 三档字号足够：页面标题 20–24px、卡片标题 13px、正文 12px、辅助 10–11px。营销站的 48–96px display 不进入产品界面。证据：R01/R02 每个 tile 仅 3 行、R23 两段式标题、R17 数字与标签的强层级 | `--text-page:20px; --text-card:13px; --text-body:12px; --text-meta:10.5px;` 行高 1.35 / 1.45 / 1.5；`body{font-size:12px}`；标题 `letter-spacing:-0.01em`；数字 `font-variant-numeric:tabular-nums` |
| T2 | 标题句式统一为「动词/能力词 + 一句解释」，说明最多 2 行。证据：R05 全部动词句、R13 重复「X with an agent」、R23「Fast. Think in milliseconds.」 | `.card-title{font:600 13px/1.35 var(--font-sans)}`<br>`.card-desc{font:400 11.5px/1.45;color:var(--color-dim);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}` |
| T3 | 等宽字体只给数字、ID、代码、键位；表格数值列右对齐，单位放表头。证据：R19 端点与 SDK 名、R20 代码示例、R23 键帽 | `.num,.mono{font-family:var(--font-mono);font-variant-numeric:tabular-nums}`；`td.num{text-align:right}`；等宽字号比正文字号小 0.5px |

### 色彩与材质（3 条）

| 编号 | 规律与证据 | CSS / 组件落地 |
|---|---|---|
| C1 | 一个主色承担全部交互，语义色只表状态，彩色面积 <5%。证据：R04 单一 CTA、R11 极简配色、R09 无彩色 hero | 主色仅用于 `:focus-visible`、激活 tab、主按钮、链接；主按钮 `background:color-mix(in srgb,var(--color-accent) 18%,transparent);color:var(--color-accent);border:1px solid color-mix(in srgb,var(--color-accent) 45%,transparent)`；禁止大面积品牌渐变 |
| C2 | 深色界面用「底 / 面板 / 浮层」3 层 + 1px 边，不用纯黑；层间亮度差 2–4%。证据：R20 暗色模式列为一级特性、R21 深色文档站、Workbench 现有 5 套主题 | `--bg:#0a0f1c; --panel:#121a2b; --panel2:#0e1526; --line:#22304a;` 浮层 `background:color-mix(in srgb,var(--color-panel) 92%,#fff 8%)`；边框 `1px solid var(--color-line)`；阴影仅浮层 `0 12px 32px rgb(0 0 0/.35)` |
| C3 | 玻璃/模糊只给覆盖层（命令面板、弹窗、toast），内容区保持不透明。证据：`src/styles/global.css:281-297` 已记录 `backdrop-filter: blur(0px)` 在无 GPU 的 WebView 导致整块不绘制的实测问题；R15 的命令栏是合理场景 | `.overlay{background:color-mix(in srgb,var(--color-panel) 72%,transparent);backdrop-filter:blur(16px)}`；内容卡 `backdrop-filter:none`；`@media (prefers-reduced-motion:reduce){backdrop-filter:none}` |

### 布局与留白（3 条）

| 编号 | 规律与证据 | CSS / 组件落地 |
|---|---|---|
| L1 | 三层壳固定尺寸：顶栏 44–48px、侧栏 232px（折叠 48px）、内容 gutter 12–16px；营销页 96–160px 的 section 间距不适用。证据：R01 双层导航、R11 单行顶栏、R21 4 项顶栏 | `header{height:44px}`<br>`aside{width:232px;transition:width .18s}`<br>`main{padding:12px 16px;gap:12px}`；全局 `box-sizing:border-box` |
| L2 | 4px 基准间距；卡片内边距 12–16px；表格行高 32px、表头 28px；看板列宽 280px。证据：R17 KPI 条、R18 产品卡平铺、R04 产品线列表 | `--space-1:4px … --space-6:24px`；`.card{padding:12px}`；`.table td{height:32px;padding:0 8px}`；`.kanban-col{width:280px;gap:8px}` |
| L3 | 一级导航 ≤7 项，其余进 ⌘K；二级用 36px tab + 2px 下划线，不用整块填充。证据：R09 4 项、R21 4 项、R20 6 项；反例 R05 一级 20+ 项 | `.tab{height:36px;padding:0 10px;border-bottom:2px solid transparent}`<br>`.tab[aria-selected="true"]{border-bottom-color:var(--color-accent);color:var(--color-text)}`<br>全局注册 ⌘K 命令面板 |

### 动效（2 条）

| 编号 | 规律与证据 | CSS / 组件落地 |
|---|---|---|
| M1 | 过渡 150–200ms、ease-out，只动 transform/opacity，位移 ≤4px；列表/表格 hover 不动或 ≤1px。证据：`src/styles/global.css:189-199` 已是 150ms + 2px；营销站的大位移不适用 | `--dur-fast:150ms; --dur-base:180ms; --ease:cubic-bezier(.2,.8,.2,1)`<br>`.card-hover:hover{transform:translateY(-1px)}`<br>表格行 hover 只改 `background` |
| M2 | 动效只服务状态变化：数值变化 600ms 高亮，加载用 1.2s shimmer；循环背景动画只允许空状态出现一次。证据：`src/styles/global.css:227-247` 的 hero-glow 14s/18s 属营销手法 | `@keyframes flash{from{background:color-mix(in srgb,var(--color-accent) 22%,transparent)}to{background:transparent}}`<br>`.value-changed{animation:flash .6s ease-out}`<br>`prefers-reduced-motion` 下全部关闭 |

### 数据可视化（3 条）

| 编号 | 规律与证据 | CSS / 组件落地 |
|---|---|---|
| V1 | 图表色板固定 6–8 色、同图 ≤5 系列；只画水平网格线，颜色 `rgba(255,255,255,.06)`；轴标签 10px、dim 色。证据：R10 V1/V2 对比图、R17 多指标、R26 统一色板常识 | ECharts：`color:['#22d3ee','#8b5cf6','#34d399','#fbbf24','#f87171','#60a5fa']`；`splitLine:{lineStyle:{color:'rgba(255,255,255,.06)'}}`；`axisLabel:{fontSize:10,color:'#8b98ad'}`；`grid:{left:8,right:8,top:24,bottom:24,containLabel:true}` |
| V2 | KPI 卡四行：label 10.5px uppercase → value 24px/600 tabular → delta 11px 语义色 → 口径 10px/60%。证据：R17 135+/99.999%、R23 99.8%、R18 20+ | `.kpi-label{font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--color-dim)}`<br>`.kpi-value{font:600 24px/1.1 var(--font-sans);font-variant-numeric:tabular-nums}`<br>`.kpi-delta{font-size:11px}` `.kpi-note{font-size:10px;opacity:.6}` |
| V3 | 表格：表头 11px/500、60% 透明；行高 32px；斑马纹用 panel2 55%；状态 = 6px 圆点 + 文字，不整行染色；数字右对齐。证据：`src/styles/global.css:173-175` 已有斑马纹；R19/R17 表格结构 | `thead th{height:28px;font-size:11px;font-weight:500;color:var(--color-dim)}`<br>`tbody td{height:32px}`<br>`.status-dot{width:6px;height:6px;border-radius:50%}`；状态色只用于圆点 |

### 细节质感（2 条）

| 编号 | 规律与证据 | CSS / 组件落地 |
|---|---|---|
| D1 | 焦点环 2px accent/70% + offset 1px；hover 只变边框或底色；禁用态 40% 透明 + `cursor:not-allowed`。证据：`src/styles/global.css:201-207` 已实现焦点环 | 沿用现有 focus-visible；补 `.btn:disabled{opacity:.4;cursor:not-allowed}`；`.row:hover{background:color-mix(in srgb,var(--color-panel2) 70%,transparent)}` |
| D2 | 边框只有 2 档（line / line-strong），圆角只有 3 档（4/8/12），图标统一 16px 线性、stroke 1.5。证据：R20 token 化、R21 四卡、Workbench `--radius-card/--radius-btn` | `--radius-sm:4px; --radius-md:8px; --radius-lg:12px;`<br>`--line-strong:color-mix(in srgb,var(--color-line) 70%,#fff 30%)`<br>`svg.icon{width:16px;height:16px;stroke-width:1.5}` |

---

## 三、不适合桌面高密度工作台的做法

| 做法 | 出处 | 为什么不适用 | 替代做法 |
|---|---|---|---|
| 全屏 hero + 90–100vh 产品大图 | R01、R03 | 首屏被品牌叙事占满；桌面工具首屏必须直接给状态与操作 | 顶栏 44px + 首屏直接是 Overview 卡片；品牌信息收进「关于」 |
| 滚动叙事 / 逐屏动画（25 个章节） | R01、R03 | 桌面工具靠滚动找信息效率低，且打断键盘流 | 固定三栏 + 页内 tab；滚动层级 ≤2 级 |
| 营销式大留白（section 间距 96–160px） | R01、R17、R13 | 信息密度被腰斩，24 寸屏也放不下 2 张卡 | gutter 12–16px、卡片内边距 12px、区块间距 24px |
| 超大 display 字号（48–96px） | R20 hero `text-8xl`、R01 | 占空间且破坏层级，桌面窗口宽度有限 | 页面标题 20–24px、KPI 24–28px、正文 12px |
| 每个 section 一句 slogan + 大图 | R23、R13 | 信息/像素比低，重复滚动无新信息 | 标题 13px + 说明 11.5px + 实体内容（表格/图表/列表） |
| 无限循环背景光晕/渐变 | Workbench 自身 `.hero-glow` 14s/18s；R15/R22 品牌渐变 | GPU 常驻、耗电、分散注意；长时间使用易疲劳 | 静态渐变；入场动画只播一次 300ms；`prefers-reduced-motion` 全关 |
| 大面积玻璃拟态 | R15、R13 视觉风格 | WebView 中 blur 成本高，`blur(0)` 还有整块不绘制的实测 bug | 仅命令面板/弹窗 blur 12–20px，其余不透明（见 `global.css:281-297`） |
| 卡片 hover 上浮 + 大阴影 | 多数营销卡（R02/R13） | 表格/看板里造成行高抖动与视觉噪音 | 只变 `border-color` 与 `background`，位移 ≤1px 或不动 |
| 居中单列长文 | R09、R14 | 浪费横向空间，桌面宽屏阅读效率低 | 12 列 grid + 可折叠侧栏；正文 `max-width:68ch` 仅用于文档页 |
| 首页放可交互 demo | R10 语音 demo、R06 prompt demo | 首屏负载与认知负担高，且依赖网络/模型 | 放「示例/模板」二级页；空状态只给一个触发按钮 |
| 巨型页脚（8–11 列） | R01、R04、R09 | 桌面应用无 SEO 需求，页脚是死空间 | 设置页 3 组（通用/数据/关于）+ 版本与许可证一行 |
| 数字墙（15+ 指标同屏） | R17 | 假精确、噪音大，用户无法判断口径 | 每屏 ≤4 个 KPI，每个带口径与时间范围；其余进「详情」 |
| 高饱和品牌色大面积铺底 | R12、R17 渐变 | 长时间使用视觉疲劳，压低数据色辨识度 | 中性底 + 主色仅激活态；图表色降饱和 10–20% |
| 全屏视频背景 | R01、R03 | CPU/GPU 与电量开销大，窗口缩放易糊 | 静态首帧 + 点击播放；默认不自动播放 |
| 一级导航 20+ 项平铺 | R05 | 扫读成本高，挤压内容区 | 一级 ≤7 项 + ⌘K 命令面板 + 设置内二级导航 |

---

## 四、落地速查（可直接进 tokens）

| 类别 | 建议值 | 说明 |
|---|---|---|
| 字号 | 20 / 13 / 12 / 10.5 px | 页面标题 / 卡片标题 / 正文 / 辅助；行高 1.35 / 1.45 / 1.5 / 1.4 |
| 间距 | 4 / 8 / 12 / 16 / 24 px | 4px 基准；卡片内 12px，区块间 24px |
| 圆角 | 4 / 8 / 12 px | 输入与标签 4、按钮 8、卡片 12；终端主题统一 0 |
| 边框 | `1px solid var(--color-line)`；强调 `--line-strong` | 全站只有 2 档，禁止 2px 以上描边（focus ring 除外） |
| 阴影 | 卡片无阴影或 `0 1px 3px rgb(0 0 0/.12)`；浮层 `0 12px 32px rgb(0 0 0/.35)` | 深色界面靠边框分层，不靠阴影 |
| 动效 | 150 / 180 / 600 ms | hover / 展开 / 数值高亮；缓动 `cubic-bezier(.2,.8,.2,1)` |
| 图表色 | `#22d3ee #8b5cf6 #34d399 #fbbf24 #f87171 #60a5fa` | 与现有 accent/ok/warn/danger 对齐，最多 6 色 |
| 表格 | 表头 28px、行 32px、字号 12px | 数字右对齐、状态点 6px、斑马纹 panel2 55% |
| 看板 | 列宽 280px、卡间距 8px、列头 32px | 列内卡片只显示标题/标签/负责人/时间 |
| 聊天 | 消息行高 1.55、正文 12.5px、代码块 12px | 用户消息右对齐最大宽 72%，助手消息左对齐无气泡底 |

---

## 五、抓取记录

| 参考 | 状态 | 说明 |
|---|---|---|
| Apple MacBook Pro | 成功 | 页面文本/结构 |
| Apple 首页 | 成功 | 9 个 hero tile 结构 |
| Tesla Model 3 | 失败 | HTTP 403 |
| Qoder | 成功 | 含页脚与数字 |
| Linear | 成功 | 含页脚 6 列 |
| Vercel | 失败 | 60s 超时 |
| Stripe | 成功 | 中文站 |
| Raycast | 成功 | 含键帽与快捷键 |
| Arc | 失败 | HTTP 403 |
| Cursor | 成功 | 含认证与语言列表 |
| Figma | 失败 | 60s 超时 |
| Resend | 成功 | 文档型首页 |
| v0 | 成功 | v0.dev 307 → v0.app，抓到文档页 |
| Tailwind CSS | 成功 | v4.3，含 `@theme` 示例 |
| Tauri | 成功 | Tauri 2.0 页面 |
| Vite | 失败 | 60s 超时 |
| Notion | 失败 | 60s 超时 |
| Supabase | 成功 | 含产品数字 |
| Framer | 成功 | 含 12 章节 |
| ElevenLabs | 成功 | 含 demo 与图表数据 |
| Anthropic | 成功 | 含新闻卡片日期 |
| OpenAI | 失败 | 连接超时 |
| GitHub Copilot | 失败 | TLS handshake 失败 |
| Zed / Warp / Datadog | 未请求 | 按要求停止抓取，事实列已标注 |

> 凡标注「未抓取」的条目，其设计事实仅来自公开设计常识，不含任何具体数值、色值或文案引用；落地参数均为建议值，使用前需在真实界面验证。
