# memory-list-button-layout Specification

## Purpose

Defines the memory-list-button-layout behavior contract, covering 底部统一操作区布局.

## Requirements

### Requirement: 底部统一操作区布局

系统 SHALL 在记忆面板底部提供统一操作区，整合批量操作与详情操作。

#### Scenario: 显示统一操作区

- **WHEN** 列表存在可展示项
- **THEN** 底部 SHALL 显示统一操作区
- **AND** 左侧为批量操作区，右侧为详情操作区

#### Scenario: 批量操作区按钮组成

- **WHEN** 用户查看批量操作区
- **THEN** SHALL 包含全选/取消全选切换按钮
- **AND** 在存在选中项时 SHALL 显示批量设高、批量设中、批量设低、批量删除按钮

#### Scenario: 不包含反选按钮

- **WHEN** 用户查看批量操作区
- **THEN** 系统 SHALL 不展示“反选”按钮

### Requirement: 顶部不重复展示批量按钮

系统 SHALL 不在列表顶部重复展示批量操作按钮。

#### Scenario: 列表顶部区域检查

- **WHEN** 用户查看列表顶部与工具栏区域
- **THEN** SHALL 不出现全选/取消全选/反选等批量按钮

### Requirement: 关键按钮图标增强

系统 SHALL 为关键操作按钮提供图标，提升识别效率。

#### Scenario: 关键按钮图标

- **WHEN** 用户查看底部操作区
- **THEN** 全选/取消全选、批量删除、保存、删除按钮 SHALL 显示图标

#### Scenario: 图标与文案关系

- **WHEN** 查看带图标按钮
- **THEN** 图标 SHALL 位于文案左侧
- **AND** 图标与文案间距 SHALL 保持紧凑一致

### Requirement: 按钮状态反馈

系统 SHALL 对加载态和禁用态提供明确反馈。

#### Scenario: 保存中的状态

- **WHEN** 用户触发保存且请求处理中
- **THEN** 保存按钮 SHALL 显示加载视觉反馈
- **AND** 保存按钮 SHALL 被禁用，防止重复提交

#### Scenario: 批量处理中状态

- **WHEN** 批量更新或批量删除处理中
- **THEN** 批量相关按钮 SHALL 处于禁用状态

### Requirement: 响应式布局

系统 SHALL 保证底部操作区在不同宽度下可用。

#### Scenario: 小屏宽度下的布局

- **WHEN** 容器宽度不足以单行容纳所有按钮
- **THEN** 操作区 SHALL 允许换行显示
- **AND** 各按钮保持可点击与可读

