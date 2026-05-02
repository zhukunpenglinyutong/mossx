# git-selective-commit Specification

## Purpose

TBD - synced from change add-git-selective-commit. Update Purpose after archive.

## Requirements
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

### Requirement: Shared commit surfaces MUST expose the same commit scope contract

凡是复用“提交当前工作区未提交改动”这一 contract 的 surface，MUST 与主 Git 面板保持同一套 inclusion control、scope hint 与 partial staged guardrail，而不是只共享 no-auto-stage 的子集语义。

#### Scenario: secondary worktree surface exposes the same inclusion controls as the main git panel

- **WHEN** 用户在 Git History/HUB 的 worktree 提交区查看 changed files
- **THEN** 系统 MUST 提供与主 Git 面板等价的 file / folder / section inclusion control
- **AND** 这些 inclusion control MUST 只定义本次 commit scope
- **AND** MUST NOT 取代现有 stage / unstage / discard 动作

#### Scenario: shared surfaces keep the same scope hint and commit enablement

- **WHEN** 主 Git 面板与 Git History/HUB worktree 提交区面对同一组 staged / unstaged / selected files
- **THEN** 两个 surface 的 commit button enablement MUST 一致
- **AND** 两个 surface 的 scope hint copy MUST 表达同一语义
- **AND** 当当前 commit scope 为空时，两个 surface 都 MUST 阻断 commit

#### Scenario: partially staged file remains locked across shared surfaces

- **WHEN** 同一路径同时存在 staged changes 与 unstaged changes
- **THEN** 主 Git 面板与 Git History/HUB worktree 提交区都 MUST 保持该路径不可被 file-level inclusion toggle 改写为“只选一半”
- **AND** 两个 surface 都 MUST 继续以现有 Git index 作为该路径的提交事实来源

### Requirement: Commit scope path matching MUST be normalized across supported desktop platforms

commit scope 的路径匹配、folder descendants 判断与 selection dedupe MUST 使用统一 normalize contract，保证 Windows 与 macOS/Linux 在相同文件集合下得到同样的 commit scope 结果。

#### Scenario: windows-style paths match the same file scope as posix-style paths

- **WHEN** 某个 changed file 在 UI 或 runtime payload 中表现为 `src\\feature\\file.ts`
- **THEN** 系统 MUST 将它与 `src/feature/file.ts` 视为同一语义路径
- **AND** file-level inclusion state MUST 与 POSIX 写法保持一致

#### Scenario: folder toggle selects the same descendants across path styles

- **WHEN** 用户在 tree 模式下切换某个 folder inclusion control
- **THEN** 系统 MUST 基于 normalized path 判断 descendant files
- **AND** 同一组文件在 Windows 风格与 POSIX 风格路径下 MUST 得到相同的 folder scope 结果
