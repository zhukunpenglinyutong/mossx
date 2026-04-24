## ADDED Requirements

### Requirement: Host Contract Diagnostics MUST Render A Productized Stop Condition

当 host-contract diagnostics 已经证明当前宿主缺少官方 Codex parent contract 时，Computer Use surface MUST 将其展示为最终 blocked verdict，而不是普通错误详情。

#### Scenario: requires official parent becomes final verdict
- **WHEN** host-contract diagnostics 返回 `requires_official_parent`
- **THEN** UI MUST 显示当前 macOS 安装态/签名证据已经可读
- **AND** MUST 明确说明当前第三方宿主不能运行官方 Computer Use helper
- **AND** MUST 保持 bridge status 为 `blocked`

#### Scenario: handoff unavailable becomes diagnostics-only verdict
- **WHEN** official parent handoff discovery 返回 `handoff_unavailable` 或 `requires_official_parent`
- **THEN** UI MUST 显示 diagnostics-only stop condition
- **AND** MUST NOT 暗示继续授予权限或重复 activation 能解决该阻塞

#### Scenario: unknown evidence is not promoted to final verdict
- **WHEN** host-contract diagnostics 返回 `unknown` 或 official parent evidence 不完整
- **THEN** UI MUST 保守展示原始 diagnostics
- **AND** MUST NOT 声称 Mac 安装态已经通过或当前只差官方 parent contract
