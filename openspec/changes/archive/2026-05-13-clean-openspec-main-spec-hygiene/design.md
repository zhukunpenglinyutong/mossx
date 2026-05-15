## Context

The OpenSpec workspace currently validates strictly, but validation does not catch all governance quality issues. The main spec tree includes archive-generated Purpose placeholders and one empty first-level capability directory. Both are metadata hygiene defects: they confuse inventory counts and make capability browsing less useful.

## Goals / Non-Goals

**Goals:**

- Replace generated Purpose placeholders with stable, deterministic summaries.
- Remove empty capability directories from the main spec tree.
- Add an OpenSpec governance requirement so future archive/sync passes have an explicit quality bar.
- Avoid touching active Phase 2/project-memory work.

**Non-Goals:**

- Change product behavior or implementation contracts.
- Rewrite existing Requirement blocks.
- Add external tooling dependencies.

## Decisions

### Decision: Derive Purpose from existing spec content

Use the spec H1 and first `### Requirement:` heading to generate a concise Purpose sentence:

`Defines the <spec title> behavior contract, covering <first requirement>.`

Alternatives considered:

- **Manual curation:** better editorial quality, but it creates a large review surface and risks accidentally changing semantics.
- **Uniform generic Purpose:** cheap, but it would remove `TBD` while adding little useful information.

The deterministic approach is the right middle ground: it is inspectable, repeatable, and anchored in existing normative content.

### Decision: Treat empty spec directories as invalid hygiene even when CLI validation passes

Remove `openspec/specs/claude-session-engine-resolution/` because it contains no `spec.md` and no requirements.

Alternatives considered:

- **Create a placeholder spec:** rejected because there is no current mainline requirement to preserve under that capability name.
- **Ignore it:** rejected because inventory tooling can count it as a capability while validation ignores it.

## Risks / Trade-offs

- [Risk] Deterministic Purpose text can be less nuanced than hand-authored summaries.
  Mitigation: keep each sentence factual and requirement-derived, and avoid changing Requirement semantics.
- [Risk] Broad file touch can obscure unrelated Phase 2 diffs.
  Mitigation: only stage `openspec/changes/clean-openspec-main-spec-hygiene/**`, touched main specs, and the empty directory deletion.
- [Risk] Archive tooling may reintroduce placeholders later.
  Mitigation: add a governance requirement and residual scans to the task checklist.

## Migration Plan

1. Create the governance delta under this change.
2. Mechanically replace archive placeholder Purpose text in main specs.
3. Remove the empty capability directory.
4. Validate with strict OpenSpec validation and residual scans.
5. Archive/sync this hygiene change once complete.

Rollback is simple: revert this change commit. No runtime data, APIs, or migrations are involved.

## Open Questions

- None for this pass.
