## Design

### Problem Statement

Memory Reference 当前召回主要依赖词面重合。用户用模糊回忆、同义表达、指代式问题时，现有 lexical path 可能在候选阶段就漏掉相关 Project Memory，后续 cleaner 无法补救。

本设计增加本地轻量语义召回层，只扩展候选召回与排序，不改变主会话注入协议。

### Core Principles

- Local-first: MVP 不依赖外部网络服务、向量数据库或常驻检索服务。
- Small-scale exactness: 面向单 workspace 1k-10k 条记忆，使用 exact cosine scan。
- Optional semantic path: semantic retrieval 必须 capability-detected，可用则参与 hybrid retrieval，不可用则回退 lexical。
- No vector injection: vector、embedding text、internal scores 不进入主会话。
- Explainable retrieval: debug/diagnostics 必须能解释命中原因和分数组成。
- Provider honesty: 没有可用本地 embedding provider 时，系统必须明确处于 `unavailable`，不得用 lexical 分数伪装 semantic score。

### Retrieval Pipeline

```text
user query
  -> build query embedding if local provider is available
  -> lexical retrieval candidates
  -> semantic exact-scan candidates
  -> merge by memoryId
  -> hybrid rerank
  -> top records
  -> existing cleaner
  -> existing project-memory-pack
  -> main conversation
```

If semantic retrieval is unavailable at any point, pipeline becomes:

```text
user query
  -> lexical retrieval candidates
  -> existing rerank / cleaner / pack
```

### Embedding Document Construction

Each memory should build a deterministic embedding document from detailed fields, not only title or summary:

```text
Title: <title>
Tags: <tags>
Kind: <recordKind/kind>
User input: <userInput>
Assistant thinking summary: <assistantThinkingSummary>
Assistant response: <assistantResponse>
Detail: <detail>
Clean text: <cleanText>
```

Rules:

- Empty fields are omitted.
- Field labels are stable and versioned.
- The document text is used only for embedding generation and local indexing.
- The document text MUST NOT be injected into the main conversation.

### Local Index

MVP should store embeddings as local rebuildable cache, preferably in the same local persistence layer as Project Memory if practical.

Required metadata:

```text
workspaceId
memoryId
providerId
modelId
embeddingVersion
dimensions
contentHash
vectorBlob
memoryUpdatedAt
indexedAt
```

`vectorBlob` should be float32 binary when stored in backend/local storage. JSON arrays are acceptable only for tests or temporary debugging fixtures.

### Local Embedding Provider Strategy

MVP introduces an embedding provider boundary instead of hard-coding a third-party vector stack.

Provider contract:

```text
providerId
modelId
dimensions
embeddingVersion
embed(text) -> normalized float32 vector
health() -> available | unavailable | error
```

Rules:

- The runtime provider MUST be local and capability-detected.
- The runtime provider MUST NOT require an external network embedding API.
- The runtime provider MUST NOT require vector database components.
- If no provider is available, semantic retrieval remains disabled and lexical fallback is the correct behavior.
- Tests MAY use deterministic fake vectors, but production code MUST NOT confuse fake/test providers with available semantic retrieval.
- Adding bundled model files, native inference runtime, or large binary assets is outside the default MVP and requires separate dependency/package-size review.

### Exact Cosine Scan

For MVP:

- Normalize vectors at write time when possible.
- Query vector is normalized before scan.
- Similarity can be dot product for normalized vectors.
- Scan only current workspace index.
- Keep topK with a bounded heap/list.

This avoids ANN complexity while staying enough for a few thousand memories.

### Hybrid Rerank

Final ranking should combine semantic and existing lexical signals:

```text
finalScore =
  vectorScore * vectorWeight
  + lexicalScore * lexicalWeight
  + tagScore * tagWeight
  + importanceBoost
  + recencyBoost
```

Weights are config/constants in implementation and must be test-covered. The exact numbers are implementation details and may be tuned, but every result should carry component scores for debug.

### Index Lifecycle

- Create memory: enqueue or immediately build embedding if provider available.
- Update memory: recompute contentHash; rebuild if hash/version/provider/dimensions changed.
- Delete memory: remove embedding entry.
- Provider/model/version change: mark index stale and rebuild lazily or explicitly.
- Corrupt/vector dimension mismatch: skip semantic entry and fall back without blocking send.
- Send path: never synchronously rebuild the full workspace index before sending; stale or incomplete records are skipped or marked `indexing`, then lexical fallback remains available.
- Timeout/error: query embedding or scan failures degrade to lexical retrieval and emit diagnostics, not user-visible send failure.

