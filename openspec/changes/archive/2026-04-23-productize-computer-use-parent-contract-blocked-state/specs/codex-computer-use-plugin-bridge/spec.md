## ADDED Requirements

### Requirement: Bridge Guidance MUST Distinguish Mac Readiness From Parent Contract Block

Computer Use bridge guidance MUST 把“官方安装态/签名证据可读”和“当前宿主可运行 helper”拆开表达，避免用户把 parent contract 阻塞误判为权限未点完。

#### Scenario: mac evidence is readable but host remains blocked
- **WHEN** Codex App、official plugin、helper path、codesign 或 parent team evidence 可读
- **THEN** UI MAY 表达 Mac-side evidence is readable
- **AND** MUST NOT 将其等同于 `ready`

#### Scenario: unsupported workaround is rejected in user guidance
- **WHEN** parent contract verdict 已经出现
- **THEN** guidance MUST NOT 推荐 direct exec nested helper、复制 helper、重签名、patch bundle 或修改官方 plugin cache
- **AND** MUST 建议等待官方 handoff/API 或继续 diagnostics-only
