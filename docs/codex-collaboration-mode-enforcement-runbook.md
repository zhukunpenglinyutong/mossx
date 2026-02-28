# Codex Collaboration Mode Enforcement Runbook

## Scope

This runbook describes rollout, verification, and rollback for runtime
enforcement of Codex collaboration modes (`plan` / `code`).

## Feature Flag

- App setting key: `codexModeEnforcementEnabled`
- Codex config feature flag key: `features.collaboration_mode_enforcement`
- Default: `true`

The backend reads/writes the codex feature flag via settings sync:

- `read_codex_mode_enforcement_enabled`
- `write_codex_mode_enforcement_enabled`

## Runtime Behavior

- `turn/start` computes a thread-level `effective_mode` and records metadata:
  - `selectedMode`
  - `effectiveMode`
  - `policyVersion`
  - `fallbackReason`
- In `code` mode, backend blocks `item/tool/requestUserInput` and emits:
  - `collaboration/modeBlocked`
- In `plan` mode, `requestUserInput` continues as normal.

## Verification Checklist

1. Start a Codex thread in `plan` mode and confirm `requestUserInput` still renders.
2. Switch to `code` mode and trigger `requestUserInput`.
3. Confirm no interactive request card appears.
4. Confirm a mode-blocked hint is rendered in the message area.
5. Confirm logs contain enforcement decision and turn/start mode metadata.

Example log probes:

```bash
rg -n "turn/start\\]\\[collaboration_mode\\]|collaboration_mode_enforcement" src-tauri
```

## Rollback Procedure

1. Disable the flag:
   - Set `codexModeEnforcementEnabled=false` in app settings, or
   - Set `features.collaboration_mode_enforcement = false` in Codex config.
2. Restart app or reconnect workspace session.
3. Re-verify that `requestUserInput` is no longer blocked in `code` mode.

## Troubleshooting

- Symptom: `requestUserInput` remains blocked after disabling flag.
  - Check session reconnection happened (flag is session-applied).
  - Check config/settings effective value is actually `false`.
- Symptom: no `collaboration/modeBlocked` event but request card absent.
  - Inspect raw `app-server-event` stream for malformed event payload.
  - Verify thread mode state exists for the current `threadId`.
