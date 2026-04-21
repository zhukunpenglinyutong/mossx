## ADDED Requirements

### Requirement: Codex Launch Resolution MUST Reuse Existing Stable Precedence

backend MUST 继续基于现有 `codexBin`、`codexArgs`、workspace `codex_bin`、workspace `codexArgs` 与 worktree inheritance 计算 effective launch context。

#### Scenario: workspace executable override wins over global default

- **WHEN** 某 workspace 配置了 `codex_bin`
- **THEN** 该 workspace 的 effective executable MUST 以 `codex_bin` 为准
- **AND** 只有在 workspace 未配置时才回退到 global `codexBin`

#### Scenario: worktree args inherit parent before global

- **WHEN** 当前 workspace 是 worktree 且自身未配置 `codexArgs`
- **THEN** 系统 MUST 先尝试继承 parent workspace 的 `codexArgs`
- **AND** 只有 parent 也未配置时才回退到 global `codexArgs`

### Requirement: Preview And Doctor MUST Share The Same Launch Resolution

preview 与 doctor MUST 复用同一套 launch resolution，而不是分别推导各自的命令结果。

#### Scenario: preview returns the same resolved executable semantics as doctor

- **WHEN** frontend 请求 Launch Configuration preview
- **THEN** backend MUST 返回 resolved executable、wrapper kind、user arguments 与 injected arguments
- **AND** 这些字段的语义 MUST 与 doctor 对同一配置的解释一致

#### Scenario: invalid configuration is reported before next launch

- **WHEN** 用户输入非法 executable 或非法 args 配置
- **THEN** preview / validation MUST 返回结构化错误
- **AND** 系统 MUST 在影响下次启动前阻止用户以“看起来已保存成功但实际无法启动”的状态继续前进

### Requirement: Phase One Launch Configuration MUST Not Introduce Runtime Lifecycle Side Effects

Phase 1 的 Launch Configuration 能力 MUST 只影响后续启动路径，不得把设置增强扩展成 runtime lifecycle 重构。

#### Scenario: saving launch configuration does not trigger runtime replacement

- **WHEN** 用户保存 Launch Configuration
- **THEN** 系统 MUST NOT 启动 replacement runtime 或执行 staged swap
- **AND** 当前已连接 runtime MUST 继续保持可用

#### Scenario: phase one does not mutate external config to achieve effect

- **WHEN** 用户保存或预览 Launch Configuration
- **THEN** 系统 MUST 只使用 app-local settings 与现有 runtime resolution
- **AND** MUST NOT 通过改写 external Codex config 文件来实现生效
