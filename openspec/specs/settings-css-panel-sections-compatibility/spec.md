# settings-css-panel-sections-compatibility Specification

## Purpose

Defines the settings-css-panel-sections-compatibility behavior contract, covering Settings CSS Section Split Compatibility.

## Requirements
### Requirement: Settings CSS Section Split Compatibility
The system SHALL preserve the effective selector contract and user-visible settings panel styling when oversized settings CSS sections are moved into dedicated shard files.

#### Scenario: Existing settings selectors stay stable after section extraction
- **WHEN** `settings.part1.css` or `settings.part2.css` moves a whole panel section into a new shard file
- **THEN** the extraction MUST preserve the same class selectors, CSS variable names, and DOM-facing styling contract as before
- **AND** existing settings components MUST NOT require any `className` or import migration for that extraction batch

#### Scenario: Aggregated import order preserves equivalent cascade
- **WHEN** `src/styles/settings.css` is updated to include new shard files
- **THEN** the new imports MUST appear in positions that preserve the original section-level cascade order
- **AND** the extraction MUST NOT move those rules to a globally later or earlier slot that changes intended override relationships

#### Scenario: Section split reduces file size without changing panel semantics
- **WHEN** retained hard-debt sections are extracted from `settings.part1.css` and `settings.part2.css`
- **THEN** both oversized source files MUST fall below the active `styles` policy fail threshold
- **AND** the resulting settings panel appearance and section semantics MUST remain equivalent to the pre-split behavior

### Requirement: Basic Behavior Settings MUST Host Performance Compatibility Controls

设置页基础-行为区域 MUST 承载低性能兼容模式与诊断导出入口，同时保持现有设置页结构与样式契约稳定。

#### Scenario: Basic behavior renders compatibility and diagnostics controls
- **WHEN** 用户打开设置页的基础-行为 tab
- **THEN** 系统 MUST 显示低性能兼容模式开关
- **AND** 系统 MUST 显示手动导出诊断包动作

#### Scenario: Existing basic behavior controls remain available
- **WHEN** 新增性能兼容与诊断入口后
- **THEN** 现有发送快捷键、流式输出、终端 Shell、代理和通知声音设置 MUST 仍可访问
- **AND** 新入口 MUST NOT 改变现有 class selector 和 card 结构的基本语义

#### Scenario: Diagnostics export result is visible and bounded
- **WHEN** 用户触发诊断导出
- **THEN** 设置页 MUST 显示成功路径或失败消息
- **AND** UI MUST NOT 因导出失败而关闭设置页或丢失未保存输入

