# Checkpoint-1：实用性审查与 Agent 模块裁剪前的存档点

- **基准提交**：`d9d1082`（feat(theme,overview): theme share links and two more overview layouts）
- **Tag**：`phase-1`（已打在基准提交上）
- **日期**：2026-10-22
- **工作区状态**：clean（打 tag 时无未提交改动）

## 目标

1. **实用性审查**：对工作台全部 10 个功能模块逐一做 keep / remove / merge 裁决，评估每个模块的日常使用价值与维护成本（审计报告见 `.aqg/code-construction/`，属本地审计产物，已由仓库根 `.gitignore` 忽略、不入库）。
2. **Agent 模块裁剪**：依据审查结论，移除 Agent 模块（前端组件 + Rust IPC 命令 + 相关脚本），收敛 IPC 面，降低维护负担。

## 产出物

| 产出物 | 位置 | 入库状态 |
| --- | --- | --- |
| 实用性审计报告（逐模块裁决 + 爆炸半径分析） | `.aqg/code-construction/`（本地目录） | 不入库（.gitignore 已忽略 `.aqg/`） |
| 本 checkpoint 文档 | `docs/checkpoint-1.md` | 入库 |
| 回滚锚点 tag | `phase-1` | 本地 tag，随裁剪完成后一并向远程同步 |

## 关键决策

- **仅移除 Agent 模块**；其余 9 个模块（主题、总览、看板、表格、文档、日历、发布、工作流、设置等）全部保留。
- 依据：Agent 模块日常使用频次低、外部依赖重、且占据大量 IPC 通道；其余模块均为工作台核心高频功能。
- 裁剪范围仅限 Agent 相关的前端组件、Rust 命令与脚本，不触碰其余模块的业务代码。

## 回滚指令

裁剪若引入不可接受的问题，可随时回到本存档点：

```bash
# 方式一：检出存档点到工作区（保留后续提交历史，便于对比）
git checkout phase-1

# 方式二：硬重置 master 到存档点（丢弃其后的全部提交，不可恢复）
git checkout master
git reset --hard phase-1
```
