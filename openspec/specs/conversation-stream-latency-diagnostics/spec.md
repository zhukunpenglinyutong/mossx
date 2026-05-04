# conversation-stream-latency-diagnostics Specification

## Purpose

Define correlated stream latency diagnostics so the system can distinguish upstream provider delay, chunk cadence anomalies, and client-side render amplification during realtime conversation turns.

## Requirements

### Requirement: Stream Latency Diagnostics MUST Capture Correlated Turn Evidence

系统 MUST 为流式会话记录可关联的 latency 证据，以区分 upstream provider 延迟、chunk cadence 异常与 client render amplification。

#### Scenario: first token and render pacing are recorded with turn correlation
- **WHEN** 某个流式会话 turn 从用户发送进入 processing，且后续收到首个 assistant chunk
- **THEN** 系统 MUST 记录该 turn 的 first token latency、首个可见 render latency 与后续 chunk cadence 摘要
- **AND** 记录中 MUST 包含 `workspaceId`、`threadId`、`engine`、`providerId/providerName/baseUrl`、`model` 与 `platform` 等可关联维度

#### Scenario: prolonged waiting or timeout still emits correlated latency evidence
- **WHEN** 某个流式会话在 waiting 状态下长时间没有收到首个 chunk，或最终进入 `FIRST_PACKET_TIMEOUT` / 等价超时
- **THEN** 系统 MUST 记录一条带相同 correlation dimensions 的 latency diagnostic
- **AND** 该诊断 MUST 能区分“尚未收到首包”和“已收到 chunk 但后续 cadence 异常”

### Requirement: Stream Latency Diagnostics MUST Reuse Existing Diagnostics Surfaces And Stay Bounded

系统 MUST 复用现有 renderer/runtime/thread diagnostics surfaces 暴露 stream latency 证据，并保持事件数量有界。

#### Scenario: renderer diagnostics append bounded latency events
- **WHEN** 前端记录 stream latency 相关事件
- **THEN** 系统 MUST 复用现有 renderer diagnostics 或等价 diagnostics surface 进行追加
- **AND** 事件缓冲 MUST 保持有界，不能因单个长会话无限增长

#### Scenario: runtime and thread diagnostics remain correlatable
- **WHEN** 同一条慢体验链路同时涉及前端等待态和 runtime-side timeout / degraded evidence
- **THEN** diagnostics MUST 保留可对齐的 correlation dimensions
- **AND** triage 时 MUST 能将 renderer 侧证据与 runtime/thread 侧证据关联到同一次 turn

### Requirement: Latency Diagnostics MUST Distinguish Upstream Delay From Client Render Amplification

系统 MUST 避免把所有“出字慢”都记录成同一种原因。

#### Scenario: upstream pending is classified without blaming renderer
- **WHEN** 会话长时间未收到首个 chunk，且 renderer 没有出现持续重渲染热点
- **THEN** 系统 MUST 将该次慢体验归类为 upstream pending、first-token delay 或等价类别
- **AND** 诊断 MUST NOT 错误归因为 client render amplification

#### Scenario: render amplification is classified after chunk ingress exists
- **WHEN** 会话已经收到 chunk，且 chunk cadence 正常，但可见文本更新明显滞后于 chunk 到达
- **THEN** 系统 MUST 将该次慢体验归类为 client render amplification、render pacing lag 或等价类别
- **AND** 诊断 MUST 保留相关节流/scroll/render 路径的证据摘要

#### Scenario: visible-output stall is classified after assistant text delta exists
- **WHEN** `Claude` 或 `Codex` 会话已经收到 assistant text delta
- **AND** 同一 live assistant item 的 visible text 在 bounded window 内不再增长
- **THEN** 系统 MUST 将该次慢体验归类为 `visible-output-stall-after-first-delta` 或等价类别
- **AND** 该分类 MUST NOT 依赖 provider/model 指纹

#### Scenario: repeat-turn full-curtain blanking is classified separately from visible stall
- **WHEN** `Claude` 会话已经成功显示过前序回合内容
- **AND** 后续 turn 进入 processing 或 realtime 更新阶段
- **AND** 当前 conversation curtain 失去全部可读内容，而不是仅仅出现可见文本增长停顿
- **THEN** diagnostics MUST 将该次异常归类为 `repeat-turn blanking` 或等价显式类别
- **AND** diagnostics MUST NOT 将其压缩成 `visible-output-stall-after-first-delta`

#### Scenario: blanking evidence stays correlated with render recovery
- **WHEN** 系统记录 `repeat-turn blanking` diagnostics
- **THEN** 记录 MUST 保留 `workspaceId`、`threadId`、`engine`、`platform`、active mitigation profile 与 turn 相关 evidence
- **AND** triage 时 MUST 能将该诊断与具体的 blanking recovery 行为关联起来

### Requirement: Stream Latency Diagnostics MUST Classify Backend Forwarding Stalls Separately

The system MUST distinguish Claude backend event forwarding stalls from upstream first-token delay and frontend visible render stalls.

#### Scenario: backend stall is classified after engine event ingress
- **WHEN** the Claude engine has produced a stream delta inside the backend
- **AND** the corresponding app event is not emitted within the bounded forwarding window
- **THEN** diagnostics MUST classify the slow path as `backend-forwarder-stall` or an equivalent explicit category
- **AND** the classification MUST NOT be collapsed into upstream provider delay

#### Scenario: burst flush is classified when queued deltas arrive together
- **WHEN** multiple Claude deltas are emitted to the frontend after a long backend forwarding gap
- **THEN** diagnostics MUST record burst evidence such as max forwarding gap, queued delta count, or equivalent summary
- **AND** the classification MUST remain distinct from `visible-output-stall-after-first-delta`

#### Scenario: diagnostics correlate runtime sync and process snapshot timing
- **WHEN** backend forwarding latency overlaps runtime sync, process diagnostics, or ledger persistence work
- **THEN** diagnostics MUST preserve enough timing evidence to correlate the stall with that work
- **AND** the evidence MUST include `workspaceId`, `threadId`, `engine`, `platform`, and turn correlation where available

#### Scenario: backend evidence uses existing bounded diagnostics surfaces
- **WHEN** backend forwarding latency evidence is recorded for a Claude turn
- **THEN** the evidence MUST be written to an existing bounded diagnostics surface such as runtime diagnostics, renderer diagnostics correlation, app-server diagnostic events, structured logs, or an equivalent project-approved diagnostics channel
- **AND** the evidence MUST be correlatable by `workspaceId`, `threadId`, `turnId` where available, `engine`, and `platform`
- **AND** adding this evidence MUST NOT require changing the stable Tauri command payload contract for conversation streaming

#### Scenario: frontend classification only consumes backend evidence when surfaced
- **WHEN** backend forwarding evidence is exposed through an existing frontend-consumable diagnostics surface
- **THEN** frontend stream latency diagnostics MAY classify `backend-forwarder-stall` or burst-flush from that evidence
- **AND** when backend evidence is log-only, frontend diagnostics MUST keep using local ingress/render timing and MUST NOT infer backend-forwarder stalls from visible render delay alone

#### Scenario: frontend visible stall remains a separate category
- **WHEN** app events are emitted promptly but visible assistant text does not grow in the frontend
- **THEN** diagnostics MUST continue to classify the issue as `visible-output-stall-after-first-delta` or equivalent frontend render category
- **AND** backend forwarding stall evidence MUST NOT be reported as the primary category for that turn
