# Upgrade large-file governance to domain-aware baseline-aware policy

## Goal
将现有基于全局 `3000` 行阈值的大文件治理，升级为按领域差异化阈值 + 历史债务基线感知的 policy engine，同时保持当前仓库可持续通过 CI。

## Requirements
- 为大文件扫描引入可版本化的 policy 配置，按路径域定义 `warn/fail/priority`。
- 为 hard-gate 引入 machine-readable baseline，允许已有历史债务持平或下降，但禁止继续增长。
- 保留现有 CLI 的基础兼容能力，避免历史命令或文档引用立即失效。
- 同步更新 CI workflow、本地 npm scripts、playbook 和 OpenSpec delta spec。

## Acceptance Criteria
- [ ] `scripts/check-large-files.mjs` 支持 policy-aware + baseline-aware 扫描。
- [ ] 仓库新增可提交的 policy/baseline 文件，并能反映当前 near-threshold/hard-debt 现状。
- [ ] `.github/workflows/large-file-governance.yml` 和 `package.json` 已切到新治理模型。
- [ ] `docs/architecture/large-file-governance-playbook.md` 与 `openspec/specs/large-file-modularization-governance/spec.md` 已同步。
- [ ] `npm run check:large-files`、`npm run check:large-files:near-threshold`、`npm run check:large-files:gate` 可在当前仓库状态下得到符合预期的输出。

## Technical Notes
- OpenSpec change: `upgrade-large-file-governance-policy-v2`
- 本轮不直接拆分业务大文件，只落治理引擎、基线和文档。
- 第一批重点治理目标保留为后续 follow-up：`src/services/tauri.ts`、`src/app-shell.tsx`、`src/features/threads/hooks/useThreadMessaging.ts`
