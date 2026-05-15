# Project Memory Consumption

## Purpose

提供项目记忆消费注入能力,在用户与 AI 对话时自动检索并注入相关记忆上下文,形成"采集→存储→消费"的完整闭环。
## Requirements
### Requirement: 前端消息注入

系统 MUST 在用户发送消息前采用"手动选择优先 + 显式 Memory Reference"注入策略，不再执行静默自动相关性检索注入。

#### Scenario: 未手动选择且未开启 Memory Reference 时不注入

- **WHEN** 用户发送消息且本次未手动选择任何记忆
- **AND** Composer Memory Reference toggle 未开启
- **THEN** 系统 SHALL 直接发送用户原始文本
- **AND** SHALL NOT 自动调用相关性注入流程

#### Scenario: 手动选择后注入

- **WHEN** 用户在本次发送前手动选择了项目记忆
- **THEN** 系统 SHALL 注入这些已选记忆
- **AND** 注入块 SHALL 追加在用户原始文本前
- **AND** 注入来源 SHALL 标记为 `manual-selection`

#### Scenario: 开启 Memory Reference 后注入 Brief

- **WHEN** 用户开启 Composer Memory Reference toggle 并发送消息
- **THEN** 系统 SHALL 在发送前执行 Memory Scout 查询
- **AND** 若 Scout 返回可用 Memory Brief，系统 SHALL 注入 Brief
- **AND** 注入来源 SHALL 标记为 `memory-scout`

#### Scenario: 手动选择与 Memory Reference 并存

- **WHEN** 用户已手动选择记忆
- **AND** 同时开启 Memory Reference toggle
- **THEN** 系统 SHALL 同时保留 `manual-selection` 和 `memory-scout` 两类来源
- **AND** UI SHALL 区分显示两类注入来源

#### Scenario: 注入记忆作为独立关联资源展示

- **GIVEN** 用户消息包含 `manual-selection` 或 `memory-scout` 的 Project Memory 注入块
- **WHEN** 系统在消息时间线中渲染该轮对话
- **THEN** Project Memory 引用 SHALL 作为独立关联资源卡片展示
- **AND** SHALL NOT 与用户可见输入气泡混排
- **AND** Claude、Codex 和 Gemini 路径 SHALL 使用一致的展示语义

#### Scenario: Codex 历史回放保留 Project Memory 关联资源

- **GIVEN** Codex 历史记录中的 user payload 原始文本包含 `<project-memory source="memory-scout">` 或 `<project-memory source="manual-selection">`
- **WHEN** 系统从 remote resume 或 local JSONL history 回放该线程
- **THEN** history loader SHALL 保留 Project Memory 注入块供消息渲染层解析
- **AND** 用户可见气泡 SHALL 只显示真实用户输入
- **AND** Project Memory 引用 SHALL 独立显示为关联资源卡片

#### Scenario: 当次发送后清空

- **WHEN** 注入发送完成（成功或失败后收敛）
- **THEN** 系统 SHALL 清空本次手动选择集合
- **AND** Memory Reference toggle SHALL 回到未激活状态或空闲状态
- **AND** 下次发送前需重新选择或重新开启

### Requirement: 相关性检索

系统 MUST 基于关键词匹配计算记忆相关性,避免注入不相关记忆造成噪声干扰。

#### Scenario: 关键词归一化

- **GIVEN** 用户 query 为 "数据库优化?"
- **WHEN** 执行关键词归一化
- **THEN** 应转小写、去标点、去停用词
- **AND** 提取关键词 ["数据库", "优化"]

#### Scenario: 计算 overlap score

- **GIVEN** 用户 query 关键词为 ["数据库", "优化"]
- **AND** 记忆 summary 包含 ["数据库", "连接池", "优化"]
- **WHEN** 计算相关性分数
- **THEN** score = hitTerms / queryTerms = 2 / 2 = 1.0

#### Scenario: 相关性阈值过滤

- **GIVEN** 相关性阈值为 0.2
- **AND** 某条记忆的 score = 0.1
- **WHEN** 筛选候选记忆
- **THEN** 应过滤掉该记忆
- **AND** 不应注入到消息中

