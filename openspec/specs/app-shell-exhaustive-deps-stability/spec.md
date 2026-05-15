# app-shell-exhaustive-deps-stability Specification

## Purpose

Defines the app-shell-exhaustive-deps-stability behavior contract, covering Search and composer callbacks remain stable after dependency remediation.

## Requirements
### Requirement: Search and composer callbacks remain stable after dependency remediation
The system SHALL allow `app-shell-parts` search and composer callbacks to include all referenced stable setter dependencies without changing search palette open/close, selection reset, filter toggle, or result-opening behavior.

#### Scenario: Search palette dependencies are completed
- **WHEN** the search palette callbacks and effects in `useAppShellSearchAndComposerSection.ts` are remediated for `react-hooks/exhaustive-deps`
- **THEN** the dependency arrays MUST include the referenced stable setters
- **AND** opening, closing, resetting selection, toggling filters, and opening search results MUST preserve existing behavior

### Requirement: App-shell transition and scheduler hooks remain behavior-compatible after dependency remediation
The system SHALL allow `app-shell-parts` transition and recurring scheduler hooks to include all referenced dependencies without changing home/workspace navigation or recurring kanban execution semantics.

#### Scenario: Transition callbacks are remediated
- **WHEN** `useAppShellSections.ts` completes its kanban panel open and home/workspace transition dependency arrays
- **THEN** the dependency arrays MUST include the referenced transition setters
- **AND** kanban panel navigation and home/workspace switching MUST preserve existing behavior

#### Scenario: Recurring scheduler effect is remediated
- **WHEN** the recurring scheduler effect in `useAppShellSections.ts` includes `kanbanCreateTask` in its dependency array
- **THEN** recurring task auto-completion and chained task creation MUST continue to follow the existing execution semantics
- **AND** the remediation MUST NOT introduce duplicate task creation or task status regression

### Requirement: Dependency Remediation MUST Not Become Structural Drift
app-shell、threads 与 composer 的 dependency remediation 在第一阶段 MUST 与结构抽取协同推进，不能为消 warning 再次堆积隐性耦合。

#### Scenario: dependency remediation keeps boundary ownership explicit
- **WHEN** `app-shell-parts`、threads 或 composer 热点为满足 exhaustive-deps 而调整 callback、effect 或 helper 依赖
- **THEN** 调整 MUST 保持状态 ownership 与职责边界清晰
- **AND** remediation MUST NOT 通过把更多无关状态塞入同一 hook 来“消掉 warning”

#### Scenario: extraction batch does not hide dependency regressions
- **WHEN** 某个架构收敛批次同时触及 app-shell dependency remediation 与结构抽取
- **THEN** 批次 MUST 保留 focused exhaustive-deps evidence
- **AND** 行为验证 MUST 证明 remediation 与 extraction 共同作用后仍保持稳定

