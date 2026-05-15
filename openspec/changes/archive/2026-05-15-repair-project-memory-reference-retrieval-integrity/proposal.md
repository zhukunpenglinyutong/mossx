## Why

Project Memory local semantic retrieval was marked complete, but production Memory Reference does not pass a real embedding provider into the retrieval path. In practice, users who enable Memory Reference still get lexical fallback only, and short recall questions such as "我是谁" can miss existing memories like "我是陈湘宁...".

This change is a corrective follow-up: make the implementation honest against the previous proposal, repair the production recall failure first, and prevent test-only semantic code from being reported as production vector retrieval.

## Audit Findings

- `project-memory-local-semantic-retrieval` task 3.1 was marked complete, but `useThreadMessaging.ts` calls `scoutProjectMemory()` without `semanticProvider`; production sends do not execute vector retrieval.
- Task 1.3 claimed workspace-local embedding sidecar/index storage, but current code builds in-memory records per call and has no persisted sidecar/table lifecycle.
- Task 3.3 claimed golden semantic query coverage, but the tests use deterministic fake vectors with `allowTestProvider`; they do not prove production semantic retrieval.
- The current lexical fallback delegates first-pass candidate filtering to backend `contains(query)`, so Chinese short recall queries can miss saved memories even when relevant content exists in the workspace.

## 目标与边界

- P0: Make Memory Reference fallback recall reliable enough for real use when semantic provider is unavailable.
- P0: Ensure the UI/debug contract clearly reports lexical fallback instead of implying vector retrieval.
- P0: Add regression coverage for identity recall: a saved memory containing "我是陈湘宁..." MUST be considered for "我是谁".
- P0: Keep main conversation payload limited to retrieval pack / cleaner output; no vectors, embedding documents, or score internals in prompts.
- P1: Keep existing semantic/vector SPI code as non-production capability until a real local embedding provider is explicitly added.
- P1: Do not re-archive or silently rewrite the historical change; this corrective change records the mismatch and closes the implementation gap.

## 非目标

- Do not add a network embedding service.
- Do not add vector database, ANN/HNSW, SQLite vector extension, or model files.
- Do not claim production vector retrieval without a real local embedding provider.
- Do not migrate Project Memory storage format beyond what is necessary for better fallback recall.
- Do not change manual `@@` explicit memory selection semantics.

## What Changes

- Memory Reference will request a broader workspace candidate set when no real semantic provider is available, then rank candidates locally using existing multi-field scoring.
- The fallback candidate fetch will scan bounded pages instead of only the first page, so older but still relevant identity memories are not excluded at candidate time.
- The fallback scorer will support recall-intent queries such as "我是谁", "我叫什么", "你知道我是谁吗", and will consider identity/name evidence in user-owned memory fields.
- Identity recall ranking will prefer relevance over importance for that specific intent, while preserving existing importance-first ordering for ordinary queries.
- Diagnostics will distinguish `semanticStatus: unavailable` from `retrievalMode: lexical`, so debug output is explicit about fallback.
- Tests will cover the production send path and pure retrieval path, including the "我是陈湘宁" -> "我是谁" regression.
- OpenSpec tasks will explicitly separate production fallback repair from future real local embedding provider work.

## 技术方案对比

### 方案 A: 先修 lexical fallback 候选召回与身份回忆规则（推荐）

- Memory Reference 不再先用 backend `contains(query)` 截断候选。
- 拉取当前 workspace bounded multi-page 候选，再用前端 multi-field scorer 和 recall intent ranking 选择注入记录。
- 身份 recall 只从用户输入、detail、cleanText 等用户侧证据提升，不把助手自我介绍当作用户身份。
- 不引入新依赖，不改变主会话 payload，能立刻修复用户可见 miss。

取舍：这不是 vector retrieval，但它诚实、可验证、风险低，能先补上当前生产缺口。

### 方案 B: 立即接入真实本地 embedding provider

- 需要选择本地 embedding 模型/runtime、打包策略、跨平台依赖、模型文件治理和性能门禁。
- 可真正实现 vector retrieval，但会引入包体、启动、兼容性和治理风险。

取舍：不适合作为本次止血修复。应另开 proposal 做依赖评审和跨平台方案。

### 方案 C: 继续依赖 backend `contains(query)`

- 代码改动最小。
- 但无法解决 "我是谁"、"之前我怎么说的" 这类短问句和语义改写。

取舍：这是当前 bug 的直接来源，不能继续作为 Memory Reference 的唯一候选入口。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `project-memory-consumption`: Memory Reference fallback retrieval MUST not miss obvious recall-intent memories solely because the raw query is not a contiguous substring.
- `project-memory-local-semantic-retrieval`: Semantic/vector retrieval status MUST reflect real provider availability; test/fake providers and lexical fallback MUST NOT be reported as production semantic retrieval.
- `project-memory-retrieval-pack-cleaner`: Retrieval pack injection MUST continue to receive detailed source records from the repaired candidate selection path.

## Impact

- Frontend: `src/features/project-memory/utils/memoryScout.ts`, `memoryContextInjection.ts`, focused tests, and `useThreadMessaging` diagnostics/tests.
- Backend/Tauri: no required command changes for P0; optional future backend search broadening may be deferred.
- Storage: no new model files, vector sidecar, or data migration in P0.
- Tests: add regression tests for identity recall, broad candidate fallback, semantic unavailable diagnostics, and production send path.

## 验收标准

- With a memory containing "我是陈湘宁...", Memory Reference query "我是谁" injects that memory through retrieval pack.
- Identity recall still works when the relevant memory is beyond the first 200 fallback candidates but within the bounded scan limit.
- Assistant self-introductions such as "我是 Codex" are not treated as user identity evidence for "我是谁".
- Production `useThreadMessaging` Memory Reference path reports lexical fallback / semantic unavailable when no provider is configured.
- No test/fake semantic provider is used in production send path.
- Main conversation payload still excludes vectors, embedding documents, and internal score details.
- Focused project-memory and thread messaging tests pass.
- `npm run typecheck`, `npm run lint`, and OpenSpec strict validation pass.
