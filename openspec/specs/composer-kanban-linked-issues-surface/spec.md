# composer-kanban-linked-issues-surface Specification

## Purpose

Defines the composer-kanban-linked-issues-surface behavior contract, covering 输入区上方展示 Kanban 关联问题.

## Requirements

### Requirement: 输入区上方展示 Kanban 关联问题

系统 MUST 在 Composer 输入区上方展示当前可关联的 Kanban 问题列表。

#### Scenario: 存在关联问题时展示列表

- **WHEN** linkedKanbanPanels 非空
- **THEN** 系统 MUST 在输入区上方显示关联问题条
- **AND** 每个条目 MUST 展示可识别名称

#### Scenario: 无关联问题时展示空态

- **WHEN** linkedKanbanPanels 为空
- **THEN** 系统 MUST 显示空态提示
- **AND** 不得渲染无效操作按钮

### Requirement: 关联问题选择行为

系统 MUST 支持在关联问题条中选择一个活动项。

#### Scenario: 选择关联问题

- **WHEN** 用户点击某个关联问题主按钮
- **THEN** 系统 MUST 将该问题标记为当前活动项
- **AND** 视觉状态 MUST 与非活动项可区分

#### Scenario: 再次点击已选项清空选择

- **WHEN** 用户点击当前已活动的关联问题
- **THEN** 系统 MUST 清空活动项
- **AND** 相关上下文模式选择器 MUST 隐藏或回到默认展示

### Requirement: 关联问题跳转能力

系统 MUST 支持从关联问题条快速跳转到对应 Kanban 面板。

#### Scenario: 点击跳转按钮

- **WHEN** 用户点击某关联问题的跳转按钮
- **THEN** 系统 MUST 打开对应 Kanban 面板
- **AND** MUST 保持当前输入草稿不被清空

### Requirement: 紧凑布局兼容

系统 MUST 在窄屏或紧凑布局下保持关联问题条可用。

#### Scenario: 条目超出容器宽度

- **WHEN** 关联问题条宽度不足以容纳全部条目
- **THEN** 系统 MUST 允许横向滚动
- **AND** 不得造成输入区主交互阻塞

