# memory-list-hover-style Specification

## Purpose

Defines the memory-list-hover-style behavior contract, covering Hover 轻量反馈.

## Requirements

### Requirement: Hover 轻量反馈

系统 SHALL 在列表项 hover 时提供纯高亮视觉反馈，仅包含背景与边框变化。

#### Scenario: 鼠标悬停反馈

- **WHEN** 用户鼠标悬停在记忆列表项
- **THEN** 列表项 SHALL 发生背景色与边框色变化
- **AND** SHALL 不应用位移抬升
- **AND** SHALL 不应用 hover 阴影增强

#### Scenario: 鼠标移出恢复

- **WHEN** 用户鼠标移出列表项
- **THEN** 列表项 SHALL 平滑恢复到默认状态

### Requirement: 不使用缩放动画

系统 SHALL 避免使用 `scale` 类缩放动画，降低视觉跳跃。

#### Scenario: Hover 动画属性限制

- **WHEN** 实现列表项 hover 动画
- **THEN** SHALL 不使用 `transform: scale(...)`

### Requirement: 不使用抬升与阴影强调

系统 SHALL 避免通过位移与阴影制造卡片抬升感，保持列表扫读稳定。

#### Scenario: Hover 动画属性限制（抬升/阴影）

- **WHEN** 实现列表项 hover 动画
- **THEN** SHALL 不使用 `translateY(...)` 抬升
- **AND** SHALL 不增加 hover 阶段的 `box-shadow`

### Requirement: 优先级差异化 Hover

系统 SHALL 为不同优先级项提供差异化 hover 风格。

#### Scenario: high/medium/low 的 hover 区分

- **WHEN** 用户悬停不同优先级项
- **THEN** `importance-high`、`importance-medium`、`importance-low` SHALL 保持各自视觉区分

### Requirement: 可读性保障

系统 SHALL 保证 hover 前后文本可读性。

#### Scenario: 文本与背景对比

- **WHEN** 用户在 hover 状态阅读列表项
- **THEN** 文本信息 SHALL 保持清晰可读

### Requirement: 过渡时长一致

系统 SHALL 使用统一过渡时长，避免动画割裂。

#### Scenario: hover 过渡

- **WHEN** 列表项状态在默认与 hover 之间切换
- **THEN** SHALL 使用平滑过渡（当前实现约 0.2s）

