## Why

Memory Reference 当前仍以词面匹配为主，面对“之前分析过这个项目吗”“上次说的部署风险是什么”这类模糊回忆型问题时，容易因为没有复用标题、tag 或 summary 原词而漏召回。

本变更的目标是为 Project Memory 增加一个本地轻量语义召回层，让个人本地客户端在单项目数千条记忆规模下提升命中率，同时保持简单、可解释、可降级。

## 目标与边界

- 目标是做**本地 Project Memory 召回能力**，只用于 Memory Reference 检索候选记忆。
- 向量仅用于本地召回和排序，MUST NOT 注入主会话。
- 主会话仍只接收 retrieval pack / cleaner 产生的可读记忆详情与 `[Mx]` citation。
- MVP MUST NOT 引入向量数据库、ANN/HNSW 索引、SQLite vector extension、外部网络 embedding 服务或常驻后台检索服务。
- MVP SHOULD 面向个人项目规模：单 workspace 1k-10k 条记忆可用；数千条记忆视为主要目标规模。
- 语义召回 MUST 是 capability-detected optional path；不可用时 MUST 回退现有 lexical retrieval，不阻塞发送。
- MVP 的 provider 边界是先实现本地 embedding provider SPI、索引、扫描和 hybrid rerank；若当前客户端没有可用本地 provider，semantic retrieval SHALL 保持 disabled，不得伪造语义召回。
- 内置 embedding 模型、模型文件、native runtime 或新增大依赖不属于本变更默认实现范围；如必须引入，MUST 单独评审依赖、包体、跨平台打包和治理工作流兼容性。
- 本变更先做 OpenSpec 方案与可执行任务拆分；实现阶段需要单独按 tasks 推进。

## What Changes

- 增加本地语义召回的行为规范：query embedding、本地 embedding index、exact cosine scan、hybrid rerank、lexical fallback。
- 定义 Project Memory embedding document 构造原则：使用 title、tags、kind、userInput、assistantResponse、assistantThinkingSummary、detail、cleanText 等字段生成召回文本。
- 定义本地 embedding index 生命周期：create/update/delete/rebuild、contentHash、provider/version/dimensions 校验、stale index 处理。
- 定义召回结果解释字段：vectorScore、lexicalScore、tagScore、importanceBoost、recencyBoost、finalScore、matchedFields、retrievalMode。
- 定义黄金查询验收集要求，用于验证模糊回忆型查询在 topK 中稳定命中目标记忆。
- 保留当前 retrieval pack 注入协议，不改变主会话 payload 格式。
- 替换 `project-memory-consumption` 中“语义检索不在本变更实现”的旧约束：本变更进入实现后，语义召回成为 optional capability，而不是禁止项。

## 技术方案比较

### 方案 A：本地 exact cosine scan + sidecar/table index（推荐）

- 存储普通 float32 embedding vector 和 metadata。
- 查询时对当前 workspace 的向量做 exact cosine scan。
- 与 lexical candidates 合并后 hybrid rerank。
- 不依赖向量数据库，也不需要 ANN。
- 对个人客户端 1k-10k 条记忆规模足够简单、可控、可调试。

取舍：召回性能不是理论最优，但工程复杂度最低，跨平台打包风险最小，最符合当前产品规模。

### 方案 B：引入向量数据库或 ANN 索引（不用于 MVP）

- 例如 Qdrant、Chroma、SQLite vector extension、HNSW native index。
- 适合大规模、多租户、高并发或几十万级向量检索。
- 会引入安装、打包、跨平台 native 依赖、迁移和故障面。

取舍：当前单项目几千条记忆不需要这类复杂组件。长期如出现 50k+ memories/workspace 或明显性能瓶颈，再另开方案评估。

### 方案 C：纯 lexical search 继续优化（不足以解决目标问题）

- 继续增强关键词、tag、recency、importance 等规则。
- 成本最低，fallback 价值高。
- 但无法稳定处理语义改写、模糊回忆、指代型查询。

取舍：lexical 应保留为 fallback 和 hybrid rerank 组成部分，但不能作为第二阶段唯一能力。

## Capabilities

### New Capabilities

- `project-memory-local-semantic-retrieval`: 本地语义召回、embedding index、exact scan、hybrid rerank、fallback、解释性诊断与黄金查询验收。

### Modified Capabilities

- `project-memory-consumption`: Memory Reference SHALL 可使用本地语义召回候选，并保持 retrieval pack 注入协议不变。
- `project-memory-storage`: Project Memory SHALL 支持本地 embedding sidecar/table 的 workspace 隔离、版本化、contentHash、增量更新和删除同步。

## 非目标

- 不实现向量数据库接入。
- 不实现 ANN/HNSW 或 SQLite vector extension。
- 不要求外部网络 embedding API。
- 不把 embedding vector、embedding text 或相似度解释注入主会话。
- 不改变 `@@` 手动选择记忆的显式注入语义。
- 不改变 retrieval pack / cleaner 的主会话注入合同。
- 不承诺跨设备同步 embedding index；index 是本地可重建缓存。

## Impact

- Frontend: Memory Reference send path、Project Memory debug/diagnostics、可能的 index status UI。
- Backend / Tauri: Project Memory storage/index command、embedding index metadata、workspace-local vector load/scan。
- Storage: 新增本地 embedding sidecar/table 或等价本地缓存结构；必须可按 contentHash/version 重建。
- Tests: retrieval unit tests、hybrid rerank tests、index lifecycle tests、fallback tests、golden query regression tests。
- Dependencies: MVP SHOULD NOT add vector database dependencies. Embedding provider 必须本地化且 capability-detected；如未来需要内置模型依赖，需单独 proposal/review。
- CI Governance: 实现 MUST 兼容 `.github/workflows/heavy-test-noise-sentry.yml` 和 `.github/workflows/large-file-governance.yml`；开发与测试写法必须在 Node 20、`npm ci`、ubuntu/macos/windows 三平台矩阵下可运行。
- Heavy test noise: focused/golden/perf 测试不得输出未断言的 `console.log`、`console.warn`、`console.error`、React `act` warning 或大段 stdout/stderr payload；需要调试信息时应只在断言失败消息中输出候选摘要。
- Large file governance: 不得提交大模型、大体积 embedding fixture、大向量快照或超 policy 单文件；新增 hot path 文件应主动拆分，避免触发 `new` 或 `regressed` hard-debt。

## 验收标准

- 模糊回忆型黄金查询 top5 能命中预期 Project Memory。
- embedding/index 不可用时，Memory Reference 回退 lexical retrieval，并正常发送。
- 单 workspace 1k/5k/10k 条记忆 exact scan MUST 有可重复的本地 benchmark 或单元性能用例；发送路径不得同步等待全量重建，semantic 查询失败或超时必须回退 lexical。
- memory create/update/delete 后 index 不产生 silent stale result；stale 必须通过 contentHash/version 检测并重建或跳过。
- 召回 debug 输出能解释 finalScore 的组成，不只暴露一个黑盒相似度。
- 主会话 payload 中不包含 vector、embedding text 或内部 score。
- golden query fixture MUST 固化输入记忆、query、expected memoryId/topic、topK 和 diagnostics 输出，避免只靠人工主观判断。
- 开发验证 MUST 至少覆盖 heavy-test-noise parser/gate 兼容性与 large-file policy/baseline 兼容性；如只做文档变更，可记录 N/A 原因。
- `openspec validate project-memory-local-semantic-retrieval --strict --no-interactive` 通过。
