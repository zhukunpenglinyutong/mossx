## ADDED Requirements

### Requirement: Codex Stalled Turn MUST Transition To A Recoverable Degraded State

当 `Codex` turn 已进入前台处理态，但在受限窗口内未收到首个可推进生命周期的事件或未收到恢复后的终态事件时，系统 MUST 将其从不可恢复的伪处理中间态转为可诊断、可重试的 degraded state。

#### Scenario: waiting-first-event leaves pseudo-processing deterministically
- **WHEN** `Codex` 线程已经进入 `processing=true`
- **AND** 受管 runtime 仍存活或刚完成启动
- **AND** turn 在受限窗口内未收到 `turn/started`、首个流事件或等效生命周期推进事件
- **THEN** 系统 MUST 将该 turn 标记为 `startup-pending`、`waiting-first-event` 或等效可诊断状态
- **AND** 线程 MUST NOT 永久停留在无法解释的 loading

#### Scenario: first-event timeout follows initial turn-start timeout contract
- **WHEN** 系统对 `Codex` 首包等待阶段执行 stalled settlement
- **THEN** `first-event timeout` MUST 复用现有 `initial_turn_start_timeout` 或与其等价的统一配置口径
- **AND** 该阶段 MUST NOT 额外引入一套与启动超时相互矛盾的独立默认值

#### Scenario: stalled resume after user input becomes recoverable
- **WHEN** 用户已成功提交 `requestUserInput` 响应
- **AND** 后端恢复链在受限窗口内未产出新的生命周期事件或终态事件
- **THEN** 系统 MUST 将该 turn 转为 `resume-pending`、`resume-stalled` 或等效可恢复状态
- **AND** 用户 MUST 能继续观察诊断信息并执行显式重试或继续操作

#### Scenario: resume timeout uses a distinct bounded recovery window
- **WHEN** 系统对 `requestUserInput` 提交后的恢复阶段执行 stalled settlement
- **THEN** `resume-after-user-input timeout` MUST 使用独立于 `first-event timeout` 的 bounded recovery window
- **AND** 该窗口默认值 MUST 短于首包等待窗口

### Requirement: Codex Stalled Recovery Diagnostics MUST Be Correlatable Across Runtime And Thread Surfaces

针对同一条 `Codex` 卡死链路，runtime diagnostics、thread-facing diagnostics 与 runtime pool console MUST 共享可关联的状态维度，避免出现“前端卡住但池子显示空闲且无解释”的断裂口径。

#### Scenario: stalled turn exposes shared correlation dimensions
- **WHEN** 系统识别到 `Codex` turn 进入 `startup-pending`、`silent-busy`、`resume-pending` 或等效状态
- **THEN** 诊断事实 MUST 至少包含可用的 `workspaceId`、`threadId`、engine、guard/recovery state 与时间窗口信息
- **AND** 不同展示面 MUST 使用语义一致的状态维度表达同一条异常链

#### Scenario: terminal settlement clears stalled diagnostic state
- **WHEN** 同一条 stalled turn 后续收到了 completed、error 或显式 recoverable-abort 终态
- **THEN** 系统 MUST 清理对应的 stalled diagnostic active state
- **AND** 后续读取方 MUST 能区分“历史上发生过 stall”与“当前仍处于 stall”
