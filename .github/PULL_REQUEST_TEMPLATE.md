<!-- Thanks for the contribution! Fill in the sections below to make review faster. -->

## What this PR does

<!-- One-sentence summary -->

## Related issue

<!-- e.g. Closes #12 -->

## Change type

- [ ] Bug fix (fix)
- [ ] New feature (feat)
- [ ] Refactor (refactor)
- [ ] Docs (docs)
- [ ] Tests (test)
- [ ] Build / CI (chore / ci)

## How you verified it

<!-- List the commands you actually ran and their results, so we can reproduce. -->

```bash
npm run format:check
npm run lint
npm test
npm run build
# If it touches the backend:
# cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

## Checklist

- [ ] All local gates green (format / lint / test / build, plus cargo test & clippy when Rust is touched)
- [ ] If a Rust struct changed, ran `cargo test --test export_bindings` and committed the generated output
- [ ] New logic has tests, or explains why it doesn't need any
- [ ] UI changes include screenshots (captured in browser demo mode)
- [ ] No secrets, tokens, or local absolute paths committed

## Notes

<!-- Trade-offs or known limitations go here. -->
