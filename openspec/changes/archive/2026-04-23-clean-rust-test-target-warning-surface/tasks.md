## 1. Baseline & Ownership

- [x] 1.1 Capture the current `cargo test --manifest-path src-tauri/Cargo.toml --message-format short` warning baseline and record `lib test` vs `bin "cc_gui_daemon" test` ownership.
- [x] 1.2 Confirm which warnings are in-scope for this change and which are out-of-scope because they belong to non-test Rust targets.

## 2. Source Cleanup

- [x] 2.1 Remove unused-import warnings in `client_storage.rs` and `shared/thread_titles_core.rs`.
- [x] 2.2 Audit and remediate dead-code warnings in `startup_guard.rs`, `window.rs`, and `workspaces/settings.rs` using direct fixes or narrow compile-boundary changes.

## 3. Verification & Residual Policy

- [x] 3.1 Re-run `cargo test --manifest-path src-tauri/Cargo.toml --message-format short` and confirm the test-target warning summaries are gone or reduced to documented residuals.
- [x] 3.2 Run `cargo test --manifest-path src-tauri/Cargo.toml` and confirm the Rust suite still passes.
- [x] 3.3 Document any residual test-target warning and its ownership if full cleanup is not possible.
