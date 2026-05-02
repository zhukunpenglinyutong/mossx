## ADDED Requirements

### Requirement: AI commit message generation MUST honor the current commit scope

AI 提交信息生成 MUST 基于“本次真正会进入 commit 的 diff 集合”工作，而不是无条件读取整个 workspace diff。

#### Scenario: explicit file selection limits generated commit scope

- **WHEN** 用户在提交 surface 中显式选择了本次 commit 的文件范围
- **THEN** 系统 MUST 只把该 commit scope 对应的 diff 传入 commit message generation
- **AND** 未被选中的 staged-only 或 unstaged-only 文件 MUST NOT 混入生成上下文

#### Scenario: generation keeps existing quick-generate fallback when no explicit scope exists

- **WHEN** 用户未显式定义 commit scope 并触发生成提交信息
- **THEN** 系统 MUST 保持既有 baseline 语义
- **AND** 当存在 staged changes 时 MUST 以 staged diff 作为生成输入
- **AND** 当不存在 staged changes 时 MUST 以当前 unstaged diff 作为生成输入

#### Scenario: partially staged paths contribute only staged diff to generation

- **WHEN** 同一路径同时存在 staged changes 与 unstaged changes
- **THEN** 系统 MUST 只把该路径当前 index 中可提交的 staged diff 纳入生成上下文
- **AND** MUST NOT 因为生成提交信息而把该路径的 unstaged 部分错误并入 prompt

#### Scenario: scope-aware generation stays consistent across all engines

- **WHEN** 用户使用 `Codex`、`Claude`、`Gemini` 或 `OpenCode` 触发提交信息生成
- **THEN** 系统 MUST 对所有引擎使用同一个 commit scope request contract
- **AND** 不同引擎之间只允许生成链路不同
- **AND** commit scope 语义 MUST 保持一致

### Requirement: Scope-aware generation MUST normalize path filters across desktop platforms

生成链路中的 scope path filter MUST 使用统一 normalized path contract，保证 Windows 与 macOS/Linux 对同一 commit scope 产生同一组 diff 输入。

#### Scenario: windows-style selected paths target the same diff entries as posix-style paths

- **WHEN** generation request 中的 scope path 使用 `\\` 分隔符
- **THEN** 系统 MUST 将其规范化为与 `/` 分隔符等价的路径语义
- **AND** diff targeting 结果 MUST 与 POSIX 写法一致

