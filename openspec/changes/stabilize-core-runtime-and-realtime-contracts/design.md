## Context

本变更聚焦 P0 主干稳定性，并只纳入少量 P1 guardrail。

核心判断：

- P0 是系统稳定性的主干：realtime event、runtime lifecycle、AppShell orchestration。
- P1 是边界治理：bridge、large-file、heavy-test-noise、cross-platform。
- 本次不做功能型重构，避免把 proposal 扩散成不可验收的大项目。

## Current State

### AppShell

`src/app-shell.tsx` 是全局 orchestration hub：

- workspace selection and actions
- thread state
- composer and search
- git panels
- settings and menu
- engine/model selection
- layout and window behavior

Current issue:

- `// @ts-nocheck` disables the most important safety net on the app root.
- The file coordinates too many feature surfaces.
- Refactors inside feature hooks can silently break the app shell callback contract.

### Realtime Events

The current event path is:

```text
Rust EngineEvent
  -> AppServerEvent { workspace_id, message: Value }
  -> subscribeAppServerEvents
  -> useAppServerEvents
  -> NormalizedThreadEvent / legacy handlers
  -> threadReducer
  -> Messages render
```

Current issue:

- Rust side has typed `EngineEvent`.
- Frontend side has typed `NormalizedThreadEvent`.
- The middle bridge is still a dynamic `serde_json::Value`.
- `useAppServerEvents` must accept multiple legacy method names and field aliases.

This compatibility is useful, but the canonical contract is not hard enough.

### Runtime Lifecycle

Runtime management already includes:

- acquire timeout
- recovery retries
- quarantine
- runtime generation
- foreground work tracking
- process diagnostics
- session replacement
- late predecessor event handling

Current issue:

- The state surface is broad.
- Existing tests are strong but need more scenario matrix coverage around user-visible flows.
- Most failures manifest as gray failures rather than simple exceptions.

## Design Goals

- Make realtime data flow contract-first.
- Make runtime lifecycle scenario-verifiable.
- Make AppShell typing incremental and behavior-preserving.
- Preserve compatibility for existing sessions, command names, and frontend imports.
- Keep Windows/macOS/Linux behavior equivalent or explicitly bounded.
- Prevent noisy tests and large-file debt while adding contract coverage.

## Non-Goals

- No UI redesign.
- No full AppShell rewrite.
- No full Tauri bridge rewrite.
- No engine-specific feature expansion.
- No removal of legacy event aliases in this change.
- No broad memory/Git/worktree behavior changes.

## Decisions

### Decision 0: P0 drives implementation; P1 constrains blast radius

This change includes P0 and P1 deliberately, but not symmetrically.

P0 items define the implementation path:

- realtime event contract
- runtime lifecycle
- AppShell boundary typing

P1 items define guardrails:

- bridge checklist
- heavy test noise governance
- large-file governance
- Windows/macOS/Linux compatibility

Why:

- P0 without P1 guardrails can pass locally while creating CI noise, platform drift, or replacement hub files.
- P1 as full implementation scope would make this change too large to finish safely.

中文校准：P0 是“必须修的主干断点”，P1 是“防止修主干时制造新坑的护栏”。

### Decision 1: Canonical events first, legacy aliases preserved

Define a canonical event matrix for supported visible realtime semantics:

| Semantic | Canonical source | Normalized operation |
|---|---|---|
| turn started | `turn:started` | turn lifecycle started |
| assistant delta | `text:delta` | `appendAgentMessageDelta` |
| assistant item complete | completed assistant item | `completeAgentMessage` |
| turn complete | `turn:completed` | turn lifecycle settlement |
| reasoning delta | `reasoning:delta` | reasoning append operation |
| tool output delta | `tool:outputDelta` | `appendToolOutputDelta` |
| processing heartbeat | `processing:heartbeat` | processing pulse |
| usage update | `usage:update` | token usage update |
| turn error | `turn:error` | structured failure settlement |

Legacy aliases remain accepted, but tests MUST identify them as compatibility inputs.

Why:

- Existing sessions and engines may still emit old shapes.
- Canonical paths are needed so new changes stop adding ad hoc parsing.

