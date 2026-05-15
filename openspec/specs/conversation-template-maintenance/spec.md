# conversation-template-maintenance Specification

## Purpose

Defines the conversation-template-maintenance behavior contract, covering Unified File Reference Interaction.

## Requirements
### Requirement: Unified File Reference Interaction
系统 MUST 将 `File changes`、`批量编辑文件`、流式文本中的文件引用统一为同一文件详情弹窗交互协议。

#### Scenario: batch edit file row opens shared file detail modal
- **WHEN** 用户点击 `批量编辑文件` 卡片中的任意文件项
- **THEN** 系统 MUST 打开统一的文件详情弹窗
- **AND** 弹窗数据源 MUST 与 `File changes` 文件详情使用同一结构

#### Scenario: file changes row opens shared file detail modal
- **WHEN** 用户点击 `File changes` 卡片中的任意文件项
- **THEN** 系统 MUST 通过统一 `onOpenDiffPath` 入口打开文件详情流程
- **AND** 文件定位 MUST 复用现有路径解析策略而非新增并行实现

#### Scenario: streaming text file reference opens shared file detail modal
- **WHEN** 用户点击流式文本中的文件引用（例如 `xxx.rs`）
- **THEN** 系统 MUST 打开同一文件详情弹窗
- **AND** MUST NOT 触发应用崩溃

#### Scenario: invalid file reference payload is recoverable
- **WHEN** 文件引用 payload 缺少必要字段（如路径或工作区上下文）
- **THEN** 系统 MUST 显示可恢复错误提示
- **AND** 当前会话交互 MUST 继续可用

#### Scenario: file changes click must not alter reused diff component behavior
- **WHEN** 用户通过 `File changes` 文件项打开 diff
- **THEN** 系统 MUST NOT 改变被复用 Git diff 组件的既有默认行为与交互语义
- **AND** 已有组件状态（例如用户既有偏好）MUST 按原契约生效

### Requirement: File Changes Metadata Completeness

`File changes` 卡片 MUST 完整展示文件状态与统计信息，包含单文件与总计两个层次。

#### Scenario: file row shows status and line deltas

- **WHEN** `File changes` 渲染文件列表
- **THEN** 每个文件行 MUST 显示状态标识（`A/M/D`）
- **AND** 每个文件行 MUST 显示该文件的 `+n/-m` 统计

#### Scenario: card header shows aggregate totals

- **WHEN** `File changes` 渲染卡片头部
- **THEN** 头部 MUST 显示全部文件聚合的 `+total/-total` 统计
- **AND** 聚合值 MUST 与文件行统计求和一致

### Requirement: Change Detail Responsibility Separation

同一操作上下文中，系统 MUST 保持“一个主详情区 + 其他摘要区”的信息职责划分，避免重复铺陈。

#### Scenario: file changes is primary detail surface for same operation

- **WHEN** 同一 operation 同时存在 `File changes` 与 `批量编辑文件` 卡片
- **THEN** `File changes` MUST 作为唯一文件详情主展示区
- **AND** `批量编辑文件` MUST 仅展示摘要与操作入口（如 `Plan`）

#### Scenario: summary card still preserves operation actions

- **WHEN** `批量编辑文件` 卡片处于摘要模式
- **THEN** 卡片 MUST 保留操作入口（如 `Plan`）
- **AND** 用户 MUST 不需要跳转到其他页面即可继续操作

### Requirement: Layering Integrity for Plan and File Detail Overlays

Plan 快览与文件详情弹层 MUST 使用统一的顶层挂载策略并保持可见可交互。

#### Scenario: plan overlay is not occluded by card containers

- **WHEN** 用户点击 `Plan` 按钮打开快览弹层
- **THEN** 弹层 MUST 显示在当前上下文最上层
- **AND** MUST NOT 被卡片容器或邻近容器遮挡

#### Scenario: file detail overlay remains fully interactive

- **WHEN** 文件详情弹窗打开
- **THEN** 弹窗主体与关闭/跳转动作 MUST 可完整交互
- **AND** 键盘焦点 MUST 受弹窗控制而不穿透到底层卡片

### Requirement: File Changes Multi-Row Collapse MUST Be Independently Controllable

`File changes` 在多文件折叠态下 MUST 以“逐文件独立行”呈现，且每行展开状态互不干扰。

#### Scenario: multi-file collapsed view renders per-file stack entries

- **WHEN** `File changes` 包含多于 1 个变更文件且处于折叠态
- **THEN** 系统 MUST 为每个文件渲染独立折叠行
- **AND** 每行 MUST 显示该文件自身的 `A/M/D` 与 `+n/-m` 统计

#### Scenario: expanding one file row does not expand siblings

- **WHEN** 用户展开某一文件折叠行
- **THEN** 系统 MUST 仅切换该行的展开状态
- **AND** 其他文件折叠行 MUST 保持原有展开/折叠状态不变

#### Scenario: single-file collapsed summary stays singular without overflow hint

- **WHEN** `File changes` 仅包含单个文件且处于折叠态
- **THEN** 摘要 MUST 使用单文件语义展示
- **AND** MUST NOT 显示多文件溢出提示（如 `+N more`）
