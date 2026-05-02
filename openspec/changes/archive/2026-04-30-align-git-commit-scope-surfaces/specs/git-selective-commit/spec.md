## ADDED Requirements

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

