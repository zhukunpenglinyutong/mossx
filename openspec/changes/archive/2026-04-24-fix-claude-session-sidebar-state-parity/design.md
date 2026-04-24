## Context

`Claude` 会话的左侧栏状态目前是多路事实拼出来的：

- 新建时先产生 pending conversation identity
- reopen 时再去加载 native session history
- delete 时依赖底层 session 文件或索引

如果其中一段链路失败，而 UI 仍把该 entry 当作正常 thread，就会出现三种用户感知：

1. 左侧还看得到旧会话
2. 点开后并没有真的打开该会话
3. 删的时候又说底层根本找不到

这正是“显示和实际不符”。问题核心不是 delete toast，而是 `Claude` sidebar 与 native session truth 之间缺少 authoritative reconcile。

## Goals / Non-Goals

**Goals**

- 让 `Claude` sidebar entry 在 activation/reopen 前先做 canonical existence check 或等价 reconcile。
- 让 history load failure 成为显式 lifecycle 分支，而不是被吞掉后继续标记为 loaded。
- 让 delete not found 变成一个 reconcile signal，最终把 ghost entry 清理到和真实状态一致。

**Non-Goals**

- 不解决 live conversation 空白幕布。
- 不为所有引擎引入统一数据库。
- 不做“猜测式 replacement”。

## Decisions

### Decision 1: sidebar 是 projection，不是 Claude native session 的真值源

左侧栏只是 projection。真正的事实源是当前可验证的 `Claude` native session。任何 activation、reopen、delete 行为都必须先与这个事实源对齐。

### Decision 2: stale entry 必须在 lifecycle consumer 读取前被 reconcile

如果某个 `Claude` entry 已经 stale，不能等到用户进入空白页后再补救。应当在 lifecycle consumer 真正读取该 identity 前，就先做 canonical resolve 或 existence reconcile。

### Decision 3: load failure 不能再被吞成“loaded success”

一旦 history load 失败，UI 不能继续把这个 thread 当成已正常打开。否则后续一切行为都会建立在假状态之上，包括“看起来打开了，实际没有”“删的时候又找不到”。

### Decision 4: delete `SESSION_NOT_FOUND` 是 authoritative reconcile 入口

对 `Claude` 来说，`Session file not found` 不是单纯的用户 toast。它明确告诉系统：sidebar projection 与真实 session truth 已经分叉。此时系统必须刷新或回收 ghost entry，而不是仅提示失败后保持原状。

### Decision 5: 禁止用自动新建会话掩盖 reopen 失败

“旧会话打不开 -> 自动新建一个 Agent conversation” 会把问题从 truth mismatch 变成 identity drift。这个行为必须被禁止，除非用户明确发起“新建会话”动作。

## Risks / Trade-offs

- [Risk] reconcile 过于激进，可能把短暂 IO 抖动误判成永久不存在。  
  Mitigation: 仅在 authoritative not-found 或明确 load failure 后回收 ghost entry，普通瞬时错误保留可重试语义。

- [Risk] `Claude` 若后续也引入 replacement/alias 语义，当前 contract 可能需要扩展。  
  Mitigation: 本次只定义 canonical resolve / existence reconcile，不提前承诺 `Codex` 式 alias 实现。

- [Risk] 删除失败后自动 refresh 可能改变列表排序或当前选中项。  
  Mitigation: 将 refresh/reconcile 限制在目标 entry 及其直接相关列表范围内，并保持 user intent 可解释。

## Validation Plan

1. 增加 hook tests，覆盖 stale `Claude` entry 在 activation 前的 reconcile。
2. 增加 load failure tests，确保失败不会继续标记为 loaded success。
3. 增加 delete tests，验证 `SESSION_NOT_FOUND` 会驱动 authoritative refresh / ghost cleanup。
4. 手工验证 restart -> reopen -> delete 链路，确认左侧栏与实际打开的会话保持一致。

## Open Questions

- `Claude` 是否需要持久化最小 canonical hint，还是 activation 时按 authoritative source 即时 resolve 即可？
- 对“暂时加载失败但底层文件仍在”的场景，UI 应显示 recoverable stale、reload action，还是直接保留原 entry 不变？
- delete reconcile 后若当前选中的是 ghost entry，是否应退回 workspace 默认态，还是切换到最近一个健康会话？