#### Scenario: 全量低于阈值则不注入

- **GIVEN** 所有记忆的 score 均 < 0.2
- **WHEN** 执行相关性筛选
- **THEN** 应返回空列表
- **AND** 不注入任何记忆到消息

### Requirement: Token 预算控制
系统 MUST 控制 Retrieval Pack 的总上下文预算，优先保留详细 source record 的身份、来源和任务相关字段，并显式标记发生裁剪的位置。

#### Scenario: 字段级裁剪

- **GIVEN** 单条记忆的 assistantResponse 超过单字段预算
- **WHEN** 系统构建 Retrieval Pack
- **THEN** 系统 SHALL 保留 memoryId、索引和来源 metadata
- **AND** SHALL 裁剪超预算字段
- **AND** SHALL 在该字段或该记录上标记 truncated

#### Scenario: 总量预算裁剪

- **GIVEN** 候选记忆共 10 条
- **AND** Retrieval Pack 达到总预算限制
- **WHEN** 系统继续处理剩余记忆
- **THEN** 系统 SHALL 停止追加低优先级记录
- **AND** SHALL 在 pack 头部标记 `truncated="true"` 或等价状态

#### Scenario: 不以 summary 替代详细记录

- **GIVEN** 某条记忆被选中注入
- **WHEN** 该记忆在预算内可容纳详细字段
- **THEN** 系统 SHALL 注入详细字段
- **AND** SHALL NOT 仅用 summary 替代完整 source record

### Requirement: 排序策略

系统 MUST 按 importance、relevance、updatedAt 三级排序,优先注入高价值记忆。

#### Scenario: Importance 优先

- **GIVEN** 记忆 A: importance=high, score=0.5
- **AND** 记忆 B: importance=medium, score=0.8
- **WHEN** 排序候选记忆
- **THEN** 记忆 A 应排在记忆 B 之前

#### Scenario: 同 Importance 按 Relevance

- **GIVEN** 记忆 A: importance=high, score=0.5
- **AND** 记忆 B: importance=high, score=0.8
- **WHEN** 排序候选记忆
- **THEN** 记忆 B 应排在记忆 A 之前

#### Scenario: 同 Importance 和 Relevance 按时间

- **GIVEN** 记忆 A: importance=high, score=0.5, updatedAt=2026-02-09
- **AND** 记忆 B: importance=high, score=0.5, updatedAt=2026-02-10
- **WHEN** 排序候选记忆
- **THEN** 记忆 B 应排在记忆 A 之前

### Requirement: 开关控制

系统 MUST 将历史"上下文注入开关"收敛为固定关闭态，并提供 Composer 级 one-shot Memory Reference toggle 作为唯一显式记忆参考入口。

#### Scenario: 历史开关默认关闭

- **WHEN** 系统初始化对话发送链路
- **THEN** 历史上下文自动注入状态 SHALL 视为 false

#### Scenario: 本地存储值不再驱动静默自动注入

- **WHEN** localStorage 中存在 `projectMemory.contextInjectionEnabled=true`
- **THEN** 系统 SHALL NOT 因该值恢复静默自动注入
- **AND** 静默自动注入能力保持关闭

#### Scenario: Composer Memory Reference 默认关闭

- **WHEN** 用户打开 Composer
- **THEN** Memory Reference toggle SHALL 默认处于关闭状态
- **AND** 系统 SHALL NOT 查询 Project Memory

#### Scenario: 用户显式开启本次记忆参考

- **WHEN** 用户点击 Composer 底部 Memory Reference icon
- **THEN** toggle SHALL 进入 armed 状态
- **AND** 本次发送 SHALL 触发 Memory Scout
- **AND** 该状态 SHALL NOT 自动变成全局永久设置

### Requirement: 异常处理和降级

系统 MUST 确保记忆注入或 Memory Scout 失败不影响消息正常发送，并提供完善的降级机制。

#### Scenario: Memory Scout 查询失败降级

- **GIVEN** Memory Scout 查询 Project Memory 失败
- **WHEN** 系统捕获异常
- **THEN** 应记录不包含记忆正文的诊断日志
- **AND** 降级为"无 scout brief 发送"
- **AND** 消息仍能正常发送

