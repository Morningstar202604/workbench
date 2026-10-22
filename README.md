# Workbench

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

> Tauri 2 desktop app · Local system dashboard · AI session cost metering

[![CI](https://github.com/X33834/workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/X33834/workbench/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/X33834/workbench?color=22d3ee&label=release)](https://github.com/X33834/workbench/releases/latest)
[![License](https://img.shields.io/github/license/X33834/workbench?color=34d399)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-0078d4)](#system-requirements)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev/)

A local-first, privacy-preserving desktop workbench for your machine: processes,
ports, dev servers, and AI coding-session token costs — all visible in one place.
Data stays on your device by default. Five switchable visual styles — from a
dense dark console to a light "paper" reading layout and a translucent glass
theme — each changing spacing, corner radius and type, not just colour. UI
ships in **简体中文 (default), English and 日本語**.

**Platforms:** Windows 10/11 (NSIS) and Linux (deb / AppImage). Port collection
uses `netstat -ano` on Windows and `ss -tulpn` on Linux, falling back to
`netstat` when iproute2 is missing. macOS is not packaged yet.

**AI assistant (tool calling):** the app can drive a model that calls the
workbench's own tools — read processes, ports, dev servers and cost, and act
(track tasks, rescan costs, open a project, terminate a process). Mutating
tools require an explicit per-call approval; the API key lives only in process
memory and is never written to disk.

**🌐 Project homepage** — every mirror hosts its own copy of the landing page
(see the mirror table below); each copy automatically links back to its own
repository and releases.

---

## Download

No dev environment needed (Windows 10 / 11 x64). Each GitHub mirror below
publishes **its own Release** with the same installer — pick the platform you
prefer:

| Channel | File | Notes |
|---------|------|-------|
| **Recommended** | `Workbench_<version>_x64-setup.exe` (Releases → latest) | NSIS installer, ~4 MB |
| Portable | `workbench.exe` (Releases → latest) | Single file, no registry writes |

> The installer is not code-signed, so Windows SmartScreen may show an
> "Unknown publisher" warning — choose **More info → Run anyway**. This is
> because signing certificates cost money, not because the file is unsafe.

### Mirrors

Identical code, five platforms; each runs its own CI and publishes its own
releases where supported:

| Platform | Repository | Landing page |
|----------|------------|--------------|
| GitHub | [X33834/workbench](https://github.com/X33834/workbench) | [x33834.github.io/workbench](https://x33834.github.io/workbench/) |
| GitHub | [badhope/workbench](https://github.com/badhope/workbench) | [badhope.github.io/workbench](https://badhope.github.io/workbench/) |
| GitHub | [Morningstar202604/workbench](https://github.com/Morningstar202604/workbench) | [morningstar202604.github.io/workbench](https://morningstar202604.github.io/workbench/) |
| Gitee | [badhope/workbench](https://gitee.com/badhope/workbench) | — (downloads on its Releases page) |
| GitCode | [badhope/workbench](https://gitcode.com/badhope/workbench) | — (downloads on its Releases page) |

---

## Screenshots

> Captured in **browser demo mode** (`npm run preview`): outside Tauri the app
> injects static demo data from `src/lib/demo.ts`; all paths and host names are
> placeholders, no real machine data.

| Overview | Processes |
|----------|-----------|
| ![Overview](docs/screenshots/01-overview.png) | ![Processes](docs/screenshots/02-processes.png) |
| CPU / memory trends, disks, process groups | Full snapshot, virtual scrolling, kill confirmation |

| Servers & ports | AI sessions |
|-----------------|--------------|
| ![Servers](docs/screenshots/03-servers.png) | ![AI sessions](docs/screenshots/04-ai-sessions.png) |
| netstat parsing, dev-framework tags | Session files, live sessions, tool mix |

| Cost ledger | AI assistant |
|-------------|--------------|
| ![Costs](docs/screenshots/05-costs.png) | ![Assistant](docs/screenshots/06-agent.png) |
| Budget progress, trend, model split, price editor | Tool-call trace, per-call approval, example prompts |

| Projects | Tasks |
|----------|-------|
| ![Projects](docs/screenshots/07-projects.png) | ![Tasks](docs/screenshots/08-tasks.png) |
| Local projects, Git branch detection | Drag-and-drop kanban |

| Settings | Logs |
|----------|------|
| ![Settings](docs/screenshots/09-settings.png) | ![Logs](docs/screenshots/10-logs.png) |
| Theme editor, shell/layout, widgets, backup | Built-in log viewer, tail reading |

### Visual system

![Five styles](docs/screenshots/00-themes.png)

Five styles share one token set (surface, hairline, radius, type scale); they
differ in surface colour, radius, density and type family, not just hue.

| Brand mark (sidebar) | Brand mark (masthead) |
|----------------------|-----------------------|
| ![Sidebar brand](docs/screenshots/11-brand-sidebar.png) | ![Masthead brand](docs/screenshots/12-brand-hero.png) |

The mark is four vector strokes with `currentColor` and no plate — it sits
directly on the panel, on any background.

| Icon at every shipped size | Icon embedded in the exe |
|----------------------------|--------------------------|
| ![Icon sizes](docs/screenshots/13-icon-sizes.png) | ![Exe icon](docs/screenshots/16-exe-icon.png) |

| Collapsed sidebar | Narrow screen (drawer) |
|-------------------|------------------------|
| ![Collapsed](docs/screenshots/15-sidebar-collapsed.png) | ![Drawer](docs/screenshots/14-mobile-drawer.png) |

### Themes, shells and layouts

Theme is **data, not CSS**: six colours plus six shape knobs expand into 26 CSS
variables and a matching chart palette. Everything below is reachable from
Settings → Appearance, and any built-in theme can be duplicated and edited.

| Orbit layout (Aurora) | Ledger layout (Ink) |
|-----------------------|---------------------|
| ![Orbit](docs/screenshots/20-layout-orbit-aurora.png) | ![Ledger](docs/screenshots/21-layout-ledger-ink.png) |

| Zen layout (Void) | Dense layout (Terminal) |
|-------------------|--------------------------|
| ![Zen](docs/screenshots/22-layout-zen-void.png) | ![Dense](docs/screenshots/23-layout-dense-terminal.png) |

| Dock shell | Zen shell |
|------------|-----------|
| ![Dock](docs/screenshots/24-shell-dock.png) | ![Zen shell](docs/screenshots/25-shell-zen.png) |

- **Shell** moves the navigation: left rail, top dock, or a collapsed icon strip.
- **Layout** re-arranges the overview: bento, ledger, orbit, dense, zen.
- **Widgets** can be dragged, reordered and hidden independently of both.

See [docs/plan-audit.md](docs/plan-audit.md) for the capability audit and
[docs/audit-2026-10-22.md](docs/audit-2026-10-22.md) for the full
correctness / security / reliability / performance / test-quality review,
including the competitor matrix (Raycast, Datadog, Warp, Linear, Zed) and the
measured coverage / complexity numbers.

Regenerate screenshots yourself: `npm run build`, then `npm run preview`,
then run a headless Chrome with
`--remote-debugging-port=9222`, then `node scripts/shoot_docs.mjs`.
The script asserts demo mode is active and refuses to shoot otherwise, so real
data can never leak into the repo.

## Features

| Module | What it does |
|--------|--------------|
| 🖥 **Overview** | CPU / memory trend charts, disk usage donut, process group stats |
| ⚙ **Processes** | Full snapshot, CPU / memory sorting, virtual scrolling (viewport-only rows), kill with confirmation, AI agent detection |
| 🌐 **Servers & ports** | netstat listener detection, dev-framework tags (Vite / Next / Django…) |
| 🤖 **AI sessions** | opencode online sessions, local Claude / Codex session preview |
| 💰 **Cost metering** | Token usage, daily trends, budget alerts, Anthropic cache pricing |
| 📁 **Projects** | Local project registry, automatic Git branch detection |
| ✅ **Tasks** | Kanban board (drag to change status) |
| ⚙ **Settings** | Theme editor, shell / layout / widget arrangement, refresh interval, budget thresholds, JSON import & export, backup & restore, start at login |
| 📋 **Logs** | Built-in viewer, auto refresh, tail reading |

## Cost metering

- **Three-level confidence**: measured (API-reported usage) → estimated
  (character heuristic) → zero_pricing
- **40+ model prices built in**; the Cost ledger ships a real price-override editor (edit a unit price, add a model, restore built-in prices; invalid prices reject the whole table)
- **Anthropic cache semantics**: `input_tokens` excludes cache;
  `cache_read_input_tokens` billed at 0.1×, `cache_creation_input_tokens` at 1.25×
- **Day attribution**: measured and estimated rows are bucketed per JSONL-line
  `timestamp` (falls back to the previous day / file mtime when missing), so
  appending to a session never rewrites historical days
- **Unknown models are never priced**: unrecognized models are flagged
  `unknown` and recorded as `zero_pricing` — no invented unit prices
- **Idempotent**: each session file keeps only its latest snapshot (replaced
  whole-group by `file_path`), so re-scans never stack stale rows
- **Estimates can be disabled**: the "include estimated rows" toggle live-updates
  overview / trend / model breakdowns
- **Budget alerts**: system notifications, de-duplicated to avoid nagging
- **Scan scope**: the cost scan covers every session file under
  `~/.claude/projects` and `~/.codex/sessions` (the UI preview shows the
  10 most recent)

## Desktop behavior

- Closing the window hides to tray; tray left-click toggles visibility, the
  tray menu really exits the process
- Global hotkey `Ctrl+Shift+W` toggles window visibility (degrades to a warning
  if the hotkey is taken; startup is never blocked)
- Logs roll per launch (> 5 MB archives to `workbench.log.1`), the Logs page
  reads on demand from the tail
- Killing PID 0/4 and critical system processes (csrss / lsass / services …)
  is rejected outright

## Getting started

### System requirements

| Item | Requirement |
|------|-------------|
| OS | Windows 10 / 11 (x64); Linux (deb) |
| Runtime | Windows needs WebView2 (preinstalled on Windows 11); Linux needs WebKitGTK 4.1 |
| Disk | ~35 MB installed; portable single file ~15 MB |
| Privileges | No admin required; killing a process needs same-or-higher privileges |
| Network | None required. The only optional probe is the local opencode service when you open the AI sessions page |

### Install from Releases (recommended)

1. Grab `Workbench_<version>_x64-setup.exe` from the
   [latest release](https://github.com/X33834/workbench/releases/latest)
2. If SmartScreen appears: **More info → Run anyway**
3. Launch "Workbench" from the Start menu

### Build from source

Requires [Node.js](https://nodejs.org/) ≥ 20,
[Rust](https://www.rust-lang.org/tools/install) ≥ 1.77, WebView2.

```bash
npm install
```

### IPC contract types

Types crossing the IPC boundary are not hand-written in `src/types.ts`; they
are generated from the Rust structs:

```bash
cd src-tauri
cargo test --test export_bindings   # regenerates src/generated/*.ts
```

`src/types.ts` only re-exports; `src/generated/` is the committed contract
snapshot. After changing a Rust struct you must re-run the command above,
otherwise the CI drift gate will reject the PR.

### Development

```bash
npm run tauri dev      # desktop dev mode (hot reload)
npm run dev            # frontend only, browser demo mode, no Rust needed
```

### Production build

```bash
npm run tauri build
```

Artifacts land in `src-tauri/target/release/bundle/`.

## Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | Tauri 2 (Rust + OS webview) |
| Frontend | React 19 + TypeScript (strict) + Vite 8 |
| State | Zustand 5 (persist) |
| Styling | Tailwind CSS 4 + dual-theme CSS variables |
| Charts | ECharts 6 (tree-shaken, dark/light themes registered) |
| Virtualization | @tanstack/react-virtual 3 (variable-height expanded rows) |
| Subscriptions | Zustand 5 `useShallow` selectors + `memo` page components |
| IPC | Tauri IPC + spawn_blocking |
| Contracts | ts-rs 12 generates `src/generated/*.ts` from Rust structs, CI drift-gated |
| Process data | sysinfo |
| Ports | netstat parser (POSIX / Windows dialects) |
| i18n | 简体中文 default, switchable English / 日本語 |
| Quality gates | ESLint 10 + Prettier 3 + vitest 5 + clippy `-D warnings` |

## Project structure

```
workbench/
├── src/                    # frontend
│   ├── pages/              # 8 feature pages (lazy loaded)
│   ├── lib/                # store / api / echarts / chartTheme / i18n / util
│   ├── generated/          # ts-rs generated IPC contract types (do not edit)
│   ├── ui.tsx              # shared component library
│   ├── types.ts            # type re-exports + frontend-only types
│   ├── App.tsx             # app shell
│   └── styles/global.css   # global styles & theme variables
├── src-tauri/              # Rust backend
│   ├── capabilities/       # Tauri permission set (minimal)
│   ├── icons/              # app icons (generated by scripts/make_icons.py)
│   ├── src/
│   │   ├── commands.rs     # IPC command layer
│   │   ├── procs.rs        # process snapshot + kill
│   │   ├── ports.rs        # netstat parsing
│   │   ├── devserver.rs    # dev-framework detection
│   │   ├── ai.rs           # AI session fetching
│   │   ├── pricing.rs      # model price matching
│   │   ├── session_meter.rs# JSONL token cost parsing
│   │   ├── cost_store.rs   # cost data persistence
│   │   ├── ipc_guard.rs    # IPC argument whitelist
│   │   └── lib.rs          # Tauri bootstrap
│   └── tests/              # IPC contract export test
├── docs/                   # GitHub Pages landing page + screenshots
├── scripts/                # icon & screenshot helper scripts
└── .github/workflows/      # CI / Release / Pages
```

## Development & quality

```bash
npm run format:check       # Prettier
npm run lint               # ESLint (zero warnings)
npm run test               # frontend unit tests (vitest, 48 cases)
npm run coverage           # coverage
npm run build              # tsc + vite build

cd src-tauri
cargo test                 # backend tests + IPC contract export
cargo clippy --all-targets -- -D warnings   # zero-warning gate
```

Pure Rust logic (netstat parsing, framework detection, price matching, token
extraction, JSON storage, IPC guard) carries `#[cfg(test)]` unit tests; the
frontend is covered by vitest (util / store / shared components / error
boundary). CI runs formatting, lint, type check, build, both test suites,
clippy with zero warnings, and verifies `src/generated/` matches the Rust
structs.

## FAQ

<details>
<summary>How is the cost metering computed? Is it accurate?</summary>

It parses the `usage` fields in local Claude Code / Codex session JSONL files
and prices them against 40+ built-in model prices, with three confidence
levels:

- **measured** — real usage reported by the API, most accurate
- **estimated** — no usage, heuristic by character count (can be disabled)
- **zero_pricing** — model unrecognized, recorded as free rather than priced
  with a made-up unit price

Anthropic cache tokens follow the official semantics (read 0.1×,
write 1.25×).
</details>

<details>
<summary>Does it upload my data anywhere?</summary>

No. Projects, tasks, the cost ledger and logs all live in the local app data
directory. The app only does two local things: read `netstat` for ports, and
read local session files for costs. The only optional network call is probing
the local opencode service (default port 4096); on failure it just shows "not
detected".
</details>

<details>
<summary>Can killing a process break my system?</summary>

No. PID 0/4 and critical system processes (csrss, lsass, services…) are
rejected by the backend; the frontend asks for confirmation first; and the
target identity is re-verified after refresh to avoid PID-reuse mistakes.
</details>

<details>
<summary>Where did the window go after I closed it? How do I quit?</summary>

Hiding to the tray is intentional (the app is meant to keep monitoring). Right
click the tray icon and choose "Quit"; the hotkey <code>Ctrl+Shift+W</code>
toggles visibility anytime.
</details>

<details>
<summary>Windows says "Unknown publisher" — what do I do?</summary>

The installer is not code-signed (certificates cost money), so SmartScreen
steps in. Choose **More info → Run anyway**, or grab the portable exe instead.
</details>

## Roadmap

Done and planned. Vote or propose new ideas in the Issues.

- [x] Real-time process / port / dev-server monitoring
- [x] AI session cost metering with budget alerts
- [x] Projects & task kanban
- [x] Data-driven themes (8 built-ins + custom editor + import/export), log viewer
- [x] Three shells (rail / top dock / zen) and five overview layouts
- [x] Draggable, hideable overview widgets
- [x] Multilingual UI (English / 简体中文 / 日本語)
- [ ] Cross-platform support (Linux done and verified; macOS not built)
- [ ] Installer code signing
- [x] Model pricing editor (edit / add / reset overrides from the UI)
- [x] Data backup and restore (timestamped snapshots, one-click rollback)
- [ ] Sharded cost ledger (100k+ records)
- [ ] Page-level end-to-end tests (visual + structural covered; agent and
      import/export flows are not)

## Known limitations

- Port collection runs `netstat -ano` on Windows and `ss -tulpn` on Linux
  (falling back to `netstat`). The Linux backend is tested and the `deb`
  package has been built and started successfully (Ubuntu 24.04 via
  container + Xvfb); it has not been tried on a physical desktop yet.
  AppImage is not produced because the bundler fetches `linuxdeploy` from
  GitHub at build time
- The AI assistant sends tool results (process command lines, project paths,
  task titles) to the model service **you configure**. If command lines may
  contain secrets, treat that provider as part of your trust boundary
- Interaction paths are covered by Playwright (structure and WCAG AA across 10 pages × 8 themes) plus a packaged-exe desktop E2E over real IPC; the agent conversation and import/export flows are not scripted yet
- The cost ledger is a single `cost_data.json` (writes are serialized); very
  large histories will make full read/write sluggish
- The cost ledger has no sharded storage yet; very large histories make full read/write sluggish
- The installer is unsigned; first launch may trigger a SmartScreen prompt
- The tray menu text is currently Chinese only (frontend UI is fully
  trilingual)

## Data storage

| File | Purpose | Location |
|------|---------|----------|
| `data.json` | Projects & tasks | app data dir |
| `cost_data.json` | Cost records + pricing settings | app data dir |
| `pricing_overrides.json` | User price overrides (editable on the Cost ledger page) | app data dir |
| `workbench.log` | Runtime logs | app data dir |
| `*.corrupt-<timestamp>` | Untouched backup of a data file that failed to parse (never overwritten by the next save) | app data dir |

On Windows the app data dir is `%APPDATA%\com.workbench.desktop`.

## Contributing

- Contribution workflow & conventions: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security vulnerabilities: private channel, see [SECURITY.md](SECURITY.md)
- Community code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)

## License

[MIT](LICENSE) © 2026 x1882
