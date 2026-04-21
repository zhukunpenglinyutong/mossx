## MODIFIED Requirements

### Requirement: User Input Response Roundtrip

系统 MUST 将用户输入结果通过标准响应通道回传给服务端，并在提交后使线程生命周期进入可恢复、可结算状态，而不是留下不可恢复的伪 processing。

#### Scenario: submit answers uses respond_to_server_request contract

- **WHEN** 用户在输入卡片点击提交
- **THEN** 客户端 MUST 调用 `respond_to_server_request`
- **AND** result payload MUST 符合 `{ answers: Record<string, { answers: string[] }> }`
- **AND** 提交成功后 MUST 从队列移除当前请求

#### Scenario: submit failure preserves request in queue

- **WHEN** 用户在输入卡片点击提交
- **AND** `respond_to_server_request` IPC 调用失败（网络异常、进程崩溃等）
- **THEN** 当前请求 MUST NOT 从队列移除
- **AND** 用户 MUST 能看到错误提示
- **AND** 用户 MUST 能重新点击提交

#### Scenario: successful submit cannot leave thread in permanent blocked processing

- **WHEN** 用户成功提交 `requestUserInput` 响应
- **AND** 当前 turn 在受限窗口内没有收到新的恢复事件或终态事件
- **THEN** 线程 MUST 转入 `resume-pending`、recoverable degraded 或等效可解释状态
- **AND** 用户 MUST 能继续操作而不是面对永久不可点击的阻塞界面

#### Scenario: settled resume clears submitted request blocking state

- **WHEN** 提交后的恢复链最终收到了 completed、error 或显式 recoverable abort 终态
- **THEN** 系统 MUST 清理与该 request 关联的提交中阻塞状态
- **AND** 同线程后续的 `requestUserInput` 卡片 MUST 保持可交互
