# project-memory-retrieval-pack-cleaner Specification

## Purpose
TBD - created by archiving change project-memory-retrieval-pack-cleaner. Update Purpose after archive.
## Requirements
### Requirement: Project Memory Retrieval Pack
系统 SHALL 将本次发送关联的 Project Memory 组织为模型可使用的 Retrieval Pack，而不是只注入摘要。

#### Scenario: 详细记录注入
- **WHEN** 系统构建 Project Memory Retrieval Pack
- **THEN** 每条被注入的记忆 SHALL 包含稳定索引、memoryId、title、record kind、source type
- **AND** SHALL 包含所有可用的 threadId、turnId、engine、updatedAt
- **AND** conversation turn 记忆 SHALL 包含可用的 userInput、assistantResponse、assistantThinkingSummary

#### Scenario: 摘要仅作为 UI preview
- **WHEN** 系统为关联资源卡片或 Composer 状态生成 preview
- **THEN** 系统 MAY 使用 summary 或 compact title
- **AND** model-facing Retrieval Pack SHALL NOT 只依赖 summary 表达被引用记忆

#### Scenario: 稳定索引
- **WHEN** 同一次发送注入多条记忆
- **THEN** 系统 SHALL 为记录分配稳定索引如 `[M1]`、`[M2]`
- **AND** 这些索引 SHALL 同时出现在注入文本和 UI 关联资源中

### Requirement: Memory Cleaner 预发送清洗
系统 SHALL 在 Memory Reference 自动关联路径中支持受限 Memory Cleaner，用于在主会话前清洗候选记忆。

#### Scenario: Cleaner 输入边界
- **WHEN** Memory Cleaner 执行
- **THEN** Cleaner SHALL 只接收用户可见请求、候选 Project Memory 记录和记录索引
- **AND** Cleaner SHALL NOT 读取项目文件、README、OpenSpec、Trellis、Git 状态或 shell 输出

#### Scenario: Cleaner 输出结构
- **WHEN** Cleaner 返回结果
- **THEN** 结果 SHALL 包含 cleaned context
- **AND** SHALL 标注相关 facts 对应的 `[Mx]` citation
- **AND** SHALL 标注 irrelevant records、conflicts 或不确定项

#### Scenario: Cleaner 不产生副作用
- **WHEN** Cleaner 处理候选记忆
- **THEN** Cleaner SHALL NOT 创建、更新、删除 Project Memory
- **AND** SHALL NOT 执行 shell、Git、Tauri 写入命令或外部工具

### Requirement: 主会话记忆使用协议
系统 SHALL 在 Retrieval Pack 中加入明确指令，要求主会话基于相关记忆重新分析用户问题。

#### Scenario: 主会话使用 cleaned context
- **WHEN** Retrieval Pack 包含 cleaned context
- **THEN** 主会话提示 SHALL 要求模型将 cleaned context 作为 prior project context
- **AND** 在使用记忆事实时 SHALL 保留对应 `[Mx]` citation

#### Scenario: 主会话处理无关记忆
- **WHEN** Cleaner 标记某条记忆为 irrelevant
- **THEN** 主会话提示 SHALL 要求模型忽略该记录
- **AND** 不得把 irrelevant record 伪装成已使用事实

#### Scenario: 主会话处理冲突记忆
- **WHEN** Cleaner 或 pack 标记 conflicts
- **THEN** 主会话提示 SHALL 要求模型把冲突作为不确定上下文处理
- **AND** 不得把冲突内容合并成单一确定事实

### Requirement: Retrieval Pack 降级和隐私
系统 SHALL 保证检索、清洗、注入失败不阻断主消息发送，并保护记忆正文不进入诊断日志。

#### Scenario: Cleaner 超时降级
- **GIVEN** Memory Cleaner 在超时限制内未返回
- **WHEN** 主发送流程继续
- **THEN** 系统 SHALL 跳过 cleaned context 或使用未清洗 source records 的安全降级
- **AND** SHALL NOT 阻断主消息发送

#### Scenario: 检索失败降级
- **GIVEN** Project Memory 检索失败
- **WHEN** 系统捕获异常
- **THEN** 系统 SHALL 发送用户原始消息
- **AND** SHALL 记录不包含完整记忆正文的诊断状态

#### Scenario: 日志隐私
- **WHEN** 系统记录 Retrieval Pack、Cleaner 或注入诊断
- **THEN** 日志 SHALL 只包含状态、数量、ids、字符数和耗时
- **AND** SHALL NOT 输出完整 userInput、assistantResponse 或 cleaned context

### Requirement: 历史回放关联资源一致
系统 SHALL 在历史回放中保留 Retrieval Pack provenance，以便 UI 继续展示独立 Project Memory 关联资源。

#### Scenario: 用户气泡只显示真实输入
- **GIVEN** 历史 user payload 包含 Project Memory Retrieval Pack
- **WHEN** 消息时间线渲染用户消息
- **THEN** 用户气泡 SHALL 只显示用户真实输入
- **AND** Project Memory 关联资源 SHALL 作为独立卡片显示

#### Scenario: 关联卡片显示索引
- **GIVEN** Retrieval Pack 中包含 `[M1]` 和 `[M2]`
- **WHEN** 系统渲染 Project Memory 关联资源卡片
- **THEN** 卡片 SHALL 显示相同索引
- **AND** 索引 SHALL 对应 pack 中的 memoryId

### Requirement: Retrieval pack receives repaired fallback candidates

The system SHALL preserve Retrieval Pack and Cleaner contracts when Memory Reference candidates are selected by repaired lexical fallback ranking.

#### Scenario: Identity fallback candidate becomes source record

- **GIVEN** repaired fallback ranking selects an identity-related Project Memory record
- **WHEN** Memory Reference injects context into the main conversation
- **THEN** the selected memory SHALL be represented as a Retrieval Pack source record with stable `[Mx]` index
- **AND** the user-visible message SHALL remain the original user question

#### Scenario: Diagnostics do not leak memory body

- **WHEN** Memory Reference logs fallback retrieval diagnostics
- **THEN** diagnostics SHALL include status, mode, counts, ids, or elapsed time only
- **AND** diagnostics SHALL NOT include full `userInput`, `assistantResponse`, `cleanText`, or cleaned context
