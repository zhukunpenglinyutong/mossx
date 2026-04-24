## Context

现有实现把 Computer Use helper 分成两层：

- discovery/status：读 `~/.codex/config.toml` 和 plugin cache manifest，但 macOS helper descriptor 仍来自 `/Applications/Codex.app/.../plugins/computer-use/.mcp.json`。
- activation：解析 `.mcp.json` 后执行 helper `mcp --help`，并对所有 nested `.app/Contents/MacOS` helper 做 diagnostics-only skip。

用户实机截图和进程树证明 Codex CLI 的真实链路是：

```text
node /opt/homebrew/bin/codex
  -> OpenAI-signed native codex binary
    -> ~/.codex/plugins/cache/openai-bundled/computer-use/<version>/Codex Computer Use.app/.../SkyComputerUseClient mcp
```

`SkyComputerUseClient` 的 launch constraint 要求 OpenAI team parent。Codex CLI native binary 满足这个要求；mossx/Tauri 直接执行 helper 不满足。因此本阶段不能“直接启动 helper”，只能把 CLI cache 识别为官方 plugin contract，并避免误报 dead end。

## Data Flow

```text
~/.codex/config.toml
  -> plugins."computer-use@openai-bundled".enabled

~/.codex/plugins/cache/openai-bundled/computer-use/<version>/
  -> .codex-plugin/plugin.json
  -> .mcp.json
  -> Codex Computer Use.app/.../SkyComputerUseClient

mossx status surface
  -> detects CLI plugin cache contract
  -> does not direct exec helper
  -> explains remaining permission/approval blockers
```

## Decisions

### Decision 1: CLI cache descriptor 优先级高于 Codex.app descriptor

理由：Codex CLI 实际运行的是 `~/.codex/plugins/cache/**`，不是 `/Applications/Codex.app/Contents/Resources/plugins/**`。优先级错误会导致 status/diagnostics 指向错误 parent model。

### Decision 2: activation probe 对 CLI cache contract 静态验证

对 CLI cache helper 直接执行会触发 parent launch constraint，因此 activation 不能再执行 `SkyComputerUseClient mcp --help`。静态验证包括：

- descriptor 可解析；
- helper path 存在且为 file；
- helper path 位于 `~/.codex/plugins/cache/openai-bundled/computer-use/<version>`；
- descriptor args 包含 `mcp`；
- 可选：当前系统有 OpenAI-signed Codex native binary 证据。

### Decision 3: Handoff discovery 把 CLI cache `.mcp.json` 视为候选入口

此前 `mcp_descriptor` candidate 只接受 non-nested command。该规则适合排除 Codex.app bundled helper direct exec，但不适合 CLI cache。CLI cache 的 `.mcp.json` 是官方 Codex CLI plugin contract，应作为 evidence-only candidate。

## Risks / Trade-offs

- [Risk] 静态验证不能证明当前会话一定能调用 Computer Use。Mitigation: 不返回 runtime ready，只移除 helper direct-exec dead end，保留 permission/approval blockers。
- [Risk] Codex CLI plugin cache 路径结构变动。Mitigation: 通过 manifest version discovery 和 descriptor parser 解析，不硬编码版本号。
- [Risk] 用户没有 Codex CLI native binary 或插件未启用。Mitigation: 保持 blocked/unavailable guidance。

## Rollback

- 回退 cache descriptor priority 与 CLI cache launch contract 判断。
- 保留上一阶段 diagnostics-only surface。
- 不涉及官方资产写入，回滚只影响 mossx 检测/展示逻辑。
