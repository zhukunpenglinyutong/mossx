## MODIFIED Requirements

### Requirement: 前端消息注入

系统 MUST 在用户发送消息前采用"手动选择优先 + 显式 Memory Reference"注入策略，并 SHALL 在本地语义召回可用时使用 semantic candidates 提升 Memory Reference 候选命中率。

#### Scenario: 本变更替换旧的语义检索禁止项

- **GIVEN** 既有主 spec 曾声明“语义检索不在本变更实现”
- **WHEN** 本变更进入实现、同步或归档
- **THEN** 该旧场景 SHALL 被移除或替换为 optional semantic retrieval 约束
- **AND** `project-memory-consumption` SHALL NOT 同时声明禁止 embedding 与允许本地 semantic retrieval

#### Scenario: Memory Reference 可使用本地语义候选

- **GIVEN** 本地 semantic retrieval capability 可用
- **WHEN** 用户开启 Memory Reference 并发送消息
- **THEN** 系统 SHALL 允许 semantic candidates 与 lexical candidates 一起进入候选合并和 rerank
- **AND** 最终注入到主会话的 Project Memory Retrieval Pack SHALL 保持现有格式
- **AND** 主会话 payload SHALL NOT 包含 embedding vector、embedding document text 或 internal score

#### Scenario: Semantic retrieval 不可用时回退

- **GIVEN** 本地 embedding provider、index 或向量扫描不可用
- **WHEN** 用户开启 Memory Reference 并发送消息
- **THEN** 系统 SHALL 回退现有 lexical retrieval
- **AND** SHALL NOT 因 semantic retrieval 失败阻塞发送
- **AND** Memory Reference 状态卡 SHALL 仍按单卡生命周期展示最终状态
