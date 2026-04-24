## Context

`#392` 对应的现象已经具备足够证据闭环：

- Windows 11 用户在 `ccgui_0.4.6` 下反馈第二轮 Claude 对话后聊天区短暂闪现并变为空白。
- issue 评论中又出现 macOS M1 Pro `100%` 重现，说明它不是 Windows-only。
- 同一评论线程里，Codex 路径正常、Claude 路径异常，说明问题集中在 Claude live conversation render path，而不是通用消息时间线。

当前代码已经做了两类修补：

1. `Messages` 逐步从 legacy props 切到 normalized `conversationState`
2. `claude-render-safe` 样式分支会在 desktop surface + Claude + processing 时关闭部分高风险动画和 `content-visibility`

但这两个修补还没有收敛成统一 contract：

- render mitigation 仍主要按 `windows-desktop` 分支落样式
- 代码层虽然开始使用 normalized `isThinking`，但规范层还没有定义“render-safe mode 必须以 normalized conversation state 为准”
- stream activity 的 waiting / ingress 相位规范没有说明“遇到桌面 WebView 不稳定时，可以降级视觉特效，但不能降级语义”

因此当前状态是 partial fix，而不是 closed fix。

## Goals / Non-Goals

**Goals:**

- 把问题正式定义为 `Claude live render stability`，而不是平台枚举 bug。
- 将 render mitigation 从 Windows-only patch 提升为跨 desktop surface 的 render-safe contract。
- 保证 render-safe mode 由 normalized `conversationState` 驱动，避免 stale legacy props 漏触发。
- 保持 Codex / Gemini / OpenCode 的现有渲染语义与视觉反馈不被误伤。
- 为后续实现提供清晰的测试矩阵，覆盖 Claude/Codex、Windows/macOS、normalized/legacy state mismatch。

**Non-Goals:**

- 不重写消息时间线、history sticky 或 realtime sticky 架构。
- 不修改 runtime event schema、history loader schema、Tauri command contract。
- 不把所有引擎都永久降级到最保守渲染策略。
- 不借机处理与本问题无关的 runtime reconnect 或 history restore 逻辑。

## Decisions

### Decision 1: 将问题治理对象定义为 Claude render-safe mode，而不是继续堆平台补丁

**Decision**

- 引入统一的 `Claude live conversation render-safe mode`
- 由消息幕布依据 `engine + normalized processing state + desktop surface` 决定是否启用
- 不再将核心保护能力写死为 `windows-desktop` 样式修补

**Why**

- issue 评论已经证明 macOS 也会触发，平台特例已经不足以描述问题。
- 只有 Claude 路径异常，说明问题更接近引擎专属 render path，而不是 OS-specific CSS bug。

**Alternatives considered**

- 方案 A：继续补 macOS 对应 CSS 分支  
  缺点：能止血，但无法抽象根因，后续 Linux 或不同 WebView 仍会重复补洞。

### Decision 2: render-safe mode 统一以 normalized conversation state 驱动

**Decision**

- 所有与 render-safe mode 相关的 processing 判定，以 `conversationState.meta.isThinking` 为第一真值
- legacy `isThinking` 仅保留兼容输入语义，不再作为 render-safe 是否启用的主判据

**Why**

- `v0.4.6` 的关键事故之一就是状态源分叉：消息数据已走 normalized path，但部分 waiting/ingress/render mitigation 仍看旧状态源。
- 只要 render safety 和 stream phase 还在吃不同状态，就会继续存在“实际 processing，但保护没开”的窗口。

**Alternatives considered**

- 方案 A：继续保留双判定并做更多兜底 if/else  
  缺点：复杂度越来越高，而且无法从根上消除 dual source of truth。

### Decision 3: 在 render-safe mode 下优先降级高风险视觉与渲染优化，而不是牺牲 processing 可见性

**Decision**

- 允许在 render-safe mode 下关闭或弱化：
  - ingress halo / spark 等激进动画
  - `content-visibility: auto` 这类高风险渲染优化
- 但必须保留：
  - working indicator
  - waiting / ingress / idle 的可辨识状态
  - sticky / collapsed-history 的基本可读性

**Why**

- 对用户来说，“有点保守但稳定”远优于“动画很酷但整块空白”。
- 这也与现有 `prefers-reduced-motion` 契约一致，本质上是同类 recoverable degradation。

**Alternatives considered**

- 方案 A：保持所有特效，只修更细的 DOM 结构  
  缺点：风险更大，回归面更广，而且不一定能覆盖桌面 WebView 的平台差异。

### Decision 4: 将影响面严格限定在 Claude path，Codex 保持对照组

**Decision**

- render-safe mode 默认只作用于 Claude live conversation
- Codex 保持现有路径，作为行为对照组

**Why**

- issue 评论已经给出强对照：Codex 正常、Claude 异常。
- 修复时保留一个未受影响引擎作为基线，有利于判断是否引入误伤。

**Alternatives considered**

- 方案 A：对全部引擎统一开启同等级保守渲染  
  缺点：会扩大 blast radius，而且没有足够证据证明其他引擎需要同样策略。

## Risks / Trade-offs

- [Risk] render-safe mode 判定过宽，导致 Claude 正常场景也被过度降级  
  Mitigation: 仅在 `desktop surface + claude + normalized processing` 场景启用，并保留 targeted regression tests。

- [Risk] 样式层仍残留平台硬编码，导致 contract 与实现再次漂移  
  Mitigation: 在 spec 和测试里明确要求“不得写死为 Windows-only”，并增加 macOS class/assertion coverage。

- [Risk] 只靠 CSS 降级仍不足以覆盖所有空白路径  
  Mitigation: 修复同时检查 `Messages` 内 processing、streamActivityPhase、waitingForFirstChunk、render-safe class 的统一驱动关系。

- [Risk] sticky/history 可读性因降级受影响  
  Mitigation: 把 sticky 与 collapsed-history 作为验收项，不允许为了稳定而破坏主阅读路径。

## Migration Plan

1. 为本 change 增补 `conversation-render-surface-stability` capability，并更新 `conversation-stream-activity-presence`。
2. 在 `Messages` 及相关 render path 中统一 render-safe mode 的判定入口。
3. 将高风险视觉与渲染优化的降级策略收敛到 Claude desktop render-safe contract，而不是 Windows-only patch。
4. 增加 cross-platform regression tests：
   - Claude 第二轮消息不空白
   - Codex 对照不受影响
   - normalized state 覆盖 stale legacy props
   - Windows/macOS desktop scope 断言
5. 运行 `openspec validate --strict`、前端 targeted tests、必要的样式 guard tests。

**Rollback strategy**

- 若 render-safe mode 范围过大，可先收紧启用条件，但保留 normalized-state 驱动。
- 若某个样式降级导致视觉回退过多，可单独回滚特效削弱，而保留 `content-visibility` 安全兜底。
- 本 change 不涉及后端 schema 或数据迁移，回滚仅需前端代码与 spec 回退。

## Open Questions

- desktop surface 的统一判定是否直接复用现有 `windows-desktop / macos-desktop` class 组合，还是增加更抽象的 `desktop-render-risk` class 更稳？
- 除 `content-visibility` 之外，Claude path 是否还有需要一起纳入 render-safe mode 的高风险 CSS / DOM 优化点？
