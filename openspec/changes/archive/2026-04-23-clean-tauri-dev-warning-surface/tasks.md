## 1. Baseline & Ownership

- [x] 1.1 Capture the current `npm run tauri dev` warning inventory and classify each warning family as `repo-owned` or `environment-owned`.
- [x] 1.2 Define the target residual-warning policy for this change, including whether the top-level `electron_mirror` warning is expected to remain until the local environment is fixed.

## 2. Frontend Bootstrap Noise Reduction

- [x] 2.1 Replace the current nested `beforeDevCommand: "npm run dev"` path with a direct frontend bootstrap command or script that preserves `ensure-dev-port + vite` behavior.
- [x] 2.2 Verify that `npm run tauri dev` still reaches the configured `devUrl`, and that repository-owned duplicate npm warning amplification is removed.

## 3. Rust Warning Cleanup

- [x] 3.1 Audit and remediate the `startup_guard / app_paths` warning group, preferring platform split or real callsite cleanup over blanket `allow`.
- [x] 3.2 Audit and remediate the `backend/app_server` auto-compaction warning group, removing or reconnecting orphaned fields/helpers/constants.
- [x] 3.3 Audit and remediate the `engine/*` warning group (`mod.rs`, `claude.rs`, `codex_adapter.rs`, `events.rs`, `manager.rs`) with narrow ownership-based fixes.

## 4. Verification & Documentation

- [x] 4.1 Re-run `npm run tauri dev` startup capture and confirm the warning surface matches the new ownership baseline.
- [x] 4.2 Run `cargo test --manifest-path src-tauri/Cargo.toml` and any touched validation commands to ensure cleanup does not regress startup/runtime behavior.
- [x] 4.3 Document any residual environment-owned warning that still requires manual local config cleanup.
