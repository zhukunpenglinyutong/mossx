# Verification Evidence

## Manual Matrix

| Date | Scenario | Coverage | Result | Evidence |
|---|---|---|---|---|
| 2026-04-24 | `Terminal -> codex exec -> official Computer Use tool` | Manual | Success | `codex exec --json` could call the official Computer Use tool and return a valid app list on the same Mac. |
| 2026-04-24 | `mossx client session -> Computer Use plugin` | Manual | Failed | Returned `Apple event error -10000: Sender process is not authenticated`. |
| 2026-04-24 | `same machine, same official plugin cache, different host identity` | Manual | Reproduced drift symptom | Confirms the issue is not “plugin missing” and not a simple “user forgot to enable permissions” case. |
| 2026-04-24 | `installed host variants present simultaneously` | Manual | Confirmed | Observed `cc-gui` app binary, `cc_gui_daemon`, and `target/debug/cc-gui`, which makes sender identity drift plausible. |
| 2026-04-24 | `same host + still denied stays generic permission` | Automated | Passed | `computer_use::broker::tests::codex_exec_output_classifies_failed_tool_as_permission_required` |
| 2026-04-24 | `main app vs daemon / debug host classification` | Automated | Passed | `computer_use::authorization_continuity::tests::authorization_host_role_classifies_debug_and_daemon_paths` |
| 2026-04-24 | `debug binary drift` | Automated | Passed | `computer_use::authorization_continuity::tests::authorization_continuity_detects_drifted_last_successful_host` |
| 2026-04-25 | `unsigned packaged app should not be treated as a stable sender` | Automated | Passed | `computer_use::authorization_continuity::tests::authorization_continuity_reports_unsupported_context_for_unsigned_packaged_app` |
| 2026-04-24 | `relaunch after re-authorization baseline persists` | Automated | Passed | `computer_use::authorization_continuity::tests::persist_last_successful_authorization_host_round_trips_snapshot` |

## Observed Error Text

- `Apple event error -10000: Sender process is not authenticated`

## Implementation Validation

- `cargo test --manifest-path src-tauri/Cargo.toml computer_use -- --nocapture`
  - Passed: 41 tests
- `npm exec vitest run src/features/computer-use/components/ComputerUseStatusCard.test.tsx src/features/computer-use/hooks/useComputerUseBridgeStatus.test.tsx src/features/computer-use/hooks/useComputerUseActivation.test.tsx src/features/computer-use/hooks/useComputerUseBroker.test.tsx src/features/computer-use/hooks/useComputerUseHostContractDiagnostics.test.tsx src/services/tauri.test.ts src/features/app/hooks/useGitCommitController.test.tsx`
  - Passed: 108 tests
- `npm run typecheck`
  - Passed

## Conclusion

- The same Mac can succeed through `Terminal -> codex exec` while failing through the client host.
- The highest-signal explanation is authorization continuity drift: the host that was granted Apple Events trust is not the host that actually sends Apple Events during the failing client flow.
- An additional validated branch now blocks unsigned packaged apps earlier, instead of letting them fall through to a misleading generic permission verdict.
- The implemented fix therefore distinguishes:
  - `authorization_continuity_blocked`
  - generic same-host `permission_required`
