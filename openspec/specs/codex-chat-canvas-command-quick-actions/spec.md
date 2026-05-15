# codex-chat-canvas-command-quick-actions Specification

## Purpose

Defines the codex-chat-canvas-command-quick-actions behavior contract, covering Codex Config Menu SHALL Provide Speed Quick Action.

## Requirements
### Requirement: Codex Config Menu SHALL Provide Speed Quick Action
系统 MUST 在 Codex 引擎的配置菜单中提供 `Speed` 快捷入口，并通过二级菜单暴露 `Standard` 与 `Fast` 两个状态选项。

#### Scenario: speed entry is visible for codex
- **WHEN** 当前会话引擎为 `codex` 且用户打开配置菜单
- **THEN** 菜单 MUST 显示 `Speed` 入口
- **AND** `Speed` 入口 MUST 可展开二级菜单

#### Scenario: speed entry is hidden for non-codex
- **WHEN** 当前会话引擎为 `claude` / `opencode` / `gemini` 且用户打开配置菜单
- **THEN** 菜单 MUST NOT 显示 `Speed` 入口

#### Scenario: selecting fast dispatches fast-on command
- **WHEN** 用户在 `Speed` 二级菜单选择 `Fast`
- **THEN** 系统 MUST 触发 `/fast on` 等价命令链路
- **AND** 菜单 MUST 将 `Fast` 标记为当前选中状态

#### Scenario: selecting standard dispatches fast-off command
- **WHEN** 用户在 `Speed` 二级菜单选择 `Standard`
- **THEN** 系统 MUST 触发 `/fast off` 等价命令链路
- **AND** 菜单 MUST 将 `Standard` 标记为当前选中状态

### Requirement: Review Quick Action SHALL Reuse Existing Review Workflow
系统 MUST 在 Codex 配置菜单提供 `Review` 快捷入口，并复用现有 `/review` 流程，不得引入平行状态机。

#### Scenario: review quick action opens preset selector
- **WHEN** 用户点击 `Review` 快捷入口
- **THEN** 系统 MUST 打开 `Select a review preset` 选择层
- **AND** 选择层 MUST 提供 4 项：`base branch`、`uncommitted changes`、`commit`、`custom instructions`

#### Scenario: base-branch preset enters third-level branch directory
- **WHEN** 用户在 preset 层选择 `Review against a base branch`
- **THEN** 系统 MUST 进入第三级 `Select a base branch` 列表
- **AND** 第三级列表 MUST 支持分支搜索与选择

#### Scenario: commit preset enters third-level commit directory
- **WHEN** 用户在 preset 层选择 `Review a commit`
- **THEN** 系统 MUST 进入第三级 `Select a commit to review` 列表
- **AND** 第三级列表 MUST 支持提交搜索与选择

#### Scenario: uncommitted preset starts without third-level selector
- **WHEN** 用户在 preset 层选择 `Review uncommitted changes`
- **THEN** 系统 MUST 直接进入该目标的 review 启动流程
- **AND** 系统 MUST NOT 打开额外第三级列表

### Requirement: Engine Isolation and Legacy Path Protection
系统 MUST 将本次能力严格限制在 Codex 引擎范围，并且 MUST NOT 对非 Codex 既有链路造成行为变化。

#### Scenario: non-codex engines keep legacy UI behavior
- **WHEN** 当前会话引擎为 `claude` / `opencode` / `gemini` 且用户打开配置菜单
- **THEN** 系统 MUST NOT 显示 `Speed` 与 `Review` 新入口
- **AND** 系统 MUST 保持原有菜单结构与交互行为

#### Scenario: non-codex message send path remains unchanged
- **WHEN** 当前会话引擎为 `claude` / `opencode` / `gemini` 且用户发送普通消息或既有 slash 命令
- **THEN** 系统 MUST 沿用原有发送与路由逻辑
- **AND** 本次新增 `/fast` 分支 MUST NOT 改变非 Codex 的既有处理结果

#### Scenario: codex review text command remains backward compatible
- **WHEN** 当前会话引擎为 `codex` 且用户手动输入 `/review`
- **THEN** 系统 MUST 继续触发现有 preset 选择流程
- **AND** GUI 快捷入口与手输命令 MUST 复用同一执行路径