### Decision 2: Contract tests must span both sides of the bridge

Tests SHOULD cover:

- Rust `EngineEvent` to app-server payload mapping.
- Frontend app-server payload to `NormalizedThreadEvent` mapping.
- Reducer integrity after replay.

Why:

- A TS-only test cannot catch Rust payload drift.
- A Rust-only test cannot catch UI normalization drift.

### Decision 3: Runtime lifecycle changes start with scenario tests

Before changing runtime behavior, add scenario tests around:

- fresh acquire
- failed acquire
- recovery budget
- quarantine
- explicit retry
- replacement
- late predecessor diagnostics
- runtime ended with active foreground work
- interrupt/manual release lease cleanup

Why:

- Runtime bugs are state-transition bugs.
- State-transition bugs need scenario tests, not only helper tests.

### Decision 4: AppShell typing uses facade-style section boundaries

Do not rewrite the app shell. Extract typed boundaries for existing sections:

- `WorkspaceShellBoundary`
- `ComposerSearchShellBoundary`
- `RuntimeThreadShellBoundary`

Names may differ in implementation, but each boundary MUST:

- preserve visible behavior
- preserve existing callbacks
- make ownership explicit
- reduce `ts-nocheck` exposure

Why:

- This is safer than a full rewrite.
- It creates typed seams without changing UX.

### Decision 5: P1 bridge guardrails are included, bridge rewrite is not

This change adds bridge contract rules but does not split the entire command registry.

Required for touched commands:

- command name unchanged
- argument names unchanged unless explicitly specified
- response shape backward-compatible
- frontend `src/services/tauri.ts` facade remains import-compatible
- errors remain mappable to existing user-facing behavior

Why:

- The P0 paths depend on bridge correctness.
- A full bridge rewrite would expand the blast radius too much.

### Decision 6: Cross-platform compatibility is part of the design, not just validation

Any touched runtime/process/path/test code MUST be reviewed for:

- Windows path separators
- macOS app/window differences
- Linux process/shell behavior
- newline and shell quoting differences
- case-sensitive vs case-insensitive filesystem behavior

Why:

- The CI workflows already run governance sentries on all three platforms.
- Runtime and test harness code often fails on platform assumptions.

### Decision 7: Governance gates stay mandatory for code changes

Heavy test noise and large-file governance are explicit constraints.

Why:

- This change adds tests. Those tests must stay signal-clean.
- This change may extract files. Extraction must not create replacement hubs.

## Implementation Plan

### Sequencing Principle

Implementation MUST proceed in small, reviewable batches:

1. Realtime contract tests before realtime behavior changes.
2. Runtime scenario tests before runtime lifecycle behavior changes.
3. AppShell boundary typing after contract/lifecycle surfaces are better pinned.
4. Bridge/governance checks only when the batch touches those boundaries.

Each batch MUST state:

- priority: P0 implementation or P1 guardrail
- touched files or modules
- validation commands
- skipped commands with reason and residual risk
- cross-platform risk if the batch touches path/process/shell/window/test harness behavior

### Phase 1: Contract Inventory

- Inventory existing `EngineEvent` variants.
- Inventory frontend normalized operations.
- Identify canonical vs legacy event names.
- Record bridge payload fields that are currently dynamic.

Deliverable:

- event matrix in code comments, tests, or spec-adjacent fixture docs.

### Phase 2: Realtime Contract Tests

- Add canonical fixtures.
- Add compatibility fixtures.
- Assert canonical payload maps to `NormalizedThreadEvent`.
- Assert reducer replay preserves semantics.

Deliverable:

- focused TS tests and, where appropriate, Rust tests for event mapping.

### Phase 3: Runtime Scenario Tests

- Add runtime lifecycle scenario coverage.
- Keep output noise controlled.
- Ensure tests are platform-neutral.

Deliverable:

- focused Rust tests under `src-tauri/src/runtime/**`.

### Phase 4: AppShell Boundary Typing

- Identify section props hidden by `ts-nocheck`.
- Add typed boundary objects for selected sections.
- Keep visible behavior unchanged.
- Reduce or isolate `ts-nocheck` only after typecheck passes.

