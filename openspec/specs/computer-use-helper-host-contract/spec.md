# computer-use-helper-host-contract Specification

## Purpose

Defines the computer-use-helper-host-contract behavior contract, covering Host Contract Diagnostics MUST Be Explicit And Non-Crashing.

## Requirements
### Requirement: Host Contract Diagnostics MUST Be Explicit And Non-Crashing

系统 MUST 仅在 `macOS` 上由用户显式触发 Computer Use host-contract diagnostics，并且 MUST NOT 直接 exec 已知会触发 crash report 的 nested app-bundle helper 路径。

#### Scenario: user explicitly starts host contract diagnostics
- **WHEN** 当前平台为 `macOS`，bridge 已检测到官方 Codex App、Computer Use plugin 与 nested helper，且用户在 Computer Use surface 显式点击 host-contract diagnostics
- **THEN** 系统 MUST 启动一次 bounded diagnostics run
- **AND** MUST 将该 run 标记为用户触发的 host-contract investigation，而不是普通 status refresh

#### Scenario: direct nested helper exec is skipped
- **WHEN** diagnostics 识别到 helper 位于官方 `SkyComputerUseClient.app/Contents/MacOS/` 或等价 nested app-bundle CLI 路径
- **THEN** 系统 MUST NOT 直接 exec 该 helper path
- **AND** MUST 返回 `requires_official_parent` 或 `handoff_unavailable` 等结构化分类，而不是制造新的 macOS crash report

#### Scenario: unsupported platform cannot start diagnostics
- **WHEN** 当前平台为 `Windows` 或其他非 `macOS` 平台
- **THEN** 系统 MUST NOT 暴露或执行 host-contract diagnostics
- **AND** MUST 继续返回 explicit unsupported 状态

### Requirement: Host Contract Diagnostics MUST Return Structured Evidence

系统 MUST 为每次 host-contract diagnostics 返回结构化证据，至少能表达 helper identity、宿主 identity、handoff 方式、签名评估摘要和 bounded output snippet。

#### Scenario: diagnostics returns host contract classification
- **WHEN** host-contract diagnostics 完成
- **THEN** 结果 kind MUST 属于 `requires_official_parent`、`handoff_unavailable`、`handoff_verified`、`manual_permission_required` 或 `unknown`
- **AND** MUST 包含可展示的 diagnostic message

#### Scenario: diagnostics includes bounded evidence fields
- **WHEN** host-contract diagnostics 返回结果
- **THEN** evidence MUST 至少包含 helper path、descriptor path、current host path、handoff method、codesign summary、spctl summary、durationMs
- **AND** stdout / stderr snippet MUST 被长度限制，避免泄露过量本机输出

#### Scenario: diagnostics records unavailable evidence explicitly
- **WHEN** codesign、spctl、descriptor 或 handoff evidence 无法读取
- **THEN** 系统 MUST 将对应字段标记为 unavailable 或 skipped
- **AND** MUST NOT 因单个证据源缺失而把整个 diagnostics 误报为 `handoff_verified`

### Requirement: Host Contract Investigation MUST Preserve Runtime Isolation

host-contract investigation MUST 作为 settings surface 内的诊断能力存在，不得隐式进入聊天主链路、MCP 管理、普通设置保存或 runtime tool relay。

#### Scenario: ordinary workflows never run host contract diagnostics
- **WHEN** 用户执行聊天发送、状态刷新、设置保存、线程恢复、MCP 管理或其他非 Computer Use diagnostics 操作
- **THEN** 系统 MUST NOT 触发 host-contract diagnostics
- **AND** MUST NOT 读取或尝试任何 helper handoff

#### Scenario: kill switch disables host contract investigation
- **WHEN** Computer Use activation / host-contract feature flag 被关闭
- **THEN** 系统 MUST 停止暴露 host-contract diagnostics CTA
- **AND** MUST 回退到 Phase 2 diagnostics-only surface

#### Scenario: verified handoff does not imply runtime integration
- **WHEN** host-contract diagnostics 返回 `handoff_verified`
- **THEN** 系统 MAY 展示该证据用于后续决策
- **AND** MUST NOT 自动将 Computer Use 注册为 conversation runtime tool

### Requirement: Host Contract Diagnostics MUST Include Official Parent Handoff Evidence

host-contract diagnostics MUST 能包含 official parent handoff discovery 的只读证据，并继续保持 diagnostics-only 语义。

#### Scenario: host diagnostics includes handoff discovery summary
- **WHEN** 用户在 `host_incompatible` 后显式运行 host-contract diagnostics 或 handoff discovery
- **THEN** 结果 MUST 包含 official parent handoff discovery summary
- **AND** summary MUST 表达 handoff method、source path、confidence、diagnostic message 与 bounded snippets

#### Scenario: handoff evidence does not imply helper verification
- **WHEN** diagnostics 找到 candidate handoff method
- **THEN** 系统 MUST NOT 自动移除 `helper_bridge_unverified`
- **AND** MUST NOT 将 bridge status 收敛为 `ready`

### Requirement: Host Contract Diagnostics MUST Explain Diagnostics-Only Stop Condition

当未发现官方 handoff 入口时，系统 MUST 清晰表达 Computer Use 在当前宿主中只能诊断、不能运行。

#### Scenario: no official handoff communicates stop condition
- **WHEN** handoff discovery 返回 `handoff_unavailable` 或 `requires_official_parent`
- **THEN** UI guidance MUST 说明当前第三方宿主不能直接运行官方 Computer Use helper
- **AND** MUST 建议等待官方 API、官方 parent handoff 或继续保持 diagnostics-only

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

### Requirement: Host Contract Diagnostics MUST Recognize Codex CLI Signed Parent Evidence

Host-contract diagnostics MUST account for the OpenAI-signed Codex CLI native parent that launches the Computer Use MCP server.

#### Scenario: codex cli native parent satisfies helper parent team evidence
- **WHEN** helper path is from CLI plugin cache
- **AND** OpenAI-signed Codex CLI native binary evidence is available
- **THEN** diagnostics MAY return `handoff_verified` as diagnostic evidence
- **AND** MUST NOT imply mossx directly executed the helper

#### Scenario: missing cli parent evidence remains conservative
- **WHEN** helper path is from CLI plugin cache but Codex CLI parent evidence cannot be established
- **THEN** diagnostics MUST remain conservative
- **AND** MUST NOT return `ready`

