## ADDED Requirements

### Requirement: Git panel MUST expose explicit file inclusion controls for commit

Git 面板 MUST 为每个 changed file row 提供明确的 inclusion control。该 control 只定义“本次 commit 是否包含该文件”，MUST NOT 取代现有 `stage / unstage` 文件动作。

#### Scenario: selecting an unstaged file includes it in the next commit without changing the visible stage action surface

- **WHEN** 用户在 `unstaged` 区勾选某个文件
- **THEN** 系统 MUST 将该文件纳入当前 commit scope
- **AND** MUST NOT 因此移除或替换该文件原有的 `Stage` action

#### Scenario: deselecting a staged file excludes it from the next commit without removing its staged state affordance

- **WHEN** 用户在 `staged` 区取消勾选某个文件
- **THEN** 系统 MUST 将该文件排除出当前 commit scope
- **AND** MUST NOT 因此移除或替换该文件原有的 `Unstage` action

#### Scenario: partially staged file remains represented by two section-scoped rows

- **WHEN** 同一路径同时存在 staged changes 与 unstaged changes
- **THEN** 系统 MUST 保留该路径在 `staged` 与 `unstaged` 两个 section 中的独立 row
- **AND** MUST NOT 将两者粗暴合并成单一路径级 checkbox

#### Scenario: partially staged file keeps the existing Git index semantics

- **WHEN** 同一路径同时存在 staged changes 与 unstaged changes
- **THEN** 系统 MUST 继续以当前 Git index 作为该路径的提交事实来源
- **AND** file-level checkbox MUST NOT 破坏已有 partial staged 语义

### Requirement: Git panel MUST support bulk inclusion controls by visible grouping

Git 面板 MUST 支持按 section 或 tree folder 进行批量 inclusion 切换，以便用户快速定义本次 commit 范围。

#### Scenario: section header includes all toggleable files in the current section

- **WHEN** 用户对某个 section 执行“全部纳入本次提交”
- **THEN** 系统 MUST 只切换该 section 当前可见且可切换的文件
- **AND** MUST NOT 跨 `staged / unstaged` section 同步修改另一侧同路径 row

#### Scenario: tree folder toggle applies to descendants in the same section only

- **WHEN** 用户在 tree 模式下切换某个 folder checkbox
- **THEN** 系统 MUST 只对该 folder 在当前 section 内的 descendant files 更新 commit scope
- **AND** MUST NOT 隐式执行批量 stage/unstage 以替代 commit scope 选择

### Requirement: Commit execution MUST be explicit and MUST NOT auto-stage all changes

提交动作 MUST NOT 因为存在 unstaged files 就在 commit 时静默 `stage all`。系统 MAY 在提交前临时准备 index 来满足本次 commit scope，但 MUST 维持现有 `stage / unstage` 用户能力与 partial staged 语义。

#### Scenario: commit is blocked when no file is selected for this commit

- **WHEN** 工作区存在改动，但当前 commit scope 为空
- **THEN** commit 入口 MUST disabled
- **AND** 系统 MUST 提示用户先显式选择要提交的文件

#### Scenario: commit can include selected unstaged-only files

- **WHEN** 用户勾选了仅存在于 `unstaged` 区的文件并执行 commit
- **THEN** 系统 MUST 让这些文件进入本次提交
- **AND** 提交完成后该文件 MUST 反映为已提交状态，而不是永久改变“旧能力”的按钮语义

#### Scenario: commit can exclude staged-only files from the current commit

- **WHEN** 用户取消勾选仅存在于 `staged` 区的文件并执行 commit
- **THEN** 系统 MUST 在本次提交中排除这些文件
- **AND** 提交完成后 SHOULD 恢复这些文件原本的 staged state

#### Scenario: commit execution does not auto-stage everything when only unstaged files exist

- **WHEN** 工作区只有 unstaged files 且用户未显式选中要提交的文件
- **THEN** 系统 MUST NOT 自动执行 `stageGitAll`
- **AND** commit MUST 保持 disabled

### Requirement: Shared commit surfaces MUST honor the same no-auto-stage contract

凡是复用“提交当前工作区未提交改动”这一 contract 的 surface，MUST 遵守相同的 no-auto-stage 语义。

#### Scenario: secondary worktree commit surface does not auto-stage all changes

- **WHEN** 次级 worktree commit surface 触发提交
- **THEN** 该入口 MUST 与主 Git 面板保持一致的 no-auto-stage 语义
- **AND** MUST NOT 在仅存在 unstaged files 时自动 stage 全部改动

#### Scenario: shared surface feedback matches main git panel contract

- **WHEN** 次级 surface 没有 staged files
- **THEN** 它 MUST 显示与主 Git 面板一致的“先选择要提交的文件”类提示
- **AND** commit enablement MUST 与主面板一致
