# codex-chat-canvas-plan-streaming-contract Specification

## Purpose

Defines the codex-chat-canvas-plan-streaming-contract behavior contract, covering Plan Stream Event Mapping.

## Requirements

### Requirement: Plan Stream Event Mapping

系统 MUST 将 Codex Plan 流式事件映射为稳定的前端时间线语义，保证计划提案与实施阶段可区分。

#### Scenario: plan event maps to proposed plan timeline item

- **WHEN** 客户端收到 Codex `plan` 流式 item
- **THEN** 前端 MUST 生成 `proposed-plan` 时间线项
- **AND** 该项 MUST 绑定当前 `thread_id` 与 `turn_id`

#### Scenario: plan implementation event maps to implementation timeline item

- **WHEN** 客户端收到 Codex `planImplementation` 流式 item
- **THEN** 前端 MUST 生成 `plan-implementation` 时间线项
- **AND** 该项 MUST 与对应计划提案建立可追踪关联

#### Scenario: implement-plan action id is preserved

- **WHEN** 流式 item 携带 `implement-plan:*` action id
- **THEN** 前端 MUST 保留 action id 原值
- **AND** 用户触发动作时 MUST 回传同一 action id

### Requirement: Plan Timeline and Panel Compatibility

系统 MUST 在计划时间线语义落地期间保持对历史 `turn/plan/updated` 面板路径的兼容。

#### Scenario: timeline takes precedence when both sources exist

- **GIVEN** 同一 turn 同时出现 timeline item 与 `turn/plan/updated` 数据
- **WHEN** 前端渲染计划视图
- **THEN** 时间线语义 MUST 作为主展示源
- **AND** 面板数据 MUST 仅作为摘要或回退来源

#### Scenario: panel fallback remains available for legacy threads

- **GIVEN** 历史线程仅存在 `turn/plan/updated` 数据
- **WHEN** 前端渲染计划视图
- **THEN** 系统 MUST 保持可读计划展示
- **AND** MUST NOT 出现空白状态回归

### Requirement: Engine Isolation for Plan Streaming

Plan 流式映射能力 MUST 只作用于 Codex 引擎。

#### Scenario: non-codex engines bypass codex plan mapping

- **WHEN** 当前活动引擎为 `claude` 或 `opencode`
- **THEN** 系统 MUST NOT 触发 Codex Plan 时间线映射
- **AND** 既有渲染行为 MUST 保持不变

