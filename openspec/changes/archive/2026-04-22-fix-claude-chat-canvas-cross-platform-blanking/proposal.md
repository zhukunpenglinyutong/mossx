## Why

`ccgui_0.4.6` 在 Claude 对话路径上出现了一个跨平台消息幕布回归：至少有 Windows 11 与 macOS M1 Pro 用户反馈，在完成首轮对话后再次发送消息时，聊天区会短暂闪现后变为空白，而 Codex 路径正常。现有代码已经补上了部分修复，但当前 mitigation 仍主要按 `Windows + Claude + processing` 收口，和 issue 中的 macOS 复现事实不一致，因此需要把问题从“平台补丁”提升为“Claude live render stability contract”。

## 代码核对状态（2026-04-22）

- `Messages.tsx` 已把 Claude render-safe mode 的主判据收敛到归一化 `conversationState.meta.isThinking`，仅在缺少 `conversationState` 时才回退 legacy `isThinking`；这与提案里“normalized processing state 优先”的定义一致。
- 桌面保护范围已经扩到 Windows + macOS：`Messages.windows-render-mitigation.test.tsx` 明确断言两类 desktop surface 都会在 Claude live conversation 下加上 `claude-render-safe`，且 non-Claude engine 不会误触发。
- stale props 边界已覆盖：同一测试文件中已经验证“prop `isThinking` 过时，但 normalized conversation state 仍在 processing”时，render-safe class 仍会开启；这正是 proposal 中要求的 normalized-state truth。
- 样式守卫也已落地：`layout-swapped-platform-guard.test.ts` 与 `src/styles/messages.part1.css` 共同确保 render-safe 降级只作用于 desktop messages shell，不把 Codex 或非目标 surface 一起降级。
- `tasks.md` 的实现、回归测试与严格校验项都已闭环，本 change 已完成 sync + archive。

## 目标与边界

- 明确将该问题定义为 `Claude live processing` 下的 chat canvas 渲染稳定性缺陷，而不是单台机器或单一平台异常。
- 收口 message curtain 在高频 delta / ingress 动画 / 渲染优化并存时的降级策略，保证不会进入闪白、空白或需要重新切线程才能恢复的状态。
- 保持 Codex / Gemini / OpenCode 的既有时间线语义与视觉反馈不被误伤。
- 保持现有 history sticky、live sticky、collapsed history、working indicator 的行为契约，只在必要处增加 render-safe degradation。

## 非目标

- 不重写整个消息时间线架构。
- 不改变 Claude / Codex / Gemini 的消息协议或 runtime event schema。
- 不把所有平台都永久降级到最低动画/最低渲染模式。
- 不顺手修改与本问题无关的 sticky header、history restore、runtime reconnect 逻辑。

## 方案对比

### 方案 A：继续追加平台定向补丁

- 做法：沿用当前 `windows-desktop` 风格，只为 macOS 再补一组类似 CSS / class 条件。
- 优点：改动小，回归面窄。
- 缺点：问题本质仍被表述成“平台枚举”，无法解释为什么只有 Claude 路径触发；后续 Linux 或不同 WebView 行为仍会重复踩坑。

### 方案 B：引入 Claude 渲染安全降级契约（选中）

- 做法：把问题收敛为 `Claude live processing render-safe mode`，统一从归一化 processing state 决定何时进入降级模式，并把降级策略定义为桌面 WebView 安全兜底，而不是 Windows-only patch。
- 优点：与 issue 现象一致，能同时覆盖 Windows 与 macOS 反馈；也能为后续平台差异保留单一治理入口。
- 缺点：需要补一层 capability/spec 约束与更完整的回归测试。

## What Changes

- 新增一条会话幕布渲染稳定性能力，约束 Claude live processing 下的 message curtain 必须具备 render-safe degradation，避免在高频实时更新时进入闪白或空白状态。
- 修改 stream activity 相关能力，要求 `waiting/ingress` 相位语义与视觉特效可以被 render-safe mode 降级，但不能因此丢失 processing 可感知性。
- 将修复范围从“Windows 平台补丁”提升为“Claude live render contract”，并要求与归一化 `conversationState` 的 processing 状态保持一致，避免 legacy props 与 normalized state 分叉。
- 为该问题增加跨平台、跨状态源的回归验证，覆盖至少 `Claude vs Codex`、`stale legacy props vs normalized state`、`Windows/macOS desktop class` 三类边界。

## Capabilities

### New Capabilities

- `conversation-render-surface-stability`: 约束聊天幕布在高频 realtime processing 下的 render-safe degradation、非空白回退与跨桌面 WebView 稳定性。

### Modified Capabilities

- `conversation-stream-activity-presence`: 调整 waiting/ingress 的视觉联动要求，允许在 render-safe mode 下关闭激进动画或渲染优化，同时保持 processing 语义与状态可见性。

## 验收标准

- 在 Claude 对话中，首轮问答后再次发送消息时，聊天幕布不得出现“短暂闪现后整块空白”的结果。
- 同一问题场景在 Windows 与 macOS desktop surface 上都必须有明确、可测试的 render-safe degradation 行为，而不是仅依赖单平台样式分支。
- 当 `conversationState.meta.isThinking` 与 legacy `isThinking` 出现短暂不一致时，渲染安全模式必须以归一化状态为准，不得漏触发。
- Codex 路径必须保持正常渲染，不得因为该修复被错误降级为 Claude 专属模式。
- 相关测试必须覆盖：Claude 正例、Codex 对照例、normalized state 覆盖 stale props、平台 class/作用域断言。

## Impact

- Affected frontend: `src/features/messages/components/Messages.tsx`, `MessagesTimeline.tsx`, `MessagesRows.tsx`
- Affected styles: `src/styles/messages.css` 及对应平台/布局守卫测试
- Affected tests: `Messages.windows-render-mitigation.test.tsx` 及新增的 cross-platform render-stability regression tests
- No backend command, storage schema, or Tauri payload contract changes expected
