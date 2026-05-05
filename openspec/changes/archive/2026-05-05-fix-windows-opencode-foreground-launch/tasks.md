## 1. Backend Guard Design

- [x] 1.1 Audit current Windows OpenCode binary resolution and probe call sites in `app_server_cli.rs`, `engine/status.rs`, `engine/commands.rs`, and `engine/opencode.rs`; output: bounded target helper/call-site list; verification: affected paths enumerated in PR notes or task log.
- [x] 1.2 Define the Windows-only OpenCode candidate safety rule and diagnostic contract; output: concrete safe/unsafe decision shape and backend error wording; verification: design and spec requirements map 1:1 to code entry points.

## 2. Backend Implementation

- [x] 2.1 Implement Windows-only OpenCode CLI-safe resolution / guard helper without changing non-Windows or non-OpenCode paths; output: guarded candidate resolution path; verification: focused Rust tests for safe CLI candidate and rejected launcher-like candidate.
- [x] 2.2 Route OpenCode status detection and explicit readiness/refresh probes through the new guard; output: stable diagnostic instead of launcher execution for unsafe candidates; verification: targeted backend tests cover `detect_opencode_status` or equivalent readiness path.
- [x] 2.3 Keep healthy Windows OpenCode CLI execution unchanged for supported candidates; output: no-regression path for valid CLI; verification: focused test asserts successful planning/probe behavior remains available.

## 3. Frontend Contract Check

- [x] 3.1 Review `src/services/tauri.ts`, `useSidebarMenus.ts`, and `useEngineController.ts` for any mapping changes needed to surface backend diagnostics without adding new automatic probes; output: aligned status/error handling; verification: focused Vitest for manual refresh / readiness path.
- [x] 3.2 Confirm no macOS/Linux or other-engine UI behavior changes are introduced; output: no-op contract for non-target paths; verification: existing targeted tests still pass or are expanded with explicit non-target assertions.

## 4. Validation And Apply Readiness

- [x] 4.1 Run focused validation for the touched code paths; output: passing targeted Rust and frontend tests; verification: record exact commands and results in implementation notes.
- [x] 4.2 Run artifact validation and final change sanity checks; output: OpenSpec change ready for apply; verification: `openspec validate --all --strict --no-interactive` passes and `openspec status --change "fix-windows-opencode-foreground-launch"` shows tasks available for execution.
