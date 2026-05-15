## MODIFIED Requirements

### Requirement: Runtime Session Lifecycle MUST Be Explicit For Each Workspace Engine Pair

系统 MUST 为每个 `workspace + engine` 维护明确的 runtime session lifecycle 状态，并将 create / replace / stop / terminate / recover / quarantine 统一解释为状态转移。该 lifecycle contract MUST be scenario-tested for user-visible runtime-required actions before implementation batches are marked complete.

#### Scenario: acquire transitions from idle to active through acquiring

- **WHEN** 用户在某个 `workspace + engine` 上启动需要 runtime 的会话
- **THEN** lifecycle MUST 从 `idle` 进入 `acquiring`
- **AND** runtime health probe 或等价 ready signal 成功后 MUST 进入 `active`

#### Scenario: stopping runtime is not reusable as foreground target

- **WHEN** 某个 runtime 已进入 `stopping`、`ended` 或 manual shutdown 等价状态
- **THEN** create-session / send / resume 路径 MUST NOT 将该 runtime 作为新的 foreground execution target
- **AND** 系统 MUST 启动或等待一轮 fresh guarded acquisition

#### Scenario: quarantine blocks automatic recovery but allows explicit retry

- **WHEN** automatic recovery 已因重复失败进入 `quarantined`
- **THEN** 系统 MUST 暂停同一 `workspace + engine` 的进一步 automatic recovery
- **AND** 用户显式 retry / reconnect MUST 可以开启一轮 fresh bounded recovery cycle

#### Scenario: lifecycle scenario matrix protects implementation changes

- **WHEN** a change touches runtime acquire, recovery, replacement, quarantine, runtime-ended settlement, interrupt, manual release, or lease cleanup behavior
- **THEN** the change MUST include focused scenario tests for the touched lifecycle states
- **AND** the tests MUST settle expected UI/runtime state without relying on unbounded timers or noisy logs

### Requirement: Runtime Generation MUST Isolate Late Events From New Sessions

系统 MUST 使用 runtime generation 或等价 identity 区分当前 runtime 与已被替换或停止的 predecessor，防止 late event 污染新 session。

#### Scenario: old runtime ended event does not end replacement session

- **WHEN** runtime replacement 已经产生新的 active generation
- **AND** 旧 generation 之后才发出 completion、stdout EOF、runtime ended 或 diagnostics event
- **THEN** 该 late event MUST NOT 结束或污染新 generation 的 active turn
- **AND** 系统 MAY 将其记录为 predecessor lifecycle evidence

#### Scenario: replacement preserves current active work signal

- **WHEN** replacement 期间新 runtime 已接管 foreground work
- **THEN** predecessor 的 cleanup event MUST NOT 清空新 runtime 的 active work state
- **AND** frontend MUST NOT 因 predecessor cleanup 进入错误的 pseudo-processing 或 disconnected 状态

#### Scenario: late predecessor event coverage is mandatory for replacement changes

- **WHEN** an implementation batch changes runtime replacement, process termination, daemon reconnect, or generation recording
- **THEN** tests MUST prove late predecessor events cannot mark the successor generation as failed
- **AND** diagnostics MUST remain correlatable to the predecessor generation or equivalent process identity
