# opencode-mode-ux Specification

## Purpose

Define user-facing OpenCode mode UX baseline for status visibility, provider diagnostics, MCP controls, session discovery, and debug-area segregation.
## Requirements
### Requirement: OpenCode Unified Status Panel

The system MUST provide a unified status panel in OpenCode mode showing key runtime context.

#### Scenario: show OpenCode runtime status

- **WHEN** user enters OpenCode conversation mode
- **THEN** UI MUST show current Session, Agent, Model, Provider, MCP, and Token/Context status

### Requirement: OpenCode Model Metadata Visibility

The system MUST display model metadata labels in OpenCode model selector.

#### Scenario: render model labels in selector

- **WHEN** user opens OpenCode model dropdown
- **THEN** system MUST show coarse-grained labels such as speed/cost/context for each model

### Requirement: OpenCode Provider Health Check

The system MUST provide provider health checks and explicit connection status in OpenCode mode, and these checks MUST run only from explicit user-triggered refresh actions instead of background sidebar/bootstrap probes. On Windows, any explicit readiness or refresh action that resolves a launcher-like OpenCode candidate MUST fail safely with diagnostics instead of activating an external foreground window.

#### Scenario: test provider connection

- **WHEN** user triggers provider connection test
- **THEN** system MUST show visual connection result
- **AND** on failure MUST display clear error reason

#### Scenario: opening workspace session menu does not auto-probe OpenCode

- **WHEN** user opens the workspace "new session" menu for a connected workspace
- **THEN** system MUST NOT automatically call OpenCode provider-health detection
- **AND** system MUST NOT enter a transient "checking" state unless the user explicitly triggers refresh

#### Scenario: unrelated engine refresh does not probe OpenCode

- **WHEN** the client refreshes Claude-only model state for a pending Claude thread
- **THEN** system MUST NOT trigger OpenCode engine/provider detection as a side effect
- **AND** OpenCode readiness MUST remain unchanged until the user explicitly refreshes it

#### Scenario: Windows explicit refresh does not bring OpenCode to foreground

- **WHEN** the user explicitly triggers OpenCode refresh or readiness on Windows
- **AND** the resolved OpenCode candidate is launcher-like or unsafe for background CLI probing
- **THEN** the system MUST return a stable diagnostic result for the current OpenCode status surface
- **AND** it MUST NOT bring an external OpenCode window to the foreground

#### Scenario: healthy explicit refresh still works on supported Windows CLI candidate

- **WHEN** the user explicitly triggers OpenCode refresh or readiness on Windows
- **AND** the resolved OpenCode candidate is a background-safe CLI
- **THEN** the system MUST continue the explicit refresh flow successfully
- **AND** it MUST preserve the existing OpenCode manual refresh interaction model

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

