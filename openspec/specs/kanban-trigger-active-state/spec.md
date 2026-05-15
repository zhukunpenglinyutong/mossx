# kanban-trigger-active-state Specification

## Purpose

Defines the kanban-trigger-active-state behavior contract, covering 看板 Trigger 选中态必须提供深色视觉反馈.

## Requirements

### Requirement: 看板 Trigger 选中态必须提供深色视觉反馈

当用户已选中某个关联看板时，Composer 底部的看板触发按钮 MUST 显示深色选中态（border、text、icon 均加深），与默认灰色态形成明确区分。

#### Scenario: trigger button reflects active selection

- **GIVEN** Composer 显示看板触发按钮
- **AND** 用户已通过 popover 选中某个看板（`selectedLinkedKanbanPanelId` 非 null）
- **WHEN** popover 关闭后
- **THEN** 触发按钮 MUST 显示深色选中态（`--text-strong` + `--border-strong`）
- **AND** 选中态 MUST 持久存在，直到用户取消选中

#### Scenario: trigger button reverts on deselection

- **GIVEN** 用户已选中某个看板，触发按钮处于深色选中态
- **WHEN** 用户再次点击同一看板取消选中（`selectedLinkedKanbanPanelId` 变为 null）
- **THEN** 触发按钮 MUST 立即恢复为默认灰色态（`--text-muted` + `--border-subtle`）

#### Scenario: trigger button stays active during panel switch

- **GIVEN** 用户已选中看板 A
- **WHEN** 用户在 popover 中切换选中看板 B
- **THEN** 触发按钮 MUST 保持深色选中态
- **AND** 显示文字 MUST 更新为看板 B 的名称

#### Scenario: hover does not conflict with active state

- **GIVEN** 触发按钮处于深色选中态
- **WHEN** 用户将鼠标悬停在触发按钮上
- **THEN** 视觉效果 MUST 保持深色（选中态与 hover 态视觉一致）
- **AND** 鼠标离开后 MUST 继续保持深色选中态

