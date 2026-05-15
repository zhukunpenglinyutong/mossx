# file-tree-visual-consistency Specification

## Purpose

Defines the file-tree-visual-consistency behavior contract, covering 多文件树视图 SHALL 采用统一视觉规范.

## Requirements
### Requirement: 多文件树视图 SHALL 采用统一视觉规范
系统 SHALL 在目标面板中使用统一的文件树视觉规范，包括行高、缩进、图标尺寸、圆角、分组容器样式与计数徽标样式。

#### Scenario: tree rows keep consistent density across panels
- **WHEN** 用户分别查看 Git Diff 树视图与 Git History 工作区文件树
- **THEN** 两处文件树行项 SHALL 使用一致的视觉密度（行高与垂直间距）
- **AND** 节点缩进与图标尺寸 SHALL 保持统一

#### Scenario: section containers and badges follow shared style contract
- **WHEN** 面板渲染 staged/unstaged 或同类分组容器
- **THEN** 分组容器外观 SHALL 遵循共享样式契约
- **AND** 变更计数徽标（正负值）SHALL 使用统一视觉语义

### Requirement: 展示层改造 MUST NOT 改变交互语义
系统 MUST 将本次改动限制在展示层，且不得改变现有交互行为、状态语义或命令调用链路。

#### Scenario: selection and expand behavior remain unchanged
- **GIVEN** 用户在当前版本可进行节点选择与展开/折叠
- **WHEN** 应用统一视觉改造后执行相同操作
- **THEN** 选择与展开/折叠语义 SHALL 与变更前一致
- **AND** 不得出现新增或丢失的交互分支

#### Scenario: context menu and commit flow keep existing behavior
- **GIVEN** 用户可通过右键菜单执行既有动作并完成提交流程
- **WHEN** 用户在改造后重复同一路径
- **THEN** 菜单动作与提交流程结果 SHALL 与改造前一致
- **AND** 系统 MUST NOT 引入新的命令分发路径

### Requirement: 本次变更 SHALL 保持后端接口零变更
系统 SHALL 不修改 Rust/Tauri 命令接口、后端数据契约与 API 行为。

#### Scenario: no backend contract change is introduced
- **WHEN** 评审本次变更涉及文件与命令调用
- **THEN** 变更范围 SHALL 限定于前端展示层（TSX/CSS）
- **AND** 不得新增、删除或修改现有 Tauri command 接口定义

#### Scenario: existing data flow stays compatible
- **WHEN** 前端请求现有文件树数据并渲染
- **THEN** 数据流与状态机 SHALL 与改造前保持兼容
- **AND** 仅视觉表现发生变化

### Requirement: 统一视觉改造 SHALL 提供可验证回归依据
系统 SHALL 提供最小可行的自动化或结构化验证，证明视觉统一与行为不回退。

#### Scenario: class contract is verifiable
- **WHEN** 运行对应组件测试或结构断言
- **THEN** 关键语义 class SHALL 在目标面板中可被稳定断言
- **AND** class contract 应支持后续持续回归检查
- **AND** 至少包含以下统一语义类：
  - `.git-filetree-section`
  - `.git-filetree-section-header`
  - `.git-filetree-list`
  - `.git-filetree-folder-row`
  - `.git-filetree-row`
  - `.git-filetree-badge`

#### Scenario: behavior tests continue to pass
- **WHEN** 运行 GitDiffPanel 与 GitHistoryPanel 相关回归测试
- **THEN** 行为测试 SHALL 保持通过
- **AND** 若快照变化，变更说明 MUST 明确其为样式层变化
- **AND** 最小回归命令基线 SHOULD 包含：
  - `pnpm vitest run src/features/git/components/GitDiffPanel.test.tsx src/features/git-history/components/GitHistoryPanel.test.tsx src/features/git-history/components/GitHistoryWorktreePanel.test.tsx`
  - `pnpm tsc --noEmit`

