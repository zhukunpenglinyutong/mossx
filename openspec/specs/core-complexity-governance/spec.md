# core-complexity-governance Specification

## Purpose

Defines the core-complexity-governance behavior contract, covering Behavior-Preserving Core Extraction.

## Requirements
### Requirement: Behavior-Preserving Core Extraction

The system SHALL allow core module extraction only when existing user-visible behavior and public runtime contracts remain unchanged.

#### Scenario: Frontend service bridge extraction preserves callers

- **WHEN** functionality is moved out of `src/services/tauri.ts` into domain-specific service modules
- **THEN** existing frontend imports and exports MUST continue to work until callers are intentionally migrated
- **AND** Tauri command names, payload field names, and response shapes MUST remain unchanged

#### Scenario: Backend module extraction preserves command contracts

- **WHEN** Rust backend code is moved between modules
- **THEN** registered Tauri command names MUST remain available through `src-tauri/src/command_registry.rs`
- **AND** successful responses and error propagation semantics MUST remain equivalent for existing callers

#### Scenario: UI extraction preserves behavior

- **WHEN** Settings, Composer, Git History, Threads, or related CSS files are split
- **THEN** visible UI behavior, persisted state behavior, keyboard interactions, and i18n keys MUST remain unchanged unless another OpenSpec change authorizes a behavior change

### Requirement: Incremental Regression Evidence

The system SHALL require focused validation for each core extraction batch and full regression validation before completion.

#### Scenario: Focused validation after each batch

- **WHEN** a batch extracts code from a core frontend or backend surface
- **THEN** the implementer MUST run focused tests or contract checks covering the touched behavior
- **AND** failures MUST be fixed before continuing to the next batch

#### Scenario: Full regression gate before completion

- **WHEN** the change is marked complete
- **THEN** the final verification evidence MUST include `openspec validate reduce-core-complexity-preserve-behavior --strict`
- **AND** it MUST include `npm run lint`, `npm run typecheck`, `npm run test`, `npm run check:runtime-contracts`, `npm run doctor:strict`, `npm run check:large-files:near-threshold`, and `cargo test --manifest-path src-tauri/Cargo.toml`
- **AND** any skipped command MUST be documented with a concrete reason and residual risk

#### Scenario: Manual smoke matrix before completion

- **WHEN** automated full regression has passed or documented blockers are accepted
- **THEN** the implementer MUST record manual smoke evidence for app launch, workspace selection, Codex chat, thread history, settings persistence, file preview, and Git status/diff/history flows
- **AND** any unavailable engine-specific smoke path MUST be documented with environment constraints

### Requirement: Large-File Governance During Core Refactor

The system SHALL prevent core complexity refactors from increasing large-file debt in touched areas.

#### Scenario: Touched file approaches large-file threshold

- **WHEN** a touched source, style, or test file is near a configured large-file warning threshold
- **THEN** the implementation MUST either reduce its size or document why the file remains on the watchlist
- **AND** the implementation MUST run the configured large-file check before completion

#### Scenario: New module grows beyond intended boundary

- **WHEN** extracted code creates a new module that approaches the relevant warning threshold
- **THEN** the extraction MUST be revisited before completion
- **AND** the new module MUST be split by responsibility rather than becoming a replacement hub

### Requirement: Core Extraction MUST Prefer Facade-First Migration Over Patch Growth
核心复杂度治理 MUST 优先通过 facade-first extraction 收敛，而不是继续在高风险 hub 上叠加 patch-style 分支。

#### Scenario: hotspot extraction starts from compatibility facade
- **WHEN** 第一阶段批次触及 `src/services/tauri.ts`、threads 主链路、persistent state hub 或 Rust shared-state hub
- **THEN** 该批次 MUST 先建立兼容 facade、adapter 或等价边界
- **AND** 批次 MUST NOT 以新增条件分支替代真正的边界收敛

#### Scenario: callers remain stable during migration
- **WHEN** facade-first extraction 正在进行
- **THEN** 调用方 SHOULD 保持既有 import、command surface 或 entrypoint 稳定
- **AND** 内部迁移完成前不得强迫无关调用方同时搬迁

### Requirement: Architecture Hardening Batches MUST Be Cohesive And Rollback-Ready
第一阶段批次 MUST 保持范围内聚，并具备 bounded rollback 能力。

#### Scenario: extraction batch has one coherent boundary
- **WHEN** 某个架构收敛批次被定义
- **THEN** 该批次 MUST 声明单一 coherent boundary，例如 bridge、persistent state、shared-state、lifecycle 或 runtime-mode
- **AND** 批次 MUST NOT 仅因多个热点都“大”而混做无关抽取

#### Scenario: rollback uses bounded compatibility path
- **WHEN** 某个收敛批次需要回滚
- **THEN** 系统 MUST 能通过 facade、adapter 或 bounded compatibility path 回到旧行为
- **AND** 回滚策略 MUST 不依赖一次性撤销整个架构变更历史

