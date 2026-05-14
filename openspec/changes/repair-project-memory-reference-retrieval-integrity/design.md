## Context

The archived `project-memory-local-semantic-retrieval` change created useful semantic retrieval utilities, but production Memory Reference does not provide a real embedding provider. The actual send path therefore falls back to lexical retrieval, and the fallback currently asks the backend to filter candidates with a raw contiguous `contains(query)` check before frontend ranking runs.

That design fails short recall questions. A saved memory may contain `我是陈湘宁你是谁...`, while the later query is `我是谁`; the backend substring filter returns no candidate, so cleaner/retrieval-pack logic never sees the relevant memory.

## Goals / Non-Goals

**Goals:**

- Repair production Memory Reference fallback recall when semantic provider is unavailable.
- Make diagnostics honest: semantic unavailable is not semantic/vector retrieval.
- Add regression coverage for identity recall and production send behavior.
- Preserve retrieval pack and cleaner contracts.

**Non-Goals:**

- Add a real local embedding model/provider.
- Add vector database, ANN index, model files, or network embedding service.
- Rewrite existing Project Memory storage.
- Change manual `@@` selection behavior.

## Decisions

### Decision: Broad candidate fallback before local ranking

When no production semantic provider is configured, Memory Reference SHALL fetch broad current-workspace candidates with `query: null` and rank locally. The fallback scan is bounded and may span multiple pages up to an explicit maximum, instead of trusting the first backend page as the full candidate universe. This prevents backend substring filtering and recency-only first-page truncation from discarding semantically relevant memories before frontend scoring.

Alternative considered: change Rust search to token-based matching. That helps all callers, but it still leaves Memory Reference dependent on backend query semantics and does not solve recall-intent ranking. We can improve backend search later; the critical send path should own its candidate policy.

### Decision: Recall-intent boost is lexical fallback, not fake semantic

Queries such as `我是谁`, `我叫什么`, `你知道我是谁吗`, `之前我说过我是谁吗` SHALL trigger identity/name recall scoring. For this specific intent, ranking SHALL prefer relevance over importance so exact identity evidence is not displaced by weakly related high-importance memories. This is still `retrievalMode: lexical`; it MUST NOT be reported as semantic.

Identity evidence SHALL be derived from user-owned fields such as `userInput`, `detail`, and `cleanText`, with patterns constrained to user identity phrasing. Assistant self-introductions in `assistantResponse`, such as `我是 Codex`, MUST NOT be promoted as user identity evidence.

Alternative considered: use the existing fake semantic provider in production. Rejected because it would violate the previous proposal and create another false capability.

### Decision: Keep semantic provider optional and explicit

`scoutProjectMemory` already accepts `semanticProvider`; production will continue to omit it until a real provider exists. The fallback result should expose semantic diagnostics or a fallback reason that can be surfaced in debug payloads.

Alternative considered: add a placeholder production provider. Rejected because no reviewed dependency/model/runtime exists in the repository.

### Decision: Tests must hit production-shaped calls

Unit tests for vector utilities remain useful, but this repair requires tests around `scoutProjectMemory()` without a provider and `useThreadMessaging` Memory Reference send path. These tests must fail if production only works with `allowTestProvider`.

## Risks / Trade-offs

- Broad candidate fetch may scan more memories in frontend. Mitigation: cap fallback page size, cap total fallback scan items, and keep ranking pure/in-memory.
- Identity recall can over-select name-like memories. Mitigation: restrict boosts to recall-intent queries, use user-owned evidence fields, keep max injected count small, and preserve ordinary query ordering outside identity recall.
- Diagnostics may reveal implementation limitations. Mitigation: this is intended; honest fallback state is required for trust.

## Migration Plan

1. Add corrective specs/tasks.
2. Implement broad fallback candidate selection and identity recall scoring.
3. Add focused tests for pure retrieval and production send path.
4. Validate OpenSpec, typecheck, lint, and focused tests.

Rollback is limited to reverting this change; no storage migration is introduced.
