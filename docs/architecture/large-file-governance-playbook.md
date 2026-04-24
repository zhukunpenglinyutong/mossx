# Large File Governance Playbook

## Scope

This playbook governs large-file growth with a domain-aware, baseline-aware policy engine.

## Governance Artifacts

- Scanner: `scripts/check-large-files.mjs`
- Policy config: `scripts/check-large-files.policy.json`
- Hard-debt baseline:
  - Machine-readable: `docs/architecture/large-file-baseline.json`
  - Human-readable: `docs/architecture/large-file-baseline.md`
- Near-threshold watchlist:
  - Human-readable: `docs/architecture/large-file-near-threshold-watchlist.md`

## Policy Groups

| Policy | Scope | Warn | Fail | Priority |
|---|---|---:|---:|---|
| `bridge-runtime-critical` | `src/services/tauri.ts`, `src/app-shell.tsx`, `src-tauri/src/{backend,engine,git,runtime,codex}/**` | 2200 | 2600 | P0 |
| `feature-hotpath` | `threads/messages/composer/git-history/settings/spec/workspaces/shared-session` + `src/utils/threadItems.ts` | 2400 | 2800 | P1 |
| `styles` | `src/styles/**` | 2200 | 2800 | P1 |
| `test-files` | `src/test/**`, `*.test.*` | 2600 | 3000 | P2 |
| `i18n` | `src/i18n/locales/**` | 2600 | 3000 | P2 |
| `default-source` | other source files | 2600 | 3000 | P1 |

## Semantics

### Watchlist

- `npm run check:large-files:near-threshold` scans with policy `warn` thresholds.
- Output is informational only.
- Files above `warn` but not above `fail` appear as `severity=warn, status=watch`.
- Files already above `fail` still appear in the watchlist, with hard-debt status attached when baseline is available.

### Hard Debt

- `npm run check:large-files` reports only files above the matched policy `fail` threshold.
- `docs/architecture/large-file-baseline.json` is the debt ledger used to distinguish retained debt from regressions.
- Status semantics:
  - `new`: file is above fail threshold but has no baseline entry
  - `regressed`: file is above fail threshold and larger than baseline
  - `retained`: file is above fail threshold and equal to baseline
  - `reduced`: file is above fail threshold but smaller than baseline
  - `captured`: baseline generation run without loading a prior baseline

### Hard Gate

- `npm run check:large-files:gate` fails only for `new` or `regressed` hard debt.
- Retained or reduced debt remains visible but non-blocking.
- Remediation must happen in the same PR: split the file or reduce it back to/below baseline.

## Local Checks

```bash
npm run check:large-files:baseline
npm run check:large-files:near-threshold:baseline
npm run check:large-files
npm run check:large-files:near-threshold
npm run check:large-files:gate
```

## CI Checks

- Workflow: `.github/workflows/large-file-governance.yml`
- Watch step: `npm run check:large-files:near-threshold`
- Hard gate step: `npm run check:large-files:gate`
- Rule: CI blocks only when a PR introduces `new` or `regressed` hard debt.

## Baseline Maintenance

- Update `docs/architecture/large-file-baseline.json` only when one of the following is true:
  - policy thresholds changed intentionally
  - a large-file refactor permanently reduced or reorganized current debt
- Do not regenerate baseline casually to hide regressions.
- When baseline changes, regenerate the markdown report in the same PR and explain why in the PR description.

## JIT Remediation Protocol

When a PR fails large-file gate:

1. Keep remediation in the same PR.
2. Prefer minimal-scope decomposition:
   - extract domain hooks/helpers/adapters
   - preserve facade exports and external contracts
3. Re-run:

```bash
npm run typecheck
npm run check:large-files:gate
cargo check --manifest-path src-tauri/Cargo.toml
```

4. Record retained capability notes in the PR description.

## Current Follow-Up Queue

The first follow-up refactor targets remain:

- `src/services/tauri.ts`
- `src/app-shell.tsx`
- `src/features/threads/hooks/useThreadMessaging.ts`

## Rollback Manual

Rollback is required when any of the following occurs:

- scanner misclassifies files because of policy matching bugs
- baseline diff logic causes false-positive or false-negative gate results
- CI and local commands diverge in semantics

Rollback steps:

1. Revert the scanner, policy config, workflow, and generated baseline files together.
2. Keep unrelated product code untouched.
3. Re-run:

```bash
npm run check:large-files
npm run check:large-files:gate
```

4. Open a follow-up fix with the corrected policy or baseline strategy.

## Merge Guardrails

- Do not use whole-file `--ours/--theirs` on high-risk large files.
- Resolve conflicts semantically and verify retained capability points.
- Baseline updates must be reviewed as governance changes, not as generated noise.
