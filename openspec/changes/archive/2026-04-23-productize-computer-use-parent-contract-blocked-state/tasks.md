## 1. Artifact And Contract Prep

- [x] 1.1 创建 proposal/design/specs/tasks，明确本阶段只做 parent contract blocked-state 产品化，不做 runtime integration。
- [x] 1.2 运行 OpenSpec change validate，确认 delta specs 可解析。

## 2. Frontend Verdict And Action Gating

- [x] 2.1 在 Computer Use status card 中从 host-contract diagnostics 派生 parent contract verdict，展示 Mac evidence readable + official parent required 的用户结论。
- [x] 2.2 在 final parent verdict 出现后隐藏重复 host-contract diagnostics 主按钮，保留 refresh。
- [x] 2.3 为 `handoff_candidate_found` 保持 evidence-only 展示，不渲染 runtime enabled。

## 3. Copy, Tests, And Specs

- [x] 3.1 增加中英文 i18n 文案，避免硬编码用户可见文本。
- [x] 3.2 更新 Computer Use status card tests，覆盖 verdict、CTA gating、candidate evidence-only。
- [x] 3.3 同步 `.trellis/spec/frontend/computer-use-bridge.md`。

## 4. Validation

- [x] 4.1 运行 targeted Vitest：`src/features/computer-use/components/ComputerUseStatusCard.test.tsx`。
- [x] 4.2 运行 `npm run typecheck`、`npm run lint`、`npm run check:large-files:gate`。
- [x] 4.3 运行 `openspec validate productize-computer-use-parent-contract-blocked-state --type change --strict --no-interactive` 与 `git diff --check`。
