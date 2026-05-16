# Runtime Performance Baseline

This directory stores fixture-based performance baseline outputs for the
`add-runtime-perf-baseline` OpenSpec change.

## Files

- `baseline.json` and `baseline.md` are the latest baseline for the current HEAD.
- `history/v<version>-baseline.json` and `.md` are immutable version anchors.
- `*-baseline.json` fragment files are producer outputs consumed by `scripts/perf-aggregate.mjs`.

## Schema

All JSON files use `schemaVersion: "1.0"`. Consumers must check the major
version before reading metrics.

Metric rows use:

- `scenario`: stable scenario id such as `S-LL-200` or `S-CS-COLD`.
- `metric`: stable metric name from the OpenSpec design.
- `value`: numeric value, or `null` when unsupported on the current platform.
- `unit`: metric unit.
- `notes`: optional human-readable context.
- `unsupportedReason`: required when `value` is `null`.

## Read Protocol

Use `docs/perf/history/v0.4.18-baseline.md` as the comparison anchor for
follow-up optimization proposals. Follow-up changes should cite exact
scenario/metric rows and state the acceptable regression or improvement bound.

Refers to:

- `openspec/changes/add-runtime-perf-baseline/proposal.md`
- `openspec/changes/add-runtime-perf-baseline/design.md`
