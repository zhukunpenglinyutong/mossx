## 1. Reader Context and Shared Viewer Foundation

- [x] 1.1 [P0][Depends:none][Input: current `useSpecHub` selection state + detached file explorer session pattern][Output: surface-scoped Spec Hub reader context model and persisted session helpers][Verify: `pnpm vitest run src/features/spec/hooks/useSpecHub.test.tsx`] 为 embedded / detached surface 定义独立的 reader context、restore 与写回规则。
- [x] 1.2 [P0][Depends:1.1][Input: current artifact markdown rendering contract][Output: shared outline parser for headings + `Requirement:` + `Scenario:` blocks][Verify: `pnpm vitest run src/features/spec/components/SpecHub.test.tsx`] 提供可复用的 artifact outline / anchor 派生能力。
- [x] 1.3 [P1][Depends:1.1,1.2][Input: current compressed presentational implementation][Output: extracted reader-focused subcomponents/helpers with stable render contract][Verify: `npm run check:large-files`] 把 reader 相关逻辑从超大 presentational 文件中拆出，避免继续膨胀。

## 2. Embedded Spec Hub Viewer UX

- [x] 2.1 [P0][Depends:1.2][Input: current artifact panel render path][Output: outline/quick-jump UI for proposal/design/specs/tasks/verification][Verify: `pnpm vitest run src/features/spec/components/SpecHub.test.tsx`] 在嵌入式 Spec Hub 中接入结构化阅读导航。
- [x] 2.2 [P0][Depends:1.1,1.2][Input: proposal capabilities + multi-spec source data][Output: proposal-to-spec jump affordance and current spec source restore per surface][Verify: `pnpm vitest run src/features/spec/components/SpecHub.test.tsx`] 打通 capability 到 spec source 的阅读跳转链路。
- [x] 2.3 [P1][Depends:2.1][Input: current Spec Hub header / artifact header controls][Output: `Open in window` entry with i18n copy and accessibility path][Verify: `pnpm vitest run src/features/spec/components/SpecHub.test.tsx`] 在嵌入式 Spec Hub 暴露独立窗口入口。
- [x] 2.4 [P1][Depends:2.1,2.3][Input: reader surface frame + layout preference store][Output: collapsible outline rail defaulting to closed plus collapsible/resizable changes pane][Verify: `pnpm vitest run src/features/spec/components/SpecHub.test.tsx`] 把阅读导航做成默认折叠的左右结构，并让左侧 change 区支持折叠与拖拽调宽。
- [x] 2.5 [P1][Depends:2.3,3.1][Input: existing sidebar/header/file-tree Spec Hub triggers][Output: primary Spec Hub buttons opening detached reader directly instead of toggling embedded center layer][Verify: `pnpm vitest run src/features/files/components/FileExplorerWorkspace.test.tsx src/features/spec/components/SpecHub.test.tsx`] 统一 `Spec Hub` 主入口的行为语义，直接打开独立阅读窗口。
- [x] 2.6 [P2][Depends:2.1,2.4][Input: tasks artifact outline + checklist rendered state][Output: section-level pending marker for unfinished task groups in reader outline][Verify: `pnpm vitest run src/features/spec/components/SpecHub.test.tsx`] 为任务页阅读导航补齐未完成分组的提醒标识。

## 3. Detached Spec Hub Window

- [x] 3.1 [P0][Depends:1.1][Input: detached file explorer WebviewWindow/session conventions][Output: detached Spec Hub launcher with fixed window label, snapshot restore, and retarget flow][Verify: `pnpm vitest run src/features/spec/detachedSpecHub.test.ts src/router.test.tsx`] 新建并复用独立 Spec Hub window identity。
- [x] 3.2 [P0][Depends:3.1,1.3][Input: shared reader surface][Output: detached Spec Hub route/component rendering reader-only workbench without execution console][Verify: `pnpm vitest run src/features/spec/components/DetachedSpecHubWindow.test.tsx`] 在独立窗口中渲染阅读专用 Spec Hub surface。
- [x] 3.3 [P1][Depends:3.2][Input: active workspace + resolved spec root context][Output: recoverable unavailable state for invalid/missing detached session payload][Verify: `pnpm vitest run src/features/spec/components/DetachedSpecHubWindow.test.tsx`] 为 detached window 补齐缺失/损坏 session 的恢复体验。
- [x] 3.4 [P1][Depends:3.2,3.3][Input: detached shell layout + shared reader surface overrides][Output: detached reader shell that fills the independent window and preserves reader header controls][Verify: `pnpm vitest run src/features/spec/components/DetachedSpecHubWindow.test.tsx src/features/spec/components/SpecHub.test.tsx`] 修正独立窗口布局链路，并对齐文件独立窗口的壳层体验。
- [x] 3.5 [P1][Depends:3.4][Input: detached menubar drag handle + collapsed changes pane affordance][Output: mac-safe drag region hardening plus visible expand icon for the collapsed changes pane][Verify: `pnpm vitest run src/features/spec/components/DetachedSpecHubWindow.test.tsx src/features/spec/components/SpecHub.test.tsx`] 修复独立窗口拖拽句柄与变更区展开 icon 的可用性问题。
- [x] 3.6 [P1][Depends:3.5][Input: user feedback on detached reader regressions][Output: manual menubar drag fallback, detached control-center toggle parity, and clearer collapsed change-pane affordance][Verify: `pnpm vitest run src/features/spec/components/DetachedSpecHubWindow.test.tsx src/features/spec/components/SpecHub.test.tsx`] 补齐独立窗体拖动兜底、执行台入口默认折叠可达，以及变更区展开按钮的可发现性。

## 4. Copy, Regression, and Quality Gates

- [x] 4.1 [P0][Depends:2.3,3.2][Input: visible Spec Hub copy inventory][Output: i18n keys for outline, jump actions, detached window entry, unavailable states][Verify: `pnpm vitest run src/features/spec/specHubVisibleCopyKeys.test.ts src/features/spec/specHubLanguageSwitch.test.ts`] 补齐新增阅读与独立窗口文案。
- [x] 4.2 [P0][Depends:4.1][Input: completed embedded + detached reader work][Output: regression coverage for outline navigation, surface isolation, window reuse, and session restore][Verify: `npm run typecheck && npm run check:large-files && pnpm vitest run src/features/spec/** src/router.test.tsx`] 执行本次 change 的最小质量门禁。
