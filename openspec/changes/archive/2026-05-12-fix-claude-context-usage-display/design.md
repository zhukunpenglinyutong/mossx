## Context

当前代码已经具备部分 Claude dynamic usage extraction：

- `ClaudeSession::try_extract_context_window_usage` 会扫描 event 中的 `context_window.current_usage`、`message.usage`、top-level `usage`。
- `EngineEvent::UsageUpdate` 会把 usage 推到前端 `thread/tokenUsage/updated`。
- 前端 legacy token indicator 通过 `contextUsage.used / contextUsage.total` 计算百分比。

缺口在于：

- `claude_history.rs` 的 projects base dir 固定为 `dirs::home_dir()/.claude/projects`。
- 历史恢复时 `modelContextWindow` 固定 `DEFAULT_CLAUDE_CONTEXT_WINDOW = 200_000`。
- 实时事件缺失 `model_context_window` 时 fallback 到 `200000`，且 UI 无法区分实时、估算、未知。
- `composer-context-dual-view` 的现有规范明确是 Codex-only，不能直接复用为 Claude 行为。

## Decisions

### Decision 1: Claude home resolution MUST be centralized

Claude history loader、commands/skills discovery、runtime launch 应共享同一套 Claude home resolution 语义。

Resolution order:

1. Explicit engine config / persisted app settings Claude home.
2. `CLAUDE_HOME` environment variable.
3. `dirs::home_dir()/.claude`.

The history projects directory is then:

```text
<resolved-claude-home>/projects
```

Why:

- CLI launch already supports setting `CLAUDE_HOME` for the child process.
- History loader must read from the same home, otherwise custom home users will see missing sessions or stale context.

### Decision 2: Runtime context_window is authoritative for live context usage

Usage source priority for active Claude threads:

1. `context_window.current_usage` + `context_window.context_window_size`.
2. `context_window.used_percentage` / `remaining_percentage` when present.
3. `message.usage` / top-level `usage` as secondary token evidence.
4. Historical JSONL usage as restored estimate.
5. Static fallback only as last resort.

The app should carry freshness metadata with token usage:

```ts
type ContextUsageFreshness =
  | "live"
  | "restored"
  | "estimated"
  | "pending";
```

This metadata prevents `unknown` from being rendered as `0%`.

### Decision 3: Claude gets a dedicated context usage view model, not Codex dual-view reuse

Codex dual-view contains Codex-specific concepts such as proactive auto-compaction threshold. Claude prompt-overflow compaction is reactive and must not be presented as the same capability.

Claude context UI should reuse visual primitives where safe:

- compact footer indicator
- detail tooltip card
- token formatting helpers
- shared percentage/ring styling

But it must use Claude-specific content:

- Total consumption
- Background information window
- Used / remaining
- Used tokens / window tokens
- Freshness label: live / waiting / estimated
- Optional compact state hint from existing Claude compaction lifecycle

### Decision 4: Static `200000` fallback remains but must be labeled

The fallback cannot be removed safely because older Claude events and old history files may not contain `context_window`.

Rules:

- If fallback window is used, surface freshness as `estimated`.
- If no usage tokens exist, freshness is `pending` and percent is absent.
- UI must not display `0%` unless actual used token count is known to be zero.

### Decision 5: `/context` is the supplemental Claude context snapshot source

Claude CLI does not consistently emit `context_window` telemetry in stream events across versions/providers. When a turn has a known session id, the app should probe the same session with:

```text
claude -p "/context" --resume <session-id> --no-session-persistence
```

Rules:

- The probe is supplemental; live stream `context_window` remains the preferred source when present.
- The probe must use `--no-session-persistence` so the diagnostic command does not pollute the conversation JSONL.
- The probe parses Claude's markdown output for total context usage, category estimates, and MCP tool usage.
- Category percentages must preserve decimal precision because `/context` commonly reports values such as `0.8%`.
- MCP tools should show top 3 by token count and still show the first 3 entries when all tools are `0` tokens, with `...` indicating omitted rows.

## Data Flow

```text
Claude CLI stream/statusline event
  -> Rust Claude event conversion
  -> optional /context resumed probe when stream telemetry is incomplete or post-turn detail is needed
  -> EngineEvent::UsageUpdate with source/freshness/window fields
  -> app-server event thread/tokenUsage/updated
  -> frontend thread token usage state
  -> Composer Claude context usage view model
  -> footer indicator + detail tooltip
```

History restore:

```text
workspace path + resolved Claude home
  -> <claude-home>/projects/<encoded-workspace>/*.jsonl
  -> restored messages + optional restored usage
  -> token usage state with freshness="restored" or "estimated"
```

## Risks

- Claude CLI event shape may drift. Mitigation: read aliases for snake_case and camelCase, and keep tests with representative payloads.
- Existing tests may assert `200000`. Mitigation: update them to assert fallback only when source is missing.
- UI can become too heavy. Mitigation: keep main footer compact; detail only appears on hover/click.
