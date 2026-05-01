## Why

The current Codex stalled recovery thresholds are too aggressive for long-running foreground work and user-input resume paths. A normal Codex foreground turn can be quarantined after only 180 seconds without visible progress, and the backend `resume-pending` watcher can settle a user-input resume chain after 45 seconds.

These values produce premature stalled states for real work that is still recoverable, especially when the runtime is quiet but not dead.

## What Changes

- Increase the normal Codex foreground no-progress stalled window from 180 seconds to 600 seconds.
- Increase the backend Codex `resume-pending` user-input recovery window from 45 seconds to 360 seconds.
- Keep the execution-active no-progress window unchanged at 1200 seconds.
- Keep the existing progress-evidence reset semantics unchanged.

## Scope

- Frontend Codex foreground no-progress timeout constant.
- Backend `resume-pending` default timeout constant.
- Focused test fixtures and expectations that encode the timeout payload values.
- OpenSpec contract text for Codex stalled recovery timing.

## Non-Goals

- No change to execution-active stalled behavior.
- No change to first-delta or early diagnostic warning timers.
- No change to queue fusion timeout logic.
- No change to archived historical OpenSpec documents.

## Acceptance

- A normal Codex foreground turn MUST only enter no-progress stalled settlement after 600 seconds without progress evidence.
- A Codex foreground turn with active execution items MUST continue using the 1200-second execution-active no-progress window.
- A backend `resume-pending` user-input chain MUST default to 360 seconds before emitting stalled settlement.
- Existing progress evidence MUST continue to reset the relevant no-progress window.
