## 1. Specs And Read Model

- [x] 1.1 [P0][Input: approved proposal + existing session management specs][Output: merged spec deltas for global center, project attribution, workspace-session-management, codex-cross-source-history-unification][Verify: `openspec validate global-session-history-archive-center` or equivalent spec lint passes] 补齐本 change 的 spec files，并校对 capability 边界与术语一致性。
- [x] 1.2 [P0][Depends: 1.1][Input: current `src-tauri/src/local_usage.rs` and session catalog payloads][Output: backend read model for global Codex history entries with canonical identity, owner metadata, archive metadata, degradation marker][Verify: Rust unit tests cover active/archived scan, deterministic ordering, metadata-missing fallback] 在后端建立 global Codex history read model。

## 2. Global History Archive Center

- [x] 2.1 [P0][Depends: 1.2][Input: existing session management Tauri commands and frontend service layer][Output: query path for global Codex history with pagination, filters, and batch operation wiring][Verify: frontend service tests assert status/source/keyword filters and cursor paging] 打通全局历史/归档中心的数据读取与筛选 contract。
- [x] 2.2 [P0][Depends: 2.1][Input: current session management UI surface][Output: Global Session History / Archive Center UI with active/archived/all tabs, source filters, empty state, and list rendering][Verify: component test covers empty, loaded, archived-only, and partial-source states] 落前端全局历史中心界面。
- [x] 2.3 [P0][Depends: 2.1][Input: canonical session entries selected from global center][Output: archive/unarchive/delete mutations routed by canonical identity and resolved owner workspace][Verify: integration-style frontend test covers success, partial failure, and owner-unknown delete protection] 打通全局中心的治理动作，并加入 delete 保护态。

## 3. Strict Project Explainability

- [x] 3.1 [P1][Depends: 2.2][Input: current strict project session management view][Output: strict-empty-state guidance pointing to global history/archive center][Verify: component test asserts strict-empty-state renders CTA when global history exists] 为 strict project 空态增加全局历史引导。
- [x] 3.2 [P1][Depends: 1.2][Input: project-scoped session entries and canonical metadata][Output: owner/source visibility in strict project list without mixing inferred results][Verify: component test covers strict list item showing workspace/source metadata separately] 提升 strict 项目视图的来源解释能力。

## 4. Project Attribution

- [x] 4.1 [P1][Depends: 1.2][Input: global Codex history entries + workspace catalog metadata][Output: attribution engine that scores strict-match, inferred-related, and unassigned states with reason/confidence][Verify: Rust tests cover cwd match, git-root match, parent-scope match, and metadata-missing fallback] 实现项目宽松归属规则引擎。
- [x] 4.2 [P1][Depends: 4.1][Input: attribution results][Output: project-facing inferred related sessions surface with badges, filters, and explainability copy][Verify: frontend component test asserts inferred badge, reason display, and no mixing into strict list] 在项目页增加 inferred related sessions 展示层。
- [x] 4.3 [P1][Depends: 4.1,4.2][Input: canonical entries from inferred view][Output: inferred-view archive/unarchive parity and delete guarded by unique owner resolution][Verify: regression test covers inferred archive success and owner-unknown delete blocked with explicit error] 保证 inferred 视图的治理行为与 strict/global 一致。

## 5. Phase 1 Hardening

- [x] 5.1 [P0][Depends: 2.3][Input: mixed-root and mixed-source duplicated entries in global center][Output: deterministic dedupe with stable canonical identity for Phase 1 surfaces][Verify: Rust tests prove one logical session appears once globally and keeps identical identity across refresh] 加固 Phase 1 的 dedupe 与 identity 稳定性。
- [x] 5.2 [P0][Depends: 2.3][Input: scan failures, source failures, metadata-missing entries, owner-unknown mutations][Output: partial-source degradation and protected archive/delete actions for global center][Verify: Rust + frontend tests assert degraded results remain visible, archive/unarchive require unique scope, and delete is blocked when owner cannot be resolved] 加固 Phase 1 的降级与保护规则。

## 6. Phase 2 Hardening

- [x] 6.1 [P1][Depends: 4.3,5.1][Input: inferred-related entries and global canonical identities][Output: inferred surface shares the same canonical identity and state transitions as global/strict surfaces][Verify: regression tests prove inferred/global/strict views stay consistent after archive/unarchive] 加固 inferred 视图的一致性。
- [x] 6.2 [P1][Depends: 4.3,5.2][Input: attribution failures, metadata-missing entries, owner-unknown inferred mutations][Output: inferred-view degradation and protected destructive actions][Verify: Rust + frontend tests assert low-confidence entries fall back to unassigned and guarded delete/archive behavior remains intact] 加固 inferred 视图的降级与边界保护。

## 7. Validation

- [x] 7.1 [P0][Depends: 2.2,5.1,5.2][Input: completed Phase 1 implementation][Output: passing Phase 1 validation and manual proof][Verify: `cargo test --manifest-path src-tauri/Cargo.toml`, `npm run test -- SessionManagementSection useWorkspaceSessionCatalog`, and one manual global-history walkthrough] 完成 Phase 1 回归验证并记录手测结果。
- [x] 7.2 [P1][Depends: 4.2,4.3,6.1,6.2][Input: completed Phase 2 implementation][Output: passing attribution validation and manual proof][Verify: targeted Rust + frontend tests and one project-related-session walkthrough] 完成 Phase 2 回归验证并记录手测结果。
