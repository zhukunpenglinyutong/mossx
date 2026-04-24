## Why

实机验证表明官方 Codex CLI 可以通过 `~/.codex/plugins/cache/openai-bundled/computer-use/<version>/.mcp.json` 启动 `SkyComputerUseClient mcp` 并调用 Computer Use。当前 mossx bridge 只按 `/Applications/Codex.app/...` 的 bundled plugin 路径判断，并把所有 nested app helper 都归为 `requires_official_parent`，误伤了 Codex CLI 官方插件缓存链路。

## 目标与边界

- 目标：识别 Codex CLI 安装在 `~/.codex/plugins/cache/openai-bundled/computer-use/<version>` 的 Computer Use plugin cache。
- 目标：优先使用 CLI plugin cache 的 `.mcp.json` 解析 helper path / cwd / args，而不是优先使用 `/Applications/Codex.app` 内部 bundled descriptor。
- 目标：将 CLI plugin cache helper 视为 Codex CLI plugin launch contract，不再错误显示为“必须 Codex.app parent 的死路”。
- 目标：activation probe 对 CLI cache helper 不 direct exec；只验证 cache descriptor、helper 文件与 OpenAI-signed Codex CLI parent 证据。
- 边界：不绕过 macOS launch constraint，不重签、不 patch、不复制官方 helper。
- 边界：不实现自研 Computer Use adapter。

## 非目标

- 不直接执行 `SkyComputerUseClient mcp` 来替代 Codex CLI。
- 不伪装 `com.openai.codex` 或 OpenAI team id。
- 不修改 `~/.codex/plugins/cache/**` 或 `/Applications/Codex.app/**`。
- 不把 Computer Use 注册成 mossx 自有 conversation runtime tool。
- 不处理 Windows runtime；Windows 仍保持 explicit unsupported。

## What Changes

- macOS detection 优先从 Codex home plugin cache 解析 Computer Use `.mcp.json`。
- activation probe 对 CLI cache launch contract 返回 verified/remaining-blockers，而不是 direct exec nested helper 后失败。
- official parent handoff discovery 将 CLI cache `.mcp.json` 识别为 `mcp_descriptor` candidate evidence，避免 UI 继续显示 final parent-contract dead end。
- host-contract diagnostics 将 CLI cache helper 分类为 Codex CLI plugin launch contract，而不是 `requires_official_parent`。
- 更新 OpenSpec / Trellis contract 和 Rust tests。

## 技术方案对比

| 方案 | 做法 | 取舍 |
|------|------|------|
| 复用 Codex CLI plugin cache contract | 读取 `~/.codex/plugins/cache/.../.mcp.json`，把 helper 交给 Codex CLI 官方 parent 链路 | 符合实机证据；不 direct exec helper；需要把状态语义从 Codex.app parent 修正为 CLI parent |
| mossx 直接 exec cache helper | 从 cache `.mcp.json` 拿 command 后直接启动 `SkyComputerUseClient mcp` | 实测会被 launch constraint 杀掉；拒绝 |
| 自研 native adapter | 自己实现 screenshot/accessibility/action executor | 可控但成本高，本阶段不是目标 |

选择：复用 Codex CLI plugin cache contract。mossx 只发现、展示、验证 launch contract，不充当 helper parent。

## Capabilities

### New Capabilities

- `codex-cli-computer-use-plugin-bridge`: 定义 mossx 如何识别 Codex CLI 官方 Computer Use plugin cache，并区分 CLI plugin contract 与 Codex.app bundled descriptor。

### Modified Capabilities

- `codex-computer-use-plugin-bridge`: bridge remediation 必须优先识别 Codex CLI plugin cache。
- `computer-use-activation-lane`: activation 不得 direct exec CLI cache helper；只能验证 launch contract。
- `computer-use-helper-host-contract`: host diagnostics 不得把 CLI cache contract 误判为 Codex.app parent dead end。

## Impact

- Backend: `src-tauri/src/computer_use/mod.rs`、`src-tauri/src/computer_use/platform/macos.rs`。
- Specs: `openspec/specs/**`、`.trellis/spec/backend/computer-use-bridge.md`。
- Tests: Rust `computer_use` tests。

## 验收标准

- 在存在 `~/.codex/plugins/cache/openai-bundled/computer-use/1.0.755/.mcp.json` 时，status 使用该 descriptor/helper path。
- CLI cache helper 不触发 diagnostics-only `host_incompatible`。
- official parent handoff discovery 对 CLI cache descriptor 返回 `handoff_candidate_found`。
- host-contract diagnostics 对 CLI cache helper 返回 `handoff_verified` 或等价 CLI contract evidence，不显示 final parent-contract dead end。
- Rust targeted tests、OpenSpec validate、diff check 通过。
