# Workbench

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

[![Release](https://img.shields.io/github/v/release/X33834/workbench?color=22d3ee&label=release)](https://github.com/X33834/workbench/releases/latest)
[![License](https://img.shields.io/github/license/X33834/workbench?color=34d399)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-0078d4)](docs/ARCHITECTURE.md#system-requirements)

![Workbench](docs/screenshots/12-brand-hero.png)

A local-first desktop workbench: see and manage everything running on your
machine — processes, ports, dev servers, projects, tasks and AI session costs
— in one dashboard, with high-privilege actions (like killing a stubborn
process as administrator) when you need them. Data stays on your device.

## Screenshots

| Overview | Processes |
|----------|-----------|
| ![Overview](docs/screenshots/01-overview.png) | ![Processes](docs/screenshots/02-processes.png) |
| CPU / memory trends, disks, process groups | Full snapshot, virtual scrolling, kill confirmation |

| Servers & ports | AI sessions |
|-----------------|--------------|
| ![Servers](docs/screenshots/03-servers.png) | ![AI sessions](docs/screenshots/04-ai-sessions.png) |
| netstat parsing, dev-framework tags | Session files, live sessions, tool mix |

| Cost ledger | Tasks |
|-------------|-------|
| ![Costs](docs/screenshots/05-costs.png) | ![Tasks](docs/screenshots/08-tasks.png) |
| Budget progress, trend, model split | Drag-and-drop kanban |

## Features

| Feature | What you get |
|---------|--------------|
| **Monitoring** | Live processes, ports (netstat) and dev-server detection with dev-framework tags |
| **Elevated kill** | "End as administrator" retry after a normal kill fails — triggers the OS UAC prompt; protected system processes are rejected by the backend up front |
| **AI cost metering** | Token costs of local Claude / Codex sessions in a local SQLite ledger — no model, no API key, nothing leaves your machine |
| **Pricing editor** | 40+ built-in model prices; edit / add / reset overrides from the UI |
| **Backup & restore** | Timestamped snapshots with one-click rollback and integrity checks |
| **Start at login** | Real OS registration (registry / autostart entry), toggle reads back from the OS |
| **Visual system** | 7 overview layouts × 8 themes × 3 shells, draggable & hideable widgets, theme editor with share links |
| **Trilingual UI** | 简体中文 (default) / English / 日本語 |
| **Cross-platform** | Windows (NSIS installer + portable exe) and Linux (deb) |

## Download

**v0.2.0** — grab the installer for your platform:

| Platform | File |
|----------|------|
| Windows 10/11 x64 | `Workbench_0.2.0_x64-setup.exe` (NSIS, ~4 MB) |
| Linux | not packaged for v0.2.0 — build from source, or keep using the `0.1.1` deb |

> Not code-signed, so Windows SmartScreen may show an "Unknown publisher"
> warning — choose **More info → Run anyway** (certificates cost money, the
> file is not unsafe).

Pick any mirror — identical code, each publishes its own releases:

| Mirror | Releases |
|--------|----------|
| GitHub | [github.com/X33834/workbench/releases](https://github.com/X33834/workbench/releases) — still on **v0.1.1** (push credentials pending) |
| Gitee | [gitee.com/badhope/workbench/releases](https://gitee.com/badhope/workbench/releases) — v0.2.0 released; installer asset pending upload from the release page |
| GitCode | [gitcode.com/badhope/workbench/releases](https://gitcode.com/badhope/workbench/releases) — v0.2.0 released; installer asset pending upload from the release page |

## Build

Requires Node.js ≥ 20 and Rust ≥ 1.77:

```bash
npm install
npm run tauri dev      # desktop dev mode (hot reload)
npm run tauri build    # installers → src-tauri/target/release/bundle/
```

Tech stack, project structure, FAQ, roadmap, screenshots and everything else
live in the [architecture & reference doc](docs/ARCHITECTURE.md)
([简体中文](docs/ARCHITECTURE.zh-CN.md) / [日本語](docs/ARCHITECTURE.ja.md)).

## Contributing & License

- Contribution workflow: [CONTRIBUTING.md](CONTRIBUTING.md) · Security:
  [SECURITY.md](SECURITY.md) · Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) ·
  Changelog: [CHANGELOG.md](CHANGELOG.md)
- [MIT](LICENSE) © 2026 x1882
