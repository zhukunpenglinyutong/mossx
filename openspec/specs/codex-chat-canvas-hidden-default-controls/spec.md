# codex-chat-canvas-hidden-default-controls Specification

## Purpose

Defines the codex-chat-canvas-hidden-default-controls behavior contract, covering Codex Config Menu MUST Hide Streaming And Thinking Default Controls.

## Requirements
### Requirement: Codex Config Menu MUST Hide Streaming And Thinking Default Controls

当当前会话 provider 为 `codex` 时，composer config menu MUST NOT 向用户暴露“流式传输”与“思考”两个基础开关；这两个入口不再属于 `Codex` 菜单中的用户可控项。

#### Scenario: codex menu hides streaming and thinking rows

- **GIVEN** 当前会话 provider 为 `codex`
- **WHEN** 用户打开 composer config menu
- **THEN** 菜单 MUST NOT 显示“流式传输”入口
- **AND** 菜单 MUST NOT 显示“思考”入口

#### Scenario: codex menu keeps other codex-specific controls visible

- **GIVEN** 当前会话 provider 为 `codex`
- **WHEN** 用户打开 composer config menu
- **THEN** 菜单中的 `Plan Mode`、`Speed`、`Review`、`实时用量` 等既有 `Codex` 专属入口 MUST 保持可见性与交互语义不变

### Requirement: Codex Composer Path MUST Force Streaming And Thinking Enabled

当当前会话引擎为 `codex` 时，输入框与发送前端路径消费到的 effective `streaming` 与 `thinking` 状态 MUST 视为开启；该结论 MUST NOT 依赖遗留本地持久化值或 `Claude` provider 的 thinking 设置读取结果。

#### Scenario: codex ignores stale disabled inputs and resolves both controls to enabled

- **GIVEN** 当前会话引擎为 `codex`
- **AND** 历史本地状态、上层传参或其他 fallback 值把 `streaming` 或 `thinking` 标记为关闭
- **WHEN** 系统为输入框链路解析 effective composer control state
- **THEN** effective `streaming` MUST 解析为开启
- **AND** effective `thinking` MUST 解析为开启

#### Scenario: codex does not depend on claude thinking fallback to resolve state

- **GIVEN** 当前会话引擎为 `codex`
- **WHEN** 系统初始化 composer control state
- **THEN** 系统 MUST NOT 先读取 `Claude` provider 的 always-thinking 设置再决定 `Codex` 的 effective thinking 状态

### Requirement: Non-Codex Providers MUST Preserve Existing Toggle Behavior

本次 `Codex` 专属隐藏与默认值收口 MUST NOT 改变 `claude`、`gemini`、`opencode` 等非 `Codex` provider 的既有菜单结构与 toggle 交互契约。

#### Scenario: non-codex menus keep legacy streaming and thinking toggles

- **GIVEN** 当前会话 provider 为 `claude`、`gemini` 或 `opencode`
- **WHEN** 用户打开 composer config menu
- **THEN** 菜单 MUST 继续显示既有“流式传输”与“思考”入口

#### Scenario: non-codex toggle interactions remain writable

- **GIVEN** 当前会话 provider 不为 `codex`
- **WHEN** 用户切换“流式传输”或“思考”入口
- **THEN** 系统 MUST 继续沿用现有 callback / fallback 写入行为
- **AND** 本次 `Codex` 专属收口 MUST NOT 让非 `Codex` 的 toggle 变成只读或失效

