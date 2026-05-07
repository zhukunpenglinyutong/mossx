# opencode-mode-ux Specification

## Purpose

Define user-facing OpenCode mode UX baseline for status visibility, provider diagnostics, MCP controls, session discovery, and debug-area segregation.
## Requirements
### Requirement: OpenCode Unified Status Panel

The system MUST provide a unified status panel in OpenCode mode showing key runtime context.

#### Scenario: show OpenCode runtime status

- **WHEN** user enters OpenCode conversation mode
- **THEN** UI MUST show current Session, Agent, Model, Provider, MCP, and Token/Context status

#### Scenario: legacy edits area is replaced by checkpoint result surface

- **WHEN** OpenCode mode renders the status panel region that previously exposed `Edits`
- **THEN** system MUST expose the new `Checkpoint/Result` surface instead of legacy `Edits`
- **AND** the panel MUST prioritize verdict, evidence, risks, and next actions over raw file-list repetition

#### Scenario: checkpoint continues to reuse canonical file-change facts

- **WHEN** OpenCode status panel checkpoint shows changed-file evidence
- **THEN** file counts and `+/-` aggregates MUST reuse canonical conversation file facts
- **AND** introducing checkpoint MUST NOT create a parallel file-change summary contract

### Requirement: OpenCode Model Metadata Visibility

The system MUST display model metadata labels in OpenCode model selector.

#### Scenario: render model labels in selector

- **WHEN** user opens OpenCode model dropdown
- **THEN** system MUST show coarse-grained labels such as speed/cost/context for each model

### Requirement: OpenCode Provider Health Check

The system MUST provide provider health checks and explicit connection status in OpenCode mode, and these checks MUST run only from explicit user-triggered refresh actions instead of background sidebar/bootstrap probes. On Windows, any explicit readiness or refresh action that resolves a launcher-like OpenCode candidate MUST fail safely with diagnostics instead of activating an external foreground window. Across all supported desktop platforms, startup detection MUST avoid unnecessary repeated OpenCode CLI processes before the user explicitly enters OpenCode-specific flows.

#### Scenario: startup detection does not fan out multiple OpenCode probes

- **WHEN** the desktop client boots and OpenCode is enabled
- **THEN** the system MUST use lightweight OpenCode availability detection during startup
- **AND** it MUST NOT chain status detect, commands fallback, and model refresh into repeated startup-time CLI launches unless the user explicitly enters an OpenCode flow

#### Scenario: disabled OpenCode closes entry surfaces and runtime probing

- **WHEN** the user disables OpenCode from the CLI validation settings
- **THEN** the system MUST close OpenCode entry surfaces in selector and workspace creation flows
- **AND** it MUST NOT execute OpenCode detect, model refresh, provider health, or status snapshot probing as part of normal app startup and refresh flows

#### Scenario: disabled OpenCode commands return stable diagnostics

- **WHEN** a client path still calls an OpenCode-specific command while OpenCode is disabled
- **THEN** the system MUST return a stable disabled diagnostic
- **AND** it MUST NOT fall through to OpenCode CLI execution as a fallback

### Requirement: OpenCode MCP Granular Control

The system MUST provide MCP global toggle and per-server toggle controls.

#### Scenario: toggle single MCP server

- **WHEN** user toggles a specific MCP server switch
- **THEN** system MUST only change availability for that server
- **AND** system MUST update related permission hint text

### Requirement: OpenCode Session Discovery

The system SHALL provide search and quick filters for OpenCode sessions.

#### Scenario: search sessions in OpenCode mode

- **WHEN** user enters keywords in session list
- **THEN** system SHALL return matching sessions
- **AND** support quick filters such as recent/favorite

### Requirement: OpenCode Advanced Debug Segregation

The system SHALL keep debug capabilities in Advanced area and out of primary chat flow.

#### Scenario: hide debug tools in primary workspace

- **WHEN** user operates in OpenCode primary chat UI
- **THEN** system SHALL not expose debug/console/heap actions as primary controls

### Requirement: MCP Engine Inspection in Settings MUST Be Read-Only

In settings, MCP information across Claude/Codex/Gemini/OpenCode MUST be presented as an engine-scoped read-only inspection surface.

#### Scenario: settings MCP panel shows engine-scoped inventory and rules without mutating runtime

- **WHEN** user opens settings MCP panel and switches inspected engine
- **THEN** panel MUST display engine-specific config paths, runtime visibility, and discovered server/tool inventory
- **AND** panel MUST NOT provide direct per-server enable/disable mutation actions

#### Scenario: refresh action only re-reads runtime/config snapshots

- **WHEN** user clicks refresh in settings MCP panel
- **THEN** system MUST re-read latest config/runtime snapshot for selected engine
- **AND** existing OpenCode session-level MCP enable state MUST remain unchanged unless user mutates it in runtime control surface

### Requirement: OpenCode Status Panel Edits Tab MUST Reuse Canonical Conversation File Facts

在 OpenCode conversation mode 中，底部 `status panel` 的 `Edits` 视图 MUST 复用 canonical conversation file-change contract，而不是维护独立统计口径。

#### Scenario: edits tab shows the full canonical file set

- **WHEN** 当前 conversation turn 的 file-change facts 涉及多个文件
- **THEN** `Edits` 视图 MUST 展示完整 canonical file set
- **AND** MUST NOT 因独立 summary 逻辑而缩减文件数量

#### Scenario: edits tab aggregate matches message card and activity panel

- **WHEN** `status panel` 展示当前 turn 或当前 thread 的文件修改 aggregate `+/-`
- **THEN** 这些 aggregate MUST 与消息幕布 `File changes` 卡片和右侧 activity panel 保持一致
- **AND** per-file `status / additions / deletions` MUST 继续保持一致

#### Scenario: historical reopen keeps edits tab parity

- **WHEN** 用户重新打开存在历史 file-change 事实的 OpenCode conversation
- **THEN** `Edits` 视图 MUST 与消息幕布、activity panel 保持同样的文件数量与 `+/-`
- **AND** MUST NOT 在历史 reopening 后退化为不同统计口径

