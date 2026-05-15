# filetree-multitab-open Specification

## Purpose

Defines the filetree-multitab-open behavior contract, covering 文件树支持多文件并行打开.

## Requirements
### Requirement: 文件树支持多文件并行打开

系统 SHALL 在文件树双击打开行为中支持多文件并行打开，而不是替换当前文件。

#### Scenario: 打开第二个文件不关闭第一个文件

- **GIVEN** 用户已打开文件 A
- **WHEN** 用户在文件树双击文件 B
- **THEN** 系统 SHALL 保留文件 A 的已打开状态
- **AND** 新增文件 B 到已打开 Tab 列表

#### Scenario: 双击已打开文件时激活而非重复创建

- **GIVEN** 文件 A 已存在于已打开 Tab 列表
- **WHEN** 用户再次双击文件 A
- **THEN** 系统 SHALL 仅切换活动 Tab 到文件 A
- **AND** 不得新增重复 Tab

#### Scenario: 单击文件仅更新选中态

- **WHEN** 用户在文件树单击任意文件节点
- **THEN** 系统 SHALL 仅更新选中态
- **AND** 不得触发文件打开动作

### Requirement: 文件 Tab 支持切换与关闭

系统 SHALL 提供标签化切换与关闭能力，且关闭活动标签后焦点行为可预测。

#### Scenario: 切换活动标签

- **WHEN** 用户点击任意已打开文件 Tab
- **THEN** 系统 SHALL 将对应文件设为活动 Tab
- **AND** 文件查看区 SHALL 渲染该文件内容

#### Scenario: 关闭活动标签后的焦点回退

- **GIVEN** 用户关闭当前活动 Tab
- **WHEN** 当前标签右侧存在相邻标签
- **THEN** 系统 SHALL 激活右侧标签
- **AND** 若无右侧标签，SHALL 激活左侧标签

#### Scenario: 关闭最后一个标签

- **GIVEN** 仅剩一个已打开 Tab
- **WHEN** 用户关闭该 Tab
- **THEN** 系统 SHALL 进入文件查看空态
- **AND** 不得触发异常或错误渲染

### Requirement: 兼容现有文件打开路径

系统 SHALL 在新增多 Tab 能力后保持现有文件树打开路径可用，并将打开触发统一为双击。

#### Scenario: 首次从文件树打开文件

- **GIVEN** 当前无已打开文件 Tab
- **WHEN** 用户在文件树中双击任意文件
- **THEN** 系统 SHALL 正常打开该文件并创建第一个 Tab
- **AND** 原有“文件可被快速查看内容”体验 MUST 保持不变

### Requirement: 根节点菜单动作不得破坏多 Tab 打开语义
系统 SHALL 在引入根节点上下文菜单后保持现有多 Tab 打开/激活/关闭语义不变。

#### Scenario: root operation does not clear opened tabs
- **GIVEN** 用户已打开多个文件 Tab
- **WHEN** 用户从根节点上下文菜单执行非打开类动作（例如复制路径、在访达中显示）
- **THEN** 系统 SHALL 保留当前已打开 Tab 列表与活动 Tab
- **AND** 不得触发 Tab 重置或文件查看区空态

#### Scenario: create-from-root keeps existing open contract
- **GIVEN** 用户从根节点上下文菜单执行新建文件动作并创建成功
- **WHEN** 系统按现有行为打开或聚焦该文件
- **THEN** 新文件 SHALL 按既有文件树打开契约加入或激活 Tab
- **AND** 已存在的 Tab MUST 保持不丢失

### Requirement: 文件树选择模型 SHALL 支持多选拖拽前置语义

系统 SHALL 在文件树提供平台兼容的多选语义，以支持单次拖拽携带多路径。

#### Scenario: 平台修饰键切换选择项

- **WHEN** 用户使用 macOS `⌘+Click` 或 Windows `Ctrl+Click` 单击文件树节点
- **THEN** 系统 SHALL 切换该节点的选中状态
- **AND** 已选其他节点 SHALL 保持不变

#### Scenario: Shift 区间选择

- **GIVEN** 用户已有一个锚点选中项
- **WHEN** 用户执行 `Shift+Click` 选择另一个节点
- **THEN** 系统 SHALL 选中锚点与目标之间的连续区间
- **AND** 选中集合 SHALL 可用于后续拖拽

#### Scenario: 从已选集合发起拖拽时携带多路径

- **GIVEN** 用户已在文件树中选中多个节点
- **WHEN** 用户从已选集合中的任一节点发起拖拽
- **THEN** 系统 SHALL 以同一批次携带所有已选路径
- **AND** Composer 接收后 SHALL 按既有引用链路批量插入

#### Scenario: 双击文件夹触发展开与折叠

- **WHEN** 用户在文件树双击文件夹节点
- **THEN** 系统 SHALL 切换该文件夹展开状态
- **AND** 单击文件夹 SHALL 仅更新选中态而不展开

