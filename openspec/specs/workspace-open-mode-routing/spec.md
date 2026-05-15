# workspace-open-mode-routing Specification

## Purpose

Defines the workspace-open-mode-routing behavior contract, covering 工作区导入必须支持打开模式分流.

## Requirements
### Requirement: 工作区导入必须支持打开模式分流

系统 MUST 在“添加工作区”流程中提供 `加入当前窗口` 与 `新开窗口` 两种打开模式，并在执行前明确当前选择。

#### Scenario: add workspace to current window
- **WHEN** 用户在添加工作区时选择 `加入当前窗口`
- **THEN** 系统 MUST 将目标目录导入当前客户端实例
- **AND** 系统 MUST 将导入后的 workspace 设为当前激活 workspace

#### Scenario: open workspace in new window
- **WHEN** 用户在添加工作区时选择 `新开窗口`
- **THEN** 系统 MUST 启动新窗口承载目标目录
- **AND** 当前窗口 MUST NOT 因该操作新增重复 workspace 记录

### Requirement: 系统必须提供新建窗口快捷入口

系统 SHALL 提供与 `CmdOrCtrl+Shift+N` 语义一致的新建窗口入口，支持用户并行处理多个项目。

#### Scenario: create blank new window from menu shortcut
- **WHEN** 用户触发“新建窗口”菜单项或对应快捷键
- **THEN** 系统 SHALL 创建一个新的客户端窗口实例
- **AND** 新窗口 SHALL 保持可继续导入项目的初始可操作状态

### Requirement: 路径导入必须具备去重激活行为

系统 MUST 在工作区导入前执行路径规范化匹配；当目标路径已存在于当前实例可见工作区列表时，必须激活现有项而不是重复新增。

#### Scenario: duplicated path import from add workspace
- **WHEN** 用户导入的目录路径与现有 workspace 路径规范化后相同
- **THEN** 系统 MUST 激活已有 workspace
- **AND** 系统 MUST NOT 创建新的 workspace 记录

#### Scenario: duplicated path import from open-paths startup event
- **WHEN** 系统通过 `open-paths` 或 pending paths 收到已存在路径
- **THEN** 系统 MUST 复用并激活现有 workspace
- **AND** 系统 MUST 保持导入流程幂等

### Requirement: 新窗口分流失败必须可恢复

当新窗口启动失败时，系统 MUST 提供可恢复反馈，且不得导致当前窗口进入不可用状态。

#### Scenario: new window launch failure fallback
- **WHEN** 用户选择 `新开窗口` 且窗口启动失败
- **THEN** 系统 MUST 显示明确失败原因与可恢复提示
- **AND** 当前窗口会话状态 MUST 保持不变且可继续操作

