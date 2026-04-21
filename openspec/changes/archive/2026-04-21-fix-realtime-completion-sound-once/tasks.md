## 1. OpenSpec / Trellis Setup

- [x] 1.1 Create and validate OpenSpec proposal, design, and delta spec for completion-only notification sound behavior.
- [x] 1.2 Create a Trellis task linked to `fix-realtime-completion-sound-once`.

## 2. Core Implementation

- [x] 2.1 Update `useAgentSoundNotifications` so streaming agent message completion events do not play notification sounds.
- [x] 2.2 Add per-thread per-turn completion dedupe so duplicate `turn/completed` events only play once.
- [x] 2.3 Preserve legacy fallback behavior for completed events without `turnId`.

## 3. Verification

- [x] 3.1 Add hook-level regression tests for streaming silence, single completion sound, duplicate completion dedupe, consecutive turns, and disabled sounds.
- [x] 3.2 Run targeted Vitest coverage for notification sound behavior.
- [x] 3.3 Run TypeScript typecheck.
- [x] 3.4 Validate the OpenSpec change in strict mode.
