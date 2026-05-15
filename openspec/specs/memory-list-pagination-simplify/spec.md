# memory-list-pagination-simplify Specification

## Purpose

Defines the memory-list-pagination-simplify behavior contract, covering 图标化分页导航.

## Requirements

### Requirement: 图标化分页导航

系统 SHALL 使用图标按钮提供上一页/下一页导航。

#### Scenario: 分页导航元素

- **WHEN** 用户查看分页区域
- **THEN** SHALL 显示左箭头与右箭头图标按钮
- **AND** 不显示“上一页/下一页”的可见文字标签

#### Scenario: 无障碍标注

- **WHEN** 分页按钮渲染
- **THEN** 左按钮 SHALL 包含 `aria-label=上一页/Prev`
- **AND** 右按钮 SHALL 包含 `aria-label=下一页/Next`

### Requirement: 页码指示器保留

系统 SHALL 保留当前页与总页数的指示信息。

#### Scenario: 页码文本

- **WHEN** 用户查看分页区域
- **THEN** SHALL 显示 `current / total` 形式页码指示

### Requirement: 移除冗余分页信息

系统 SHALL 移除与翻页无关的冗余文案与控件。

#### Scenario: 元信息移除

- **WHEN** 用户查看分页区域
- **THEN** SHALL 不显示“共 X 条记录”等统计文案
- **AND** SHALL 不显示每页条数选择器

### Requirement: 禁用态正确

系统 SHALL 在边界页正确禁用翻页按钮。

#### Scenario: 首页禁用上一页

- **WHEN** 当前页为第一页
- **THEN** 上一页按钮 SHALL 处于禁用状态

#### Scenario: 末页禁用下一页

- **WHEN** 当前页为最后一页
- **THEN** 下一页按钮 SHALL 处于禁用状态

### Requirement: 布局居中与紧凑

系统 SHALL 保持分页区域居中且紧凑。

#### Scenario: 布局对齐

- **WHEN** 分页区域渲染
- **THEN** 分页控件 SHALL 在容器内水平居中
- **AND** 图标与页码间距 SHALL 保持一致

