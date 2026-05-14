## Context

Current Project Memory consumption has two separate paths:

- `@@` manual reference: user explicitly chooses memory ids, and send orchestration injects selected records.
- Memory Reference: user arms a one-shot toggle, Scout retrieves candidate memories, then injects a short `Memory Brief`.

The current implementation proves the transport works, but the prompt contract is weak. A summary-only brief can be displayed as an associated resource while the main model still ignores it or treats it as low-confidence context. The system needs a model-facing evidence pack with stable indexes and an explicit usage protocol.

## Goals / Non-Goals

**Goals:**

- Use one model-facing Project Memory pack contract for `manual-selection` and `memory-scout`.
- Inject detailed memory evidence records, including canonical conversation turn fields where available.
- Preserve stable `[M1]` style indexes across injected prompt blocks and UI associated-resource cards.
- Add a restricted Memory Cleaner step for Memory Reference before the main conversation receives context.
- Keep send behavior non-blocking: retrieval/cleaner failure degrades to normal send.
- Keep canonical auto-captured `userInput` clean and equal to the visible user request.

**Non-Goals:**

- No vector search, embedding store, or new runtime dependency in the first implementation.
- No cross-workspace retrieval.
- No project file reads, shell/Git execution, writes, or general agent orchestration from Memory Cleaner.
- No persistent automatic memory injection setting.

## Decisions

### Decision 1: Replace Memory Brief with Project Memory Retrieval Pack

The model-facing payload will be a retrieval pack:

```text
<project-memory-pack source="manual-selection|memory-scout" count="2" cleaned="true">
Cleaned Context:
- [M1] ...

Conflicts:
- none

Source Records:
[M1] memoryId=...
title=...
threadId=... turnId=... engine=... updatedAt=...
Original user input:
...
Original assistant response:
...

Instruction:
Use relevant records as prior project context. Preserve [Mx] citations when applying facts.
</project-memory-pack>

<user request>
```

Alternative considered: keep `<project-memory>` brief and add stronger wording. Rejected because the main model still lacks detailed source evidence and cannot verify or cite facts.

### Decision 2: Detailed records are required, but still budgeted

Detailed injection does not mean unlimited raw transcript dumping. Each selected memory record should include the most important canonical fields:

- `memoryId`, index, source type, title, record kind.
- `threadId`, `turnId`, `engine`, `updatedAt` when available.
- `userInput`.
- `assistantResponse`.
- `assistantThinkingSummary` when available.
- `detail` or `cleanText` only as fallback for legacy/manual records.

Budgeting should happen at record/section boundaries. If truncation is required, the pack must mark which record or field was truncated rather than silently replacing details with a summary.

Alternative considered: full records without truncation. Rejected because large histories can consume the entire context window and degrade the actual user task.

### Decision 3: Memory Cleaner is a restricted pre-send transformer

Memory Cleaner runs before the main send and receives only:

- visible user request,
- retrieved Project Memory records,
- per-record metadata and indexes.

It returns structured output:

- `relevantFacts`: fact statements with `[Mx]` citations,
- `irrelevantRecords`: indexes with reasons,
- `conflicts`: contradictory or uncertain facts,
- `confidence`: deterministic or model-derived confidence label,
- `cleanedContextText`: compact text for prompt injection.

It must not read project files, execute tools, write memory, or call arbitrary runtime agents. First implementation can be deterministic. A later model-backed cleaner can replace it only behind the same contract.

Alternative considered: instruct the main conversation to spawn a sub-agent itself. Rejected because that is not reliably testable, varies by engine, and turns memory grounding into a hidden model behavior instead of an application-level contract.

### Decision 4: UI card and prompt pack share indexes

Message rendering should keep Project Memory resources outside the user bubble, but each card must display the same `[Mx]` index that the model saw. This keeps debugging and user trust aligned: when the assistant uses `[M2]`, the user can inspect the `[M2]` associated resource.

Alternative considered: UI-only card ids independent from prompt ids. Rejected because it creates drift between visible resources and model-visible citations.

### Decision 5: Keep retrieval deterministic first

The initial retrieval improvement should be lexical and deterministic:

- broaden search beyond exact full-query `contains`,
- score against title, summary, tags, userInput, assistantResponse, detail/cleanText,
- retain current workspace and obsolete filtering,
- sort stably by relevance, importance, recency, id.

Embedding or semantic search is intentionally deferred.

### Decision 6: Treat CI sentries as implementation constraints, not afterthoughts

The implementation must be shaped to pass the existing cross-platform sentries:

- Heavy Test Noise Sentry installs with `npm ci`, runs Node 20, validates parser tests, then runs `npm run check:heavy-test-noise` across Ubuntu, macOS, and Windows.
- Large File Governance Sentry installs with `npm ci`, runs Node 20, validates parser tests, then runs the near-threshold watch and hard-debt gate across Ubuntu, macOS, and Windows.

This creates several design constraints:

- Retrieval pack tests should assert parsed structure instead of printing prompt bodies or relying on large inline snapshots.
- Cleaner/retrieval diagnostics should expose metadata-only summaries that tests can inspect without stdout/stderr payload noise.
- Pack builder, cleaner, parser, presentation adapter, and history adapter should be separate small modules to avoid creating large-file debt in `src/features/threads`, `src/features/messages`, `src/features/composer`, and `src/styles`.
- Tests must use Node/Vitest APIs that work on Windows paths and line endings. Avoid shell pipelines, POSIX path literals, and platform-specific temp paths.
- Generated prompt samples used in tests should be compact fixtures or builders, not checked-in full transcript dumps.

Alternative considered: implement first and rely on release gates to catch sentry failures. Rejected because this change touches prompt strings, diagnostics, tests, message UI, and history replay; these are exactly the surfaces that can create noisy test output or oversized files if not designed upfront.

## Risks / Trade-offs

- [Risk] Detailed records consume more context. → Mitigation: pack-level and field-level budgets with explicit truncation markers.
- [Risk] Cleaner summary becomes untrusted second-hand context. → Mitigation: always include source records alongside cleaned context.
- [Risk] Cleaner failure blocks sends. → Mitigation: hard timeout and degraded normal send.
- [Risk] Full memory bodies leak into logs/tests. → Mitigation: diagnostics contain counts, ids, chars, status, and elapsed time only.
- [Risk] Engine-specific behavior diverges. → Mitigation: one pack builder used by Claude, Codex, Gemini, and history replay.
- [Risk] New tests or large prompt fixtures fail CI governance. → Mitigation: no full-body test logging, no large snapshots, module splitting before files approach warning thresholds, and local execution of both sentry command sets before review.

## Migration Plan

1. Add Retrieval Pack types and builder utilities.
2. Change manual `@@` injection to use Retrieval Pack with detailed selected records.
3. Change Memory Reference to retrieve candidate records, run cleaner, then build pack.
4. Update message parsing/rendering to show associated resources with stable `[Mx]` indexes.
5. Update Codex/Claude/Gemini tests and history loader tests.
6. Keep old `<project-memory>` parser compatibility for existing history.
7. Run heavy-test-noise and large-file governance sentries locally before implementation review.

Rollback:

- Disable Memory Cleaner and emit packs with source records only.
- If pack injection regresses, fall back to current one-shot no-injection behavior while preserving UI toggle and manual selection state.

## Open Questions

- Should Memory Cleaner initially be deterministic only, or should a model-backed cleaner be introduced behind a feature flag?
- What is the first budget limit for detailed records per send: fixed chars, model-aware token estimate, or engine-specific default?
- Should assistant answers surface `[Mx]` citations visibly by default, or only when the user asks "what memory did you use"?
