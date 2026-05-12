# Claude Context Usage Display Specification

## Purpose

Defines how the app resolves Claude history location, extracts Claude runtime context usage, and presents Claude context usage in Composer without confusing pending or estimated data with live telemetry.

## Requirements

### Requirement: Claude History MUST Resolve Projects Directory From The Effective Claude Home

The system MUST read Claude Code session history from the same effective Claude home that the runtime uses, instead of unconditionally reading `~/.claude/projects`.

#### Scenario: configured claude home is used for history

- **GIVEN** the Claude engine configuration provides a custom Claude home
- **WHEN** the system lists or loads Claude sessions for a workspace
- **THEN** it MUST read JSONL files from `<configured-claude-home>/projects`
- **AND** it MUST NOT fall back to `~/.claude/projects` unless the configured home is absent or invalid

#### Scenario: environment claude home is used when config is absent

- **GIVEN** no explicit Claude home is configured
- **AND** `CLAUDE_HOME` is set
- **WHEN** the system lists or loads Claude sessions
- **THEN** it MUST read JSONL files from `$CLAUDE_HOME/projects`

#### Scenario: default home remains backward compatible

- **GIVEN** no explicit Claude home is configured
- **AND** `CLAUDE_HOME` is not set
- **WHEN** the system lists or loads Claude sessions
- **THEN** it MUST retain the current default of `<user-home>/.claude/projects`

### Requirement: Claude Context Usage MUST Prefer Runtime Context Window Telemetry

The system MUST treat Claude CLI `context_window` telemetry as the authoritative source for live context usage when it is present.

#### Scenario: runtime context window updates live usage

- **WHEN** Claude CLI emits an event containing `context_window.current_usage`
- **THEN** the runtime MUST emit a thread token usage update using that current usage as the active context-window usage
- **AND** the update MUST include the corresponding `context_window_size` when available
- **AND** the update MUST preserve the active context-window used token count separately from cumulative message usage totals

#### Scenario: runtime percentages are preserved

- **WHEN** Claude CLI emits `used_percentage` or `remaining_percentage`
- **THEN** the system MUST preserve those values for the frontend context view
- **AND** it MUST NOT recompute a conflicting percentage from a different token source

#### Scenario: cumulative usage does not override current window telemetry

- **WHEN** the same Claude event contains both `context_window.current_usage` and cumulative `message.usage`
- **THEN** the current context-window usage MUST drive the Composer context indicator
- **AND** cumulative usage MAY be retained only as total consumption metadata

#### Scenario: hook lifecycle events are enabled for context window telemetry

- **WHEN** the system launches Claude CLI for a runtime turn
- **THEN** it MUST request hook lifecycle events so Claude `context_window` telemetry can reach the stream parser
- **AND** if the installed Claude CLI rejects the hook lifecycle flag as unsupported
- **THEN** the system MUST retry the turn without that flag for backward compatibility
- **AND** it MUST NOT surface the unsupported-flag attempt as a user-visible turn failure

#### Scenario: nested hook payloads carry context window state

- **WHEN** Claude CLI emits `context_window` inside a hook, payload, or data wrapper
- **THEN** the runtime MUST extract that nested context-window state
- **AND** it MUST preserve `current_usage`, `context_window_size`, `used_percentage`, and `remaining_percentage` when available

#### Scenario: null current usage is not fabricated

- **WHEN** Claude CLI emits a `context_window` object with `current_usage` set to null or absent
- **THEN** the runtime MAY preserve available window size or percentage metadata
- **AND** it MUST NOT fabricate context-window used tokens from cumulative message usage
- **AND** cumulative message usage MAY still be shown as total consumption metadata

#### Scenario: context command probe supplements missing stream telemetry

- **GIVEN** a Claude turn completes with a known Claude session id
- **WHEN** the runtime needs a post-turn context snapshot or stream telemetry did not provide full context details
- **THEN** it MUST invoke Claude CLI with `/context` against the same session
- **AND** it MUST pass `--resume <session-id>` so the snapshot reflects the active conversation
- **AND** it MUST pass `--no-session-persistence` so the diagnostic command does not append to conversation history
- **AND** it MUST parse total tokens, context window capacity, and used percentage from the `/context` output

#### Scenario: context command parser preserves detailed category estimates

- **WHEN** Claude `/context` output includes the `Estimated usage by category` table
- **THEN** the runtime MUST parse each category name, token count, and percentage
- **AND** it MUST preserve decimal percentages such as `0.8%`
- **AND** it MUST emit the parsed category list in the token usage update for frontend rendering

#### Scenario: context command parser exposes MCP tools top contributors

- **WHEN** Claude `/context` output includes the `MCP Tools` table
- **THEN** the runtime MUST sort parsed tools by token count descending
- **AND** it MUST emit at most the top 3 tool rows
- **AND** it MUST indicate when additional tool rows were omitted
- **AND** it MUST still emit the first 3 rows when all parsed tools report `0` tokens

### Requirement: Claude Context Display MUST Distinguish Live Pending And Estimated States

The Composer Claude context display MUST distinguish live telemetry from pending or estimated data.

#### Scenario: missing telemetry is not shown as zero percent

- **WHEN** a Claude thread has no context usage telemetry yet
- **THEN** the context indicator MUST show a pending or unavailable state
- **AND** it MUST NOT display `0%` unless a known usage snapshot explicitly reports zero used tokens

#### Scenario: fallback context window is labeled as estimated

- **WHEN** the system uses a static fallback context window such as `200000`
- **THEN** the UI MUST label the context usage as estimated or waiting for refresh
- **AND** it MUST NOT present the fallback as live Claude CLI telemetry

#### Scenario: restored history remains truthful before live refresh

- **WHEN** a Claude history session is restored from JSONL
- **AND** no fresh runtime `context_window` event has arrived
- **THEN** the UI MUST mark the context snapshot as restored or estimated
- **AND** it MUST update to live state after runtime telemetry arrives

### Requirement: Claude Context Detail View MUST Match Codex Information Density Without Codex-Only Controls

The Claude context detail view MUST provide a detail tooltip/card comparable to the Codex context overview while preserving Claude-specific semantics.

#### Scenario: detail view shows required Claude context fields

- **WHEN** the user opens the Claude context detail view
- **THEN** it MUST show total token consumption when available
- **AND** it MUST show background information window usage
- **AND** it MUST distinguish cumulative message usage details from current background-window token usage
- **AND** it MUST show used and remaining percentages when available
- **AND** it MUST show used tokens and window capacity when available
- **AND** it MUST show whether the snapshot is live, pending, restored, or estimated

#### Scenario: detail view shows context command category details

- **WHEN** the runtime has parsed Claude `/context` category usage
- **THEN** the detail view MUST show the estimated category list with token counts and percentages in a scannable two-row layout when viewport width allows
- **AND** it MUST adapt to narrower viewports without horizontal overflow
- **AND** it MUST NOT show MCP tool rows in the compact Claude context tooltip

#### Scenario: codex auto-compaction controls are not shown for claude

- **WHEN** the active engine is Claude
- **THEN** the context detail view MUST NOT show Codex auto-compaction threshold controls
- **AND** it MUST NOT describe Claude prompt-overflow recovery as proactive Codex-style auto-compaction

#### Scenario: compact footer remains usable

- **WHEN** the Claude detail view is available
- **THEN** the Composer footer MUST remain compact in its default state
- **AND** primary actions such as attach, mode selection, reasoning selection, and model selection MUST remain operable
