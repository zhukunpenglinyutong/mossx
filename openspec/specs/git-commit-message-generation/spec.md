# git-commit-message-generation Specification

## Purpose

定义 Git 提交信息 AI 生成能力的统一契约，覆盖语言选择、引擎选择、生成链路路由与输出清洗，确保生成结果可直接用于提交输入框且行为可预测。

## Requirements

### Requirement: AI Commit Message Generation MUST Support Language Selection

系统 MUST 支持按语言生成提交信息（`zh` / `en`），并保持 Conventional Commits 约束。

#### Scenario: selecting Chinese generates zh commit message prompt

- **WHEN** 用户选择中文生成
- **THEN** 系统 MUST 以中文 Conventional Commits 提示词发起生成
- **AND** 生成结果 SHOULD 包含标题与正文

#### Scenario: selecting English generates en commit message prompt

- **WHEN** 用户选择英文生成
- **THEN** 系统 MUST 以英文 Conventional Commits 提示词发起生成
- **AND** 生成结果 SHOULD 保持英文语义

### Requirement: AI Commit Message Generation MUST Support Engine Selection

系统 MUST 支持按引擎触发提交信息生成（Codex / Claude / Gemini / OpenCode）。

#### Scenario: codex engine uses codex background generation path

- **WHEN** 用户选择 `codex` 作为生成引擎
- **THEN** 系统 MUST 调用 codex 提交信息生成链路
- **AND** 不得额外引入并行 prompt 发送路径

#### Scenario: non-codex engines use prompt + sync message path

- **WHEN** 用户选择 `claude/gemini/opencode`
- **THEN** 系统 MUST 先获取 commit prompt
- **AND** MUST 通过对应引擎同步消息通道生成结果

### Requirement: Generated Commit Message MUST Be Sanitized Before Applying To Input

系统 MUST 在写回 commit 输入框前清洗 AI 输出，避免解释性文本污染提交内容。

#### Scenario: fenced or prefixed response is normalized to conventional title/body

- **WHEN** AI 返回包含代码块、列表前缀或解释性文本
- **THEN** 系统 MUST 提取并规范化 Conventional Commit 标题
- **AND** SHOULD 保留有效正文内容

#### Scenario: stale async result MUST NOT overwrite another workspace input

- **WHEN** 生成请求返回时用户已切换到其他 workspace
- **THEN** 系统 MUST 丢弃该结果
- **AND** 当前 workspace 输入内容 MUST 不被覆盖

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
