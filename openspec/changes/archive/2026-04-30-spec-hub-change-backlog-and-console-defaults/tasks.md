## 1. Runtime Overlay

- [x] 1.1 [P0][Depends:none][Input: existing `useSpecHub` persisted-state pattern][Output: workspace + spec-root scoped control-center preference restore/writeback][Verify: `pnpm vitest run src/features/spec/hooks/useSpecHub.test.tsx`] 为 execution console 增加首次默认折叠与用户偏好持久化。
- [x] 1.2 [P0][Depends:1.1][Input: current change snapshot + local overlay design][Output: backlog membership overlay with stale-id cleanup and derived filter helpers][Verify: `pnpm vitest run src/features/spec/hooks/useSpecHub.test.tsx`] 增加需求池 membership 持久化、refresh 清理和过滤派生规则。

## 2. Change List UI

- [x] 2.1 [P0][Depends:1.2][Input: current Spec Hub left-panel filter/list rendering][Output: `all / active / backlog / blocked / archived` filter row + backlog badge/copy states][Verify: `pnpm vitest run src/features/spec/components/SpecHub.test.tsx`] 在左侧变更区接入需求池视图与相应视觉提示。
- [x] 2.2 [P0][Depends:2.1][Input: change row interaction model][Output: right-click triage menu plus keyboard-accessible equivalent for move/remove backlog actions][Verify: `pnpm vitest run src/features/spec/components/SpecHub.test.tsx`] 为 change row 增加移入/移出需求池的上下文操作。
- [x] 2.3 [P1][Depends:2.1][Input: current control-center toggle render path][Output: execution console opens collapsed by default on first visit and restores explicit preference afterwards][Verify: `pnpm vitest run src/features/spec/components/SpecHub.test.tsx`] 把默认折叠行为接到 Spec Hub 主视图。

## 3. Copy, Regression, and Quality Gates

- [x] 3.1 [P0][Depends:2.2,2.3][Input: current visible Spec Hub copy inventory][Output: new i18n keys for backlog filter, backlog actions, and explanatory empty states][Verify: `pnpm vitest run src/features/spec/specHubVisibleCopyKeys.test.ts src/features/spec/specHubLanguageSwitch.test.ts`] 补齐需求池与默认折叠相关可见文案。
- [x] 3.2 [P0][Depends:3.1][Input: completed runtime/UI changes][Output: verified frontend regressions for persistence, filter derivation, and context action semantics][Verify: `npm run lint && npm run typecheck && pnpm vitest run src/features/spec/hooks/useSpecHub.test.tsx src/features/spec/components/SpecHub.test.tsx`] 执行本次 change 的最小质量门禁。
