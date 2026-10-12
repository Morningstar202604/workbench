# Security Policy

## Supported versions

| Version | Security fixes |
|---------|----------------|
| 0.1.x | ✅ |

## Reporting a vulnerability

**Please do not disclose security issues in public issues.**

Prefer GitHub's private reporting channel:
[Security Advisories](https://github.com/X33834/workbench/security/advisories/new)

If that channel is unavailable, contact the maintainer privately through the
contact information published on the repository home page.

### Please include

- Affected version (`v0.1.x` tag or commit)
- Reproduction steps or a minimal PoC
- Impact assessment (remotely triggerable? what preconditions?)
- Known mitigations, if any

### Response expectations

| Stage | Target |
|-------|--------|
| Acknowledgement | within 3 business days |
| Initial assessment | within 7 business days |
| Fix or mitigation | agreed based on severity |

## Security design already in place

Workbench is a **local-first** desktop app; its attack surface differs from
typical web apps. Measures already implemented:

| Surface | Measure |
|---------|---------|
| WebView permissions | `capabilities/default.json` is minimal; `opener:allow-open-path` is **not** granted |
| Opening directories | must pass the backend `open_known_path` whitelist; the frontend cannot open arbitrary paths |
| IPC arguments | `ipc_guard.rs` whitelists directories and ports; ports must reuse a just-probed successful value |
| Session ids | `ai.rs` validates charset and length, preventing path/query rewrites when embedded in URLs |
| External requests | redirects never followed; `percent-encode` as a second layer |
| Content security policy | CSP in `tauri.conf.json` tightened to `self`, no remote resources |
| Data integrity | JSON writes use atomic replacement; on parse failure the file is preserved as `*.corrupt-<timestamp>` before erroring — data is never silently dropped |
| Dangerous operations | killing PID 0/4 and critical system processes is rejected outright; the frontend asks for confirmation |
| Dependencies | CI runs `npm audit`; Dependabot keeps dependencies current |

## After disclosure

Once a fix ships, we will credit you in the release notes if you agree.
