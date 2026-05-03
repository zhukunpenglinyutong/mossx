## Why

`Context Ledger` 已经具备来源解释、变化对比和来源回跳，但当前还存在三个明显的产品断点：

- `last send` comparison 会跨 session/thread 泄漏，导致新会话看到旧会话的对比结果
- collapsed 头部摘要占两行，信息密度低，和 composer 之间的层次不够利落
- 用户只能 `展开 / 收起`，不能把整个 ledger 临时藏到输入框后面，打断了输入优先的节奏

这三个问题不属于新能力扩张，而是阶段三后的 surface refinement 与行为收口。如果不补，`Context Ledger` 会继续给人“功能在，但边界和交互还没收敛”的感觉。

## What Changes

- 收紧 `last send` / `pre-compaction` baseline 的 session boundary，禁止跨 thread / workspace 继承最近对比结果
- 把 `Context Ledger` collapsed header 改成单行 compact summary
- 为 `Context Ledger` 增加独立 `hide drawer` 交互：
  - 用户可在不丢失账本状态的情况下临时把 surface 藏到 composer 后方
  - hidden 后保留可再次拉出的最小入口

## Goals

- 新 session/thread 不再看到旧 session 的 recent comparison
- `本轮上下文来源` 头部在默认态下更紧凑，不再浪费垂直空间
- 用户在需要专注输入时，可以把 ledger 临时藏起，而不是只能完全展开或完全收起

## Non-Goals

- 不在本次变更扩展新的来源类型
- 不在本次变更改写 current groups / comparison model 的核心算法
- 不在本次变更新增持久化偏好；drawer hidden state 仅作为当前 composer surface 的局部 UI 状态

## Acceptance Criteria

- 当用户切换到新的 thread/session 或 workspace 上下文时，`相比最近一次发送` 和 `pre-compaction` comparison MUST NOT 继承旧会话基线
- `Context Ledger` collapsed header MUST 以单行展示标题、摘要和主要操作
- 用户点击 hidden action 后，ledger surface MUST 收拢为一个可恢复的 drawer peek，不得直接丢失该 surface
- hidden 状态下用户 MUST 仍可通过可见入口再次展开 ledger
