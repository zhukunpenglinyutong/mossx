## Tasks

- [x] 1. Define the Claude fork session IPC contract and backend parameter shape for fork thread actions.
- [x] 2. Update the Claude engine command builder to append `--resume <parent-session-id> --fork-session` for valid Claude fork requests only.
- [x] 3. Wire the frontend fork thread action to pass the target historical session identity through the existing send path.
- [x] 4. Add composer config-panel Fork quick action entry for Codex and Claude providers.
- [x] 5. Add focused tests for fork vs resume separation, invalid fork input rejection, provider-scoped visibility, and fork quick action routing.
- [x] 6. Validate the change with OpenSpec strict checks and focused TypeScript/Rust test coverage.
