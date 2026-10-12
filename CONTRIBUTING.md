# 贡献指南 Contributing

感谢你有兴趣为「工作台」做贡献。本文档说明本地开发、提交规范与验收门槛。

## 开发环境

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | ≥ 20（CI 用 22，LTS 均可） | 前端构建与测试 |
| Rust | ≥ 1.77（`src-tauri/Cargo.toml` 的 `rust-version`） | 后端与桌面壳 |
| Windows | 10 / 11 | **当前唯一验证平台**，见下方「平台范围」 |
| WebView2 Runtime | 随 Windows 11 预装 | Windows 10 需手动安装 |

```bash
npm install            # 安装前端依赖
npm run tauri dev      # 启动桌面开发模式（含热更新）
```

只想调前端界面时，用浏览器演示模式即可，不需要 Rust 工具链：

```bash
npm run dev            # http://localhost:5173，自动注入演示数据
```

## 提交前必须跑

CI 会把这四道门全部跑一遍，本地先过一遍能省一个来回：

```bash
npm run format:check   # Prettier 格式检查
npm run lint           # ESLint（零警告）
npm test               # 前端单测（vitest）
npm run build          # tsc --noEmit + vite build

cd src-tauri
cargo test             # 后端单测 + IPC 契约导出
cargo clippy --all-targets -- -D warnings   # 零警告
```

### 改了 Rust 结构体后必做

前端的跨 IPC 类型由 Rust 结构体生成，**不要手写**：

```bash
cd src-tauri
cargo test --test export_bindings   # 重新生成 src/generated/*.ts
```

`src/generated/` 入库作为契约快照，CI 会比对：若 Rust 改了而生成物没更新，直接失败。

## 分支与提交

- 从 `main` 切分支，命名如 `feat/xxx`、`fix/xxx`
- 提交信息用 [Conventional Commits](https://www.conventionalcommits.org/)：
  `feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:` / `ci:`
- 一个提交只做一件事，便于 review 与回溯

## 代码约定

- **TypeScript**：strict 全开，`noUnusedLocals` / `noUnusedParameters` 生效；禁止 `any`
- **Rust**：`cargo fmt` + `cargo clippy -- -D warnings` 零警告
- **样式**：Tailwind CSS 4 + CSS 变量双主题；颜色不要硬编码，走 `global.css` 的 `@theme`
- **图表**：ECharts 选项里的颜色**必须给真实色值**（ECharts 不解析 CSS 变量）；
  主题相关取值走 `src/lib/chartTheme.ts`，并在 `useMemo` 依赖里带上 `theme`
- **注释**：解释「为什么」而非「是什么」。删掉代码时连同它的历史注释一起删

## 平台范围

当前只在 Windows 上开发、测试与打包：

- 端口采集写死 `cmd /c netstat -ano`（`ports.rs` 的 POSIX 分支存在但未被执行）
- 安装包仅产出 NSIS
- 欢迎提交 macOS / Linux 支持，但请**同时**补上对应平台的实际验证记录

## 提交 PR

1. 确认上述门禁本地全绿
2. PR 描述里写清：改了什么、为什么、怎么验证的
3. 涉及界面的改动请附截图（用浏览器演示模式截，避免泄漏真实数据）

## 报告问题

- 缺陷与功能建议走 [Issues](https://github.com/X33834/workbench/issues)（含模板）
- 安全问题**不要**开公开 issue，见 [SECURITY.md](SECURITY.md)
