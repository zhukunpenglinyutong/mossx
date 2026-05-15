## 1. Scope And Artifact Setup

- [x] 1.1 Create the OpenSpec change artifacts for the spec hygiene pass; input: current main spec debt; output: proposal/design/spec/tasks; validation: `openspec status --change clean-openspec-main-spec-hygiene`.
- [x] 1.2 Add a governance delta for main-spec Purpose and empty-directory hygiene; input: `project-instruction-layering-governance`; output: delta spec; validation: strict OpenSpec validation.

## 2. Main Spec Cleanup

- [x] 2.1 Replace archive-generated Purpose placeholders in main specs; input: affected `openspec/specs/*/spec.md`; output: deterministic Purpose text; validation: residual `rg` scan returns no matches.
- [x] 2.2 Remove empty main capability directories; input: first-level `openspec/specs/*` directories; output: no empty capability directory remains; validation: `find openspec/specs -mindepth 1 -maxdepth 1 -type d -empty`.

## 3. Verification And Closure

- [x] 3.1 Run strict OpenSpec validation; input: full workspace; output: all specs/changes pass; validation: `openspec validate --all --strict --no-interactive`.
- [x] 3.2 Archive/sync the hygiene change after tasks are complete; input: completed change; output: main governance spec updated and active change removed; validation: strict OpenSpec validation after archive.
