## ADDED Requirements

### Requirement: Surface MUST Show Computer Use Authorization Host Identity

Computer Use surface MUST 向用户展示当前 broker 真正使用的 authorization host，避免“权限开了但不知道授权给了谁”。

#### Scenario: surface shows current host snapshot
- **WHEN** 用户打开 Computer Use surface 或刷新 broker 状态
- **THEN** UI MUST 展示 current authorization host 的 display name、executable path、bundle id 或 executable identifier、team id、backend mode、host role 与 launch mode
- **AND** 这些字段 MUST 与 backend continuity snapshot 保持一致

#### Scenario: surface compares current host with last successful host
- **WHEN** backend 返回 last successful authorization host
- **THEN** UI MUST 能同时展示 current host 与 last successful host
- **AND** MUST 明确表达两者是否发生 drift

### Requirement: Surface MUST Render Authorization Continuity Block Distinctly

当 broker 的真实问题是 authorization continuity broken 时，surface MUST 用单独 verdict 告诉用户 exact remediation，而不是继续泛化成“去打开权限”。

#### Scenario: continuity block renders exact-host remediation
- **WHEN** backend 将 broker 结果分类为 authorization continuity blocked
- **THEN** UI MUST 渲染单独的 continuity blocked verdict
- **AND** MUST 指明需要重新授权、重启或重置的是哪个 exact host

#### Scenario: continuity block does not collapse into generic permission copy
- **WHEN** continuity blocked verdict 已存在
- **THEN** surface MUST NOT 只显示 generic `permission_required` / `approval_required` copy
- **AND** MUST 保留 exact host evidence 与 drift explanation

#### Scenario: same-host sender failure still renders generic permission guidance
- **WHEN** backend 将 broker 结果分类为 generic permission / approval block
- **AND** current authorization host 与 expected stable host 一致
- **THEN** surface MUST 保留 generic permission guidance
- **AND** MUST NOT 误渲染 continuity drift badge
