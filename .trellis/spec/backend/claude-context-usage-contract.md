# Claude Context Usage Backend Contract

本规范固化 Claude Code 上下文用量链路，适用于 `src-tauri/src/claude_home.rs`、`src-tauri/src/engine/claude*`、`src-tauri/src/engine/events.rs`、`src-tauri/src/engine/commands.rs`、`src-tauri/src/bin/cc_gui_daemon/**`。

## Scenario: Claude Home Resolution For History And Runtime

### 1. Scope / Trigger

- Trigger：修改 Claude history list/load/fork/delete、Claude commands discovery、Claude runtime launch、或任何读取 `.claude/projects` 的路径。
- 目标：history loader 与实际 Claude CLI runtime 使用同一个 Claude home，避免自定义 `CLAUDE_HOME` 用户看到空历史或旧上下文。

### 2. Signatures

- Shared resolver:
  - `normalize_home_path(value: &str) -> Option<PathBuf>`
  - `resolve_effective_claude_home(config: Option<&EngineConfig>) -> Option<PathBuf>`
  - `resolve_claude_projects_dir(config: Option<&EngineConfig>) -> Option<PathBuf>`
- History entrypoints MUST prefer `*_with_config(...)` variants:
  - `list_claude_sessions_with_config(workspace_path, limit, config)`
  - `load_claude_session_with_config(workspace_path, session_id, config)`
  - `fork_claude_session_with_config(workspace_path, session_id, config)`
  - `fork_claude_session_from_message_with_config(workspace_path, session_id, message_id, config)`
  - `delete_claude_session_with_config(workspace_path, session_id, config)`

### 3. Contracts

- Resolution order MUST be:
  - explicit `EngineConfig.home_dir`
  - `CLAUDE_HOME`
  - `<user-home>/.claude`
- History projects directory MUST be `<resolved-claude-home>/projects`.
- Daemon commands MUST retrieve Claude engine config from `EngineManager` and pass it into history operations.
- `~`, `~/...`, `$HOME`, `$HOME/...`, `${HOME}`, `${HOME}/...` MUST normalize before joining subpaths.
- Invalid or traversal-style `session_id` values MUST still be rejected before path access.

### 4. Validation & Error Matrix

| 场景 | 必须行为 | 禁止行为 |
|---|---|---|
| config home exists | read `<config-home>/projects` | silently read `~/.claude/projects` |
| config missing + `CLAUDE_HOME` set | read `$CLAUDE_HOME/projects` | ignore env and show stale history |
| config/env missing | keep default `<home>/.claude/projects` | fail startup |
| invalid session id | return explicit error | join raw id into path |

### 5. Good / Base / Bad Cases

- Good：`DaemonState::list_claude_sessions` obtains `EngineType::Claude` config and calls `list_claude_sessions_with_config`.
- Base：standalone tests pass `None` config and retain default home behavior.
- Bad：new code directly constructs `dirs::home_dir().join(".claude").join("projects")`.

### 6. Tests Required

- resolver：configured home wins over env.
- resolver：env home is used when config absent.
- resolver：default home remains backward compatible.
- history：configured home projects dir is scanned.
- history：invalid `session_id` remains rejected.

### 7. Wrong vs Correct

#### Wrong

```rust
let base_dir = dirs::home_dir().unwrap().join(".claude").join("projects");
list_claude_sessions_from_base_dir(&base_dir, workspace_path, limit).await
```

#### Correct

```rust
let base_dir = crate::claude_home::resolve_claude_projects_dir(config)
    .ok_or_else(|| "Unable to resolve Claude home".to_string())?;
list_claude_sessions_from_base_dir(&base_dir, workspace_path, limit).await
```

## Scenario: Runtime Context Window And `/context` Usage Probe

### 1. Scope / Trigger

- Trigger：修改 Claude CLI command args、Claude stream event parsing、`EngineEvent::UsageUpdate`、app-server event mapping、或 post-turn forwarding loop。
- 目标：优先使用 Claude runtime `context_window`，并在 stream 不稳定时通过同一 session 的 `/context` 追加补充快照。

