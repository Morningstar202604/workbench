# Changelog

This project follows [Semantic Versioning](https://semver.org/) and the format
recommended by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **AI assistant with real tool calling** — talk to an OpenAI-compatible model
  that can call the workbench's own tools: inspect processes, ports, dev
  servers, AI sessions and cost, then act (create tasks, rescan costs, open a
  project directory, terminate a process). Every tool call is shown with its
  raw arguments so the user can audit it.
  - Mutating tools require a **per-call approval**. The backend stores the
    pending call (tool name + arguments) and executes that exact call once
    approved, so what the user approves is what runs. Approvals expire after
    5 minutes and cannot be replayed. The gate constrains the *model*; it is
    not a defense against a compromised WebView, which can already call
    `terminate_process` directly.
  - **Automatic failover**: primary service queued, timed out or reporting "no
    available channel" → the assistant switches to the configured fallbacks.
  - API keys are kept in process memory only — never written to disk, logs or
    config files.
- **Linux support** — port collection via `ss -tulpn` (with `netstat`
  fallback), unified listen-state vocabulary across both dialects,
  platform-aware protected-process lists, case-sensitive path handling and
  POSIX absolute paths on POSIX, plus `deb` / `AppImage` packaging targets.
  A Linux CI job now compiles and tests the backend on ubuntu-latest.
- **Responsive shell** — grouped, collapsible sidebar; on narrow windows it
  becomes a drawer. Layout adapts across desktop / tablet / phone widths.
- New **Cost ledger** page (cost moved out of the AI sessions page) and
  **Assistant** page.

### Changed

- Cost metering now reads the model from where the tools actually write it
  (`message.model` for Claude Code, `turn_context.payload.model` for Codex) and
  aggregates **per day and per model**, so a session that mixes models is priced
  correctly instead of applying the first model's rate to the whole file.
- Process snapshots are shared within a refresh cycle; port sampling is cached
  for the same window; system info no longer re-enumerates every process.
- Refresh requests are never dropped: concurrent callers share the in-flight
  sample and one follow-up runs afterwards.
- Polling pauses when the window is hidden.

### Fixed

- Windows drive paths (for example `C:/proj`) were misdetected as URL schemes,
  breaking every "open directory" action.
- Focus trap in dialogs could be escaped by clicking non-focusable body text.
- UNC paths collapsed into relative paths in the allowed-directory set.
- `updateCostSettings` reported success on failure, so unsaved settings looked
  saved.
- Modal/confirm dialogs: real focus trapping, ESC handling, focus restoration.
- Log rotation now happens at runtime (not only at startup) and tail reads no
  longer corrupt multibyte characters at chunk boundaries.
- Cost commands no longer block the main thread.

## [0.1.1] - 2026-10-12

### Added

- **Trilingual UI** — the whole frontend ships in English (default), 简体中文
  and 日本語, switchable in Settings and persisted per device
- Landing page internationalization (English default with a language switcher)

### Changed

- Dependency refresh (verified by the full local gate suite):
  - React / react-dom / @types/react / @types/react-dom → **19.3.0**
    (supersedes Dependabot #11 / #14, which half-upgraded and broke `npm ci`)
  - lucide-react → 1.54.0 (#10), vite → 8.3.4 (#44), @vitejs/plugin-react → 6.1.2 (#47)
  - reqwest → 0.13.5 (#8), sysinfo → 0.39.6 (#7), ts-rs → 12.0.1 (#9)
    (ts-rs API migration: `export_all_to(dir)` → `Config` + `export_all(&cfg)`;
    regenerated contracts are byte-identical)
  - GitHub Actions: checkout v7, setup-node v7, upload-artifact v7,
    action-gh-release v3
- TypeScript intentionally stays on 5.9.x: typescript-eslint does not support
  TS 7 yet (typescript-eslint#10940) — #13 closed with this reason
- README rewritten in English as the primary language, with README.zh-CN.md and
  README.ja.md kept in sync

## [0.1.0] - 2026-10-12

First public release. Windows desktop, NSIS installer.

### Added

- **Overview**: live CPU / memory trend charts, disk usage donut, process group
  stats, hero status banner
- **Processes**: full process snapshot, CPU / memory sorting and filtering,
  virtual scrolling (with variable-height expanded rows), kill confirmation,
  AI agent process detection
- **Servers & ports**: `netstat` listener detection, 30+ dev-framework tags
  (Vite / Next / uvicorn …), port-range distribution chart
- **AI sessions**: opencode online session list and detail, local Claude Code /
  Codex session file preview
- **Cost metering**: token usage stats, daily trends (last 14 days), per-model
  breakdown, budget alerts (system notifications), Anthropic cache pricing
- **Projects & tasks**: local project registry (automatic Git branch
  detection), kanban task board (drag to change status)
- **Logs**: built-in log viewer, tail reading, auto refresh and scroll follow
- **Settings**: theme / refresh interval, budget and alert thresholds, JSON
  data import & export
- **Desktop behavior**: close-to-tray, global hotkey `Ctrl+Shift+W`, always on
  top, per-launch log rotation

### Technical

- Tauri 2 + React 18 + TypeScript (strict) + Vite 6
- Zustand 5 (persist), Tailwind CSS 4 dual theme, ECharts 6 (tree-shaken)
- IPC contracts generated from Rust structs via ts-rs into `src/generated/`,
  drift-checked in CI
- Pure Rust logic (netstat parsing, framework detection, price matching, token
  extraction, JSON storage, IPC guard) unit-tested — 44 tests
- Frontend vitest suite — 48 tests

### Security

- Minimal WebView permission set; no `opener:allow-open-path` — opening
  directories goes through a whitelisted backend command
- IPC argument whitelist (directories / ports); session id charset & length
  validation
- CSP tightened to `self`; external requests never follow redirects
- Atomic writes for data files; corrupted files are preserved before erroring
- Process termination refuses PID 0/4 and critical system processes

### Known limitations

- Windows-only verified; macOS / Linux collection & packaging not wired up
- `pricing_overrides.json` is read-only, no UI editor
- The cost ledger lives in a single JSON file; very large histories make full
  read/write sluggish
- Installer is not code-signed; Windows may warn "Unknown publisher"

[0.1.1]: https://github.com/X33834/workbench/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/X33834/workbench/releases/tag/v0.1.0
