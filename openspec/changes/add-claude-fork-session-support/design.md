## Context

Mossx 已有“fork thread / 从消息分叉”的 UI 概念，但 Claude engine 侧仍偏向由客户端自己维护 `threadId` / `sessionId` 映射，导致 fork 语义要靠前端模拟会话分支。这个路径的问题不在于“能不能用”，而在于它把原本属于 Claude Code CLI 的会话分叉能力，拆成了客户端状态拼装逻辑。

当前需要解决的不是通用 session 管理，而是 Claude provider 下“从历史会话开新分支”这一动作的原生接入。设计目标是把 fork 变成一个显式、可验证、由 engine 负责执行的命令能力，减少客户端伪造上下文和 session 映射的复杂度。

## Goals / Non-Goals

**Goals:**
- 让 Claude engine 原生支持历史 session 分叉能力。
- 让 UI 上的 fork thread 动作直接映射到 Claude CLI 的 fork 语义。
- 明确 fork 与 resume 的边界：resume 回到原 session，fork 生成新 session 分支。
- 保持非 Claude provider 的现有行为不变。

**Non-Goals:**
- 不重构通用 session store。
- 不修改 Claude session 历史文件格式。
- 不把 fork 能力扩展到其他 engine。
- 不引入一套新的前端 session 状态机来“模拟” fork。

## Decisions

### Decision 1: 将 fork session 作为 Claude engine 的原生 command contract

选择在 Claude engine 层直接支持 `--resume <parent-session-id> --fork-session`，而不是由前端或 service 层拼装一个新的 session 映射。

Rationale:
- fork 本质上是 CLI 能力，不是前端推导逻辑。
- 原生 command contract 让参数透传、错误处理和测试都落在同一条链路上。
- 这样可以避免客户端和 engine 对“fork”含义出现两套实现。

Alternatives considered:
- 由客户端在创建 fork 时先恢复旧 session，再生成新 thread/session 映射。拒绝：会继续增加状态分叉和补丁式逻辑。
- 将 fork 语义隐藏进通用 session resume path。拒绝：会模糊 resume 与 fork 的边界，也难以表达“新分支”这一动作。

### Decision 2: fork 与 resume 保持显式分离

fork 是“从历史 session 创建新分支”，resume 是“回到同一 session”。两者不共享隐式 fallback 语义。

Rationale:
- UI 语义清晰，用户能区分继续原会话和开新分支。
- 这能防止后续为了兼容而把 fork 重新折叠回 resume，从而再次引入复杂度。

Alternatives considered:
- 统一成一个“open session” 动作，由 context 自动判断。拒绝：判断条件会越来越多，边界会更脆。

### Decision 3: 传参只保留最小必需信息

前端只传递目标历史 session 标识，以及必要的 provider-scoped fork 意图，不把 thread 生命周期或本地映射状态一并塞进 backend。

Rationale:
- 最小输入可以降低 IPC contract 面积。
- 让 Claude CLI 自己负责生成 fork 后的新 session identity，避免客户端提前假设结果。

Alternatives considered:
- 同时传递 parent thread snapshot、message anchor、history cursor。拒绝：这些信息大部分只是客户端补丁，不应成为 fork contract 的必需输入。

### Decision 4: 失败策略以显式拒绝为主

当 fork 参数缺失、非法或 CLI 不支持时，系统应明确失败并阻断该 fork 请求，而不是静默回退成普通 resume。

Rationale:
- fork 和 resume 语义不同，静默回退会让用户误以为已经开了新分支。
- 显式失败更容易定位 CLI 支持性问题和参数透传问题。

Alternatives considered:
- 自动回退到旧的客户端模拟 fork。拒绝：这会让新能力与旧补丁长期并存，维护成本更高。

## Risks / Trade-offs

- [Risk] Claude CLI 的 `--fork-session` 语义或可用性与当前预期存在偏差。 → Mitigation: 在 command builder 与测试中把参数 allowlist、错误映射和 fallback 行为写死，避免“看起来支持但实际上不一致”。
- [Risk] 前端 fork UI 与 backend contract 对不齐，导致 fork/resume 路径混淆。 → Mitigation: 将 fork 和 resume 的调用入口拆开测试，分别验证 command building。
- [Risk] 旧的客户端 session 映射逻辑可能短期仍然存在，形成双路径。 → Mitigation: 设计上明确 fork 走原生 CLI，旧路径仅保留给 resume 或历史兼容，不再扩展。
- [Risk] 过度抽象成通用 session capability，会再次扩大范围。 → Mitigation: 设计文档只定义 Claude provider 范围内的 fork contract，不扩散到其他 engine。

## Migration Plan

1. 先补齐 Claude fork session 的参数契约与 command builder，按 `--resume <parent-session-id> --fork-session` 生成 CLI 参数。
2. 再让前端 fork thread 动作在 Claude provider 下走原生 fork 入口。
3. 补回归测试，覆盖 fork、resume、非法参数和 provider-scoped 显隐。
4. 若 CLI 支持出现偏差，优先回滚到单点 fallback，而不是恢复整套客户端模拟 fork。

Rollback strategy:
- 如果 fork contract 在实际 CLI 上不可用，保留现有 resume 路径，不释放 fork UI 的新能力入口。
- 如果前端传参或 backend 构建出现问题，优先禁用 fork 分支，而不是影响既有历史打开和 resume。

## Open Questions

- fork 成功后的新 session identity 是否需要在 UI 层立即可见，还是仍由后台 session refresh 拉回？
- fork 失败时是否需要专门的错误文案区分“参数不合法”与“CLI 不支持”？
