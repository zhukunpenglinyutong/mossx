# kanban-popover-dismiss-behavior Specification

## Purpose

Defines the kanban-popover-dismiss-behavior behavior contract, covering 看板 Popover 不因外部点击意外关闭.

## Requirements

### Requirement: 看板 Popover 不因外部点击意外关闭

当看板 popover 处于打开状态时，用户点击 popover 面板外部区域（含 Composer 主输入框）MUST NOT 导致 popover 关闭。

#### Scenario: clicking composer input does not dismiss popover

- **GIVEN** 看板 popover 处于打开状态
- **WHEN** 用户点击 Composer 主输入框区域
- **THEN** popover MUST 保持打开状态
- **AND** Composer 输入框 MUST 获得焦点，用户可立即输入

#### Scenario: Escape key closes popover

- **GIVEN** 看板 popover 处于打开状态
- **WHEN** 用户按下 Escape 键
- **THEN** popover MUST 立即关闭

#### Scenario: trigger button toggle closes popover

- **GIVEN** 看板 popover 处于打开状态
- **WHEN** 用户再次点击看板触发按钮（`.composer-kanban-trigger`）
- **THEN** popover MUST 关闭（toggle 行为）

#### Scenario: other ComposerContextMenuPopover instances unaffected

- **GIVEN** 代码库中存在其他使用 `ComposerContextMenuPopover` 的场景（如文件上下文菜单）
- **WHEN** 用户点击这些 popover 的外部区域
- **THEN** 这些 popover MUST 仍然通过外部点击关闭（默认行为不变）
- **AND** 仅看板 popover 使用非外部点击关闭策略

