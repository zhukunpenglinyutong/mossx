# Proposal: Global Session History Archive Center

## Why

当前 `workspace/project` 视图与用户对“历史会话”的认知并不一致。

- 真实排查已经证明：某些项目页显示 `0` 并不一定是 bug。例如 `mouna` 在当前客户端配置中的 workspace path 为 `/Users/chenxiangning/code/mouna`，但现有可见 Codex 历史里，没有任何 `session_meta.payload.cwd` 精确命中该路径或其子目录，因此“严格项目视图 = 0”是符合当前实现语义的数据事实。
- 但从产品语义看，用户仍然需要看到“本机当前客户端可见的历史会话”，尤其是 CLI / VSCode 等来源的历史；这些历史即使不严格属于当前项目，也应该有统一的归档查看、筛选、恢复、删除入口。
- 同时，现有项目视图过于依赖 strict path match，导致一部分“看起来属于某项目”的历史被直接丢在全局之外，用户无法理解为什么它们不出现，也无法治理。

这说明当前缺的不是单点 bug 修复，而是三层模型的明确 contract：`严格项目视图`、`全局历史/归档中心`、`项目宽松归属`。

## 目标与边界

### 目标

- 保留当前严格项目视图，用来表示“这个项目路径下真实发生过的会话”。
- 新增全局历史 / 归档中心，展示当前客户端本机可见的 Codex 历史，不要求先命中某个项目路径。
- 为全局历史增加“项目宽松归属 / 智能归属”能力，把部分 CLI / VSCode / 其它来源历史推断为“与某项目相关”。
- 让 archive / unarchive / delete 在三类视图下都具备一致、可解释、可验证的行为。
- 明确 UI 上 strict match 与 inferred attribution 的差异，避免把“推断归属”伪装成“真实项目命中”。

### 边界

- 本提案只覆盖 Codex 本地历史与其会话治理面，不扩展新的云同步或远程索引能力。
- 本提案不要求重做主聊天页、sidebar 默认展示策略；重点是补齐历史治理与归档查看面。
- 本提案不改变现有 session 文件格式的基本来源事实，只在读取、归属、聚合与治理层补 contract。
- 本提案允许项目视图继续保持 strict-first，不强制把所有“可能相关”历史直接混入项目主列表。

## 非目标

- 不在本轮把所有引擎历史统一成一个完全相同的全局中心，首期聚焦 Codex。
- 不在本轮承诺 100% 正确的自动项目归属；宽松归属允许存在“未归属”或低置信度结果。
- 不在本轮重建会话存储格式或引入数据库。
- 不在本轮把所有历史默认重新注入到主界面最近会话入口。

## What Changes

- 新增 `Global Session History / Archive Center`：
  - 展示当前客户端本机可见的 Codex `active + archived` 历史。
  - 支持按 `source/provider`、archive 状态、关键词、时间范围、项目归属状态筛选。
  - 用户可以在此处查看、archive、unarchive、delete、恢复历史。
  - 该中心必须是“无项目前提”的入口，用户即使未先进入某个 workspace，也能直接看到本机可见历史。
- 保留 `Strict Project Sessions`：
  - 项目页继续按 workspace path 精确命中真实会话。
  - 当 strict 结果为空时，系统必须允许用户理解“这是严格命中为空，不等于本机完全没有历史”。
  - strict project sessions 必须只表示“真实命中当前项目边界的会话”，不得混入推断结果。
- 新增 `Project Attribution / Inferred Ownership`：
  - 对全局历史尝试做宽松归属，依据可以包括 `cwd`、git root、工作区父目录、已知 workspace catalog、worktree/root 映射等。
  - 每条归属结果必须携带 `attributionReason` 与 `confidence` 或等价的可解释元数据。
  - 未能稳定归属的历史仍应保留在全局中心，而不是静默丢弃。
- 明确治理行为 contract：
  - archive / unarchive / delete 必须作用于真实 session identity，而不是依赖当前视图猜测。
  - 同一条会话在项目视图、推断视图、全局中心中的治理结果必须保持一致。
  - 归档后的历史默认不重新出现在主界面标准会话入口，但必须在全局中心与管理视图中可查询、可恢复。
- 明确空态与解释性：
  - 项目 strict 视图为空时，UI 必须能提示用户去看“全局历史/归档中心”或“推断相关历史”。
  - 推断相关历史必须明确标注“推断归属”，不得与 strict project sessions 混排为同一语义。

## 视图与行为模型

### 视图分层

