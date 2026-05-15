# project-memory-scout-agent Specification

## Purpose
TBD - created by archiving change project-memory-phase3-usability-reliability. Update Purpose after archive.
## Requirements
### Requirement: Memory Scout 只读检索

系统 SHALL 提供 Memory Scout 流程，在用户显式开启 Memory Reference 后，只读查询当前 workspace 的 Project Memory。

#### Scenario: 仅查询当前 workspace

- **GIVEN** 用户在 workspace A 中开启 Memory Reference
- **WHEN** Memory Scout 执行查询
- **THEN** Scout SHALL 只查询 workspace A 的 Project Memory
- **AND** SHALL NOT 查询其他 workspace 的记忆

#### Scenario: Scout 不写入 Project Memory

- **WHEN** Memory Scout 查询和摘要记忆
- **THEN** Scout SHALL NOT 创建、更新或删除 Project Memory 记录
- **AND** SHALL NOT 修改项目文件

#### Scenario: Scout 不读取项目文件或执行命令

- **WHEN** Memory Scout 执行
- **THEN** Scout SHALL NOT 读取项目源码、README、OpenSpec、Trellis 或 Git 状态
- **AND** SHALL NOT 执行 shell、Git、Tauri 文件写入或外部工具命令

#### Scenario: 排除过期记忆

- **GIVEN** 某条记忆 review state 为 `obsolete`
- **WHEN** Memory Scout 检索候选
- **THEN** 默认 SHALL 排除该记忆
- **AND** 除非用户显式允许包含过期记忆

### Requirement: Memory Brief

系统 SHALL 将 Memory Scout 的结果组织为结构化 Memory Brief，而不是直接注入原始长文本。

#### Scenario: 返回相关记忆摘要

- **GIVEN** Memory Scout 找到 3 条相关记忆
- **WHEN** Scout 生成 Brief
- **THEN** Brief SHALL 包含每条记忆的摘要
- **AND** SHALL 包含每条记忆的选择理由
- **AND** SHALL 包含每条记忆的来源信息

#### Scenario: 来源可追踪

- **WHEN** Memory Brief 引用一条 Project Memory
- **THEN** 该引用 SHALL 包含 memory id
- **AND** SHALL 包含 title 或 summary
- **AND** SHALL 包含 threadId、turnId、engine、updatedAt 中所有可用字段

#### Scenario: 冲突或不确定项

- **GIVEN** Scout 发现候选记忆之间存在相互矛盾的信息
- **WHEN** Scout 生成 Brief
- **THEN** Brief SHALL 将冲突写入 `conflicts` 或等价区域
- **AND** SHALL NOT 把冲突内容伪装成确定事实

#### Scenario: Brief 长度预算

- **GIVEN** 候选记忆内容超过 Brief 预算
- **WHEN** Scout 生成 Brief
- **THEN** Brief SHALL 裁剪低优先级内容
- **AND** SHALL 标记 `truncated=true` 或等价状态
- **AND** SHALL 保留来源引用

### Requirement: Scout 注入契约

系统 SHALL 将 Memory Brief 作为主会话的可追踪上下文块注入，而不是改写用户原始输入。

#### Scenario: 注入格式

- **GIVEN** Memory Scout 返回可用 Brief
- **WHEN** 系统构建发送文本
- **THEN** 系统 SHALL 使用 `<project-memory ...>` 或等价可识别块包裹 Brief
- **AND** source SHALL 标记为 `memory-scout`
- **AND** 用户原始输入 SHALL 保持可从发送文本中恢复

#### Scenario: 不污染可见用户输入记忆

- **WHEN** 本次发送启用了 Memory Scout
- **THEN** 自动捕获到 Project Memory 的 canonical `userInput` SHALL 仍保存用户可见输入
- **AND** SHALL NOT 把 Memory Brief 当成用户手写输入保存

#### Scenario: 发送链路多引擎一致

- **WHEN** Claude Code、Codex 或 Gemini 发送路径启用 Memory Reference
- **THEN** 系统 SHALL 使用相同 Memory Brief contract
- **AND** 不得为某个 engine 创建独立 Project Memory 存储模型

### Requirement: 超时和降级

系统 SHALL 对 Memory Scout 设置超时和失败降级，确保主会话发送不被记忆检索阻塞。

#### Scenario: Scout 超时

- **GIVEN** Scout 在规定时间内没有返回
- **WHEN** 主发送流程需要继续
- **THEN** 系统 SHALL 放弃本次 Scout 注入
- **AND** SHALL 继续发送主消息
- **AND** SHALL 记录超时状态

#### Scenario: Scout 查询失败

- **GIVEN** Project Memory 查询失败
- **WHEN** Scout 捕获异常
- **THEN** 系统 SHALL 返回失败状态
- **AND** SHALL NOT 阻断主消息发送
- **AND** 日志 SHALL 不包含完整记忆正文

#### Scenario: Scout 无结果

- **GIVEN** Scout 没有找到相关记忆
- **WHEN** 发送流程继续
- **THEN** 系统 SHALL 不注入 Memory Brief
- **AND** SHALL 显示本次未找到相关记忆

### Requirement: Scout 工程治理

系统 SHALL 保证 Memory Scout 的实现不会引入测试噪音、大文件债务或平台专用行为。

#### Scenario: 日志不输出记忆正文

- **WHEN** Scout 记录成功、失败、超时或降级日志
- **THEN** 日志 SHALL 只包含统计信息、状态和耗时
- **AND** SHALL NOT 输出完整用户输入、完整 AI 回复或完整 Memory Brief 正文

#### Scenario: 无平台专用命令

- **WHEN** Scout 执行查询、摘要、超时或取消逻辑
- **THEN** 实现 SHALL 使用跨平台 TypeScript/Rust API
- **AND** SHALL NOT 依赖 POSIX-only shell 语法或 macOS-only 路径

#### Scenario: Brief fixture 不形成大文件债务

- **WHEN** 为 Scout 添加测试 fixture
- **THEN** fixture SHALL 使用最小必要内容
- **AND** SHALL NOT 复制大段真实对话正文
