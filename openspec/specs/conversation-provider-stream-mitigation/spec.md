# conversation-provider-stream-mitigation Specification

## Purpose

Define provider-scoped stream mitigation so stronger pacing protections can be enabled only for affected provider/model/platform paths without changing baseline semantics for unaffected conversations.
## Requirements
### Requirement: Provider-Scoped Stream Mitigation MUST Be Activated By Fingerprint And Evidence

系统 MUST 仅在命中的 provider/model/platform 指纹且存在对应 latency 证据时，启用更激进的流式渲染缓解策略。

#### Scenario: matched provider fingerprint activates stronger mitigation
- **WHEN** 某个流式会话命中预定义的 provider/model/platform 指纹，例如 `Claude-compatible Qwen provider + Windows`
- **AND** 同一次 turn 的 latency evidence 达到激活阈值
- **THEN** 系统 MUST 为该路径启用更激进的 stream mitigation profile
- **AND** 未命中的 provider 或没有证据的 turn MUST 继续使用当前基线路径

#### Scenario: unmatched providers retain baseline behavior
- **WHEN** 当前会话不命中该 provider/model/platform 指纹，或没有达到 latency evidence 阈值
- **THEN** 系统 MUST 保持现有 batching / throttle / render-safe 基线行为
- **AND** MUST NOT 因单个 issue 的修复把所有会话一并降级

### Requirement: Stream Mitigation MUST Reduce UI Amplification Without Breaking Conversation Semantics

更激进的 mitigation 可以调整 render/scroll/Markdown 的刷新策略，但 MUST 保持会话语义不变。系统 MUST distinguish baseline engine presentation profiles from provider-scoped mitigation profiles: baseline profiles define normal `Codex`、`Claude Code`、`Gemini` streaming cadence, while mitigation profiles are only evidence-triggered recovery overrides.

#### Scenario: mitigation adjusts pacing without losing ordering or terminal outcome
- **WHEN** mitigation profile 已启用
- **THEN** 系统 MAY 提高 Markdown throttle、收紧 render light path 或调整 realtime flush/scroll 节奏
- **AND** batched ordering、terminal lifecycle 与 conversation visible outcome MUST 与基线路径保持语义一致

#### Scenario: waiting and ingress visibility survive mitigation
- **WHEN** mitigation profile 已启用且会话仍处于 processing
- **THEN** 系统 MUST 保留 waiting/ingress/stop 等基础状态可见性
- **AND** 用户 MUST NOT 因 mitigation 失去对“仍在处理中”的判断能力

#### Scenario: claude long markdown uses baseline profile controlled staged reveal

- **WHEN** `Claude Code` 正在 streaming 长 Markdown、plan text 或 approval-adjacent assistant output
- **THEN** normal render cadence MUST be controlled by an engine-aware baseline presentation profile
- **AND** completion 后 MUST 在本地 realtime render 路径收敛为最终 Markdown structure
- **AND** 系统 MUST NOT 依赖 history replay 才恢复标题、列表、代码块或强调结构

#### Scenario: gemini reasoning stream keeps processing visibility

- **WHEN** `Gemini` 正在 streaming reasoning 或长 assistant output
- **THEN** reasoning / assistant render pacing MAY be throttled by baseline presentation profile
- **AND** waiting、ingress、stop affordance 与 terminal outcome MUST remain visible and ordered
- **AND** throttle MUST NOT collapse non-equivalent reasoning steps into one semantic row

#### Scenario: mitigation remains evidence-triggered

- **WHEN** Claude or Gemini baseline profile is active without latency or render-stall evidence
- **THEN** the system MUST NOT report that turn as an active mitigation case
- **AND** mitigation diagnostics MUST only be emitted when an evidence-triggered recovery profile overrides baseline cadence

### Requirement: Active Mitigation MUST Be Observable And Rollback-Safe

系统 MUST 让 triage 与回退可以明确知道某次 turn 是否命中了 mitigation profile。

#### Scenario: diagnostics record active mitigation profile and activation reason
- **WHEN** 某个 turn 启用了 provider-scoped mitigation 或 an explicit evidence-triggered override to baseline presentation cadence
- **THEN** diagnostics MUST 记录命中的 profile、触发证据摘要与关键 correlation dimensions
- **AND** triage 时 MUST 能区分“问题仍存在于基线路径”还是“问题出现在 mitigation/profile 路径”

#### Scenario: rollback restores baseline path without breaking session continuity
- **WHEN** 某个 mitigation profile 被关闭、回退或临时禁用
- **THEN** 系统 MUST 能回到现有基线路径
- **AND** 该回退 MUST NOT 破坏当前会话连续性或引入新的 lifecycle drift

#### Scenario: claude gemini profile fallback does not affect codex baseline

- **WHEN** Claude / Gemini streaming profile is disabled or rolled back
- **THEN** Codex existing baseline presentation profile、staged markdown and idempotent convergence behavior MUST remain unchanged
- **AND** rollback MUST be scoped to the affected engine/profile

### Requirement: Baseline Presentation Profiles MUST Cover Codex Claude Code And Gemini
The client MUST define baseline presentation profiles for Codex, Claude Code, and Gemini independently from evidence-triggered mitigation profiles.

#### Scenario: baseline profile controls normal streaming cadence
- **WHEN** Codex, Claude Code, or Gemini is streaming without latency or visible-stall evidence
- **THEN** assistant Markdown throttle, reasoning throttle, staged Markdown behavior, and waiting/heartbeat affordances MUST come from the engine baseline presentation profile
- **AND** diagnostics MUST NOT report that turn as an active mitigation case solely because a baseline profile changed render cadence

#### Scenario: mitigation profile requires explicit evidence
- **WHEN** a stronger stream mitigation profile overrides baseline cadence
- **THEN** diagnostics MUST record the profile id, activation reason, evidence category, engine, platform, provider/model dimensions when available, and thread/turn correlation
- **AND** disabling that mitigation profile MUST return the engine to its baseline presentation profile

### Requirement: Gemini Streaming Profile MUST Preserve Reasoning And Assistant Visibility
Gemini baseline and mitigation profiles MUST preserve processing visibility and final semantic convergence while reducing render amplification.

#### Scenario: gemini long assistant output remains progressively visible
- **WHEN** Gemini streams a long assistant output
- **THEN** render pacing MAY throttle Markdown work
- **AND** visible assistant text MUST continue progressing or produce visible-stall diagnostics
- **AND** completed output MUST converge to the final Markdown surface without requiring history replay

#### Scenario: gemini reasoning stream keeps semantic row boundaries
- **WHEN** Gemini streams reasoning deltas or reasoning snapshots
- **THEN** throttle or batching MAY reduce UI amplification
- **AND** non-equivalent reasoning steps MUST NOT be collapsed into one semantic row
- **AND** waiting, ingress, and stop affordances MUST remain visible while the turn is processing

