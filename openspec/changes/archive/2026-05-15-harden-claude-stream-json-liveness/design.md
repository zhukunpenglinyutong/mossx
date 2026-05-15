## Context

The GUI uses Claude Code print mode and expects newline-delimited `stream-json` events. The current parser is tolerant of plain JSON and `data:` SSE lines, and it already handles runtime errors that exit or appear as recognizable stream errors. The missing path is a child process that remains alive while no valid event is ever parsed.

Interactive Claude CLI success does not prove GUI success because interactive mode and print-mode stream-json have different contracts. The GUI lifecycle must therefore defend against an upstream stream contract mismatch without hard-coding provider identity.

## Decisions

### Decision 1: Guard only pre-first-valid-event silence

The primary watchdog applies before the first valid Claude stream event is parsed. This avoids killing legitimate long-running Claude work after the runtime has proven it is speaking the expected event protocol.

Progress after first event continues through existing terminal, runtime error, approval, compact-retry, and interrupt paths.

### Decision 2: Malformed output counts as diagnostics, not progress

Non-empty stdout that cannot be parsed as stream-json is captured in the existing error-output buffer, but it does not satisfy the first-event guard. This is necessary for endpoints that stream plain text, HTML error pages, proxy banners, or malformed SSE payloads.

The final timeout message should include a short redacted/truncated sample so a user can tell whether the upstream produced plain text, protocol noise, or no output.

### Decision 3: Backend owns terminal settlement

The backend is closest to the child process and can terminate it. The frontend should not invent a terminal failure solely from a UI timer because that risks process leaks and duplicate settlement. Frontend continues to rely on the existing `turn/error` path for processing cleanup.

### Decision 4: Timeout is fixed internal contract for this change

This change uses an internal constant rather than a user setting. The goal is to stop infinite pseudo-processing and collect evidence. User-configurable timeouts can be introduced later if there is real product demand.

## Error Contract

Timeout error code:

- `claude_stream_no_event_timeout`

Message requirements:

- Mention Claude stream-json startup timeout.
- Include whether stdout/stderr diagnostics were observed.
- Include a short diagnostic sample when available.
- Avoid full raw payload dumps.

## Implementation Notes

- Wrap `lines.next_line()` with `tokio::time::timeout()` while no valid event has been parsed.
- Track `saw_valid_stream_event`.
- Track a compact diagnostic sample from invalid stdout and stderr.
- On timeout:
  - emit `EngineEvent::TurnError`;
  - remove and terminate the active child handle;
  - return `Err(String)` so command logs and caller tasks observe failure.
- Keep existing unsupported `--include-hook-events` retry behavior intact. The guard applies independently to each attempt.

## Risks

- A slow but compatible provider might take longer than the fixed startup window before emitting the first event.
  - Mitigation: choose a conservative startup window and make the error message explicit enough for diagnosis.
- Killing a child while stderr reader is still running can race with final stderr collection.
  - Mitigation: use the existing active-process handle pattern and keep timeout diagnostics local to the stream loop.
- If an invalid stream outputs frequent junk forever, the guard must still fire.
  - Mitigation: invalid stdout does not refresh the first valid event deadline.

## Validation Strategy

- Rust fake process with no output and long sleep.
- Rust fake process with malformed stdout then long sleep.
- Rust fake process with valid JSON event before timeout.
- Existing Claude parser and synthetic approval tests must remain green.

## Rollback

Rollback removes the first-event guard and timeout error code. No persistent data migration or Claude settings cleanup is needed.
