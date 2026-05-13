# Client Stability + Conversation Implementation Readiness

Updated: 2026-05-11

## Purpose

本文件冻结三个相关 change 的实施边界，避免在实现阶段让 Runtime、Conversation、Composer 三层重复定义同一类状态。

实施顺序必须是：

```text
stabilize-runtime-session-lifecycle
  -> converge-conversation-fact-contract
  -> improve-composer-send-readiness-ux
```

核心原则：

- Runtime owns actor lifecycle truth.
- Conversation owns transcript fact truth.
- Composer owns send-intent projection.

Composer 只能消费 Runtime 与 Conversation 暴露出的事实，不得重新解释 runtime lifecycle 或 transcript truth。

## Layer Dependency

| Layer | Change | Owns | Must Not Own |
|---|---|---|---|
| Runtime | `stabilize-runtime-session-lifecycle` | `workspace + engine` lifecycle、runtime generation、stale recovery outcome、reasonCode、recoverySource、retryable、userAction | message fact classification、Composer disabled copy |
| Conversation | `converge-conversation-fact-contract` | conversation fact classification、visible transcript parity、request_user_input settled truth、control-event vs hidden-control-plane | runtime acquisition/retry policy、Composer primary action |
| Composer | `improve-composer-send-readiness-ux` | target summary、context summary、activity projection、disabled reason display、request pointer | runtime recovery、request lifecycle settlement、raw provider payload classification |

## Ownership Matrix

| Concept | Source Of Truth | Consumers | Notes |
|---|---|---|---|
| `runtimeState` | Runtime lifecycle coordinator | Thread recovery UI, status panel, Composer readiness | Composer may display `recovering` / `ended`, but cannot infer it from raw errors. |
| `runtimeGeneration` | Runtime lifecycle coordinator | Backend event guards, diagnostics | Used to prevent predecessor events from ending replacement sessions. |
| `reasonCode` | Runtime diagnostics | Frontend `stabilityDiagnostics`, Composer disabled reason | Frontend may map to copy, not invent lifecycle categories when structured reason exists. |
| `recoverySource` | Runtime diagnostics | Recovery notice, status panel | Manual and automatic recovery must remain distinguishable. |
| `staleRecoveryOutcome` | Runtime / thread recovery helpers | Conversation control event, Composer activity | `rebound`, `fresh`, and `failed` must not be collapsed into one generic failure. |
| `conversationFact` | Conversation assembler / normalization | Messages, Composer pointer summaries | Render layer consumes facts; it does not classify raw provider payload. |
| `requestUserInputState` | Conversation fact contract | Messages request card, Composer pointer | States: `pending`, `submitted`, `timeout`, `dismissed`, `cancelled`, `stale`. |
| `modeBlocked` | Conversation control-event fact | Messages compact row, Composer disabled reason | It is a control event, not assistant prose and not a generic Composer block. |
| `composerActivity` | Composer send readiness view model | Composer UI only | Derived from runtime state, queue state, and request state. It is not durable truth. |
| `composerDisabledReason` | Composer send readiness view model | Composer UI only | Must reference upstream structured state where available. |

## Cross-Change Boundary Rules

### Runtime Recovering

- Runtime defines `recovering`, `quarantined`, and `ended`.
- Conversation may show compact control events for recovery outcomes.
- Composer may display "runtime 正在恢复" and disable/redirect send actions.
- Composer must not start recovery or retry by itself.

### request_user_input

- Conversation owns the request lifecycle and settled truth.
- Messages owns the primary request card interaction.
- Composer may show a pointer such as "等待你的选择" and jump to the card.
- Composer must not render the full form or decide that a request is submitted/timeout from raw provider text.

### modeBlocked

- Runtime or provider adapters may emit the raw blocking signal.
- Conversation classifies it as a `control-event`.
- Messages renders it as compact diagnostic row.
- Composer may project it into `disabledReason`, but must not turn it into assistant text or override access mode.

### queued / fusing

- Queue/fuse mechanics remain in existing thread messaging / queued send logic.
- Composer owns only the activity projection and user-facing explanation.
- Conversation owns whether optimistic user bubbles converge with authoritative user facts.
- Runtime owns whether the underlying turn is still active/recovering/ended.

### Stale Thread Recovery

- Runtime/thread recovery defines `rebound`, `fresh`, or `failed`.
- Conversation may represent recovery result as a compact control event.
- Composer may display a send readiness action based on the classified outcome.
- Fresh fallback must be user-visible and must not masquerade as verified rebind.

## Implementation Gates

Before implementation starts:

1. Freeze the ownership matrix above in the active task PRD or implementation notes.
2. For each changed file, identify which layer owns the truth being modified.
3. If a change needs to cross layers, add a typed projection instead of duplicating logic.
4. Add focused tests at the owner layer first, then projection/render tests.
5. Do not implement Composer readiness UI until Runtime and Conversation expose the upstream structured state it needs, unless the UI is explicitly behind a legacy-safe fallback.

## Minimum Sequencing

### Phase 1: Runtime Contract Inventory

- Complete `stabilize-runtime-session-lifecycle` tasks 1.1, 1.2, and 1.3.
- Output lifecycle table, diagnostics field table, and helper call matrix.
- No UI feature work should depend on guessed runtime states before this is complete.

### Phase 2: Runtime Coordinator + Diagnostics

- Implement coordinator and generation guard.
- Stabilize Codex create/shutdown race and stale recovery classification.
- Expose structured diagnostics for frontend consumers.

### Phase 3: Conversation Fact Contract

- Complete fact inventory and normalization core.
- Classify `modeBlocked`, `request_user_input`, synthetic approval markers, and queue bookkeeping.
- Add realtime/history parity tests before renderer cleanup.

### Phase 4: Composer Readiness Projection

- Build `ComposerSendReadiness` from upstream structured state.
- Add summary bar and queue/fuse explanations.
- Keep request_user_input as pointer only.

## Validation Strategy

- Validate each OpenSpec change independently with `openspec validate <change> --strict`.
- During implementation, run owner-layer tests first:
  - Runtime: Rust lifecycle / Codex session runtime tests.
  - Conversation: normalization / parity / request_user_input / Messages focused tests.
  - Composer: view model unit tests before UI render tests.
- Full quality gates should run only after focused owner tests pass.
