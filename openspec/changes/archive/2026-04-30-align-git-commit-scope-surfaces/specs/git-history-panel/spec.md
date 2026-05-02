## ADDED Requirements

### Requirement: Git History worktree commit surface MUST mirror the main git panel commit semantics

Git History/HUB 内的 worktree 提交区 MUST 以右侧主 Git 面板为 canonical surface，保持同一套 commit scope、commit hint、button enablement 与 AI generation 语义。

#### Scenario: worktree surface mirrors main panel commit feedback

- **WHEN** Git History/HUB worktree 提交区与主 Git 面板面对同一组 staged / unstaged / selected changes
- **THEN** 两个 surface 的 commit button enablement MUST 一致
- **AND** 两个 surface 的 hint copy MUST 表达同一 commit scope 状态
- **AND** 空 scope 时两者都 MUST 阻断 commit

#### Scenario: worktree surface mirrors main panel generation menu semantics

- **WHEN** 用户在 Git History/HUB worktree 提交区触发 AI 生成提交信息
- **THEN** 系统 MUST 提供与主 Git 面板一致的 engine selection 与 language selection 入口
- **AND** 生成请求 MUST 基于当前 worktree surface 的 commit scope
- **AND** 生成结果 MUST 与主 Git 面板在相同 scope 下保持语义一致

#### Scenario: worktree surface keeps file tree scope behavior stable across platforms

- **WHEN** Git History/HUB worktree 提交区在 tree 模式下渲染 Windows 风格或 POSIX 风格路径
- **THEN** file row、folder row 与 section row 的 commit scope 判断 MUST 基于 normalized path contract
- **AND** 用户在不同平台下对同一文件集合执行 inclusion toggle 时 MUST 得到相同结果

