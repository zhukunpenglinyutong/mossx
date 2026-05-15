## MODIFIED Requirements

### Requirement: Workspace 隔离存储

系统 MUST 按 workspace 隔离 Project Memory embedding index，确保 semantic retrieval 不跨项目读取或返回记忆向量。

#### Scenario: Embedding index 按 workspace 隔离

- **GIVEN** workspace A 和 workspace B 均有 Project Memory embedding index
- **WHEN** 用户在 workspace A 中执行 Memory Reference semantic retrieval
- **THEN** 系统 SHALL 仅扫描 workspace A 的本地 embedding index
- **AND** SHALL NOT 读取或返回 workspace B 的 embedding records

### Requirement: 文件格式与结构

系统 MUST 为 Project Memory embedding index 保存可重建、可版本化、可检测 stale 的 metadata 与 vector data。

#### Scenario: Embedding index metadata

- **GIVEN** 系统为 Project Memory 保存本地 embedding index
- **WHEN** 写入或更新 embedding record
- **THEN** embedding record SHALL 包含 workspaceId、memoryId、providerId、modelId、embeddingVersion、dimensions、contentHash、memoryUpdatedAt、indexedAt
- **AND** vector data SHALL 作为本地可重建缓存存储
- **AND** 大型模型文件或大体积向量 fixture SHALL NOT 随测试资产提交，除非另有 large-file governance 审批

#### Scenario: Large file governance 兼容

- **WHEN** 系统新增 embedding index 存储、测试 fixture 或 provider 资产
- **THEN** repository SHALL NOT include generated index files, large vector JSON snapshots, or bundled model files by default
- **AND** tests SHALL prefer small textual fixtures and deterministic fake vectors generated at runtime
- **AND** changed source files SHALL remain compatible with `scripts/check-large-files.policy.json` thresholds and baseline rules

#### Scenario: Content hash 驱动重建

- **GIVEN** 某条 Project Memory 的 embedding record 已存在
- **WHEN** 记忆内容、embedding document version、providerId、modelId 或 dimensions 发生变化
- **THEN** 系统 SHALL 将该 embedding record 视为 stale
- **AND** SHALL 重建或跳过该 stale record 并回退其他可用召回路径

#### Scenario: 删除记忆同步删除 index

- **GIVEN** 某条 Project Memory 被删除
- **WHEN** 删除操作收敛
- **THEN** 系统 SHALL 删除或失效对应 memoryId 的 embedding record
- **AND** 后续 semantic retrieval SHALL NOT 返回已删除记忆
