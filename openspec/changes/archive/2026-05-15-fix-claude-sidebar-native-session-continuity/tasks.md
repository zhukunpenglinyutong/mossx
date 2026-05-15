## 1. Contract And Boundary

- [x] 1.1 [P0][depends:none][I: current Claude sidebar and catalog specs][O: OpenSpec requirements for Claude degraded-list continuity and title stability][V: `openspec validate fix-claude-sidebar-native-session-continuity --strict --no-interactive`] Define the native Claude sidebar continuity contract.
- [x] 1.2 [P0][depends:1.1][I: current sidebar projection code][O: implementation boundary notes preserving parent-child, archived/hidden, scope, and visible-window semantics][V: regression tests explicitly assert these boundaries] Confirm continuity cannot resurrect filtered rows or flatten relationships.

## 2. Projection Merge

- [x] 2.1 [P0][depends:1.1][I: `useThreadActions.helpers.ts` summary merge utilities][O: stable Claude title merge helper or equivalent][V: helper tests show generic fallback cannot overwrite mapped/custom/meaningful names] Implement stable title preservation.
- [x] 2.2 [P0][depends:1.1,1.2][I: last-good thread summaries and partial source markers][O: Claude continuity merge for degraded/partial/empty refreshes][V: hook tests keep last-good Claude rows on timeout/error/partial empty] Implement Claude degraded-list continuity.
- [x] 2.3 [P0][depends:2.2][I: Claude native/catalog parent metadata][O: preserved `parentThreadId`/`parentSessionId` across continuity merge][V: tests assert parent-child metadata survives] Preserve Claude relationship metadata.
- [x] 2.4 [P0][depends:2.2][I: archived/hidden/control-plane filters][O: continuity skip gates for authoritative filtered rows][V: tests assert archived/hidden rows are not resurrected] Keep authoritative filters hard.

## 3. Startup And Catalog Semantics

- [x] 3.1 [P0][depends:2.2][I: `first-page` startup hydration path][O: first-page treated as incomplete evidence for Claude deletion][V: startup/sidebar test keeps existing Claude rows during first-page hydration] Protect startup first-page from clearing Claude truth.
- [x] 3.2 [P1][depends:2.2][I: shared catalog partial/degraded markers][O: catalog omission treated as incomplete when source cannot prove Claude completeness][V: focused catalog/sidebar test covers partial projection omission] Align catalog degraded semantics.

## 4. Validation

- [x] 4.1 [P0][depends:2.1,2.2,2.3,2.4][I: focused frontend tests][O: passing Vitest suites for helper and hook regressions][V: `pnpm vitest run <focused suites>` or repo-equivalent command] Run focused frontend validation.
- [x] 4.2 [P0][depends:4.1][I: OpenSpec artifacts][O: valid OpenSpec change][V: `openspec validate fix-claude-sidebar-native-session-continuity --strict --no-interactive`] Validate OpenSpec.
- [x] 4.3 [P1][depends:4.1][I: TypeScript contract changes if any][O: clean typecheck or documented unrelated failures][V: `npm run typecheck`] Run type validation when touched types require it.
