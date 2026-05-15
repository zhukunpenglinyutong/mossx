## Why

Phase 1 archive closed the release-facing work, but the main OpenSpec tree still contains many archive-generated `TBD` Purpose placeholders and one empty capability directory. These artifacts do not break strict validation, but they degrade search, review quality, and future archive hygiene.

## 目标与边界

- Clean existing main-spec metadata debt without changing product behavior.
- Make future archive output easier to review by recording that main specs need meaningful Purpose text and no empty capability directories.
- Keep the change scoped to `openspec/**`; do not touch Phase 2 client/project-memory implementation work.

## 非目标

- No frontend, backend, runtime, IPC, or packaging behavior change.
- No rewrite of existing Requirement/Scenario semantics beyond a governance rule for OpenSpec hygiene.
- No fabricated platform smoke evidence or release qualification updates.

## What Changes

- Replace archive-generated `TBD - created by archiving change ...` Purpose placeholders in main `openspec/specs/*/spec.md` files with deterministic, requirement-derived Purpose summaries.
- Remove the empty `openspec/specs/claude-session-engine-resolution/` directory that made inventory tooling report a capability with zero requirements.
- Add a governance requirement to keep OpenSpec main specs free of generated Purpose placeholders and empty capability directories.

## 技术方案对比

| Option | Approach | Decision |
| --- | --- | --- |
| A | Manually rewrite every affected Purpose | Rejected: highest quality per file, but too slow and error-prone for a broad mechanical cleanup. |
| B | Deterministically derive Purpose from spec title and first Requirement | Chosen: removes placeholder debt consistently while preserving existing requirements unchanged. |
| C | Leave placeholders and document as known debt | Rejected: keeps search noise in the main spec tree and weakens Phase 1 closure. |

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `project-instruction-layering-governance`: Add governance for keeping main OpenSpec specs readable after archive/sync operations.

## Impact

- Affected files: `openspec/changes/clean-openspec-main-spec-hygiene/**`, `openspec/specs/*/spec.md`, and the empty `openspec/specs/claude-session-engine-resolution/` directory.
- Validation: `openspec validate --all --strict --no-interactive`, residual placeholder scan, empty capability directory scan.
- Dependencies: none.

## 验收标准

- No main spec contains `TBD - created by archiving change`.
- No empty first-level directory remains under `openspec/specs/`.
- Strict OpenSpec validation passes.
