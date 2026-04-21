## Context

当前 `Codex` 生命周期已经能区分 runtime 是否存活，但 thread identity continuity 仍然分散在多个入口里：

- `refreshThread`、`resumeThread` 会直接消费当前 `threadId`
- stale-thread replacement 只在少数恢复路径里记住了“旧 id -> 新 id”
- 这层 alias 映射之前是内存 `ref`，应用重启后会丢失
- workspace restore 只要 thread list Promise 返回，就可能把 workspace 标记成 restored，即使 `activeThreadId` 仍然是 stale
- reconnect card 把“恢复绑定”和“重发 prompt”绑在一起，导致用户明明只需要修绑定，也被迫走 resend 路径

所以问题的本质不是 runtime 还没恢复，而是**runtime continuity、thread binding continuity、resend continuity 被混成了一件事**。

## Goals / Non-Goals

**Goals**

- 让已验证的 stale-thread replacement 在重启后仍然生效。
- 在任何消费 `activeThreadId` 的前台入口前先 canonicalize。
- 明确区分 recover-only 与 recover-and-resend 两种恢复动作。
- 保持“找不到安全 replacement 就失败”的保守语义，不引入误绑。

**Non-Goals**

- 不引入新的后端持久化表。
- 不自动从 thread list 猜测 replacement。
- 不改变非 Codex engine 的 thread lifecycle。

## Decisions

### Decision 1: Persist only verified stale-thread aliases

alias map 只记录已经被恢复链验证过的 `oldThreadId -> canonicalThreadId`。它不是启发式缓存，而是恢复事实缓存。

这样做的好处：

- 重启后还能继续 canonicalize
- 不需要引入新的 backend contract
- 不会因为 thread list 顺序变化而误绑到其他线程

### Decision 2: Canonicalize before every active-thread lifecycle action

`activeThreadId` 进入 lifecycle consumer 前，统一做 canonicalization，包括：

- set active thread
- workspace active-thread restore
- refresh active thread
- active-thread map 自修正

这比只在 `thread not found` 之后补救更稳定，因为消费者看到的从一开始就是 canonical id。

### Decision 3: Separate recover-binding from resend

recover binding 的职责是把 UI 当前 thread binding 指向可用 canonical thread；resend 的职责是重新执行上一条用户输入。这两者不能再被同一按钮语义绑死。

因此 reconnect card 需要区分：

- `onRecoverThreadRuntime`: 只恢复绑定/运行态
- `onRecoverThreadRuntimeAndResend`: 恢复并重发

如果只有前者存在，UI 仍然必须允许用户先把会话救回来。

### Decision 4: Manual reconnect starts a fresh recovery cycle

用户点击 `重新连接 runtime` 或等价 recover action 时，后端不能继续把这条链路按 automatic recovery 处理。否则在 warm runtime 进入 stale health probe 失败后，automatic guard 已经累计的 quarantine 会直接反噬手动恢复动作，表现成“按钮也救不回来”。

因此 `ensure_runtime_ready` / user-triggered `ensure_codex_session` 必须：

- 绕过现有 automatic quarantine gate
- 不再把 stale existing session probe failure 继续记入 automatic backoff budget
- 以 fresh explicit recovery cycle 尝试 acquire / replace runtime

### Decision 5: Normalize alias chains at storage boundary

alias map 读取和写入时都要压平链式映射，例如：

- `stale-A -> stale-B`
- `stale-B -> live-C`

最终应稳定成：

- `stale-A -> live-C`
- `stale-B -> live-C`

这样 restore path 就不会在重启后又走一遍过时的中间 id。

## Risks / Trade-offs

- [Risk] alias map 如果被污染，可能放大会话误绑风险。  
  Mitigation: 仅允许通过已验证的 remember path 写入，并在读取时做 string-only sanitize。

- [Risk] restore 阶段主动修正 `activeThreadId` 可能暴露新的状态同步问题。  
  Mitigation: 只做 canonical replacement，不做“猜测式替换”；找不到映射时保持原失败语义。

- [Risk] recover-only 按钮可能让用户以为消息一定会自动继续。  
  Mitigation: 按钮语义只承诺恢复当前会话绑定，不承诺自动重发上一条 prompt。

## Validation Plan

1. 单测 alias store：损坏值过滤、链式 alias 压平、持久化回写。
2. UI 测试 reconnect card：存在 recover-only callback 时展示恢复动作，resend 不可用。
3. 后端 recovery guard 验证：手动 reconnect / user-triggered ensure 不继承 automatic quarantine。
4. 线程 hook 回归：现有 stale-thread resend / refresh 测试继续通过，确保“不安全时不要误绑”的语义不回退。