Deliverable:

- typed section boundaries and targeted tests.

### Phase 4.1: AppShell Boundary Inventory

Current hidden contract surfaces found in `src/app-shell.tsx` and `src/app-shell-parts/**`:

| Boundary | Current Hidden Contract | Risk If Untyped | Next Typed Surface |
|---|---|---|---|
| Workspace shell | Workspace selection, workspace home, restore/refresh, drag/drop, worktree/clone prompts, terminal launch, file explorer launch, git root selection, workspace settings updates. `useAppShellWorkspaceFlowsSection` has a partial context type, but still carries `any` for debug entries, app settings, terminal args, save queue, and task scroll requests. | Workspace/worktree action refactors can silently break callback payloads or route actions to the wrong workspace/thread. Terminal/workspace side effects can drift without compile-time feedback. | `WorkspaceShellBoundary` with typed workspace identity, workspace actions, terminal actions, settings updater, and error/debug sinks. |
| Composer/search shell | Search palette state/results, content filters, result routing, composer model/effort/collaboration selection, composer shortcuts/menu actions, PR composer mode, dictation/image/draft inputs, kanban context. `useAppShellSearchAndComposerSection` is `@ts-nocheck` and accepts `ctx: any` with broad destructuring. | Search result routing can desync workspace/thread state; composer send payload can lose model/effort/collaboration intent; shortcut/menu callbacks can compile while receiving stale or missing handlers. | `ComposerSearchShellBoundary` with typed search state/actions, composer selection state/actions, send/queue handlers, and explicit PR composer contract. |
| Runtime/thread shell | `useThreads` output, active thread/workspace identity, thread status, active turn, token usage/rate limits, runtime console toggles, interrupt/archive/copy actions, shared session selection, thread rows and message activity callbacks. Most values are later passed through the render context as a large untyped object. | Runtime-ended, processing, active turn, shared session, or thread selection regressions can hide behind `ts-nocheck`; callbacks may be invoked with mismatched workspace/thread identity. | `RuntimeThreadShellBoundary` with typed thread identity, lifecycle/status maps, runtime actions, shared-session actions, and message activity callbacks. |
| Layout/render context | `renderAppShell`, `useAppShellLayoutNodesSection`, and `useAppShellSections` receive hundreds of values through `ctx: any` and legacy default spreading. | UI sections can depend on accidental globals; removing/renaming a field is not type-checked at the root. This is the main blocker to removing `ts-nocheck` from `app-shell.tsx`. | After the three primary boundaries are typed, split layout/render props into small typed section props instead of a single catch-all context. |

中文结论：3.1 的核心不是马上拆文件，而是先把 `ts-nocheck` 掩盖的“谁拥有哪个状态/回调”钉住。后续 3.2/3.3/3.4 必须按上表逐块收窄，不能一次性重写 AppShell。

### Phase 4.2: AppShell Typing Evidence

This change introduced typed boundary surfaces without removing `ts-nocheck` from the root app shell yet:

- `WorkspaceShellBoundary` in `useAppShellWorkspaceFlowsSection.ts`
- `ComposerSearchShellBoundary` in `useAppShellSearchAndComposerSection.ts`
- `RuntimeThreadShellBoundary` in `runtimeThreadBoundary.ts`

`ts-nocheck` removal is intentionally blocked for this change because `useAppShellSections.ts`, `useAppShellLayoutNodesSection.tsx`, `useAppShellSearchAndComposerSection.ts`, and `renderAppShell.tsx` still depend on broad legacy context passthrough. Removing the directive before those catch-all contexts are split would convert a scoped stabilization change into a broad AppShell rewrite.

中文结论：本批先建立 typed boundary，不强行删除 `ts-nocheck`。删除时机应放到后续专门的 AppShell context split change，避免把 P0 稳定性提案扩大成 UI root 重写。

### Phase 5: Bridge Guardrails

- Add command contract checklist.
- Add or update focused bridge tests for any touched command.
- Preserve `src/services/tauri.ts` facade exports.

Deliverable:

- documented checklist and focused tests.

### Phase 5.1: Bridge Guardrail Evidence

