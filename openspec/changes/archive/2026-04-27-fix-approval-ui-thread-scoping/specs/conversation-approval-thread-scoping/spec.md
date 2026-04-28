## ADDED Requirements

### Requirement: Inline Approval Surface MUST Scope Thread-Bound Requests To The Active Conversation
当 inline approval surface 渲染带有明确 `threadId` 的 approval request 时，系统 MUST 只在匹配的活动会话中显示这些审批卡。

#### Scenario: matching thread renders its own approval requests
- **WHEN** 当前活动会话属于某个 workspace
- **AND** approval queue 中存在携带该活动 `threadId` 的 request
- **THEN** inline approval surface MUST 显示这些 request
- **AND** approve / decline / batch actions MUST 只作用于当前可见 request 集合

#### Scenario: unrelated thread does not render another thread's approval card
- **WHEN** 同一 workspace 中另一条会话拥有带明确 `threadId` 的 approval request
- **AND** 用户当前查看的不是该 `threadId` 对应会话
- **THEN** 当前消息区 MUST NOT 渲染这条 approval card
- **AND** 系统 MUST NOT 让用户误以为该审批属于当前会话

### Requirement: Inline Approval Surface MUST Preserve Compatibility For Requests Without Thread Identity
当 approval request 无法解析出 `threadId` 时，系统 MUST 走兼容回退，而不是直接丢弃该审批卡。

#### Scenario: threadless approval remains visible as workspace fallback
- **WHEN** 当前 workspace 中存在 approval request
- **AND** 该 request 没有可解析的 `threadId`
- **THEN** inline approval surface MUST 允许该 request 继续按 workspace 范围显示
- **AND** 系统 MUST NOT 因缺失 `threadId` 而 silent drop 这条 approval

### Requirement: Inline Approval Surface MUST Provide A Local Dismiss Escape Hatch
approval 卡 MUST 提供一个本地 `close/dismiss` 出口，用于销毁失效或卡死的前端审批卡，而不是把该动作伪装成真实 backend 决策。

#### Scenario: dismiss removes the visible approval card without sending backend decision
- **WHEN** 用户点击 approval 卡上的 `close/dismiss` 按钮
- **THEN** 系统 MUST 从前端待审批队列中移除该 request
- **AND** 系统 MUST NOT 因此发送 backend `accept` 或 `decline` 响应

#### Scenario: dismiss applies to the current visible approval card only
- **WHEN** 当前 inline approval surface 中存在多个待审批项
- **AND** 用户关闭其中当前正在展示的 approval 卡
- **THEN** 系统 MUST 只销毁该可见 request
- **AND** 其余待审批项 MUST 继续保留在队列中
