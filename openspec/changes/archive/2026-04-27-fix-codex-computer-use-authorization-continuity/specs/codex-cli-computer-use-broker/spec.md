## ADDED Requirements

### Requirement: Broker MUST Use A Stable Authorization Host

broker 在 local packaged app 场景下 MUST 从单一 stable authorization host 发起 `codex exec`，不得在多个 host identity 之间漂移。

#### Scenario: local packaged app host is preferred
- **WHEN** 当前客户端运行于 embedded local app mode，且 stable authorization host 可用
- **THEN** broker MUST 使用该 stable host 发起 `codex exec --json`
- **AND** MUST NOT 在主 App、daemon、debug binary 或旧签名 host 之间随机切换

#### Scenario: broker resolves the actual execution host for the current backend mode
- **WHEN** broker 运行 preflight
- **THEN** broker MUST 解析当前 backend mode 下实际执行 `codex exec` 的 host
- **AND** MUST NOT 只把前台 GUI app 当作 authorization host

#### Scenario: ambiguous launcher host blocks broker execution
- **WHEN** broker 无法确定单一 stable authorization host
- **THEN** broker MUST 返回结构化 blocked 或 failed 结果
- **AND** MUST NOT 启动 `codex exec`

### Requirement: Broker MUST Return Authorization Continuity Diagnostics

broker 遇到 sender authentication failure 时 MUST 返回 continuity-aware diagnostics，而不是只有 generic permission message。

#### Scenario: sender authentication failure includes host evidence
- **WHEN** `codex exec` 或 `computer-use` MCP tool 返回 `Apple event error -10000`、`Sender process is not authenticated` 或等价 sender authentication failure
- **THEN** broker result MUST 包含 current authorization host snapshot
- **AND** current authorization host snapshot MUST 包含 backend mode、host role 与 signing evidence
- **AND** 若存在 last successful host，MUST 同时返回对比后的 continuity diagnostics

#### Scenario: continuity blocked is distinct from generic permission block
- **WHEN** sender authentication failure 与 host drift 同时成立
- **THEN** broker MUST 将结果表达为 authorization continuity blocked
- **AND** MUST NOT 把该结果继续压缩成 generic `permission_required`

#### Scenario: same-host sender failure remains generic permission block
- **WHEN** sender authentication failure 出现
- **AND** current authorization host 与 expected stable host 一致
- **THEN** broker MUST 继续返回 generic permission / approval block
- **AND** MUST NOT 因为错误文本匹配 `-10000` 就直接转成 continuity blocked
