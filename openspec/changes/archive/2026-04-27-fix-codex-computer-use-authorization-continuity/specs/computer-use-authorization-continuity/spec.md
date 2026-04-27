## ADDED Requirements

### Requirement: Computer Use Authorization Host MUST Be Explicit

系统 MUST 为每次 Codex CLI Computer Use broker 运行解析并暴露当前 authorization host，而不是让 launcher identity 隐含在当前进程树里。

#### Scenario: broker preflight exposes current authorization host
- **WHEN** 用户进入 Computer Use surface，或显式提交 broker 任务
- **THEN** 系统 MUST 解析当前 authorization host snapshot
- **AND** snapshot MUST 至少包含 display name、executable path、bundle id 或 executable identifier、team id、backend mode、host role、launch mode
- **AND** snapshot MUST 携带足以识别 signing drift 的 signing evidence 摘要

#### Scenario: current authorization host maps to actual broker execution host
- **WHEN** 系统解析 current authorization host
- **THEN** 该 host MUST 指向当前 backend mode 下实际执行 `codex exec` 的宿主
- **AND** MUST NOT 只凭前台 GUI app 名称推断 sender identity

#### Scenario: successful broker run records last successful host
- **WHEN** broker 成功完成一次 Computer Use 任务
- **THEN** 系统 MUST 持久化本机 last successful authorization host
- **AND** 后续诊断 MUST 能将 current host 与该记录进行对比

### Requirement: Authorization Continuity MUST Detect Sender Drift

系统 MUST 能区分“当前 host 真没拿到权限”和“用户授权过的不是这一次真正发起调用的 host”。

#### Scenario: sender authentication failure with host drift becomes continuity block
- **WHEN** broker 或 Computer Use tool 返回 `Apple event error -10000`、`Sender process is not authenticated` 或等价 sender authentication failure
- **AND** current authorization host 与 last successful host 或 expected stable host 不一致
- **THEN** 系统 MUST 将结果分类为 authorization continuity blocked
- **AND** MUST NOT 继续只显示 generic `permission_required`

#### Scenario: sender authentication failure without host drift remains generic permission block
- **WHEN** broker 或 Computer Use tool 返回 sender authentication failure
- **AND** current authorization host 与 expected stable host 一致
- **THEN** 系统 MAY 继续将结果分类为 generic permission / approval block
- **AND** MUST 仍然附带 current host snapshot

### Requirement: Authorization Remediation MUST Name The Exact Host

当系统判定为 authorization continuity blocked 时，remediation MUST 指向 exact host，而不是泛化到“请打开系统权限”。

#### Scenario: remediation surfaces exact launcher identity
- **WHEN** continuity blocked verdict 已产生
- **THEN** 系统 MUST 告诉用户当前应重新授权、重启或重置的是哪个 host
- **AND** MUST 展示该 host 的 display name、executable path、bundle id 或 executable identifier、team id

#### Scenario: signing drift invalidates stale continuity state
- **WHEN** current authorization host 的 signing identity、team id 或 stable launcher identity 与已记录成功值不一致
- **THEN** 系统 MUST 将旧的 continuity success 视为失效
- **AND** MUST 要求用户对当前 exact host 重新完成一次性 authorization continuity

### Requirement: Authorization Continuity MUST Compose With Host-Contract Diagnostics

continuity verdict MUST 建立在现有 host-contract diagnostics 之上，不能变成一套彼此脱节的平行诊断。

#### Scenario: same-host sender failure remains generic permission issue
- **WHEN** broker 或 Computer Use tool 返回 sender authentication failure
- **AND** current authorization host 与 expected stable host 一致
- **THEN** 系统 MUST 保留 generic permission / approval classification
- **AND** MUST NOT 因为错误文本包含 `-10000` 就直接判定为 continuity blocked

#### Scenario: continuity diagnostics reuse host-contract evidence
- **WHEN** 系统返回 authorization continuity diagnostics
- **THEN** diagnostics MUST 复用现有 host-contract evidence 与 current host evidence
- **AND** frontend MUST 能在同一个 diagnostics surface 中渲染两者
