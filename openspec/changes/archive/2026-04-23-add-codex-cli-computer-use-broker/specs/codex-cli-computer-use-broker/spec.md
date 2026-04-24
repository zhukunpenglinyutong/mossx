## ADDED Requirements

### Requirement: Broker MUST Execute Computer Use Through Official Codex Runtime

mossx MUST use the official Codex runtime as the parent that can invoke Computer Use tools.

#### Scenario: explicit broker task uses codex hidden thread
- **WHEN** 用户在 Computer Use surface 显式提交 broker 任务
- **THEN** mossx MUST create or reuse an official Codex app-server session for the selected workspace
- **AND** MUST execute the task through a hidden Codex thread
- **AND** MUST NOT direct exec `SkyComputerUseClient`

#### Scenario: broker result is returned as structured outcome
- **WHEN** Codex hidden thread completes
- **THEN** broker MUST return `completed` with bounded text result
- **AND** MUST include updated bridge status and duration

### Requirement: Broker MUST Enforce Hard Bridge Readiness Before Starting Codex

Broker MUST not start desktop automation while Computer Use bridge still has hard known blockers. Permission and approval blockers MAY be tested by explicit broker run because the official Codex runtime owns the real prompt.

#### Scenario: hard blockers prevent broker execution
- **WHEN** bridge status contains `helper_bridge_unverified`, `plugin_disabled`, `helper_missing` or another hard blocked reason
- **THEN** broker MUST return `blocked`
- **AND** MUST NOT start a Codex thread

#### Scenario: manual permission blockers allow explicit broker attempt
- **WHEN** bridge status only contains `permission_required` and/or `approval_required`
- **THEN** broker MAY start a Codex hidden thread after explicit user action
- **AND** UI MUST explain that macOS permissions or app approval may still stop the task

#### Scenario: unsupported platform prevents broker execution
- **WHEN** current platform is not `macOS`
- **THEN** broker MUST return `blocked` or `failed` with `unsupported_platform`
- **AND** MUST NOT attempt Codex Computer Use execution

#### Scenario: missing workspace prevents broker execution
- **WHEN** request workspace id is missing or unknown
- **THEN** broker MUST return `failed` with `workspace_missing`
- **AND** MUST NOT start a Codex thread

### Requirement: Broker MUST Be Explicit, Single-Flight And Kill-Switchable

Broker execution MUST only happen after a direct user action and MUST prevent concurrent Computer Use runs.

#### Scenario: refresh does not trigger broker
- **WHEN** user refreshes Computer Use status
- **THEN** broker MUST NOT run
- **AND** no Codex hidden thread is created

#### Scenario: duplicate run is rejected
- **WHEN** a broker task is already running
- **THEN** a second broker request MUST return `already_running` or be ignored by frontend single-flight
- **AND** MUST NOT start parallel desktop automation

#### Scenario: kill switch disables broker
- **WHEN** broker feature flag is disabled
- **THEN** UI MUST hide or disable the broker action
- **AND** backend MUST return a structured disabled/blocked result if called directly

### Requirement: Broker Prompt MUST Preserve User Intent And Safety Boundary

Broker prompt construction MUST be deterministic and must not broaden user intent.

#### Scenario: instruction is passed as task content
- **WHEN** broker receives user instruction
- **THEN** prompt MUST include the instruction as user task content
- **AND** MUST instruct Codex to summarize actions and result

#### Scenario: empty instruction is rejected
- **WHEN** instruction is empty after trimming
- **THEN** broker MUST return `failed` with `invalid_instruction`
- **AND** MUST NOT start a Codex thread

#### Scenario: file mutation is not implied
- **WHEN** user instruction only asks to operate an app or inspect UI
- **THEN** broker prompt MUST NOT ask Codex to edit repository files
- **AND** any file mutation remains governed by normal Codex approval/sandbox policy