- `Strict Project Sessions`
  - 只展示严格命中当前 workspace/project 边界的历史。
  - 这是“真实归属”视图，不承担兜底展示本机全部历史的职责。
- `Inferred Related Sessions`
  - 展示系统推断为“与当前项目相关”的历史。
  - 这是解释层，不是事实层；必须有显式 `inferred` 标签与归属原因。
- `Global Session History / Archive Center`
  - 展示当前客户端可见的全局 Codex 历史。
  - 这是兜底入口，也是 archive 治理的完整中心。

### 最小筛选与排序 contract

- 全局中心至少支持以下筛选维度：
  - `status`: `active | archived | all`
  - `source`: `cli | vscode | exec | unknown | all`
  - `attribution`: `strict-match | inferred-related | unassigned | all`
  - `keyword`
  - `time-range`
- 排序默认按 `lastUpdatedAt desc`，同时间戳冲突时必须使用稳定 tie-break 规则，避免列表抖动。
- 同一筛选条件下重复读取必须返回确定性排序结果。

### 会话 identity 与治理 contract

- 每条会话必须存在唯一 `canonical session identity`，供 strict 视图、推断视图、全局中心共用。
- dedup 后保留的 canonical entry 必须仍保留原始来源信息，不能因为去重丢失可解释性。
- archive / unarchive / delete 必须针对 canonical identity 执行，不能按“当前列表项猜测的路径”执行。
- 同一条会话在任一视图完成治理后，其它视图必须反映同一最终状态。

## 分阶段落地范围

### Phase 1: Global Visibility Baseline

- 提供全局历史 / 归档中心。
- 打通 active / archived 读取、筛选、分页、治理能力。
- 保证 strict 项目空态可以跳转或引导到全局中心。

### Phase 2: Project Attribution

- 引入宽松归属规则。
- 在项目页增加 `Inferred Related Sessions` 或等价入口。
- 输出归属理由、置信度与未归属状态。

### Phase 3: Consistency Hardening

- 加强 mixed-source deduplication、mutation consistency、partial failure handling。
- 补齐跨视图刷新一致性、归档可见性、删除准确性的回归覆盖。

## 风险与约束

- 归属规则可能产生误判，因此 inferred 结果必须默认与 strict 结果隔离展示。
- 不同 source 可能存在 metadata 缺失；当 `cwd`、git root 或来源字段缺失时，系统必须允许该会话保留在 `unassigned`，而不是强行猜测归属。
- archive / delete 属于高风险治理动作，必须优先确保“不误删、不串改”，宁可少归属，也不能错治理。
- 部分 source 扫描失败时，系统必须继续返回其它可用结果，并暴露 partial-source / degradation 信息。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 继续只做 strict path match，判空即 0 | 实现最简单 | 无法满足“历史应该能在归档里查看”的产品诉求，大量 CLI / VSCode 历史继续不可见 | 不采用 |
| B | 仅新增全局历史中心，不做项目宽松归属 | 可快速让用户看到历史全量 | 项目页仍然“0 就是 0”，无法解释哪些历史与项目相关，项目治理体验割裂 | 部分采用，但不足 |
| C | 新增全局历史中心，并增加 strict project + inferred attribution 双层视图 | 同时解决可见性与项目关联问题，语义最完整 | 需要新增归属规则、元数据与 UI 区分 | **采用** |

取舍：采用 `B + C` 组合路径。先把全局历史/归档中心建起来，再用可解释的宽松归属把部分全局历史重新关联到项目；严格项目命中语义继续保留，不被推断结果污染。

## Capabilities

### New Capabilities

- `global-session-history-archive-center`: 提供客户端可见的全局 Codex 历史查看、筛选、归档、恢复与删除能力。
- `session-history-project-attribution`: 提供针对全局历史的项目宽松归属 / 智能归属能力，并暴露归属理由与置信度。

### Modified Capabilities

- `workspace-session-management`: 从“只治理严格 workspace 历史”扩展为同时能够引导到全局历史/归档中心，并清晰区分 strict project sessions 与 inferred related sessions。
- `codex-cross-source-history-unification`: 从“同一 workspace 下多来源聚合”扩展为“全局历史可见性 + 项目相关归属”的基础读取 contract，确保 CLI / VSCode / 其它来源不会被静默遗漏。

## 验收标准

- 当某项目 strict path match 无任何结果时：
  - 项目视图可以返回空。
  - 系统必须同时提供进入全局历史/归档中心或查看推断相关历史的明确入口。
