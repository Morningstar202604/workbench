# 工作台 Workbench

[English](README.md) | **简体中文** | [日本語](README.ja.md)

[![Release](https://img.shields.io/github/v/release/X33834/workbench?color=22d3ee&label=release)](https://github.com/X33834/workbench/releases/latest)
[![License](https://img.shields.io/github/license/X33834/workbench?color=34d399)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-0078d4)](docs/ARCHITECTURE.zh-CN.md#系统要求)

![工作台](docs/screenshots/12-brand-hero.png)

本地优先的桌面运维工作台：进程、端口、开发服务器、项目、任务与 AI 会话成本，
一屏看清；需要时也能做高权限操作（比如以管理员结束一个杀不掉的进程）。
数据仅存本机。

## 界面预览

| 概览 | 进程监控 |
|------|----------|
| ![概览](docs/screenshots/01-overview.png) | ![进程监控](docs/screenshots/02-processes.png) |
| CPU / 内存趋势、磁盘与进程分类 | 全进程快照、虚拟滚动、杀进程二次确认 |

| 服务与端口 | AI 会话 |
|------------|----------|
| ![服务与端口](docs/screenshots/03-servers.png) | ![AI 会话](docs/screenshots/04-ai-sessions.png) |
| netstat 端口识别与开发框架标注 | 会话文件、在线会话、工具分布 |

| 成本账本 | 任务看板 |
|----------|----------|
| ![成本账本](docs/screenshots/05-costs.png) | ![任务看板](docs/screenshots/08-tasks.png) |
| 预算进度、趋势、模型分解 | 拖拽看板，待办 / 进行中 / 已完成 |

## 功能

| 功能 | 说明 |
|------|------|
| **实时监控** | 进程、端口（netstat）、开发服务器识别，带开发框架标注 |
| **管理员结束进程** | 普通结束失败后一键「以管理员结束」，触发系统 UAC 授权弹窗；受保护系统进程由后端先行拦截 |
| **AI 会话成本计量** | 本机 Claude / Codex 会话 token 成本，SQLite 本地账本——不依赖任何模型、不要 API key、数据不出本机 |
| **价格编辑器** | 40+ 模型价格内置，界面内改价 / 新增 / 恢复内置价 |
| **备份恢复** | 带时间戳快照，一键回滚，恢复前完整性校验 |
| **开机自启** | 真实系统级注册（注册表 / autostart），开关状态回读操作系统 |
| **视觉系统** | 7 种概览版面 × 8 套主题 × 3 种外壳，组件可拖拽 / 隐藏，主题编辑器与分享链接 |
| **三语界面** | 简体中文（默认）/ English / 日本語 |
| **跨平台** | Windows（NSIS 安装包 + 免安装 exe）与 Linux（deb） |

## 下载

**v0.2.0** —— 按平台取安装包：

| 平台 | 文件 |
|------|------|
| Windows 10/11 x64 | `Workbench_0.2.0_x64-setup.exe`（NSIS，约 4 MB）或免安装 `workbench.exe` |
| Linux | `workbench_0.2.0_amd64.deb` |

> 安装包未做代码签名，Windows SmartScreen 可能提示「未知发布者」——
> 点「更多信息 → 仍要运行」即可（证书需付费，文件没有风险）。

任选镜像下载——代码完全一致，各自发布 Release：

| 镜像 | Release 页 |
|------|------------|
| GitHub | [github.com/X33834/workbench/releases](https://github.com/X33834/workbench/releases) |
| Gitee | [gitee.com/badhope/workbench/releases](https://gitee.com/badhope/workbench/releases) |
| GitCode | [gitcode.com/badhope/workbench/releases](https://gitcode.com/badhope/workbench/releases) |

## 构建

需要 Node.js ≥ 20 与 Rust ≥ 1.77：

```bash
npm install
npm run tauri dev      # 桌面开发模式（含热更新）
npm run tauri build    # 安装包 → src-tauri/target/release/bundle/
```

技术栈、项目结构、常见问题、Roadmap、截图全览等内容都在
[架构与参考文档](docs/ARCHITECTURE.zh-CN.md)
（[English](docs/ARCHITECTURE.md) / [日本語](docs/ARCHITECTURE.ja.md)）。

## 参与贡献 & 许可

- 贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md) · 安全漏洞见
  [SECURITY.md](SECURITY.md) · 行为规范见
  [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · 版本记录见
  [CHANGELOG.md](CHANGELOG.md)
- [MIT](LICENSE) © 2026 x1882