This change did not add, rename, move, or wrap any Tauri command handler.

Bridge checklist for the touched surface:

| Surface | Result | Evidence |
|---|---|---|
| Tauri command name | Unchanged. No new or renamed `#[tauri::command]` was introduced by this change. | Code review of touched files; this batch does not edit command handlers. |
| Command args | Unchanged. No Tauri command argument names or command payload inputs were modified. | No touched command handler or `command_registry.rs` entry. |
| Command response | Unchanged for command invocations. The touched bridge-like surface is app-server realtime event payload mapping, not command responses. | `src-tauri/src/engine/events.rs` mapping tests and frontend realtime contract tests cover the event payload path. |
| Error mapping | Unchanged for Tauri commands. Realtime turn error payload remains normalized through existing frontend handling. | Realtime contract tests include turn error semantics. |
| Frontend facade | `src/services/tauri.ts` import surface unchanged. No caller import migration is required. | `npm run typecheck` and `npm run check:runtime-contracts` passed. |
| Command registration | `src-tauri/src/command_registry.rs` unchanged. Registered command availability remains compatible. | `npm run check:runtime-contracts` passed, including app-shell and git-history runtime contract sentries. |

中文结论：本次没有做 Tauri command bridge 重构；真正被加固的是 Rust `EngineEvent` 到 app-server realtime payload，再到 frontend normalized event 的事件桥。P1 bridge guardrail 在这里表现为“记录并验证没有顺手改 command contract”。

## Rollback Strategy

- Realtime changes keep legacy aliases, so canonical path changes can be backed out without breaking legacy input.
- AppShell extraction uses facade boundaries, so callers can remain stable.
- Runtime behavior changes must be isolated behind scenario-tested lifecycle paths.
- If a batch regresses, revert that batch without reverting unrelated spec/test work.
- P1 guardrails should be reversible as documentation/checklist/test-gate adjustments unless they expose a real P0 contract failure.

## Validation Matrix

| Area | Required Evidence |
|---|---|
| Realtime contract | TS adapter tests, replay boundary guard |
| Runtime lifecycle | Rust runtime scenario tests |
| AppShell typing | `npm run typecheck`, targeted AppShell tests |
| Bridge guardrail | runtime contract checks when bridge or command surfaces are touched |
| Heavy test noise | parser tests and `npm run check:heavy-test-noise` when tests/logging are touched |
| Large file governance | parser tests, near-threshold watch, and hard gate when files grow or are extracted |
| Cross-platform | no platform-specific assumptions in touched code; CI parity or recorded residual gap required |

## Validation Evidence

Current local validation completed on macOS:

| Gate | Result | Notes |
|---|---|---|
| Frontend typecheck | Passed: `npm run typecheck` | Confirms new AppShell boundary types and realtime contract types compile without caller import migration. |
| Frontend tests | Passed: `npm run test` | 474 Vitest files completed. Heavy integration suites remain controlled by the existing test-batched policy. |
| Realtime replay guard | Passed: `npm run perf:realtime:boundary-guard` | Confirms ordering, terminal lifecycle, and payload completeness stay equivalent. |
| Runtime contract guard | Passed: `npm run check:runtime-contracts` | `check:app-shell:runtime-contract` and `check:git-history:runtime-contract` both passed. |
| Rust runtime tests | Passed: `cargo test --manifest-path src-tauri/Cargo.toml runtime` | Runtime lifecycle, recovery, quarantine, generation, and foreground-work tests passed. |
| Heavy test noise parser | Passed: `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs` | Parser and batched runner governance tests passed. |
| Heavy test noise full gate | Passed: `npm run check:heavy-test-noise` | 477 Vitest files completed; act warnings 0, stdout payload lines 0, stderr payload lines 0. |
| Large file parser | Passed: `node --test scripts/check-large-files.test.mjs` | Governance scanner tests passed. |
| Large file near-threshold | Passed with existing watch warnings: `npm run check:large-files:near-threshold` | Watch list remains existing debt; no hard failure. |
| Large file hard gate | Passed: `npm run check:large-files:gate` | Fail-scope violations: 0. |

