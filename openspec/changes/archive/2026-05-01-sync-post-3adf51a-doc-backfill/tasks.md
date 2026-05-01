# Tasks

## 1. Gitlog Coverage

- [x] 1.1 [P0][input: `git log 3adf51a..HEAD`][output: 非 merge / 非 Trellis record 功能提交清单][verify: proposal coverage table 覆盖所有功能域] 梳理区间功能变更。
- [x] 1.2 [P0][depends: 1.1][input: active/archive OpenSpec changes][output: commit -> existing change / backfill action 映射][verify: 每个功能域至少有 proposal 或 delta spec 留痕] 建立变更矩阵。

## 2. OpenSpec Delta Backfill

- [x] 2.1 [P0][depends: 1.x][input: uncovered behaviors][output: `sync-post-3adf51a-doc-backfill/specs/**`][verify: `openspec validate sync-post-3adf51a-doc-backfill --strict`] 补充缺失或不完整的 delta specs。
- [x] 2.2 [P0][depends: 2.1][input: delta specs][output: updated `openspec/specs/**`][verify: 主 specs 包含对应 requirements/scenarios] 将 delta specs 同步到主 specs。
- [x] 2.3 [P1][depends: 2.2][input: existing active changes][output: 必要的 proposal/tasks 状态补充][verify: 不移动 active change，不归档] 回写已有提案遗漏状态。

## 3. Trellis Code-Spec Backfill

- [x] 3.1 [P0][depends: 2.x][input: latest code facts][output: `.trellis/spec/**` executable rules][verify: code-spec 只包含可执行 contract，不写流水账] 更新 Trellis code-level specs。
- [x] 3.2 [P1][depends: 3.1][input: cross-layer rules][output: guides index / cross-layer checklist 更新][verify: 后续 AI 可从 spec index 发现规则] 更新必要索引。

## 4. Project Snapshot

- [x] 4.1 [P0][depends: 2.x][input: current OpenSpec state][output: `openspec/project.md` 更新][verify: active change / specs / update history 与当前仓库事实一致] 更新项目快照。
- [x] 4.2 [P1][depends: 4.1][input: latest code alignment][output: alignment table 覆盖本区间关键功能][verify: 每个主功能域有 evidence path] 更新代码对齐摘要。

## 5. Validation

- [x] 5.1 [P0][depends: 1-4][input: OpenSpec artifacts][output: strict validation result][verify: `openspec validate sync-post-3adf51a-doc-backfill --strict`] 验证本 change。
- [x] 5.2 [P0][depends: 5.1][input: full OpenSpec workspace][output: all strict validation result][verify: `openspec validate --all --strict`] 验证全量规范。
- [x] 5.3 [P0][depends: 5.2][input: docs-only diff][output: whitespace validation][verify: `git diff --check`] 检查文档 diff。
