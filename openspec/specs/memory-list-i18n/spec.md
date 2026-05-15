# memory-list-i18n Specification

## Purpose

Defines the memory-list-i18n behavior contract, covering Kind 字段国际化显示.

## Requirements

### Requirement: Kind 字段国际化显示

系统 SHALL 为记忆列表中的 Kind 字段提供国际化显示，覆盖当前支持的 Kind 类型。

#### Scenario: 中文环境显示中文 Kind

- **WHEN** 用户语言为 `zh-CN`
- **THEN** Kind 值 SHALL 显示为中文标签（项目上下文/对话/代码决策/已知问题/笔记）

#### Scenario: 英文环境显示英文 Kind

- **WHEN** 用户语言为 `en-US`
- **THEN** Kind 值 SHALL 显示为英文标签（Project context/Conversation/Code decision/Known issue/Note）

#### Scenario: 未知 Kind 值降级显示

- **WHEN** Kind 值不在当前映射集合中
- **THEN** 系统 SHALL 显示原始值作为降级结果

### Requirement: Importance 字段国际化显示

系统 SHALL 为记忆列表中的 Importance 字段提供国际化显示，覆盖当前支持的优先级类型。

#### Scenario: 中文环境显示中文 Importance

- **WHEN** 用户语言为 `zh-CN`
- **THEN** Importance 值 SHALL 显示为 高/中/低

#### Scenario: 英文环境显示英文 Importance

- **WHEN** 用户语言为 `en-US`
- **THEN** Importance 值 SHALL 显示为 High/Medium/Low

#### Scenario: 未知 Importance 值降级显示

- **WHEN** Importance 值不在当前映射集合中
- **THEN** 系统 SHALL 显示原始值作为降级结果

### Requirement: 运行时语言切换生效

系统 SHALL 在运行时语言切换后更新 Kind 和 Importance 显示，无需刷新页面。

#### Scenario: 语言切换后标签更新

- **WHEN** 用户在应用内切换语言
- **THEN** Kind 与 Importance 标签 SHALL 随语言立即更新

### Requirement: 翻译键命名空间一致

系统 SHALL 将相关翻译键维护在统一命名空间下。

#### Scenario: Kind 与 Importance 键结构

- **WHEN** 开发者查看 locale 文件
- **THEN** Kind 键 SHALL 位于 `memory.kind.*`
- **AND** Importance 键 SHALL 位于 `memory.importance.*`

