## ADDED Requirements

### Requirement: Artifact Viewer SHALL Provide Structured Outline Navigation

Spec Hub 的 artifact viewer SHALL 为当前打开的 proposal / design / specs / tasks / verification 提供结构化 outline
或 quick-jump 导航，避免用户只能通过长滚动查找目标内容。

#### Scenario: Navigate a long artifact by outline

- **GIVEN** 当前 artifact 内容包含多个 markdown heading
- **WHEN** 用户在 Spec Hub 中浏览该 artifact
- **THEN** UI SHALL 提供由该 artifact 结构生成的 outline 或 quick-jump 导航
- **AND** 用户激活 outline 项后 SHALL 跳转到对应内容位置，而不改变当前 selected change

#### Scenario: Specs outline recognizes requirement and scenario blocks

- **GIVEN** 当前 artifact tab 为 `specs`
- **AND** 当前 spec source 包含 `Requirement:` 与 `Scenario:` 语义块
- **WHEN** Spec Hub 渲染该 spec source
- **THEN** outline SHALL 区分 requirement / scenario 项与普通 heading
- **AND** 用户 SHALL 能直接跳到对应 requirement 或 scenario 段落

#### Scenario: Tasks outline highlights sections with unfinished checklist items

- **GIVEN** 当前 artifact tab 为 `tasks`
- **AND** 某个任务分组下仍有未勾选的 checklist item
- **WHEN** Spec Hub 渲染该 tasks reader outline
- **THEN** 对应的 outline 项 SHALL 显示可见但低干扰的提醒标识
- **AND** 已全部完成的 outline 项 SHALL NOT 显示同类提醒

### Requirement: Artifact Viewer SHALL Support Linked Spec Reading Flow

Spec Hub SHALL 提供从 proposal capability 到 spec source 的显式阅读跳转能力，并在多 spec source 场景下保持当前 surface 的阅读上下文可恢复。

#### Scenario: Proposal capability jumps to matching spec source

- **GIVEN** 当前 change 同时包含 proposal 与一个或多个 spec source
- **AND** proposal 中存在与某个 spec capability 对应的阅读跳转入口
- **WHEN** 用户激活该 capability 跳转
- **THEN** Spec Hub SHALL 切换到 `specs` artifact
- **AND** 与该 capability 对应的 spec source SHALL 成为当前 active source

#### Scenario: Current spec source is restored within the same surface

- **GIVEN** 某个 change 具有多个 spec source
- **WHEN** 用户在当前 surface 中切换过 spec source，随后切换到其他 artifact 再返回 `specs`
- **THEN** Spec Hub SHALL 恢复该 surface 最近一次 active spec source
- **AND** source switcher SHALL 明确标识当前 active source

### Requirement: Reader Surface SHALL Support Collapsible Side Panes

Spec Hub 的阅读 surface SHALL 支持以正文为中心的双侧 pane 布局：左侧 change browsing 可折叠且可调宽，右侧阅读导航可折叠且默认收起。

#### Scenario: Reader outline starts collapsed and can be expanded on demand

- **GIVEN** 用户首次打开某个 surface 上的 artifact reader
- **WHEN** 当前 artifact 存在可用的 outline / linked spec 导航
- **THEN** reader outline pane SHALL 默认处于折叠状态
- **AND** 用户展开后 SHALL 在不切换 artifact 的前提下查看并使用当前文档的结构化导航

#### Scenario: Changes pane can collapse and resize safely

- **GIVEN** 当前 Spec Hub surface 处于非 artifact maximized 状态
- **WHEN** 用户折叠左侧 changes pane 或拖拽其宽度
- **THEN** 正文阅读区 SHALL 重新分配空间而不发生布局断裂
- **AND** changes pane 的折叠状态与安全宽度 SHALL 按 surface 维度被恢复

#### Scenario: Detached reader keeps the control-center entry discoverable

- **GIVEN** 当前 surface 为 detached Spec Hub reader
- **WHEN** 用户查看 artifact header controls
- **THEN** 系统 SHALL 保留既有 control center toggle
- **AND** detached surface 首次进入时 SHALL 默认维持 control center collapsed
- **AND** 阅读流 SHALL 不因执行台默认折叠而失去正文浏览能力

#### Scenario: Primary Spec Hub buttons open the detached reader directly

- **GIVEN** 用户通过 sidebar、header 或 file tree root action 触发 `Spec Hub`
- **WHEN** 系统处理该入口动作
- **THEN** 系统 SHALL 直接打开或聚焦 detached Spec Hub window
- **AND** 它 SHALL NOT 再把主窗体切换到嵌入式 Spec Hub 作为默认路径
