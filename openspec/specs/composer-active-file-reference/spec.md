# composer-active-file-reference Specification

## Purpose

Defines the composer-active-file-reference behavior contract, covering Composer 显示当前文件关联.

## Requirements

### Requirement: Composer 显示当前文件关联

系统 SHALL 在存在 active file tab 时在 Composer 显示当前关联文件。

#### Scenario: 有活动文件时显示关联条

- **GIVEN** 当前存在 active file tab
- **WHEN** Composer 渲染
- **THEN** 系统 SHALL 显示当前文件关联条
- **AND** 至少展示文件名

#### Scenario: 无活动文件时隐藏关联条

- **GIVEN** 当前没有 active file tab
- **WHEN** Composer 渲染
- **THEN** 系统 SHALL 不显示文件关联条

### Requirement: 发送时可选注入文件路径

系统 SHALL 支持在发送/排队时按开关状态注入 active file path。

#### Scenario: 开启路径注入

- **GIVEN** 路径注入开关为开启
- **WHEN** 用户发送或排队消息
- **THEN** 系统 SHALL 在消息前缀注入 `@file \`path\``

#### Scenario: 关闭路径注入

- **GIVEN** 路径注入开关为关闭
- **WHEN** 用户发送或排队消息
- **THEN** 系统 SHALL 不注入文件路径前缀

### Requirement: editor 场景发送后可见反馈

系统 SHALL 在 editor 场景发送后确保用户可看到会话反馈。

#### Scenario: editor 场景发送后切回 chat

- **GIVEN** 当前处于 editor center mode
- **WHEN** 用户发送或排队消息
- **THEN** 系统 SHALL 切换到 chat 视图
- **AND** 用户可立即看到消息反馈

