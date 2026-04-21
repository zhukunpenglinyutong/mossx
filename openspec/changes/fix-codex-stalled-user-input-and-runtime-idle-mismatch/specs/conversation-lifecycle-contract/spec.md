## ADDED Requirements

### Requirement: Foreground Turn MUST Exit Pseudo-Processing When Recovery Progress Stalls

在统一会话生命周期契约下，任何已经进入 foreground processing 的 turn，只要其恢复链无法继续推进，就 MUST 以可恢复的 degraded 方式离开伪处理中间态，而不是无限保持 loading。

#### Scenario: waiting-first-event does not block lifecycle forever
- **WHEN** 前端已将线程标记为 processing
- **AND** turn 在受限窗口内未收到启动后的首个可推进事件
- **THEN** 生命周期 MUST 转入可诊断的 stalled/degraded 子状态
- **AND** 线程 MUST 不再表现为无法解释的永久 loading

#### Scenario: missing terminal event after user input still settles lifecycle
- **WHEN** 用户提交 `requestUserInput` 后 turn 恢复执行
- **AND** 生命周期在受限窗口内没有收到新的进度事件或终态事件
- **THEN** 系统 MUST 以 recoverable degraded 结果结算当前恢复阶段
- **AND** 线程 MUST 重新进入可交互状态

### Requirement: Cross-Surface Lifecycle State MUST Remain Non-Contradictory

生命周期展示面之间 MUST 避免对同一条 turn 给出互相矛盾的主状态结论。

#### Scenario: runtime pool cannot report unexplained idle during foreground stall
- **WHEN** 线程仍处于 foreground stalled 或 resume-pending 状态
- **THEN** runtime pool、thread canvas 与 diagnostics surface MUST 共享“仍有前台未结算工作”的事实
- **AND** runtime pool MUST NOT 在无附加解释的情况下仅显示 `idle`

#### Scenario: settled turn removes foreground stalled contract
- **WHEN** turn 收到 completed、error 或 recoverable abort 等终态
- **THEN** 前台 stalled 标记 MUST 被清理
- **AND** 各展示面 MUST 收敛到一致的 settled 生命周期结果
