## Why

实时对话中 `Explored` 卡片会随着全局 processing 状态保持展开；当后续阶段已经进入非 Explore 操作时，旧探索内容仍占据视觉空间，造成当前阶段焦点被前一阶段内容干扰。

本变更要把展开条件从“整轮对话仍在流式处理”收敛为“当前实时阶段仍是 Explore”，保留实时探索过程中的自动展开，同时在阶段推进后自动折叠已完成探索内容。

## 目标与边界

- 保留实时对话过程中 `Explored` 工具卡片自动展开的现有行为。
- 当对话仍在 processing，但最新可见阶段已经不是 Explore 时，自动折叠此前的 `Explored` 卡片。
- 只影响 `ConversationItem.kind === "explore"` 的卡片展开状态。
- 保持非自动展开状态下的手动展开/折叠入口可用。

## 非目标

- 不改变 Explore 事件聚合、去重、排序规则。
- 不改变普通 tool/reasoning/message 的展示和展开逻辑。
- 不调整样式视觉语言、不新增持久化偏好。
- 不改 Tauri command、runtime payload 或 backend contract。

## What Changes

- `Messages` 的 Explore 展开判断从全局 `isThinking` 改为阶段级判断：只有当前实时 timeline 的最后一个渲染项仍是已完成 Explore 时自动展开。
- 当实时 timeline 推进到 tool、reasoning、assistant message 等非 Explore 阶段时，自动折叠已完成 Explore 详情。
- 增加前端回归测试，覆盖 “processing 仍为 true，但后续操作已变为非 Explore” 的自动折叠场景。

## 技术方案取舍

### Option A: 直接在 `ExploreRow` 内部监听 item/status

优点：局部化强，组件内部即可判断折叠。

缺点：`ExploreRow` 不知道 timeline 后续阶段，无法判断“当前阶段是否仍是 Explore”；若把全量 items 传入会污染子组件职责。

### Option B: 在 `Messages` 中基于 `groupedEntries` 推导 live Explore 阶段（采用）

优点：`Messages` 已经负责 timeline 分组与渲染，天然知道最后一个可见阶段；只需把 auto-expand 判断限定到最新 Explore entry，不影响其他卡片。

缺点：需要注意 `groupToolItems` 合并后 entry 的判断，避免误伤 grouped tool。

### Option C: 在数据层新增 Explore lifecycle 字段

优点：语义显式。

缺点：需要改动 conversation item contract 与上游组装逻辑，超出本次 UI 行为修复边界。

## 验收标准

- 实时对话中，最新阶段仍是 Explore 时，`Explored` 卡片保持自动展开。
- 实时对话继续进入非 Explore 操作后，前一个 `Explored` 卡片自动折叠。
- 对话结束后，已完成 Explore 卡片仍按现有逻辑折叠。
- 其他 tool/reasoning/message 卡片展开逻辑不受影响。
- 目标测试与 TypeScript typecheck 通过。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `conversation-stream-activity-presence`: 实时处理阶段推进时，Explore 卡片的自动展开必须跟随当前阶段，而不是仅跟随全局 processing 状态。

## Impact

- Affected frontend:
  - `src/features/messages/components/Messages.tsx`
  - `src/features/messages/components/Messages.explore.test.tsx`
- APIs / backend / storage:
  - No changes.
- Dependencies:
  - No new dependencies.
