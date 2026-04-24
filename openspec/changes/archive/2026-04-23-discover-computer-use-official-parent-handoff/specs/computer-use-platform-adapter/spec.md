## ADDED Requirements

### Requirement: Platform Adapter MUST Keep Handoff Discovery macOS-Only

official parent handoff discovery MUST 只在 macOS adapter 中可执行，Windows 和其他平台必须保持 explicit unsupported。

#### Scenario: windows cannot execute handoff discovery
- **WHEN** 当前平台为 `Windows`
- **THEN** platform adapter MUST NOT 暴露 official parent handoff discovery execution path
- **AND** MUST 返回 `unsupported`

#### Scenario: non-macos guidance is non-executable
- **WHEN** 非 macOS 平台展示 Computer Use guidance
- **THEN** guidance MUST NOT 指示用户运行 macOS bundle path、helper binary、`open -a Codex` 或 shell command
- **AND** MUST 明确本阶段只支持 macOS diagnostics investigation
