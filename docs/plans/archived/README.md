# Archived Plans Index

本目录用于存放**已完成并归档**的计划文档，避免主 `docs/plans/` 被历史计划干扰。

## 归档规则

1. 计划对应代码已落地（或明确终止且有结论）。
2. 验证结果已记录（至少包含 typecheck / tests 结论）。
3. 路线图与研究文档中的引用已切换到归档路径。

## 命名规范

- 保留原文件名：`YYYY-MM-DD-<topic>.md`
- 不重命名，保证历史可追溯。

## 当前归档清单

- `2026-02-10-memory-auto-capture-abcd-implementation.md`
- `2026-02-10-memory-storage-restructure.md`
- `2026-02-10-fix-note-cleanup-and-engine-tag.md`
- `2026-02-10-phase2-memory-consumption-mvp-implementation-plan.md`
- `2026-02-10-auto-memory-tagging-mvp.md`

## 维护建议

- 新计划先放 `docs/plans/`，完成后再迁移到本目录。
- 每次归档后，更新：
  - `docs/plans/2026-02-10-phase2-roadmap.md`
  - 本 README 的“当前归档清单”。
