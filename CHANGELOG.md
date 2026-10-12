# 更新日志 Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

## [0.1.0] - 2026-10-12

首个发布版本。Windows 桌面端，NSIS 安装包。

### 新增

- **概览**：CPU / 内存实时趋势曲线、磁盘占用环形图、进程分类统计、Hero 状态横幅
- **进程**：全进程快照、CPU / 内存排序与筛选、虚拟滚动（含展开详情行的变高实测）、
  杀进程二次确认、AI 代理进程识别
- **服务与端口**：`netstat` 端口监听识别、30+ 开发框架标注（Vite / Next / uvicorn …）、
  端口区间分布图
- **AI 会话**：opencode 在线会话列表与详情、本地 Claude Code / Codex 会话文件预览
- **成本计量**：token 消耗统计、按日趋势（近 14 天）、按模型分解、预算告警（系统通知）、
  Anthropic 缓存折扣计价
- **项目与任务**：本地项目管理（Git 分支自动检测）、看板式任务板（拖拽切换状态）
- **运行日志**：内置日志查看器、尾部读取、自动刷新与滚动跟随
- **设置**：主题 / 刷新间隔可调、预算与告警阈值、JSON 数据导入导出
- **桌面行为**：关闭窗口隐藏到托盘、全局快捷键 `Ctrl+Shift+W`、
  窗口置顶、日志按启动滚动

### 技术实现

- Tauri 2 + React 18 + TypeScript（strict）+ Vite 6
- Zustand 5 状态管理（persist）、Tailwind CSS 4 双主题、ECharts 6（按需引入）
- IPC 契约由 Rust 结构体经 ts-rs 生成到 `src/generated/`，CI 校验无漂移
- Rust 侧纯逻辑（netstat 解析、框架识别、价格匹配、token 提取、JSON 存储、
  IPC 守卫）均有单元测试，共 44 个
- 前端 vitest 单测 48 个（util / store / 共享组件 / 错误边界）

### 安全

- WebView 最小权限集，不授予 `opener:allow-open-path`；打开目录走白名单后端命令
- IPC 入参白名单（目录 / 端口）；会话 ID 字符集与长度校验
- CSP 收紧到 `self`；外部请求禁跟随重定向
- 数据文件原子写入，解析失败先保全再报错
- 终止进程拒绝 PID 0/4 与关键系统进程

### 已知限制

- 仅 Windows 验证；macOS / Linux 尚未接入采集与打包
- `pricing_overrides.json` 只有读取路径，UI 未提供编辑入口
- 成本账本落在单个 JSON 文件，记录数极大时全量读写会吃力
- 安装包未做代码签名，Windows 可能提示「未知发布者」

[Unreleased]: https://github.com/X33834/workbench/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/X33834/workbench/releases/tag/v0.1.0