#### Scenario: Memory Scout 超时降级

- **GIVEN** Memory Scout 在超时限制内未返回
- **WHEN** 用户发送流程继续
- **THEN** 系统 SHALL 跳过 scout brief 注入
- **AND** SHALL 在 UI 中显示本次记忆参考超时或失败状态
- **AND** SHALL NOT 阻塞主会话发送

#### Scenario: 查询结果为空不注入

- **GIVEN** Memory Scout 返回空结果
- **WHEN** 系统检测到无候选记忆
- **THEN** 应跳过 scout brief 注入
- **AND** 发送用户原始文本或仅发送手动选择注入后的文本

#### Scenario: 多引擎兼容

- **GIVEN** Claude Code、Codex 和 Gemini 三条发送路径
- **WHEN** 执行手动记忆注入或 Memory Reference 流程
- **THEN** 各路径 SHALL 使用一致的注入块格式
- **AND** Project Memory 不得暴露引擎专用注入 API

### Requirement: 可观测性

系统 MUST 提供日志和埋点,支持追踪注入行为和诊断问题。

#### Scenario: 注入成功日志

- **GIVEN** 成功注入 3 条记忆
- **WHEN** 记录日志
- **THEN** 应包含以下信息:
    - `injected_count: 3`
    - `injected_chars: 850`
    - `retrieval_ms: 120`

#### Scenario: 未注入原因日志

- **GIVEN** 开关关闭导致跳过注入
- **WHEN** 记录日志
- **THEN** 应包含 `disabled_reason: "switch_off"`

#### Scenario: 低相关性跳过日志

- **GIVEN** 所有记忆 score < 0.2
- **WHEN** 记录日志
- **THEN** 应包含 `disabled_reason: "low_relevance"`

#### Scenario: 日志隐私保护

- **GIVEN** 记录注入日志
- **WHEN** 输出日志内容
- **THEN** 应仅包含统计信息
- **AND** 不应打印完整记忆正文
- **AND** 避免隐私泄漏

### Requirement: 确定性输出

系统 MUST 确保相同输入在相同记忆集下产生稳定一致的注入结果。

#### Scenario: 排序稳定性

- **GIVEN** 相同的候选记忆集
- **WHEN** 多次执行排序
- **THEN** 排序结果应完全一致
- **AND** 不应依赖非稳定迭代顺序

#### Scenario: 裁剪稳定性

- **GIVEN** 相同的记忆内容和预算限制
- **WHEN** 多次执行裁剪
- **THEN** 裁剪结果应完全一致
- **AND** 字符边界处理一致

#### Scenario: 注入块格式稳定

- **GIVEN** 相同的注入记忆集
- **WHEN** 多次构建注入块
- **THEN** XML 标签格式应一致
- **AND** count 和 truncated 属性准确

### Requirement: 高优先级记忆优先注入

系统 MUST 优先检索和注入 importance=high 的记忆,确保关键信息不被遗漏。

#### Scenario: 仅检索 high 级别(MVP)

- **GIVEN** workspace 有 high/medium/low 三种优先级记忆
- **WHEN** 调用 `getContextMemories(workspaceId)`
- **THEN** 应仅查询 importance="high" 的记忆
- **AND** pageSize=5(限制候选数量)

#### Scenario: 混合优先级检索(增强版)

- **GIVEN** high 级别记忆不足 5 条
- **WHEN** 执行相关性检索
- **THEN** 应补充 medium 级别记忆
- **AND** 总候选数不超过 5 条

### Requirement: 用户可见性(Phase 2.2)

系统 MUST 在 Composer 中提供 Memory Reference 可见性控制，让用户了解本次发送是否参考了项目记忆以及参考了哪些来源。

#### Scenario: 显示 Memory Reference toggle

- **WHEN** Composer 底部工具区渲染
- **THEN** 系统 SHALL 显示 Memory Reference icon button
- **AND** button SHALL 有可访问名称
- **AND** 当前开启/关闭状态 SHALL 可见

#### Scenario: 查询中状态

- **WHEN** 用户开启 Memory Reference 并发送消息
- **THEN** 系统 SHALL 显示记忆查询中状态
- **AND** SHALL 防止用户误以为查询已经完成

