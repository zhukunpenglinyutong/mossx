## Why

Issue [#363](https://github.com/zhukunpenglinyutong/desktop-cc-gui/issues/363) 暴露了当前产品在 `Claude Code` 会话上的 compaction 语义断层：用户会自然预期“会话支持自动压缩”且手动输入 `/compact` 能稳定生效，但实际实现只有“Prompt overflow 后的一次性自动恢复”，缺少明确的产品级命令适配与用户反馈。

这个问题现在需要修，是因为 `Codex` 已经具备独立且自洽的自动/手动压缩路径，而 `Claude Code` 仍停留在引擎内部能力层；如果继续放任这种不对齐，用户会把 engine 差异持续感知为“产品 bug”。

## What Changes

### 目标与边界

- 将 `/compact` 收敛为 `Claude Code` 线程中的正式产品行为，而不是“普通文本碰碰运气”。
- 当激活线程属于 `claude:*` 或 `claude-pending-*` 时，前端/运行时必须为 `/compact` 提供确定性的路由、成功反馈和失败反馈。
- 保持现有 Claude `Prompt is too long -> /compact -> retry once` 自动恢复逻辑，但补齐用户可理解的语义说明。
- 在用户可见文案中明确区分：
  - `Codex`：按 token 阈值自动 compaction；
  - `Claude Code`：当前仅支持 prompt overflow 自动恢复，以及显式 `/compact` 手动触发。

### 非目标

- 不改造 `Codex` 自动压缩阈值、冷却窗口、手动压缩按钮或 RPC 路径。
- 不把 `Codex` 的 dual-context compaction UI 扩展到 `Claude Code`。
- 不为所有引擎统一实现 `/compact`；本变更只处理 Claude 路径。
- 不引入新的重型 compaction 面板，仅允许最小提示或错误反馈。

### 技术方案对比

| 方案 | 描述 | 优点 | 风险 / 缺点 | 结论 |
|---|---|---|---|---|
| A | 继续把 `/compact` 当普通文本发给 Claude | 改动最小 | 成败不可预测，前端无确定性反馈，用户继续感知为“没效果” | 不采用 |
| B | 仅补文案，告诉用户 Claude 只有 overflow 自动恢复 | 低成本 | 没解决手动 `/compact` 的产品契约，issue 本体仍在 | 不采用 |
| C | 为 Claude 增加产品级 `/compact` 路由与反馈，复用既有 compaction lifecycle | 边界清晰，直接响应 issue，且不碰 Codex | 需要增加 slash command 解析和 Claude-only routing 测试 | **采用** |

### 验收标准

1. **Claude 手动 compact 可达**
   - **GIVEN** 当前激活线程属于 `Claude Code`
   - **WHEN** 用户输入 `/compact`
   - **THEN** 系统 MUST 走 Claude 专用 compact 路由
   - **AND** MUST NOT 把该输入当作普通无保障文本 silently passthrough

2. **Claude 手动 compact 有确定性反馈**
   - **GIVEN** `/compact` 已发起
   - **WHEN** compaction 成功或失败
   - **THEN** 用户 MUST 能看到成功或失败的明确反馈
   - **AND** 线程状态 MUST 不停留在模糊或悬空状态
   - **AND** 成功路径 MUST 复用现有 `thread/compacting` / `thread/compacted` 与 `Context compacted.` 语义，而不是再造第二套提示

3. **自动语义不再误导**
   - **GIVEN** 用户查看 Claude 侧 compaction 相关提示
   - **WHEN** 文案描述自动能力
   - **THEN** 系统 MUST 明确表达 Claude 当前不是 Codex 式阈值自动 compaction
   - **AND** MUST 只承诺 overflow 自动恢复与显式手动 `/compact`

4. **Codex 保持不变**
   - **GIVEN** 当前激活线程属于 `Codex`
   - **WHEN** 用户使用现有 compaction 入口
   - **THEN** Codex 现有自动/手动 compaction 行为 MUST 保持不变

5. **非 Claude 行为保持兼容**
   - **GIVEN** 当前激活线程不属于 `Claude Code`
   - **WHEN** 用户输入 `/compact`
   - **THEN** 本次 Claude 适配 MUST NOT 劫持该输入
   - **AND** 非 Claude 行为 MUST 保持当前兼容语义

## Capabilities

### New Capabilities
- `claude-manual-compact-command`: 定义 Claude 线程中 `/compact` 的正式产品级命令路由、结果反馈与边界守卫。

### Modified Capabilities
- `claude-context-compaction-recovery`: 收紧 Claude compaction 的用户语义，明确“overflow 自动恢复”与“显式手动 compact”边界。

## Impact

- 受影响前端：
  - `src/features/threads/hooks/useQueuedSend.ts`
  - `src/features/threads/hooks/useQueuedSend.test.tsx`
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/features/threads/hooks/useThreadMessaging.test.tsx`
  - `src/features/composer/components/Composer.tsx`
  - `src/features/app/hooks/useAppServerEvents.test.tsx`
  - `src/i18n/locales/*.ts`
- 受影响后端 / runtime：
  - Claude 发送链路与会话命令适配层（现有 `src-tauri/src/engine/claude/*`）
- 受影响规范：
  - 新增 `openspec/changes/claude-code-compact-command-adaptation/specs/claude-manual-compact-command/spec.md`
  - 修改 `claude-context-compaction-recovery`
- 风险面：
  - slash command 解析
  - Claude thread routing
  - 用户可见文案与错误反馈
