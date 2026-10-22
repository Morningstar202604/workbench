# Changelog

This project follows [Semantic Versioning](https://semver.org/) and the format
recommended by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- **Themes are data now, not CSS.** A theme is six colours plus six shape knobs
  (card radius, button radius, density, typeface, material, grid strength,
  panel opacity, dark footing) expanded into 26 CSS variables and a matching
  chart palette. `src/lib/theme/tokens.ts` owns the derivation;
  `src/lib/theme/presets.ts` holds eight built-in themes — Midnight, Frost,
  Paper, Aurora, Terminal, **Ink**, **Void**, **Jade**. Built-ins and custom
  themes share one render path, so any built-in can be duplicated and edited.
- Settings gained a real appearance panel: theme editor with live preview,
  import/export of theme JSON (fail-closed validation, id collisions renamed),
  shell picker, layout picker and widget manager. Persist version 3 migrates
  `dark`/`light` to `midnight`/`frost` and cleans the new fields.
- **Shell** is now a real choice: left rail, top dock (navigation in the header,
  full-width canvas) or zen (icon strip + centred column). Previously
  `StyleDef.shell` only rounded the preview swatch in Settings and never
  affected the app.
- **Overview has five layouts** over the same nine widget components: bento,
  ledger, orbit, dense, zen. The orbit layout keeps the yin-yang *structure*
  (one hub + a ring of satellites) without rotating cards or text — the hub
  carries the headline gauge.
- **Widgets can be reordered and hidden** from Settings or dragged directly on
  the overview page; order and visibility persist per device.

### Fixed

- **Density never applied.** `--space-card` had five values but 23 of 39 cards
  set `p-4` explicitly, and Tailwind's utilities layer beat the unlayered
  `.t-card` rule — every theme rendered 16 px padding. The padding rule moved
  into `@layer components` and the redundant classes were removed; measured
  Midnight 16 px vs Terminal 12 px afterwards.
- **Pie chart seams were the page colour, not the panel colour.** On light
  themes the card is white while the page is off-white, so every gap between
  sectors showed a grey line. `chartGapColor()` now returns the panel colour.
- **The visual baseline used pink masks.** Timestamps were masked with
  `toHaveScreenshot({ mask })`, which paints a solid magenta block into the
  baseline; the real layout underneath was never captured. Switched to
  `visibility:hidden`, and the clock is frozen (`page.clock.install`) so a
  screenshot is reproducible — before this, the first run failed and a rerun
  passed.
- Four dead i18n keys (`settings.dark` / `light` / `styleHint` /
  `appearanceHint`) had no references anywhere; removed.

### Added

- **Restore from backup.** `list_backups` / `restore_backup` join the existing
  `backup_data`. Restore validates every file as parseable JSON *before*
  touching anything, creates a safety backup of the current state, then replaces
  files atomically. The backup id is a timestamp, never a path, so traversal is
  rejected. Verified on the packaged exe: change data after a backup, restore,
  data is back; both the source and safety backups exist afterwards.
- Settings gained a Backup & restore panel listing every backup point with its
  timestamp and file list, plus a layout wireframe so the five overview layouts
  are distinguishable before clicking them.

### Fixed

- **Backups could overwrite themselves.** Directory names are second-precision,
  and restore creates a safety backup in the same second as the source it is
  restoring from — both landed in the same folder, so restore silently did
  nothing and destroyed the backup it was reading. Now the directory is claimed
  atomically and a collision waits for the next second.
- Restore now validates the source backup before creating the safety backup, so
  a corrupt backup no longer leaves a useless rollback point behind.
- The appearance panel's two cards were stretched to equal height by the grid,
  leaving a large blank area under the shorter one; the layout picker now shows
  a wireframe preview and the grid uses `items-start`.

- **Model pricing editor** (Cost ledger page). The built-in price table (56
  models, USD per 1M tokens) is listed with search; any model can be
  overridden, new models can be added, and each row can be reset to the
  built-in price. Saving is **whole-table validated**: one invalid entry rejects
  the entire write and shows every reason, because a partially applied price
  table makes the UI and the disk disagree. Invalid entries already sitting in
  `pricing_overrides.json` are now reported instead of being silently ignored.
  Two new IPC commands (`get_pricing` / `save_pricing`) with ts-rs generated
  types.
- **Real desktop E2E** (`scripts/e2e-desktop.mjs`): connects to the packaged exe
  over the WebView2 debugging port and exercises the real Tauri commands —
  pricing read/write/reject/reset plus UI rendering. This is the first test that
  runs against real IPC rather than the browser demo build.

### Fixed

- **Dev-server detection flagged dozens of false positives.** The `serve`
  rule was a substring match and `server` contains `serve`, so on this machine
  42 node processes (`dist-server/server/main.js`, `apps/server/main.js`) were
  reported as dev servers. Short words now require a standalone command token,
  plus a `node_modules/serve/` path check. Real run: 42 → 29.
- **A daemon was counted as a dev server.** `opencode-cli.exe serve --service`
  is opencode's own local API, not a user project. Commands carrying
  `--service` / `--daemon` / `--background` are excluded; the real machine now
  reports 29 entries, all genuine `vite` / `uvicorn` processes.
- Removed two unused theme variables (`--toward-light` / `--toward-dark`).
- Added the two missing i18n keys (`settings.widgetsShow` / `widgetsHide`) that
  the widget manager already referenced — they were rendering the raw key.


- **Design language rebuilt around "precision instrument"**, benchmarked against
  Apple / Tesla / Qoder / Linear / Vercel / Raycast / Stripe style modern product
  sites (see `docs/design-references.md`). Concretely:
  - Sidebar: 212 px rail, 32 px rows, active state = 2 px signal line + 8 % tint
    instead of a filled pill; brand block is a 52 px bar with a 1px hairline.
  - Header: 52 px, floating icon cluster (refresh / pin / theme) inside a pill,
    monospace timestamp, status chip with a live dot.
  - Cards: surface + 1px inner hairline + a 3.5 % top light wash. Removed the
    coloured top bars, the 32 px icon tiles and the heavy shadows from every
    stat card; numbers are now tabular monospace at 26–30 px and carry the card.
  - Overview opens with a masthead (mark + title + live state) directly on the
    canvas instead of a hero card with blurred blobs; machine info became a
    one-line nameplate; a 64 px grid field sits under the content.
  - Typography: 13 px base, 12 px section titles, 10 px tabular column heads,
    tighter heading tracking; all-caps was removed from section titles (it now
    only marks table column headers, where it is actually meaningful).
- **Chinese is the default UI language.** English and Japanese remain available
  in Settings; an explicitly stored choice is never overridden.

### Fixed

- **Logo no longer shows a white patch.** The sidebar and the overview masthead
  now render `BrandMark`, a pure-vector mark (four strokes, `currentColor`, no
  plate, no rect, no bitmap) — it sits directly on whatever surface is behind it.
  The app icon pipeline was rewritten to derive alpha from luminance instead of
  applying an estimated rounded-rect mask, which left a white ring wherever the
  mask radius disagreed with the badge radius. `scripts/check_icons.py` now also
  fails on any near-white visible pixel, not just opaque corners.
- Chart palette, `data-theme` swatches and the chart gap colour were re-based on
  the new surface colours, so Frost/Paper pies no longer draw black seams.

### Added

- **Five visual styles** switchable in Settings, each with a live preview card:
  - *Midnight* — dense dark console (the previous look)
  - *Frost* — light, airy, large radii, soft shadows
  - *Paper* — warm paper background, serif headings, wide margins
  - *Aurora* — translucent glass panels over a fixed gradient
  - *Terminal* — monospace, sharp corners, high contrast

  These change corner radius, shadow, spacing, type family and panel opacity,
  not just hue. Chart colours follow the style's light/dark footing
  automatically.
- **Visual regression tests** (Playwright): 11 baselines across five styles and
  key pages, plus structural assertions on theme variables. Added because
  overlapping chart labels, a collapsed hero column and an entirely blank
  settings page all passed the unit tests.
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
  platform-aware protected-process lists, and a single normalisation rule that
  follows the path's own shape (drive letter, UNC, POSIX) instead of the
  compile target, so the same config string means the same thing on both
  platforms.
  **Verified on real Linux (Ubuntu 24.04)**: 93 unit tests pass, clippy is
  clean, the `deb` package builds (`Workbench_0.1.1_amd64.deb`, 8.2 MiB), the
  binary inside it has zero missing shared libraries, and it starts under
  Xvfb — the log shows the app booting and probing the opencode port.
  AppImage is not shipped: the bundler downloads `linuxdeploy` from GitHub at
  build time and that host is unreachable here, so it is unverified.
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
