## 1. Backend Path Resolution

- [x] 1.1 Extract a shared Claude home resolver used by history loader and related Claude discovery paths.
- [x] 1.2 Update `claude_history` list/load/fork/delete paths to read `<resolved-claude-home>/projects`.
- [x] 1.3 Add tests for explicit config home, `CLAUDE_HOME`, and default home fallback.
- [x] 1.4 Ensure daemon state passes relevant Claude config/home into history commands instead of calling a hardcoded helper.

## 2. Runtime Usage Contract

- [x] 2.1 Extend Claude usage extraction to preserve `context_window_size`, `used_percentage`, `remaining_percentage`, and usage source/freshness.
- [x] 2.2 Ensure `context_window.current_usage` is preferred over cumulative `message.usage`.
- [x] 2.3 Stop presenting `200000` as live data when `model_context_window` is missing; mark it as estimated fallback.
- [x] 2.4 Add Rust tests for Claude `context_window` snake_case and camelCase payloads.
- [x] 2.5 Preserve runtime context-window used tokens separately from cumulative message usage totals.
- [x] 2.6 Request Claude hook lifecycle events via `--include-hook-events` and retry without the flag for legacy CLI versions.
- [x] 2.7 Parse nested hook/payload `context_window` events and treat null `current_usage` as unavailable instead of fabricated usage.

## 3. Frontend State And View Model

- [x] 3.1 Extend thread token usage state with context usage freshness/source metadata.
- [x] 3.2 Build a Claude-specific context usage projection for Composer.
- [x] 3.3 Treat missing telemetry as pending/unknown, not `0%`.
- [x] 3.4 Keep legacy token indicator fallback behind the same data source to avoid divergent calculations.

## 4. Claude Context UI Redesign

- [x] 4.1 Add Claude context detail tooltip/card modeled after Codex density but without Codex-only auto-compaction controls.
- [x] 4.2 Show total consumption, background information window, used/remaining percent, used/window tokens, and freshness status.
- [x] 4.3 Add compact/pending/estimated visual states.
- [x] 4.4 Ensure responsive layout does not overlap attachment/model/mode controls.
- [x] 4.5 Show tooltip breakdowns for cumulative message usage versus background-window token usage.
- [x] 4.6 Show `/context` estimated category details in a scannable responsive two-row layout; keep MCP tool parsing in state but omit MCP tool rows from the compact Claude detail tooltip.

## 5. Claude `/context` Probe

- [x] 5.1 Invoke `claude -p "/context" --resume <session-id> --no-session-persistence` after a completed Claude turn when a session id is available.
- [x] 5.2 Parse `/context` total tokens, context window, percentage, estimated usage categories, and MCP tools table.
- [x] 5.3 Preserve decimal category percentages and include zero-token tools when selecting the MCP tool preview rows.
- [x] 5.4 Emit parsed category and MCP tool details through `EngineEvent::UsageUpdate` and normalized frontend thread token usage state; only category details are rendered in the compact Claude tooltip.

## 6. Verification

- [x] 6.1 Run targeted Rust tests for Claude history and lifecycle usage extraction.
- [x] 6.2 Run targeted frontend tests for Composer context indicator and tooltip.
- [x] 6.3 Manually verify active Claude turn updates context usage from runtime events.
- [x] 6.4 Manually verify restored Claude history with custom `CLAUDE_HOME`.
- [x] 6.5 Run `openspec validate fix-claude-context-usage-display --type change --strict --no-interactive`.
- [x] 6.6 Run targeted Rust tests for hook lifecycle telemetry parsing and legacy `--include-hook-events` fallback.
- [x] 6.7 Run targeted frontend tests for estimated Claude context-window labeling.
