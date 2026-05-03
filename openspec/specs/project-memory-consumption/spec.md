# Project Memory Consumption

## Purpose

提供项目记忆消费注入能力,在用户与 AI 对话时自动检索并注入相关记忆上下文,形成"采集→存储→消费"的完整闭环。
## Requirements
### Requirement: 前端消息注入

系统 MUST 在用户发送消息前采用"手动选择优先"注入策略，不再执行自动相关性检索注入。

#### Scenario: 未手动选择时不注入

- **WHEN** 用户发送消息且本次未手动选择任何记忆
- **THEN** 系统 SHALL 直接发送用户原始文本
- **AND** SHALL NOT 自动调用相关性注入流程

#### Scenario: 手动选择后注入

- **WHEN** 用户在本次发送前手动选择了项目记忆
- **THEN** 系统 SHALL 仅注入这些已选记忆
- **AND** 注入块 SHALL 追加在用户原始文本前

#### Scenario: 注入格式规范

- **WHEN** 系统构建手动注入文本块
- **THEN** 仍 SHALL 使用 `<project-memory ...>` 包裹格式
- **AND** `source` SHALL 标记为手动选择来源（如 `manual-selection`）

#### Scenario: 当次发送后清空

- **WHEN** 注入发送完成（成功或失败后收敛）
- **THEN** 系统 SHALL 清空本次手动选择集合
- **AND** 下次发送前需重新选择

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

系统 MUST 严格控制注入内容的字符数,避免占用过多上下文窗口。

#### Scenario: 单条记忆裁剪

- **GIVEN** 单条记忆 summary 长度为 300 字符
- **AND** maxItemChars 限制为 200
- **WHEN** 裁剪单条记忆
- **THEN** 应截取前 200 字符
- **AND** 不添加省略号(保持语义完整性)

#### Scenario: 总量预算裁剪

- **GIVEN** 候选记忆共 10 条
- **AND** maxTotalChars 限制为 1000
- **WHEN** 累计注入字符数
- **THEN** 应在达到 1000 字符时立即停止
- **AND** 不应继续添加更多记忆

#### Scenario: 裁剪标记

- **GIVEN** 注入内容发生裁剪
- **WHEN** 构建注入块头部
- **THEN** 应在 XML 标签中标记 `truncated="true"`
- **AND** 示例: `<project-memory count="3" truncated="true">`

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

系统 MUST 将"上下文注入开关"收敛为固定关闭态，避免用户触发旧自动注入行为。

#### Scenario: 默认关闭

- **WHEN** 系统初始化对话发送链路
- **THEN** 上下文自动注入状态 SHALL 视为 false

#### Scenario: 本地存储值不再驱动自动注入

- **WHEN** localStorage 中存在 `projectMemory.contextInjectionEnabled=true`
- **THEN** 系统 SHALL NOT 因该值恢复自动注入
- **AND** 自动注入能力保持关闭

#### Scenario: 开关异常降级

- **GIVEN** localStorage 读取失败
- **WHEN** 系统尝试获取开关状态
- **THEN** 应回退默认值 true
- **AND** 不应阻塞消息发送

### Requirement: 异常处理和降级

系统 MUST 确保注入失败不影响消息正常发送,提供完善的降级机制。

#### Scenario: 记忆查询失败降级

- **GIVEN** `project_memory_list` 调用失败(网络错误)
- **WHEN** 系统捕获异常
- **THEN** 应记录 `console.warn("[project-memory] query failed")`
- **AND** 降级为"无注入发送"
- **AND** 消息仍能正常发送

#### Scenario: 查询结果为空不注入

- **GIVEN** `getContextMemories` 返回空数组
- **WHEN** 系统检测到无候选记忆
- **THEN** 应跳过注入流程
- **AND** 发送用户原始文本

#### Scenario: 双引擎兼容

- **GIVEN** Claude 和 Codex 两条引擎路径
- **WHEN** 执行注入逻辑
- **THEN** 两条路径应均支持注入
- **AND** 注入格式和行为保持一致

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

系统 MUST 在 UI 中提供注入可见性控制,让用户了解注入了哪些记忆。

#### Scenario: 折叠显示注入提示

- **GIVEN** 成功注入 3 条记忆
- **WHEN** 消息发送前
- **THEN** 应在输入框上方显示提示 "已注入 3 条项目记忆"
- **AND** 默认折叠不展开

#### Scenario: 展开查看注入明细

- **GIVEN** 用户点击注入提示
- **WHEN** 展开明细面板
- **THEN** 应列出 3 条记忆的 title 和 summary
- **AND** 支持点击跳转到记忆详情

#### Scenario: 调试模式完整输出

- **GIVEN** 开发模式开启 debug 开关
- **WHEN** 记录注入日志
- **THEN** 应输出完整注入文本块
- **AND** 包含记忆正文(受开关控制)

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

