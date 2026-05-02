## 1. Spec

- [x] Document normal Codex no-progress timeout increase from 180 seconds to 600 seconds.
- [x] Document backend resume-pending timeout increase from 45 seconds to 360 seconds.
- [x] Preserve execution-active timeout contract at 1200 seconds.

## 2. Implementation

- [x] Update `CODEX_TURN_NO_PROGRESS_STALL_MS` to `600_000`.
- [x] Update `DEFAULT_RESUME_AFTER_USER_INPUT_TIMEOUT_MS` to `360_000`.
- [x] Leave first-delta, early stall diagnostics, execution-active timeout, and queue fusion timeout unchanged.

## 3. Tests

- [x] Update focused timeout fixtures from `180_000` / `45_000` to `600_000` / `360_000`.
- [x] Run focused Vitest coverage for thread stalled handling.
- [x] Run `npm run typecheck`.
- [x] Run focused Rust backend app server tests.
