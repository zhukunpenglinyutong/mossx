# project-memory-local-semantic-retrieval Specification

## Purpose
TBD - created by archiving change project-memory-local-semantic-retrieval. Update Purpose after archive.
## Requirements
### Requirement: 本地语义召回

系统 MUST 为 Project Memory 提供本地-only 的轻量语义召回能力，用于 Memory Reference 候选召回，并 SHALL 在语义能力不可用时回退现有 lexical retrieval。

#### Scenario: 本地 exact scan 召回

- **GIVEN** 当前 workspace 已有本地 embedding index
- **WHEN** 用户发送 Memory Reference 查询
- **THEN** 系统 SHALL 为查询生成本地 query embedding
- **AND** SHALL 对当前 workspace 的本地向量执行 exact cosine scan
- **AND** SHALL 返回 topK semantic candidates 参与后续 rerank

#### Scenario: 不依赖向量数据库

- **WHEN** 系统执行 MVP 语义召回
- **THEN** 系统 MUST NOT 要求 Qdrant、Chroma、Pinecone、SQLite vector extension、HNSW native index 或其他向量数据库组件
- **AND** SHALL 使用本地 sidecar/table 中的普通向量数据完成扫描

#### Scenario: 不依赖外部网络服务

- **WHEN** 系统执行 MVP 语义召回
- **THEN** 系统 MUST NOT 要求外部网络 embedding API
- **AND** semantic retrieval SHALL 仅在本地 provider 可用时启用
- **AND** provider 不可用时 SHALL 回退 lexical retrieval

#### Scenario: Provider 能力必须真实可检测

- **GIVEN** 当前客户端没有可用的本地 embedding provider
- **WHEN** 用户开启 Memory Reference 并发送消息
- **THEN** semantic retrieval status SHALL 为 `unavailable`
- **AND** 系统 SHALL 执行 lexical retrieval
- **AND** 系统 MUST NOT 使用 fake/test provider 或 lexical 分数伪装 semantic candidate

#### Scenario: 向量不进入主会话

- **WHEN** 系统将检索结果注入主会话
- **THEN** 主会话 payload MUST NOT 包含 embedding vector
- **AND** MUST NOT 包含 embedding document text
- **AND** MUST NOT 包含内部 vector score 明细
- **AND** SHALL 继续使用现有 Project Memory Retrieval Pack 和 cleaner 输出

### Requirement: Hybrid rerank 与可解释性

系统 MUST 将 semantic candidates 与 lexical candidates 合并，并 SHALL 输出可解释的 rerank diagnostics。

#### Scenario: 候选合并

- **GIVEN** lexical retrieval 与 semantic retrieval 均返回候选
- **WHEN** 系统合并候选
- **THEN** 系统 SHALL 按 memoryId 去重
- **AND** SHALL 保留每条候选的 semantic 与 lexical 信号

#### Scenario: 组合评分

- **WHEN** 系统对候选记忆排序
- **THEN** 系统 SHALL 计算 finalScore
- **AND** finalScore SHALL 至少可由 vectorScore、lexicalScore、tagScore、importanceBoost、recencyBoost 中的可用项解释
- **AND** 缺失的 semantic score SHALL NOT 阻止 lexical candidate 参与排序

#### Scenario: Debug 可解释

- **WHEN** 系统记录 Memory Reference 召回 diagnostics
- **THEN** diagnostics SHALL 包含 retrievalMode
- **AND** SHALL 包含每条候选的分数组成或不可用原因
- **AND** SHALL NOT 记录完整私密记忆正文

### Requirement: Golden query 验收

系统 MUST 使用黄金查询集验证本地语义召回对模糊回忆型查询的提升。

#### Scenario: 模糊回忆查询命中

- **GIVEN** 黄金查询集中存在预期 memoryId 或主题标签
- **WHEN** 系统执行 semantic + hybrid retrieval
- **THEN** 预期记忆 SHOULD 出现在 top5 candidates
- **AND** 未命中时测试 SHALL 输出候选与分数组成用于调参

#### Scenario: Fallback 不退化发送

- **GIVEN** 本地 embedding provider 不可用
- **WHEN** 用户发送 Memory Reference 查询
- **THEN** 系统 SHALL 继续执行 lexical retrieval
- **AND** 消息发送 SHALL 不被 semantic retrieval 阻塞

#### Scenario: Golden fixture 可复现

- **WHEN** 系统定义 golden query 验收
- **THEN** fixture SHALL 固化输入记忆、query、expected memoryId 或 expected topic、topK 与 acceptable retrieval mode
- **AND** 失败输出 SHALL 包含候选 id/title、retrievalMode、finalScore 与 score components
- **AND** fixture MUST NOT 依赖大模型文件或大量日志输出

#### Scenario: Heavy test noise 兼容

- **WHEN** 系统新增 semantic retrieval、golden query 或性能边界测试
- **THEN** passing tests SHALL NOT emit raw stdout/stderr payloads
- **AND** SHALL NOT produce React `act` warnings
- **AND** diagnostics SHALL be limited to assertion failure messages or compact structured summaries

#### Scenario: 三平台 npm CI 兼容

- **WHEN** 系统新增 retrieval scripts、fixtures 或 test helpers
- **THEN** 它们 SHALL run under Node 20 and `npm ci`
- **AND** SHALL be compatible with ubuntu-latest, macos-latest, and windows-latest
- **AND** SHALL use repo-relative paths or platform-safe path helpers instead of POSIX-only shell assumptions

### Requirement: Semantic availability honesty

The system SHALL report production semantic retrieval only when a real production local embedding provider is available and used by the Memory Reference send path.

#### Scenario: No provider is lexical fallback

- **WHEN** the user sends a Memory Reference query and no production semantic provider is configured
- **THEN** semantic retrieval SHALL be reported as unavailable or absent
- **AND** retrievalMode SHALL remain `lexical`
- **AND** the system MUST NOT label lexical fallback as semantic or hybrid retrieval

#### Scenario: Test provider is not production capability

- **WHEN** semantic tests use fake or test-scoped providers
- **THEN** those tests SHALL NOT be used as evidence that production vector retrieval is enabled
- **AND** production send-path tests SHALL verify behavior without `allowTestProvider`
