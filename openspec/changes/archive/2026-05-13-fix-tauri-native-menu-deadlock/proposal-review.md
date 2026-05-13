## Review Role

审查身份：桌面应用稳定性 / Tauri-WebKit 架构 reviewer。

审查目标：确认 `fix-tauri-native-menu-deadlock` 是否足够定位根因、是否能落地、是否存在过度设计或遗漏风险。

## Verdict

结论：提案方向正确，优先迁移 high-risk native popup 到 renderer UI 是比升级依赖或延迟 popup 更可靠的修复路径。当前提案已达到可实施节点，但实现时必须严守 P0/P1 边界，避免为了“一次性清完所有菜单”拖慢 severe bug hotfix。

## Strengths

- 根因判断清晰：stackshot 的 `WebURLSchemeHandler -> tauri::menu -> resources_table mutex` 与 `popup_inner -> Receiver::recv` 形成可解释的等待环。
- 版本对比有效：`v0.4.13..v0.4.16` 依赖未变，但新增嵌套菜单和加重 sidebar menu，支持触发面放大假设。
- 方案取舍务实：没有把希望押在 Tauri/Wry 升级，也没有用 `setTimeout` 这种概率性缓解冒充修复。
- 验收标准可测：静态 guard、targeted tests、manual macOS matrix 都能直接驱动实施。
- P0 路径优先级合理：`CheckpointCommitDialog`、`useSidebarMenus`、`useFileLinkOpener` 与 hang stack 和风险模型匹配。

## Issues Found

### 1. P0 范围仍有变大的风险

提案包含 P1 迁移所有 feature native popup，这是正确方向，但 severe bug 修复的第一交付应只承诺 P0。否则实现可能陷入 FileTree/GitDiff/Layout 这些大文件重构，推迟可发布修复。

优化建议：实施时把 P0 hotfix 作为独立 PR / commit：shared primitive + 三个高风险菜单 + backend lock-scope + guard inventory。P1 迁移另起 follow-up。

### 2. Renderer menu primitive 容易被做重

如果第一版追求完整 ARIA menu、submenu、roving tabindex、动画体系，容易过度设计。当前 bug 修复需要的是稳定替代 native popup，不是设计系统重建。

优化建议：第一版只支持 `item / label / separator`、outside click、Escape、viewport clamp。Nested submenu 暂不做；commit selector 可以 flatten 或用 dialog 内 popover。

### 3. Static guard allowlist 需要避免“永久后门”

allowlist 如果只是一个数组，很容易未来继续塞例外，最后 guard 失效。

优化建议：allowlist entry 必须包含 `reason`、`owner`、`removeBy` 或 `category=app-level-os-integration`；feature path exception 默认不允许长期存在。

### 4. Manual matrix 需要绑定 0.4.16 具体复现场景

当前 matrix 覆盖了高风险路径，但还可以更贴近事故现场：用户提到“以前会恢复，这次不恢复，并强制关闭”。需要验证长时间不恢复风险，而不仅是点几下。

优化建议：manual matrix 增加 3 分钟 stress window：快速打开/关闭菜单、同时滚动 markdown/file preview、切换 thread，再观察主窗口是否仍响应输入和菜单。

### 5. Backend lock-scope 修复不是主因，不能喧宾夺主

`MenuItemRegistry::set_text` 的锁范围修复是合理防御，但 stackshot 指向 JS-created menu popup/resource table。实现和验收时不要把 backend lock fix 当作主要修复证据。

优化建议：release note 和验证报告中明确主修复证据是 P0 renderer menu migration；backend lock-scope 是 defensive hardening。

## Required Adjustments Before Implementation

- 将实施计划明确分成 `P0 hotfix` 与 `P1 cleanup`，P0 不等待 P1。
- Renderer primitive 第一版保持最小能力，不做 submenu abstraction。
- Guard allowlist 必须包含元数据，且 CI 默认阻断新增 feature native popup。
- 手测矩阵补充 3 分钟 stress window 和“无需 force quit”判断标准。
- 实施报告必须列出 `rg` native menu callsite before/after 对比。

## Recommended Implementation Order

1. Backend lock-scope 小修先做或与 frontend 并行，风险低。
2. 创建最小 renderer menu primitive。
3. 迁移 `CheckpointCommitDialog`，因为 nested native menu 是最高风险。
4. 迁移 `useSidebarMenus`，覆盖 dynamic folder items。
5. 迁移 `useFileLinkOpener`，覆盖 asset/custom protocol 邻近路径。
6. 加 static guard 并先让 P0 path 零违规。
7. 跑 targeted tests + macOS stress manual。

## Final Review Decision

批准进入实施，但限定第一阶段只做 P0 hotfix。P1 全量菜单清理可以作为同 change 的后续 tasks，也可以拆 follow-up change；不应阻塞严重 hang 修复发布。