### 2. Signatures

- Claude CLI runtime SHOULD include `--include-hook-events`.
- Unsupported legacy fallback MUST retry without `--include-hook-events` when stderr/stdout indicates unknown/unrecognized/unsupported option.
- Post-turn probe command:

```text
claude -p "/context" --resume <session-id> --no-session-persistence
```

- `EngineEvent::UsageUpdate` MUST support:
  - `input_tokens`
  - `output_tokens`
  - `cached_tokens`
  - `model_context_window`
  - `context_used_tokens`
  - `context_usage_source`
  - `context_usage_freshness`
  - `context_used_percent`
  - `context_remaining_percent`
  - `context_category_usages`
  - `context_tool_usages`
  - `context_tool_usages_truncated`

### 3. Contracts

- `context_window.current_usage` is authoritative for live context-window used tokens.
- `message.usage` / top-level `usage` is cumulative message usage and MUST NOT override `context_window.current_usage`.
- `context_window.used_percentage` and `remaining_percentage` MUST be preserved when present; do not recompute conflicting percentages from cumulative usage.
- `current_usage: null` or absent MAY emit window size/percent metadata but MUST NOT fabricate used tokens from cumulative usage.
- `/context` probe MUST:
  - use current workspace as `current_dir`
  - set `CLAUDE_HOME` when runtime has a configured home
  - pipe stdout/stderr
  - use null stdin
  - timeout instead of hanging the turn forwarder
  - pass `--no-session-persistence`
- `type: "result"` stream packets MUST NOT be treated as terminal `TurnCompleted`; `send_message` emits the canonical completion after stdout closes so post-turn usage can arrive.
- Forwarders MUST stay subscribed after `TurnCompleted` long enough to receive `context_usage_source == "context_command"` usage update, bounded by a short grace window.

### 4. Validation & Error Matrix

| 场景 | 必须行为 | 禁止行为 |
|---|---|---|
| live `context_window.current_usage` object | emit live `context_used_tokens` and window size | show cumulative total as current window |
| live `context_window.current_usage` number | emit that number as current window usage | drop numeric payload |
| nested hook payload | recursively find `context_window` | only inspect top-level event |
| `current_usage: null` | preserve available percent/window metadata | invent `0` or total usage |
| CLI lacks hook flag | retry once without flag | fail visible user turn |
| post-turn `/context` succeeds | emit estimated `context_command` update | close forwarder before update |
| `/context` fails or times out | log debug and keep existing usage | block send completion |

### 5. Good / Base / Bad Cases

- Good：stream emits `context_window`, UI sees `freshness="live"`; after completion `/context` may provide categories as `freshness="estimated"`.
- Base：older CLI emits only `message.usage`; usage is marked `estimated`, no fake window capacity.
- Bad：mapping uses `model_context_window.unwrap_or(200000)` in app-server event, making missing live data look authoritative.

### 6. Tests Required

- Rust lifecycle: snake_case and camelCase `context_window` payloads.
- Rust lifecycle: numeric `current_usage`.
- Rust lifecycle: nested hook/payload wrapper.
- Rust lifecycle: `current_usage: null`.
- Rust parser: `/context` tokens, category table, MCP table, decimal percentages.
- Rust stream: `type: "result"` maps to raw and only one canonical `TurnCompleted` appears.
- Rust command: `--include-hook-events` included when requested and omitted for legacy retry.

### 7. Wrong vs Correct

#### Wrong

```rust
"modelContextWindow": model_context_window.unwrap_or(200000)
```

#### Correct

```rust
"modelContextWindow": model_context_window,
"contextUsedTokens": context_used_tokens,
"contextUsageSource": context_usage_source,
"contextUsageFreshness": context_usage_freshness,
"contextUsedPercent": context_used_percent,
"contextRemainingPercent": context_remaining_percent,
```