#### Scenario: 显示引用数量

- **GIVEN** Memory Scout 返回 3 条来源记忆
- **WHEN** 消息发送前或发送中显示状态
- **THEN** 系统 SHALL 显示已参考 3 条项目记忆
- **AND** 用户 SHALL 能查看来源标题或跳转到 Project Memory 详情

#### Scenario: 失败状态可见

- **GIVEN** Memory Scout 失败或超时
- **WHEN** 系统降级发送
- **THEN** Composer 或消息上下文 SHALL 显示本次未成功参考项目记忆
- **AND** 主消息 SHALL 继续发送

### Requirement: 验收标准(Phase 2.1 MVP)

系统 MUST 满足以下验收标准才能发布。

#### Scenario: 开关开启注入可见

- **GIVEN** contextInjectionEnabled=true
- **WHEN** 用户发送消息
- **THEN** 最终消息文本应包含 `<project-memory>` 前缀

#### Scenario: 开关关闭零行为回归

- **GIVEN** contextInjectionEnabled=false
- **WHEN** 用户发送消息
- **THEN** 消息文本应与注入前完全一致
- **AND** 无任何行为变化

#### Scenario: 注入失败不阻塞发送

- **GIVEN** 记忆查询失败
- **WHEN** 系统执行降级处理
- **THEN** 消息仍能正常发送
- **AND** 用户无感知异常

#### Scenario: 双引擎均可工作

- **GIVEN** Claude 和 Codex 两条引擎路径
- **WHEN** 分别执行注入逻辑
- **THEN** 两条路径均应成功注入
- **AND** 行为一致

### Requirement: 远期增强(Phase 2.3)

系统 SHALL 为后续语义检索和向量召回预留扩展接口。

#### Scenario: 语义相关性检索(预留)

- **GIVEN** 用户 query 为 "如何提升性能"
- **WHEN** 执行语义检索(Phase 2.3)
- **THEN** 应计算 query embedding
- **AND** 召回向量相似度高的记忆
- **AND** 不仅限于关键词匹配

#### Scenario: Embedding 生成(预留)

- **GIVEN** 新创建一条记忆
- **WHEN** 入库时生成 embedding(Phase 2.3)
- **THEN** 应调用本地模型或 API 服务
- **AND** 存储 embedding 向量到记忆数据中

#### Scenario: 混合召回策略(预留)

- **GIVEN** 候选记忆通过向量召回
- **WHEN** 执行重排序(Phase 2.3)
- **THEN** 应综合考虑向量相似度和 importance
- **AND** 排序策略: importance(desc) → vector_score(desc) → updatedAt(desc)

### Requirement: 记忆写入去重与摘要-正文分离

系统 MUST 在 conversation memory 落库前执行摘要/正文规整，避免 detail 发生重复堆叠。

#### Scenario: 摘要句级去重

- **WHEN** 助手输出摘要包含重复句段或回声片段
- **THEN** 系统 SHALL 在写入前对摘要进行句级去重
- **AND** 生成的 `助手输出摘要` 不应包含相邻重复语句

#### Scenario: 助手输出与摘要重叠时仅保留增量

- **WHEN** 助手输出正文与摘要存在高重叠内容
- **THEN** 系统 SHALL 优先保留摘要
- **AND** `助手输出` 字段 SHALL 仅写入摘要之外的新增片段，或在无新增时省略该段

#### Scenario: 尾部提示词残片裁剪

- **WHEN** 助手输出包含尾部提示词残片（如"好的，更新记录：""在终端执行："）并与摘要语义重复
- **THEN** 系统 SHALL 在写入前裁剪该残片
- **AND** 最终 detail 不应出现同一提示语重复落盘

### Requirement: Manual Memory Selection SHALL Remain Traceable In Context Ledger

系统 MUST 让手动选择的项目记忆在 Context Ledger 中保持可追踪，而不是只在发送时临时拼接后消失。

#### Scenario: selected memories appear as ledger blocks before send

- **WHEN** 用户在当前发送前手动选择了一组项目记忆
- **THEN** ledger SHALL 为每条已选记忆投影一个 `manual_memory` block
- **AND** 每个 block SHALL 保留稳定的 `memoryId` 或等价 source reference

