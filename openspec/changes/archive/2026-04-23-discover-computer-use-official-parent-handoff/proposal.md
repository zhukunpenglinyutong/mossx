## Why

Phase 2.5 已经证明官方 `SkyComputerUseClient` helper 本身签名可信，但第三方宿主 direct exec 会被 parent contract 拦截。下一步需要调查官方 `Codex.app` 是否存在可支持、可解释、只读可验证的 handoff 入口，否则 Computer Use bridge 必须停留在“安装态/诊断态”而不是继续误导用户尝试运行。

## 目标与边界

- 目标：建立 official parent handoff discovery 能力，用本机只读证据判断官方 Codex parent 是否暴露 URL scheme、LaunchServices、XPC/service、plugin descriptor、MCP descriptor 或等价 handoff 入口。
- 目标：把 handoff 入口的发现结果表达成结构化 diagnostics evidence，供 settings surface 和后续提案决策使用。
- 目标：如果没有可支持入口，明确返回 `handoff_unavailable` / `requires_official_parent`，并把 Computer Use 定性为 diagnostics-only。
- 边界：macOS only；Windows 和其他平台继续 explicit unsupported。
- 边界：所有调查必须 bounded、用户显式触发、只读、不修改官方 bundle、不写入 TCC/approval database。

## 非目标

- 不实现 Computer Use conversation runtime integration。
- 不自动启动或接管官方 Computer Use helper。
- 不复制、重签名、重打包、patch 或伪造官方 Codex / plugin / helper。
- 不依赖私有、脆弱、会修改状态的系统调用作为 remediation。
- 不处理 Windows bridge 实现。

## What Changes

- 增加 official parent handoff discovery contract，定义可识别的 handoff method、evidence 字段与安全限制。
- 扩展现有 host-contract diagnostics，使其能展示官方 parent handoff discovery 的只读调查结果。
- 增加本地只读 scanner：读取 `Codex.app` 的 `Info.plist`、LaunchServices metadata、plugin manifests、helper descriptors、可能的 XPC/service declarations 与 MCP descriptors。
- 增加 automated guard：普通 status refresh、settings save、chat send、MCP 管理不得触发 handoff discovery。
- 增加手测矩阵：macOS Codex installed / plugin enabled / third-party host 场景下，确认不会产生 crash report，且 evidence 足以判断“可继续 / 不可继续”。

## 技术方案对比

| 方案 | 做法 | 取舍 |
|------|------|------|
| 只读 official parent discovery | 读取 bundle/plugin/descriptor/LaunchServices/XPC metadata，输出结构化 evidence | 安全、可回滚、符合官方资产边界；只能证明是否存在入口，不能强行启用 runtime |
| 继续尝试 direct exec 或 shell handoff | 组合 `open`、helper binary、环境变量或 shell command 试探启动 | 可能更快看到反应，但已知会触发 crash report 或越过 parent contract，拒绝 |
| 直接停止 Computer Use bridge | UI 只显示 blocked，不再调查 | 最安全，但无法回答是否存在官方 handoff，缺少后续决策证据 |

选择：采用只读 official parent discovery。它回答“有没有合法入口”，不把调查阶段升级成运行阶段。

## Capabilities

### New Capabilities

- `computer-use-official-parent-handoff`: 定义如何只读发现官方 Codex parent handoff 入口，以及如何分类可用/不可用/未知结果。

### Modified Capabilities

- `computer-use-helper-host-contract`: host-contract diagnostics 需要包含 official parent handoff discovery evidence，并保持 diagnostics-only isolation。
- `codex-computer-use-plugin-bridge`: bridge remediation 必须基于 official handoff evidence，禁止继续推荐 direct exec nested helper。
- `computer-use-activation-lane`: activation 的 `host_incompatible` 后续引导需要指向 handoff discovery，而不是重复 activation/probe。
- `computer-use-platform-adapter`: Windows/非 macOS 平台不得暴露 official parent handoff discovery execution path。

## Impact

- Backend: `src-tauri/src/computer_use/**` 增加只读 handoff discovery provider 与分类。
- Backend command registry: 如需新增 command，统一在 `src-tauri/src/command_registry.rs` 注册并复用 single-flight guard。
- Frontend service/types: `src/services/tauri.ts`、`src/services/tauri/computerUse.ts`、`src/types.ts` 同步 typed contract。
- Frontend UI: `src/features/computer-use/**` 展示 official parent handoff evidence，但不改变 runtime tool availability。
- Specs/docs: 更新 `openspec/specs/**` delta 与 `.trellis/spec/**/computer-use-bridge.md`。

## 验收标准

- `host_incompatible` 后能显式运行 handoff discovery，并返回 bounded structured evidence。
- discovery 不 direct exec `SkyComputerUseClient`，不修改官方 bundle，不触发系统 crash report。
- 如果未发现官方入口，UI 明确显示 diagnostics-only / unavailable，不误报 ready。
- Windows 仍不出现可执行 handoff discovery CTA 或 command path。
- 自动化验证覆盖 result classification、ordinary workflow isolation、kill switch、typed service contract 与 UI rendering。