- 当本机存在来自 CLI、VSCode 或其它来源的 Codex 历史时：
  - 全局历史/归档中心必须能列出这些历史。
  - 用户无需先命中某个项目才能查看它们。
- 当某条历史可被宽松归属到某个项目时：
  - 系统必须返回 `project/workspace attribution` 与对应理由。
  - UI 必须将其标注为推断归属，而不是 strict 命中。
- 当某条历史仅满足宽松归属、不满足 strict path match 时：
  - 该历史不得直接混入 strict project sessions。
  - 用户必须能够区分“真实属于项目”与“推断相关项目”。
- 当某条历史无法稳定归属到任何项目时：
  - 该历史仍必须在全局中心可见。
  - 系统不得因为无法归属而静默隐藏它。
- 当用户对某条会话执行 archive / unarchive / delete 时：
  - 无论操作入口来自 strict 项目视图、推断视图还是全局中心，最终状态都必须一致。
  - 操作失败时必须保留失败项并返回可解释错误。
- 当某条会话缺失 `cwd`、git root 或 source metadata 时：
  - 系统仍必须允许其出现在全局中心。
  - 系统不得因为 metadata 缺失而 crash、误归属或误删。
- 当用户筛选 `archived` 历史时：
  - 全局中心必须能稳定返回已归档历史。
  - 这些历史默认不得重新回填到主界面标准会话入口。
- 当同一条逻辑会话同时被多个来源扫描到时：
  - 系统必须维持稳定去重与确定性排序。
  - 归属与治理操作必须作用于唯一 canonical session identity。
- 当某个 source 扫描失败但其它 source 成功时：
  - 全局中心与项目相关视图必须继续返回可用结果。
  - 系统必须暴露部分降级信息，而不是无提示返回不完整空列表。

## Impact

- Affected behavior specs:
  - `openspec/specs/workspace-session-management/spec.md`
  - `openspec/specs/codex-cross-source-history-unification/spec.md`
  - 新增 `openspec/specs/global-session-history-archive-center/spec.md`
  - 新增 `openspec/specs/session-history-project-attribution/spec.md`
- Likely affected backend:
  - `src-tauri/src/local_usage.rs`
  - `src-tauri/src/session_management.rs`
  - 相关 session identity / archive metadata / attribution scan 逻辑
- Likely affected frontend:
  - Session management settings surface
  - workspace/project history list 与 empty-state explainability
  - global archive center / attribution badges / filters
- Validation focus:
  - strict project empty-state
  - global history visibility
  - inferred attribution explainability
  - archive/unarchive/delete consistency across views
  - mixed-source deduplication and ordering
  - metadata-missing edge cases
  - partial-source degradation behavior

## Validation Record

- Automated checks completed:
  - `npx tsc --noEmit`
  - `npx vitest run src/features/settings/components/settings-view/hooks/useWorkspaceSessionCatalog.test.tsx src/features/settings/components/settings-view/sections/SessionManagementSection.test.tsx src/services/tauri.test.ts`
  - `cargo test --manifest-path src-tauri/Cargo.toml session_management::tests`
  - `cargo test --manifest-path src-tauri/Cargo.toml delete_codex_session_for_workspace_rejects_ambiguous_unknown_candidates`
  - `cargo test --manifest-path src-tauri/Cargo.toml delete_codex_sessions_for_workspace_reuses_single_scan_for_multiple_targets`
  - `cargo test --manifest-path src-tauri/Cargo.toml delete_codex_session_for_workspace_physically_removes_matching_file`
- Validation notes:
  - strict project empty-state now renders explicit explainability copy and global archive CTA instead of silently implying “no history”.
  - inferred related sessions render in a dedicated surface with `related` badge and attribution reason, without polluting strict project results.
  - delete guard now preserves the owner-unresolved / ambiguous-file protection path: single-entry delete surfaces the same protective error as batch delete instead of degrading to `deletedCount = 0`.
- Manual walkthrough checklist for final human QA:
  - Open `Settings -> Session Management` in a project with no strict Codex hits and confirm the strict empty hint plus `View Global` CTA appear.
  - Switch to `Global` mode and confirm historical Codex entries remain visible, including archived-only filtering.
  - Return to `Project` mode on a workspace with sibling/worktree history and confirm `Related Sessions` shows inferred badge plus attribution reason.
  - Archive, unarchive, and delete one inferred/global entry and confirm cross-view state stays aligned while unresolved-owner delete remains blocked with an explicit error.