Residual risk:

- Local validation is macOS-only. Windows and Linux runtime execution remain covered by GitHub Actions matrix for the governance workflows, not by this local run.
- Existing near-threshold large files remain as watch debt, including `src/app-shell.tsx`; this change does not claim to complete large-file remediation.
- Root `src/app-shell.tsx` still has `// @ts-nocheck`; this change creates typed boundaries first and defers full context split.
- Realtime legacy aliases are still accepted intentionally; removing them needs a separate compatibility-window change.

中文结论：本批的 P0 主干证据已闭环；剩余风险都属于已记录的后续治理项，不是本批必须继续扩张的范围。

## Follow-up Backlog

Deferred items that should remain outside this change:

- Split AppShell layout/render catch-all contexts so `src/app-shell.tsx` can eventually drop root `// @ts-nocheck`.
- Consider typed `AppServerEvent.message` variants or generated TS event types from Rust `EngineEvent`.
- Define and enforce a compatibility window for legacy realtime event aliases.
- Plan separate large-file remediation for existing watch-list hubs instead of bundling it into runtime/realtime stabilization.
- Keep memory, Git/worktree, and full bridge/command-registry cleanup as separate OpenSpec changes.

Priority calibration:

- P0 implementation evidence: realtime contract, runtime lifecycle, and AppShell typed boundary surfaces.
- P1 guardrail evidence: bridge checklist, heavy-test-noise gate, large-file governance gate, and cross-platform audit.
- Out-of-scope by design: full AppShell rewrite, full Tauri bridge split, memory/Git/worktree behavior redesign.

## Cross-Platform Evidence

This batch audited the touched runtime/realtime contract surfaces for Windows/macOS/Linux drift.

| Surface | Evidence | Residual Gap |
|---|---|---|
| Realtime fixtures and hook tests | Canonical fixture payloads use logical ids and JSON method names only. No filesystem path, shell quoting, platform newline, or case-sensitive filesystem assumption is introduced. The only fixture newline is payload content (`canonical tool output\n`), not a snapshot/newline parser assumption. | Local run is macOS-only; CI remains responsible for executing the same TS tests on Windows and Linux. |
| Runtime lifecycle tests | New runtime tests use `std::env::temp_dir()` and existing `Path::join()` patterns instead of hard-coded `/tmp` or `\\` paths. They exercise lifecycle state projection and coordinator behavior without shell/process launch branching. | Local run cannot prove Windows process behavior; this batch did not change process termination or platform-specific launch code. |
| Existing runtime process parser tests | Existing tests explicitly cover both Unix process rows and Windows `CommandLine` payloads, and those platform-shaped fixtures are bounded to parser behavior. | These parser tests are evidence for parsing semantics, not a substitute for live OS process smoke tests. |
| CI governance workflows | `.github/workflows/heavy-test-noise-sentry.yml` and `.github/workflows/large-file-governance.yml` both run on `ubuntu-latest`, `macos-latest`, and `windows-latest`. | CI parity evidence is pending until the branch runs in GitHub Actions. |

中文结论：本批新增内容没有引入新的平台分支、硬编码路径分隔符、POSIX shell quoting 或 Windows-only path 假设；无法在本地覆盖的三端执行风险已交给现有 CI matrix 承接。

## Impact Calibration

If this change is not executed:

- realtime failures will remain gray failures instead of contract failures
- runtime lifecycle regressions will keep surfacing as stuck/phantom UI state
- `AppShell` will continue to hide root-level type drift
- future bridge or platform changes can accidentally re-open the same failure class

If this change is executed:

- short-term implementation cost increases because tests and contracts come before behavior edits
- some hidden type and payload inconsistencies may surface as required fixes
- CI may catch more issues earlier, especially on Windows/macOS/Linux
- the core runtime/realtime path becomes easier to extend without guessing

## Open Questions

- Whether to generate TS event types from Rust `EngineEvent` in a later change.
- Whether to split `AppServerEvent.message` into typed variants in a later change.
- Whether to define a formal compatibility window for legacy realtime aliases.

These are intentionally deferred. 本次先稳定主干，不追求一次性完美。
