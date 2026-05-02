## Why

当前 `Codex` 对话配置菜单仍暴露“流式传输 / 思考”两个通用开关，但在产品语义上这两个能力对 `Codex` 已经应被视为默认能力，而不是需要用户理解和维护的可变配置。更糟的是，当前前端实现里这两个值并不完全收口：`streaming` 会受本地 `localStorage` 旧值影响，`thinking` 还会沾到 `Claude` 路径的配置读取，导致 `Codex` 菜单即使后续只做视觉隐藏，也可能继续携带漂移的暗状态。

这个问题现在需要处理，因为 `Codex` 配置菜单已经形成清晰的 provider-scoped 能力分层：`Plan Mode`、`Speed`、`Review`、`实时用量` 都是 `Codex` 专属能力；“流式传输 / 思考”继续作为可切换项存在，会让用户误以为它们在 `Codex` 路径上仍是可选行为，并增加状态不一致的回归面。

## 目标与边界

- 目标：
  - `Codex` provider 下隐藏配置菜单中的“流式传输 / 思考”两项。
  - `Codex` provider 下把这两个能力在发送链路前端视图中强制收口为开启状态。
  - 保持 `Codex` 现有 `Speed / Review / Plan Mode / 实时用量` 入口不变。
- 边界：
  - 仅修改 frontend composer config menu 与 `ChatInputBoxAdapter` 的 provider-scoped 显示/默认值收口。
  - 不新增 Tauri command，不改 backend runtime contract。
  - 不改变 `Claude / Gemini / OpenCode` 现有菜单结构与行为。

## 非目标

- 不移除全局 Settings 中已有的 streaming 行为配置。
- 不重构 `ConfigSelect` 全部菜单分组或样式体系。
- 不改 `Codex` reasoning effort（如 `low/medium/high`）选择器；该能力仍由现有 `ReasoningSelect` 承担。

## 方案对比

### 方案 A：只隐藏菜单项，保留内部状态读取与切换逻辑

- 优点：改动最小，UI 变化快。
- 风险：
  - `Codex` 仍可能继续吃到旧的 `localStorage` `streamingEnabled` 值。
  - `Codex` 仍可能继续受 `Claude alwaysThinkingEnabled` 读取路径污染。
  - 隐藏后问题从“可见错误”变成“不可见漂移”，回归更难定位。

### 方案 B：隐藏菜单项，同时对 `Codex` provider 收口 effective 值为常量开启

- 优点：
  - UI 与真实行为一致。
  - 切断 `Codex` 对通用本地状态/Claude 状态的意外继承。
  - provider-scoped contract 更清晰，后续测试也更稳定。
- 代价：需要补一层 `Codex` 专属判断，并更新测试断言。

结论：采用方案 B。这个问题的根因不是“入口太吵”，而是“Codex 路径没有对隐藏前后的真实状态做语义收口”。

## What Changes

- 在 `Codex` provider 的配置菜单中移除“流式传输 / 思考”两项及其相关分隔结构。
- 在 `ChatInputBoxAdapter` 中为 `Codex` provider 引入 provider-scoped effective defaults：
  - `streamingEnabled` 对 `Codex` 恒为 `true`
  - `alwaysThinkingEnabled` 对 `Codex` 恒为 `true`
- 阻断 `Codex` provider 继续依赖本地 `streamingEnabled` 持久化值和 `Claude alwaysThinkingEnabled` 读取路径。
- 增加回归测试，确保：
  - `Codex` 菜单不再显示上述两项；
  - 非 `Codex` provider 保持旧行为；
  - `Codex` 传给 `ChatInputBox` 的两个值恒为开启。

## Capabilities

### New Capabilities

- `codex-chat-canvas-hidden-default-controls`: 定义 `Codex` 配置菜单中默认强制开启且对用户隐藏的基础控制项约束。

### Modified Capabilities

- None.

## 验收标准

- 打开 `Codex` 对话配置菜单时，用户 MUST NOT 看到“流式传输”与“思考”开关。
- 打开 `Claude / Gemini / OpenCode` 配置菜单时，现有对应菜单行为 MUST 保持不变。
- `Codex` provider 下，无论本地 `streamingEnabled` 旧值为何，前端传给输入框/发送路径的 `streamingEnabled` MUST 为 `true`。
- `Codex` provider 下，前端传给输入框/发送路径的 `alwaysThinkingEnabled` MUST 为 `true`，且 MUST NOT 依赖 `Claude` provider 配置读取结果。

## Impact

- Affected code:
  - `src/features/composer/components/ChatInputBox/selectors/ConfigSelect.tsx`
  - `src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.tsx`
  - `src/features/composer/components/ChatInputBox/selectors/ConfigSelect.test.tsx`
  - `src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.test.tsx`
- APIs / contracts:
  - 无 backend / Tauri contract 变更。
  - 变更 frontend provider-scoped composer config menu behavior contract。
- Dependencies:
  - 无新增依赖。
