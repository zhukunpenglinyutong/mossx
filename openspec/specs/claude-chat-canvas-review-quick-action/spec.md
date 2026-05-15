# claude-chat-canvas-review-quick-action Specification

## Purpose

Defines the claude-chat-canvas-review-quick-action behavior contract, covering Claude 配置面板 MUST 提供 Review 快捷入口.

## Requirements
### Requirement: Claude 配置面板 MUST 提供 Review 快捷入口

当当前 provider 为 `claude` 时，配置面板 MUST 显示 `Review` 快捷项；当 provider 不为 `claude` 或 `codex` 时 MUST NOT 显示该快捷项。

#### Scenario: Claude 下显示 Review

- **GIVEN** 当前 provider 为 `claude`
- **WHEN** 用户打开配置面板
- **THEN** 面板显示 `Review` 快捷项
- **AND** `Speed` 项仍保持仅 `codex` 可见

### Requirement: Claude Review preset MUST 在 claude 线程执行

在 claude 引擎下，从 `ReviewInlinePrompt` 触发的 review 目标 MUST 转换为 `/review ...` 文本命令并发送到 claude 线程，不得强制切换到 codex review RPC。

#### Scenario: Claude 审查未提交改动

- **GIVEN** 当前引擎为 `claude`
- **WHEN** 用户在 preset 选择 `Review uncommitted changes`
- **THEN** 系统向 claude 线程发送 `/review`
- **AND** 不调用 codex `start_review` RPC

#### Scenario: Claude 审查指定基础分支

- **GIVEN** 当前引擎为 `claude`
- **WHEN** 用户选择 `Review against a base branch` 并确认分支 `main`
- **THEN** 系统向 claude 线程发送 `/review base main`

### Requirement: Codex Review 行为 MUST 保持不变

Codex 引擎下 review 入口和执行路径 MUST 继续使用现有 `start_review` RPC 与线程兼容性守卫。

#### Scenario: Codex 下仍调用 RPC

- **GIVEN** 当前引擎为 `codex`
- **WHEN** 用户触发 review preset
- **THEN** 系统调用 `start_review` RPC
- **AND** 保持原有错误提示与回退行为

