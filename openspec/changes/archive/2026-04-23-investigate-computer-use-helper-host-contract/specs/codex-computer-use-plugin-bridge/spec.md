## ADDED Requirements

### Requirement: Bridge MUST Preserve Official Helper Handoff Boundary

系统 MUST 只调查官方支持的 handoff boundary，不得复制、修改、重签名、重打包或伪造官方 Computer Use helper 的 parent contract。

#### Scenario: bridge records official handoff evidence without mutating assets
- **WHEN** host-contract diagnostics 检查 official app bundle、plugin manifest、helper descriptor 或 launch services evidence
- **THEN** 系统 MUST 以只读方式采集 evidence
- **AND** MUST NOT 写入官方 Codex App、plugin cache、helper bundle 或 macOS approval database

#### Scenario: bridge rejects asset mutation as remediation
- **WHEN** diagnostics 判断 direct third-party host 无法满足 helper parent contract
- **THEN** remediation MUST NOT 建议复制、重签名、重打包或替换官方 helper
- **AND** MUST 将结果表达为 `requires_official_parent`、`handoff_unavailable` 或等待官方 API 的等价 guidance

### Requirement: Bridge MUST Not Promote Host Diagnostics To Conversation Runtime

host-contract diagnostics 的任何成功或失败结果 MUST 只影响 Computer Use settings surface 与后续提案决策，不得在本阶段自动开启 conversation runtime integration。

#### Scenario: handoff verified remains diagnostic evidence
- **WHEN** host-contract diagnostics 返回 `handoff_verified`
- **THEN** 系统 MUST 只在 Computer Use surface 展示该证据
- **AND** MUST NOT 自动注册 Computer Use conversation tool、MCP relay 或后台 automation

#### Scenario: host diagnostics failure remains isolated
- **WHEN** host-contract diagnostics 返回 `handoff_unavailable`、`requires_official_parent`、`manual_permission_required` 或 `unknown`
- **THEN** 现有聊天、Codex、MCP、设置与工作区功能 MUST 保持不变
- **AND** MUST NOT 因该失败进入重试循环
