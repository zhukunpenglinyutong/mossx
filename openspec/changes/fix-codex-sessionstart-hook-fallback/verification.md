# Verification Notes

## Automated Matrix

The hook-safe fallback contract is covered by deterministic Rust tests that simulate
`thread/start` outcomes without depending on a real Codex account, model availability,
network, or user-local hook scripts.

| Case | Automated Test | Expected Result |
|---|---|---|
| normal SessionStart hook | `sessionstart_hook_matrix_normal_hook_stays_on_primary_path` | primary thread id is returned, fallback metadata is absent |
| no hook project | `sessionstart_hook_matrix_no_hook_stays_on_primary_path` | primary thread id is returned, fallback metadata is absent |
| broken hook / invalid response | `sessionstart_hook_matrix_broken_hook_falls_back_once` | fallback thread id is returned with `ccguiHookSafeFallback.reason = invalid_thread_start_response` |
| slow hook timeout | `sessionstart_hook_matrix_slow_hook_falls_back_once` | fallback thread id is returned with `ccguiHookSafeFallback.reason = thread_start_timeout` |
| plain non-hook timeout | `sessionstart_hook_matrix_plain_thread_timeout_does_not_fallback` | original timeout is surfaced and fallback is not attempted |

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml sessionstart_hook_matrix -- --nocapture
```

## Manual Smoke Still Recommended

The automated matrix validates ccgui's fallback decision and response contract. A final
manual smoke against real `codex app-server` is still recommended before archiving this
change because real Codex behavior can vary by CLI version, login state, platform, and
project-local hook scripts.

## Manual Smoke Result

- Normal-path local smoke was reported as passing by the maintainer on 2026-05-12.
- The 4.3 validation gate is considered complete because the automated matrix covers
  normal hook, no hook, broken hook, slow hook, and non-hook timeout classification.
