## MODIFIED Requirements

### Requirement: 发送时可选注入文件路径

系统 SHALL 支持在发送/排队时按开关状态注入 active file path，并且 MUST 能在同一发送中携带用户显式确认的 file line annotation context。

#### Scenario: 开启路径注入

- **GIVEN** 路径注入开关为开启
- **WHEN** 用户发送或排队消息
- **THEN** 系统 SHALL 在消息前缀注入 `@file \`path\``

#### Scenario: 关闭路径注入

- **GIVEN** 路径注入开关为关闭
- **WHEN** 用户发送或排队消息
- **THEN** 系统 SHALL 不注入文件路径前缀

#### Scenario: annotation context includes line range and body

- **GIVEN** 当前 Composer 存在用户确认的 file line annotation
- **WHEN** 用户发送或排队消息
- **THEN** 系统 MUST 注入该 annotation 的 `path#Lx-Ly`
- **AND** 系统 MUST 注入用户标注语
- **AND** annotation 注入 MUST NOT 依赖 active file path 开关是否开启

#### Scenario: annotation context is appended as a stable text block

- **GIVEN** 当前 Composer 存在用户正文和一条或多条 file line annotation
- **WHEN** 用户发送或排队消息
- **THEN** 系统 MUST 保留用户正文
- **AND** 系统 MUST append annotation blocks using stable `@file \`path#Lx-Ly\`` and `标注：body` formatting
- **AND** 多条 annotation MUST preserve Composer selection order

#### Scenario: annotation removal updates composer and source surfaces

- **GIVEN** 当前 Composer 存在用户确认的 file line annotation
- **WHEN** 用户删除该 annotation chip/card 或发送后清空 annotation context
- **THEN** 系统 MUST 从下一次发送 payload 中移除该 annotation
- **AND** 已打开文件或 diff surface 中对应该 annotation 的 confirmed marker MUST 同步消失

#### Scenario: code annotation chip uses compact composer context layout

- **GIVEN** 当前 Composer 存在用户确认的 file line annotation
- **WHEN** Composer 渲染待发送上下文
- **THEN** 系统 MUST 展示文件名、line range、annotation body summary 和 remove action
- **AND** 该展示 MUST 与 manual memory / note card context chips 共存在同一上下文栈中

#### Scenario: composer remains mounted during maximized editor mode

- **GIVEN** 用户处于文件视图最大化模式
- **WHEN** 用户从文件视图创建 file line annotation
- **THEN** 当前 Composer MUST 仍能接收、展示并发送该 annotation
