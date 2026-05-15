# composer-queued-followup-fusion Specification

## Purpose

Defines the composer-queued-followup-fusion behavior contract, covering Queued Follow-up Surface SHALL Match Composer Container Semantics.

## Requirements
### Requirement: Queued Follow-up Surface SHALL Match Composer Container Semantics

系统 MUST 将 composer 上方的排队消息区域渲染为与输入容器一致的组合式表面，而不是割裂的独立列表块。

#### Scenario: queued area keeps shared visual language with composer
- **WHEN** 当前线程存在至少一条排队消息
- **THEN** 系统 MUST 渲染排队容器并与下方 composer 保持一致的圆角、边框层级和背景语义
- **AND** 队列容器 MUST 视觉上属于同一输入组合区域

#### Scenario: queue items render as child cards inside shared surface
- **WHEN** 排队区域渲染多条队列项
- **THEN** 每条队列项 MUST 作为外层容器内的子卡片渲染
- **AND** 系统 MUST 避免出现外层圆角与内层 item 风格冲突的视觉断裂

### Requirement: Each Queued Follow-up SHALL Expose Dedicated Item Actions

系统 MUST 为每条排队消息提供独立动作入口，至少包含 `融合` 与 `删除`。

#### Scenario: queued item shows fuse and remove actions
- **WHEN** 队列项出现在当前活动线程的排队区域
- **THEN** 该队列项 MUST 提供 `融合` 按钮
- **AND** 该队列项 MUST 继续提供既有 `删除` 按钮

#### Scenario: unsupported runtime does not fake interactive fuse affordance
- **WHEN** 当前活动线程不满足融合条件
- **THEN** 系统 MUST NOT 展示“可点击且会成功”的假融合交互
- **AND** 融合入口 MUST 以禁用态或不可见方式表达不可用状态

### Requirement: Queued Follow-up Fusion SHALL Prefer Existing In-Run Follow-up Semantics

系统 MUST 在 queue fusion 真正收到 continuation 证据前，将该动作视为“待确认接续”，而不是直接向用户宣称回复已经继续生成。

#### Scenario: same-run fusion remains pending until new continuation evidence arrives

- **GIVEN** 当前线程正在运行
- **AND** 当前引擎支持同轮 follow-up / steer
- **WHEN** 用户点击某条排队消息的 `融合`
- **THEN** 系统 MAY 先进入待确认接续状态
- **AND** 在收到新的 `turn/started`、stream delta、execution item 或等效 continuation 证据前 MUST NOT 直接宣称“内容正在继续生成”

#### Scenario: cutover fusion remains pending until successor run actually starts

- **GIVEN** 当前线程正在运行
- **AND** 当前引擎不支持同轮 follow-up / steer
- **AND** 当前引擎支持安全 cutover
- **WHEN** 用户点击某条排队消息的 `融合`
- **THEN** 系统 MUST 先等待 successor run 的真实启动证据
- **AND** 在 successor run 未被确认前 MUST NOT 把 cutover 视作已经成功继续

### Requirement: Queued Follow-up Fusion SHALL Preserve Queue Order Integrity

系统 MUST 在 fusion continuation 未接上的情况下有界结算当前融合动作，避免留下永久锁死的 fusion 状态。

#### Scenario: stalled continuation releases fusion lock and returns thread to recoverable state

- **WHEN** 用户对某一条队列项执行融合
- **AND** 在受限窗口内未收到新的 continuation 证据或终态事件
- **THEN** 系统 MUST 将该融合动作结算为 recoverable stalled / degraded
- **AND** 系统 MUST 清理该线程的 fusion lock
- **AND** 用户 MUST 能继续操作当前线程与后续排队消息

#### Scenario: terminal settlement clears unresolved fusion continuation

- **WHEN** 融合动作对应的恢复链最终收到了 completed、error、runtime-ended 或等效终态
- **THEN** 系统 MUST 清理该融合动作的待确认状态
- **AND** 剩余队列项 MUST 不再被已结束的 fusion continuation 阻塞

### Requirement: Queued Follow-up Fusion SHALL Preserve Original Message Payload

系统 MUST 在融合发送时保留原排队消息的完整 payload，而不是退化成纯文本 resend。

#### Scenario: fusion preserves text images and send options
- **GIVEN** 某条排队消息包含 `text`、`images` 或逐条 `sendOptions`
- **WHEN** 用户对该消息执行融合
- **THEN** 系统 MUST 使用与原排队项一致的 `text`、`images` 和 `sendOptions` 发送该消息
- **AND** 系统 MUST NOT 静默丢弃附件或逐条发送参数

