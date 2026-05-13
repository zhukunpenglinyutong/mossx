# Tasks

## Implementation

- [x] Add OpenSpec delta for active thread engine resolution during conversation restore.
- [x] Update layout conversation engine derivation to prefer active thread metadata over global selected engine.
- [x] Pass the resolved active conversation engine into `Messages activeEngine`.
- [x] Keep composer/global engine selection behavior unchanged.

## Verification

- [x] Add regression test for Claude active thread while global selected engine is Codex.
- [x] Run focused Vitest for layout hook UI visibility contract.
- [x] Run full frontend gate if needed before release: `npm run lint && npm run typecheck && npm run test`.