#### Scenario: removing a selected memory removes the matching ledger block

- **WHEN** 用户在发送前移除某条已选记忆
- **THEN** 对应 ledger block SHALL 同步消失
- **AND** 其余已选记忆的 ledger block SHALL 保持不变

#### Scenario: send settlement clears one-shot memory blocks

- **WHEN** 当前发送完成或失败后收敛
- **AND** 用户未对该记忆显式执行 `pin for next send`
- **THEN** one-shot 手动记忆选择 SHALL 按现有语义清空
- **AND** 相应 ledger blocks SHALL 一起清空

#### Scenario: pin for next send carries a manual memory across one additional send

- **WHEN** 用户对当前已选记忆执行 `pin for next send`
- **THEN** 当前发送收敛后该记忆 SHALL 继续留在下一轮发送准备态
- **AND** 该保留 SHALL 在下一轮发送后自动消耗

#### Scenario: ledger does not reintroduce hidden auto memory retrieval

- **WHEN** 当前发送准备态不存在手动选择的项目记忆
- **THEN** Context Ledger SHALL NOT 伪造 `manual_memory` block
- **AND** Phase 1 ledger SHALL NOT 仅为了补齐账本而重启隐藏的 project-memory 自动检索注入

### Requirement: Memory Reference 边界控制

系统 SHALL 将 Memory Reference 限定为本次发送的 Project Memory 参考能力，不得扩展为静默自动注入或通用项目 agent。

#### Scenario: 不跨 workspace 检索

- **WHEN** 用户在当前 workspace 开启 Memory Reference
- **THEN** 系统 SHALL 只查询当前 workspace 的 Project Memory
- **AND** SHALL NOT 查询其他 workspace 的记忆

#### Scenario: 不读取项目文件

- **WHEN** Memory Reference 执行 Scout 流程
- **THEN** 系统 SHALL NOT 读取项目源文件、README、OpenSpec 或 Git 状态
- **AND** SHALL 只基于 Project Memory 数据生成 Brief

#### Scenario: 不执行工具命令

- **WHEN** Memory Reference 执行 Scout 流程
- **THEN** 系统 SHALL NOT 执行 shell、Git、Tauri 文件写入或外部工具命令

#### Scenario: 不成为永久设置

- **WHEN** 用户完成一次开启 Memory Reference 的发送
- **THEN** 系统 SHALL 清空本次 Memory Reference 激活状态
- **AND** SHALL NOT 将开启状态保存为 workspace 或 global 自动注入设置

### Requirement: Memory Reference fallback recall integrity

When production semantic retrieval is unavailable, the system SHALL still perform reliable lexical fallback retrieval for Memory Reference and MUST NOT discard obvious recall-intent memories solely because the raw user query is not a contiguous substring.

#### Scenario: Identity recall does not depend on exact substring

- **GIVEN** current workspace Project Memory contains a record whose content includes `我是陈湘宁`
- **WHEN** the user enables Memory Reference and sends `我是谁`
- **THEN** the system SHALL consider that memory as a candidate
- **AND** the injected retrieval pack SHALL include the memory if it is within the selected fallback budget

#### Scenario: Broad fallback candidates precede local ranking

- **WHEN** semantic retrieval has no production provider
- **THEN** Memory Reference SHALL fetch a broad workspace candidate set without raw query filtering
- **AND** the broad fallback scan SHALL be allowed to continue across bounded pages when the first page is full
- **AND** SHALL apply local multi-field ranking before deciding that no related project memory exists

#### Scenario: Fallback remains bounded

- **WHEN** Memory Reference fetches broad fallback candidates
- **THEN** the candidate request SHALL use an explicit bounded page size
- **AND** the total fallback scan SHALL stop at an explicit maximum item count
- **AND** the final injected records SHALL remain capped by the existing Memory Scout selection budget

#### Scenario: Identity recall avoids assistant self-introduction false positives

- **GIVEN** a memory only proves that the assistant said `我是 Codex`
- **WHEN** the user sends `我是谁`
- **THEN** the system SHALL NOT promote that memory as user identity evidence

