<!-- 感谢贡献！请填写以下内容，便于 review。 -->

## 这个 PR 做了什么

<!-- 一句话概括 -->

## 关联 Issue

<!-- 如 Closes #12 -->

## 改动类型

- [ ] 缺陷修复（fix）
- [ ] 新功能（feat）
- [ ] 重构（refactor）
- [ ] 文档（docs）
- [ ] 测试（test）
- [ ] 构建 / CI（chore / ci）

## 怎么验证的

<!-- 写清你实际执行的命令与结果，便于复核 -->

```bash
npm run format:check
npm run lint
npm test
npm run build
# 涉及后端时：
# cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

## 自查清单

- [ ] 本地门禁全绿（format / lint / test / build，涉及 Rust 时含 cargo test 与 clippy）
- [ ] 改了 Rust 结构体的话，已跑 `cargo test --test export_bindings` 并提交生成物
- [ ] 新增逻辑有对应测试，或说明了为何不需要
- [ ] 界面改动附了截图（用浏览器演示模式截）
- [ ] 没有提交任何密钥、令牌或本机绝对路径

## 补充说明

<!-- 有取舍或已知限制请写在这里 -->
