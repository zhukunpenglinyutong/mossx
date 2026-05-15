# codex-native-plan-default-parity Specification

## Purpose

Defines the codex-native-plan-default-parity behavior contract, covering Official Plan Default Terminology Parity.

## Requirements

### Requirement: Official Plan Default Terminology Parity

Codex 模式下用户可见术语 MUST 与官方保持一致，仅使用 `Plan Mode` 与 `Default`。

#### Scenario: user-visible mode label uses official names

- **GIVEN** 当前引擎为 `codex`
- **WHEN** 用户查看模式标签或模式提示
- **THEN** 系统 MUST 仅展示 `Plan Mode` 或 `Default`
- **AND** MUST NOT 展示内部术语 `code`

#### Scenario: mode confirmation response uses official terminology

- **GIVEN** 用户询问当前模式
- **WHEN** 系统返回模式确认答复
- **THEN** 答复 MUST 使用 `Plan Mode` / `Default` 术语
- **AND** MUST NOT 输出 `Collaboration mode: code`

### Requirement: Codex-only Mode Commands

`/plan`、`/default`、`/mode` MUST 仅在 Codex 引擎触发模式行为。

#### Scenario: codex mode command takes effect in codex engine only

- **GIVEN** 当前引擎为 `codex`
- **WHEN** 用户输入 `/plan` 或 `/default`
- **THEN** 系统 MUST 切换当前线程模式

#### Scenario: non-codex treats mode command as plain text

- **GIVEN** 当前引擎不是 `codex`
- **WHEN** 用户输入 `/plan`、`/default` 或 `/mode`
- **THEN** 系统 MUST 按普通文本发送
- **AND** MUST NOT 改变协作模式状态

#### Scenario: code alias remains backward-compatible but hidden

- **GIVEN** 当前引擎为 `codex`
- **WHEN** 用户输入 `/code`
- **THEN** 系统 MUST 视为 `/default`
- **AND** 用户可见文案 MUST 仍显示 `Default`

### Requirement: Deterministic Mode Status Query

系统 MUST 提供确定性的模式查询路径，避免仅依赖自然语言解释。

#### Scenario: mode query returns structured mode state

- **GIVEN** 当前引擎为 `codex`
- **WHEN** 用户输入 `/mode`
- **THEN** 系统 MUST 返回结构化结果，至少包含 `threadId`、`uiMode`、`runtimeMode`
- **AND** `uiMode` 与 `runtimeMode` MUST 满足映射关系

### Requirement: Thread-Scoped Mode Source of Truth

模式状态 MUST 以线程为单位收敛。

#### Scenario: mode switch is isolated by thread

- **GIVEN** Thread A 与 Thread B 模式不同
- **WHEN** 用户在两个线程间切换
- **THEN** 每个线程 MUST 恢复各自模式
- **AND** MUST NOT 发生跨线程污染

