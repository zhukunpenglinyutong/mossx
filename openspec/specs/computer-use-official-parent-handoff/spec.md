# computer-use-official-parent-handoff Specification

## Purpose
TBD - created by archiving change discover-computer-use-official-parent-handoff. Update Purpose after archive.
## Requirements
### Requirement: Official Parent Handoff Discovery MUST Be Read-Only

系统 MUST 仅通过只读 metadata scan 调查官方 `Codex.app` 是否暴露 Computer Use handoff 入口，不得启动 helper 或修改官方资产。

#### Scenario: scan official codex metadata
- **WHEN** 用户在 `macOS` Computer Use surface 显式触发 official parent handoff discovery
- **THEN** 系统 MUST 读取官方 Codex app、plugin manifest、helper descriptor、Info.plist 或等价 metadata
- **AND** MUST NOT 直接 exec `SkyComputerUseClient` 或启动 Computer Use runtime

#### Scenario: scanner avoids asset mutation
- **WHEN** discovery 读取官方 bundle、plugin cache、helper descriptor 或 LaunchServices metadata
- **THEN** 系统 MUST 以只读方式访问
- **AND** MUST NOT 写入、复制、重签名、重打包或 patch 官方资产

### Requirement: Official Parent Handoff Discovery MUST Return Structured Classification

系统 MUST 为 handoff discovery 返回结构化结果，区分候选入口、不可用、需要官方 parent 与未知。

#### Scenario: candidate handoff method is reported as evidence only
- **WHEN** scanner 发现 URL scheme、XPC/service、MCP descriptor、plugin descriptor 或等价候选入口
- **THEN** 系统 MUST 返回 `handoff_candidate_found` 或等价分类
- **AND** MUST 将该入口标记为 evidence，而不是 runtime enabled

#### Scenario: no handoff method remains unavailable
- **WHEN** scanner 未发现可解释的 official parent handoff method
- **THEN** 系统 MUST 返回 `handoff_unavailable` 或 `requires_official_parent`
- **AND** MUST 明确说明当前只能保留 diagnostics-only 状态

#### Scenario: incomplete metadata remains unknown
- **WHEN** scanner 无法读取关键 metadata 或 metadata 互相矛盾
- **THEN** 系统 MUST 返回 `unknown`
- **AND** MUST NOT 把未知结果升级为 ready

### Requirement: Official Parent Handoff Discovery MUST Preserve Runtime Isolation

handoff discovery MUST 只影响 Computer Use settings diagnostics surface，不得自动启用 conversation runtime、MCP relay 或后台 automation。

#### Scenario: candidate found does not register runtime tool
- **WHEN** handoff discovery 返回 candidate method
- **THEN** 系统 MUST 只展示候选 evidence
- **AND** MUST NOT 自动注册 Computer Use conversation tool、MCP relay 或 background automation

#### Scenario: ordinary workflows never trigger handoff discovery
- **WHEN** 用户执行聊天发送、状态刷新、设置保存、线程恢复或 MCP 管理
- **THEN** 系统 MUST NOT 触发 official parent handoff discovery
- **AND** MUST NOT 读取或尝试 handoff candidate

