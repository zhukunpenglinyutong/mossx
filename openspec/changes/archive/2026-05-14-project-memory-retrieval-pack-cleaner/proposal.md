## Why

Phase 3 restored explicit Project Memory reference, but the current `Memory Brief` is still a UI-oriented summary. The main conversation can receive the injected block and still fail to use it because the block lacks detailed evidence, stable citations, and a clear "use these memories" protocol.

This change upgrades memory consumption from "summary injection" to a traceable retrieval pack: retrieve candidate memories, optionally clean them in a restricted pre-send step, inject detailed memory records with stable indexes, and instruct the main conversation to answer with the cleaned context and source citations.

## 目标与边界

- `@@` manual memory references SHALL inject the selected memory records as detailed evidence, not only summary snippets.
- Memory Reference one-shot auto association SHALL use retrieval only to select candidate memories; the final injected context SHALL contain detailed records for selected candidates.
- The injected pack SHALL include stable per-send indexes such as `[M1]`, `[M2]`, tied to `memoryId`, `threadId`, `turnId`, `engine`, and `updatedAt`.
- A restricted Memory Cleaner pre-send step SHALL clean, deduplicate, classify relevance, surface conflicts, and produce a structured cleaned context for the main conversation.
- The main conversation SHALL receive both cleaned context and source records, plus explicit instructions to apply relevant memories when answering.
- UI associated-resource cards SHALL use the same memory indexes as the injected pack, so user-visible resources and model-visible context stay aligned.

## CI governance constraints

This change SHALL remain compatible with the repository's cross-platform CI sentries:

- `.github/workflows/heavy-test-noise-sentry.yml` runs `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs` and `npm run check:heavy-test-noise` on Ubuntu, macOS, and Windows.
- `.github/workflows/large-file-governance.yml` runs `node --test scripts/check-large-files.test.mjs`, `npm run check:large-files:near-threshold`, and `npm run check:large-files:gate` on Ubuntu, macOS, and Windows.

Implementation and tests for this change SHALL therefore:

- avoid noisy `console.log` / `console.warn` / `console.error` output in Vitest and Node test runs, especially full memory bodies, cleaned context, prompts, or injected pack text;
- keep diagnostic assertions on metadata only: status, counts, ids, character lengths, elapsed time, and truncation flags;
- keep new source/test/style files below the active large-file governance thresholds by splitting pack builder, cleaner, parser, UI presentation, and tests into focused modules;
- use cross-platform path and shell-compatible scripts, with no POSIX-only command assumptions inside tests or package scripts used by the CI sentries;
- avoid creating persistent test artifacts outside ignored/runtime artifact paths, and never require checked-in large generated snapshots to validate pack output.

## 非目标

- This change SHALL NOT add embedding, vector databases, cloud sync, or cross-workspace memory search.
- Memory Cleaner SHALL NOT read project files, README, OpenSpec, Trellis, Git status, shell output, or external tools.
- Memory Cleaner SHALL NOT write Project Memory, mutate memory records, or become a general-purpose agent platform.
- This change SHALL NOT make Memory Reference a persistent global auto-injection setting; it remains one-shot and user-triggered.
- This change SHALL NOT remove existing history replay behavior; it extends the injected context contract that history loaders must preserve.

## What Changes

- Replace `Memory Brief` as the model-facing payload with a `Project Memory Retrieval Pack`.
- Preserve summary previews for UI, but stop treating summary as the only prompt context.
- Add detailed source records for both `manual-selection` and `memory-scout` sources.
- Add stable memory indexes and citation metadata into the injected context block.
- Add a Memory Cleaner contract that runs before the main send when Memory Reference is enabled, with strict read-only input boundaries.
- Add a main-conversation instruction section that tells the model to use cleaned memory context, cite `[Mx]` records when useful, and explicitly ignore irrelevant records.
- Keep degraded behavior: if retrieval or cleaning fails, send the user message without blocking.
- No intentional breaking change to stored Project Memory schema; this is a send-time consumption contract change.

## 技术方案取舍

### Option A: Continue injecting short summaries only

- Pros: small context footprint, minimal implementation change.
- Cons: weak grounding, poor source traceability, main model can ignore the memory, and user cannot verify whether a cited fact came from the selected memory.

### Option B: Inject full detailed records directly

- Pros: strong evidence, easy to reason about, directly fixes `@@` manual selection semantics.
- Cons: larger context footprint, duplicated/noisy records can distract the main model, conflicts may remain unresolved.

### Option C: Retrieval Pack with Memory Cleaner

- Pros: keeps detailed evidence, adds cleaned task-relevant facts, preserves citations, handles conflict/irrelevance before the main answer, and remains testable as a pre-send contract.
- Cons: more moving parts, needs timeout/degradation logic and a stricter output schema.

Decision: choose Option C. Manual `@@` can use the same pack format without automatic retrieval; Memory Reference adds retrieval and cleaner before building the pack.

## Capabilities

### New Capabilities

- `project-memory-retrieval-pack-cleaner`: Defines the retrieval pack, detailed source record format, stable memory indexes, Memory Cleaner read-only contract, and main-conversation usage instructions.

### Modified Capabilities

- `project-memory-consumption`: Changes model-facing memory injection from brief/summary-oriented blocks to detailed retrieval packs with explicit source records and degraded send behavior.
- `composer-manual-memory-reference`: Clarifies that `@@` selected memories are injected as detailed evidence records with stable indexes, while UI previews may remain compact.

## 验收标准

- Sending with one selected `@@` memory injects a pack containing that memory's detailed fields, including user input, assistant response when available, source metadata, and a stable `[M1]` index.
- Sending with Memory Reference enabled retrieves candidate memories, runs the cleaner contract when candidates exist, and injects cleaned context plus detailed source records.
- The main prompt includes explicit instructions to apply relevant memories and preserve `[Mx]` citations when using facts.
- UI associated-resource cards show the same `[Mx]` indexes as the injected pack and remain separate from the user bubble.
- Retrieval or cleaner timeout/failure does not block sending and does not log full memory bodies.
- Auto-captured Project Memory canonical `userInput` remains the user's visible input, not the injected pack.
- Existing Codex/Claude/Gemini send paths use the same pack contract.
- Heavy test noise sentry and large-file governance sentry commands pass locally before implementation is considered ready for review.

## Impact

- Frontend send orchestration: `src/features/threads/hooks/useThreadMessaging.ts`.
- Project Memory consumption utilities: `src/features/project-memory/utils/memoryContextInjection.ts`, `memoryScout.ts`, and likely a new retrieval-pack/cleaner utility.
- Composer manual memory flow: `src/features/composer/**`.
- Message render/history replay: `src/features/messages/**`, `src/features/threads/loaders/**`.
- Tests: focused Vitest coverage for manual `@@`, Memory Reference retrieval pack, cleaner degradation, UI associated cards, and Codex history replay.
- No new runtime dependency is expected for the first implementation; cleaner can start as a deterministic restricted transformer behind the same contract.
- CI governance: implementation must stay compatible with the two existing sentry workflows without weakening their parser tests, hard gates, or cross-platform matrix.
