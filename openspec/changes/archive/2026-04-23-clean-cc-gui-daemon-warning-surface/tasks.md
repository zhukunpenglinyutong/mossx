## 1. Baseline & Ownership

- [x] 1.1 Capture the current `cc_gui_daemon` warning inventory and record the warning-family baseline with ownership labels (`daemon-owned`, `shared-module warning debt`, `intentional compatibility shim`).
- [x] 1.2 Confirm which warning families are in-scope for this change and which families remain out-of-scope because they belong to other Rust targets or active changes.

## 2. Daemon-Owned Surface

- [x] 2.1 Audit `src-tauri/src/bin/cc_gui_daemon.rs` and `src-tauri/src/bin/cc_gui_daemon/*` for unreachable stubs, entry-only helpers, and daemon-local wrappers that can be removed or reconnected safely.
- [x] 2.2 Verify that daemon-owned cleanup does not change daemon RPC params, response shape, or desktop app command contracts.

## 3. Shared Module Warning Families

- [x] 3.1 Audit `src-tauri/src/local_usage.rs` and split or narrow the daemon import surface so desktop-only analytics wrappers stop leaking into the daemon target.
- [x] 3.2 Audit `src-tauri/src/engine/*` plus `src-tauri/src/bin/cc_gui_daemon/engine_bridge.rs`, and decide which warnings should be fixed by reconnecting symbols, shrinking imports, or documenting intentional compatibility shims.
- [x] 3.3 Audit `src-tauri/src/runtime/*`, `src-tauri/src/session_management.rs`, `src-tauri/src/shared/workspaces_core.rs`, and `src-tauri/src/git_utils.rs` for daemon-target reachability cleanup.

## 4. Verification & Residual Policy

- [x] 4.1 Re-run `cargo check --manifest-path src-tauri/Cargo.toml --bin cc_gui_daemon --message-format short` after each cleanup batch and update the warning baseline.
- [x] 4.2 Run `cargo test --manifest-path src-tauri/Cargo.toml` and any touched targeted checks to ensure shared-module cleanup does not regress behavior.
- [x] 4.3 Document any residual daemon warnings with ownership, retention reason, and the narrowest allowed suppression scope.
