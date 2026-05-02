## ADDED Requirements

### Requirement: Main git panel file rows MUST expose explicit preview actions

右侧主 Git 面板的 changed file row MUST 在行尾 action 区显式暴露 preview actions，而不是只依赖 row 单击 / 双击手势。

#### Scenario: preview actions are visible in both flat and tree list views

- **WHEN** 用户在右侧主 Git 面板查看 changed file list
- **THEN** 每个 file row MUST 在行尾 action 区显示两个 preview action buttons
- **AND** 该 requirement MUST 同时适用于 `flat` 与 `tree` 两种列表模式

#### Scenario: preview actions appear before mutation actions

- **WHEN** file row 同时显示 preview actions 与 `stage / unstage / discard` actions
- **THEN** preview action buttons MUST 出现在 `+ / - / 回退` 之前
- **AND** MUST NOT 移除或替代原有 mutation actions

### Requirement: Explicit preview actions MUST preserve existing preview semantics

显式 preview action buttons MUST 复用现有 preview 行为，而不是引入新的 preview 模式或破坏旧手势语义。

#### Scenario: inline preview action matches single-click behavior

- **WHEN** 用户点击 file row 的 inline preview button
- **THEN** 系统 MUST 执行与“单击 file row”一致的中间区域 diff 预览行为

#### Scenario: modal preview action matches double-click behavior

- **WHEN** 用户点击 file row 的 modal preview button
- **THEN** 系统 MUST 执行与“双击 file row”一致的 modal diff 预览行为

#### Scenario: row click and double-click remain available

- **WHEN** 新的 preview action buttons 已显示
- **THEN** 现有 row 单击与双击手势 MUST 继续可用
- **AND** preview action button click MUST NOT 冒泡成额外的 row click / double-click 重复触发
