## ADDED Requirements

### Requirement: Settings MUST Expose Conservative Codex Launch Configuration Editors

系统 MUST 在 Codex 设置中提供保守版 Launch Configuration editor，但 Phase 1 只覆盖 `executable` 与 `arguments`。

#### Scenario: global launch configuration editor is visible

- **WHEN** 用户打开 Codex settings
- **THEN** 系统 MUST 展示 default executable 与 default arguments 编辑控件
- **AND** MUST NOT 在 Phase 1 强制暴露 environment 编辑能力

#### Scenario: workspace launch configuration shows inherit or override state

- **WHEN** 用户打开某个 workspace 的 Codex 启动配置
- **THEN** 系统 MUST 明确显示该 workspace 当前处于 inherit 还是 explicit override 状态
- **AND** worktree 在自身未设置时 MUST 按 parent workspace 再回退到 global 的顺序解释当前结果

### Requirement: Saving Launch Configuration MUST Not Interrupt Current Runtime

系统 MUST 把 Launch Configuration 的普通保存定义为 next-launch only 行为，不得影响当前已连接的 Codex runtime。

#### Scenario: save updates next launch only

- **WHEN** 用户保存 global 或 workspace Launch Configuration
- **THEN** 系统 MUST 持久化该配置
- **AND** MUST NOT 因普通保存动作自动重启当前已连接的 Codex runtime

#### Scenario: unchanged users keep current behavior

- **WHEN** 用户从未修改 Launch Configuration
- **THEN** 系统 MUST 保持该用户的 Codex 启动行为与当前版本一致
- **AND** MUST NOT 因此能力上线引入默认启动行为变化

### Requirement: Preview And Doctor MUST Be Available Before Launch-Affecting Save

系统 MUST 在用户真正影响下次启动前提供可见的 preview 或 doctor 结果。

#### Scenario: preview shows effective executable and injected suffix

- **WHEN** 用户编辑 Launch Configuration 并请求预览
- **THEN** 系统 MUST 返回 resolved executable、wrapper kind、user arguments 与 injected arguments
- **AND** 该预览 MUST 对应实际 runtime launch resolution

#### Scenario: doctor explains gui launch context

- **WHEN** 用户运行 Codex doctor
- **THEN** 系统 MUST 继续返回 GUI 实际使用的 binary、wrapper、PATH / probe 等诊断信息
- **AND** 这些诊断 MUST 与 preview 使用相同的 launch resolution 语义
