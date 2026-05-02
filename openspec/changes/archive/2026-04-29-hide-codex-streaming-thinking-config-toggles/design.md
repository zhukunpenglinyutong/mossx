## Context

当前 composer config menu 已经呈现出明显的 provider-scoped 分层：`Codex` 下有 `Plan Mode`、`Speed`、`Review`、`实时用量` 等专属能力入口；与此同时，“流式传输 / 思考”仍作为通用开关暴露在同一菜单里。这个展示层与实际产品语义已经脱节，因为 `Codex` 路径下这两个能力应被视为默认开启的基础能力，而不是用户需要维护的可变开关。

现状还有两个实现层面的不一致：

- `streamingEnabled` 的 fallback 会读取本地 `localStorage` 历史值；
- `alwaysThinkingEnabled` 的 fallback 会走 `Claude` provider 的设置读取链路。

这意味着即使只做 UI 隐藏，`Codex` 仍可能继续携带历史暗状态，形成“界面看不到、行为却不稳定”的回归风险。约束条件是本次只改 frontend provider-scoped 行为，不新增 Tauri command，不改 backend/runtime contract。

## Goals / Non-Goals

**Goals:**

- 在 `Codex` provider 下隐藏 composer config menu 里的“流式传输 / 思考”入口。
- 在 `Codex` provider 下把输入框链路消费到的 `streamingEnabled / alwaysThinkingEnabled` 收口为恒定开启。
- 切断 `Codex` 对本地 streaming 持久化值和 `Claude` thinking 读取路径的意外继承。
- 保持 `Claude / Gemini / OpenCode` 现有行为不变。

**Non-Goals:**

- 不移除全局 settings 中已有的 streaming 配置。
- 不调整 `Codex` 的 `ReasoningSelect`、`Speed`、`Review`、`Plan Mode`、`实时用量` 信息架构。
- 不引入新的 provider 配置模型、后端协议或统一 toggle registry。

## Decisions

### 1. 在 `ConfigSelect` 做 provider-scoped 条件渲染，而不是只做样式隐藏

**Decision**

- 仅当当前 provider 非 `codex` 时，渲染 streaming/thinking 两个菜单项及相邻 divider。
- `codex` 下直接不挂载这两行，而不是 `display: none`。

**Why**

- 条件渲染让测试与 DOM 语义更直接，避免隐藏元素仍可被事件或辅助技术命中。
- 这次变更目标是“该能力不再属于 `Codex` 菜单的用户可控项”，不是纯视觉弱化。

**Alternatives considered**

- 方案 A：保留 DOM，仅用 CSS 隐藏。缺点是暗状态仍存在，而且测试只能验证样式，不验证真实信息架构。
- 方案 B：迁移到单独的 `Codex` 二级面板。缺点是超出本次最小范围。

### 2. 在 `ChatInputBoxAdapter` 做 `Codex` effective value 收口，而不是改底层 `ChatInputBox`

**Decision**

- 在 `ChatInputBoxAdapter` 新增 `isCodexEngine` 分支。
- `Codex` 下：
  - `resolvedStreamingEnabled = true`
  - `resolvedAlwaysThinkingEnabled = true`
- `Codex` 下同时短路：
  - `Claude` thinking fallback `useEffect`
  - `handleThinkingToggle`
  - `handleStreamingToggle`

**Why**

- `ChatInputBoxAdapter` 是 provider、local fallback、callback 透传真正汇合的边界层；在这里收口能同时覆盖 prop 覆写、本地状态和 fallback effect。
- 如果只在 `ChatInputBox` 内部写死，外层 props 仍可能继续漂移，测试也更难解释。

**Alternatives considered**

- 方案 A：在 `Composer` 上层直接传常量 `true`。缺点是无法阻断 adapter 内已有 fallback effect。
- 方案 B：在 `ChatInputBox` 展示层忽略传入值。缺点是行为与 props 语义分离，容易留下隐藏 bug。

### 3. 非 `Codex` provider 保持旧 toggle contract，不顺手抽象成通用 provider policy

**Decision**

- 保留 `Claude / Gemini / OpenCode` 当前 toggle 行为、callback 透传和 fallback 逻辑。
- 不借这次机会重构成新的 provider capability matrix。

**Why**

- 这次要解决的是 `Codex` 的错误暴露和状态污染，不是全局 provider 统一化。
- 顺手抽象会扩大回归面，而且没有当前需求支撑。

**Alternatives considered**

- 统一 provider capability policy。收益有限，风险显著增加，当前不做。

### 4. 用 focused component tests 锁定“隐藏 + 强制开启 + 非 Codex 不回归”三条边界

**Decision**

- `ConfigSelect.test.tsx` 断言 `Codex` 下两个入口不显示，`Claude` 下仍显示。
- `ChatInputBoxAdapter.test.tsx` 断言 `Codex` 下即使传入 `false`，effective 值仍为 `true`，且不会触发 `Claude` 设置读取。

**Why**

- 这次变更的根因是 provider-scoped 行为分叉和暗状态漂移，最适合用组件级回归测试表达。

## Risks / Trade-offs

- [Risk] `Codex` 下隐藏入口后，用户可能误以为全局 Settings 里的 streaming 配置也会失效于所有 provider。  
  → Mitigation：本次仅改变 `Codex` composer path；非 `Codex` 行为保持原样，后续如有需要再补产品文案澄清。

- [Risk] `ChatInputBoxAdapter` 中新增 `Codex` 分支会让 provider 特判继续增多。  
  → Mitigation：本次只收口两个明确的基础开关，不扩展到 reasoning effort、speed 等其他语义；后续若 provider policy 继续增长，再单独抽象。

- [Risk] 旧的 `localStorage` `streamingEnabled` 值仍存在，可能让调试时产生困惑。  
  → Mitigation：`Codex` 路径显式忽略该值；不做数据迁移，避免引入额外副作用。

## Migration Plan

1. 更新 `ConfigSelect`，让 `Codex` 下不再渲染 streaming/thinking 两项。
2. 更新 `ChatInputBoxAdapter`，在 `Codex` 路径上提供常量化 effective defaults，并阻断旧 fallback 读取/切换路径。
3. 补充组件测试，锁定 DOM 可见性与 effective props 行为。
4. 执行 targeted `vitest` 和 `typecheck` 验证。

Rollback:

- 若出现回归，可单独回退 `ConfigSelect.tsx` 的 `Codex` 条件渲染；
- 或回退 `ChatInputBoxAdapter.tsx` 中 `isCodexEngine` 的常量收口分支；
- 两者均为 frontend-only 改动，不涉及数据迁移或 backend rollback。

## Open Questions

- 是否需要后续把这条规则显式沉淀到全局 app settings 文案中，解释 `Codex` 路径会忽略 composer 内的 streaming/thinking 用户开关？
- 若未来 `Codex` 再增加更多“默认开启且隐藏”的基础能力，是否需要单独抽一个 provider capability policy 层，而不是继续在 adapter 里加分支？
