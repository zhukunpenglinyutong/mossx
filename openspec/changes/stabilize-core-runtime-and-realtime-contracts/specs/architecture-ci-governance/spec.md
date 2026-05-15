## MODIFIED Requirements

### Requirement: Architecture Hardening Batches MUST Declare Validation Gates Up Front

第一阶段架构收敛批次 MUST 在实现前声明适用的质量门禁与 focused validation，而不是在实现后补跑模糊回归。

#### Scenario: validation matrix is declared before implementation

- **WHEN** 某个架构收敛批次被开始执行
- **THEN** 该批次 MUST 先声明适用的 OpenSpec、frontend、backend、runtime contract、persistent state、large-file、heavy-test-noise 与 platform evidence gates
- **AND** 该批次 MUST NOT 在未定义验证矩阵的情况下直接进入实现

#### Scenario: core runtime realtime stabilization declares mandatory gates

- **WHEN** this stabilization change is implemented
- **THEN** the implementation plan MUST include always-required gates for `npm run typecheck`, `npm run test`, `npm run perf:realtime:boundary-guard`, Rust runtime tests, and strict OpenSpec validation
- **AND** the implementation plan MUST declare when-touched gates for `npm run check:runtime-contracts`, heavy-test-noise sentry checks, and large-file governance checks
- **AND** skipped commands MUST include concrete reason, impact, and residual risk

#### Scenario: when-touched gates run when their surface is touched

- **WHEN** this stabilization change touches bridge payloads, command registration, runtime contracts, app-server payloads, tests/logging, source extraction, fixture growth, or near-threshold files
- **THEN** the matching runtime-contracts, heavy-test-noise, or large-file governance gate MUST run before completion
- **AND** a skipped matching gate MUST record why it was not applicable or not runnable, plus the residual risk

### Requirement: Documentation-Only Batches MUST Declare Explicit Runtime Gate Skips

仅文档批次若跳过运行时门禁，MUST 显式说明。

#### Scenario: docs-only batch skips runtime gates with note

- **WHEN** 某个批次只修改 OpenSpec、Trellis、Markdown 或其他非代码文档
- **THEN** 该批次 MUST 显式记录 runtime-related gates 被跳过
- **AND** 变更记录 MUST 显式注明跳过原因
