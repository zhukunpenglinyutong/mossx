## MODIFIED Requirements

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

## ADDED Requirements

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
