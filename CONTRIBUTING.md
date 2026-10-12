# Contributing

Thanks for your interest in contributing to Workbench. This document covers
local development, commit conventions, and the acceptance gates.

## Development environment

| Dependency | Version | Notes |
|------------|---------|-------|
| Node.js | ≥ 20 (CI uses 22; any LTS is fine) | frontend build & tests |
| Rust | ≥ 1.77 (`rust-version` in `src-tauri/Cargo.toml`) | backend & desktop shell |
| Windows | 10 / 11 | **the only verified platform**, see "Platform scope" |
| WebView2 Runtime | preinstalled on Windows 11 | Windows 10 needs a manual install |

```bash
npm install            # install frontend dependencies
npm run tauri dev      # desktop dev mode (hot reload)
```

Frontend-only work can use the browser demo mode — no Rust toolchain needed:

```bash
npm run dev            # http://localhost:5173, demo data injected automatically
```

## Run before committing

CI runs all of these gates; passing them locally first saves a round trip:

```bash
npm run format:check   # Prettier
npm run lint           # ESLint (zero warnings)
npm test               # frontend unit tests (vitest)
npm run build          # tsc + vite build

cd src-tauri
cargo test             # backend tests + IPC contract export
cargo clippy --all-targets -- -D warnings   # zero warnings
```

### After changing a Rust struct

Frontend IPC types are generated from Rust structs — **do not hand-write them**:

```bash
cd src-tauri
cargo test --test export_bindings   # regenerates src/generated/*.ts
```

`src/generated/` is committed as the contract snapshot; CI compares it and
fails if the Rust side changed without regenerating.

## Branches & commits

- Branch off `main`, named `feat/xxx`, `fix/xxx`, …
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:` / `ci:`
- One commit does one thing — easier to review and to revert

## Code conventions

- **TypeScript**: strict everywhere, `noUnusedLocals` / `noUnusedParameters`
  on; `any` is not allowed
- **Rust**: `cargo fmt` + `cargo clippy -- -D warnings` with zero warnings
- **Styling**: Tailwind CSS 4 + CSS variables for the dual theme; never
  hardcode colors, go through `@theme` in `global.css`
- **Charts**: ECharts options need **real color values** (ECharts cannot parse
  CSS variables); theme-dependent values come from `src/lib/chartTheme.ts`,
  and `theme` must be listed in `useMemo` dependencies
- **Comments**: explain "why", not "what". When deleting code, delete its
  history comments too

## Platform scope

Development, testing and packaging are Windows-only today:

- Port collection shells out to `cmd /c netstat -ano` (the POSIX branch in
  `ports.rs` exists but is never exercised)
- Only the NSIS installer is produced
- PRs adding macOS / Linux support are welcome, but must come with actual
  verification notes for those platforms

## Opening a PR

1. Make sure all gates above pass locally
2. Describe in the PR: what changed, why, and how you verified it
3. UI changes: attach screenshots (use browser demo mode so no real data leaks)

## Reporting issues

- Bugs and feature requests go to
  [Issues](https://github.com/X33834/workbench/issues) (templates provided)
- Security issues must **not** be filed publicly — see [SECURITY.md](SECURITY.md)