### Capability Detection

Semantic retrieval status should distinguish:

- `available`: provider and index usable.
- `indexing`: provider available, index incomplete.
- `unavailable`: no local provider.
- `stale`: index version/hash mismatch.
- `error`: provider/index failed; lexical fallback used.

Status priority during send:

```text
available -> use semantic + lexical hybrid
indexing -> use available indexed subset + lexical, mark partial diagnostics
stale -> skip stale records or use non-stale subset + lexical
unavailable/error -> lexical only
```

### Golden Query Evaluation

Before implementation is accepted, define a small golden set for fuzzy recall queries:

```text
“之前分析过 springboot-demo 吗”
“这个项目主要风险是什么”
“我之前说过 JWT 配置的问题吗”
“上次关于记忆注入我们定了什么方案”
“有没有提过 H2 数据库风险”
```

Each query must map to a fixture-defined expected memory id or topic label.

Fixture requirements:

- Input memories include detailed fields, not only title/summary.
- Expected result declares `topK`, expected memory id/topic, and acceptable retrieval mode.
- Failure output includes candidate ids, titles, retrievalMode, finalScore, and score components.
- Fixture text should stay small enough to satisfy heavy-test-noise and large-file governance.

MVP acceptance: expected record appears in top5 when a local provider is available; provider unavailable tests assert lexical fallback and successful send.

### Deployment And CI Compatibility

The implementation must stay compatible with the repository CI sentries:

- `.github/workflows/heavy-test-noise-sentry.yml`
- `.github/workflows/large-file-governance.yml`

Runtime/development assumptions:

- CI uses Node 20 and `npm ci`.
- Gates run on `ubuntu-latest`, `macos-latest`, and `windows-latest`.
- Scripts and fixtures must avoid POSIX-only path assumptions; use repo-relative paths and Node/Rust path helpers.
- New commands must work under npm scripts and should not require shell-specific syntax.

Heavy-test-noise compatible test writing:

- Do not leave `console.log`, `console.warn`, `console.error`, or raw debug dumps in tests.
- Do not introduce React state updates that produce `act` warnings.
- Do not print candidate lists, vectors, fixture bodies, or benchmark rows during passing tests.
- Put diagnostics in assertion failure messages or small structured objects, not unconditional stdout/stderr.
- If a focused perf guard is added, it must emit only a compact pass/fail summary.

Large-file compatible implementation:

- Do not commit bundled embedding models, generated index files, large vector JSON, or large snapshot fixtures.
- Keep golden fixtures small and textual; use deterministic fake vectors generated in test code.
- Split new files before they approach the policy thresholds used by `scripts/check-large-files.policy.json`.
- Avoid growing existing hot-path files under `src/features/threads/`, `src/features/messages/`, `src/features/composer/`, `src/features/git-history/`, `src/features/settings/`, `src/features/spec/`, `src/features/workspaces/`, `src/features/shared-session/`, and bridge/runtime files under `src-tauri/src/**`.
- Any future model packaging proposal must include package-size review, cross-platform build review, and large-file governance handling.

Suggested local gates for implementation PRs:

```bash
node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs
npm run check:heavy-test-noise
node --test scripts/check-large-files.test.mjs
npm run check:large-files:near-threshold
npm run check:large-files:gate
```

### Trade-off Decision

Chosen: local exact scan + sidecar/table index.

Rejected for MVP:

- Vector DB / ANN: unnecessary operational and packaging complexity.
- Pure lexical: cannot solve semantic/fuzzy recall.
- Remote embedding service: violates local-first and no-required-external-service constraint.

### Risks

- Local embedding provider may not exist yet. The architecture must allow semantic retrieval to remain disabled while fallback works.
- Embedding model quality will affect recall. Golden queries are required before tuning.
- Index rebuild can become slow if done synchronously. Implementation should prefer incremental/lazy work and visible index state.
- If a usable local embedding provider is not already present, the first implementation may land index/rerank/fallback infrastructure with semantic status `unavailable`; adding a bundled model remains a separate risk decision.
