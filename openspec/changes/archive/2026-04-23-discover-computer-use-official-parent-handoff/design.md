## Context

当前 Computer Use bridge 已能发现官方 `Codex.app`、`computer-use@openai-bundled` plugin 与 nested helper，并且 Phase 2.5 已把 direct exec helper 的 macOS crash risk 收敛为 diagnostics-only。实机证据显示 helper 签名与 notarization 正常，但第三方宿主不满足官方 parent contract。

Phase 3 的关键问题不是“如何绕过限制”，而是“官方 Codex parent 是否暴露可支持 handoff”。如果没有公开或可稳定解释的入口，mossx 必须停止在 runtime integration 方向继续扩张，只保留安装态、可见性与诊断能力。

约束：

- macOS only；Windows 保持 explicit unsupported。
- 所有调查必须只读、bounded、用户显式触发。
- 不 direct exec `SkyComputerUseClient`。
- 不修改官方 app/plugin/helper、TCC、approval database 或 LaunchServices 状态。
- 结果只影响 settings diagnostics surface，不自动进入 conversation runtime。

## Goals / Non-Goals

**Goals:**

- 建立 official parent handoff discovery provider，扫描官方 app/plugin/helper metadata。
- 定义 handoff method 与 result kind：`launch_services_url_scheme`、`xpc_service`、`mcp_descriptor`、`plugin_descriptor`、`none`、`unknown` 等。
- 将发现结果接入 host-contract diagnostics evidence。
- 如果未发现入口，明确给出 diagnostics-only conclusion。
- 覆盖 automated tests 与 macOS manual matrix。

**Non-Goals:**

- 不启动 Computer Use runtime。
- 不调用未经确认的私有 helper command。
- 不模拟官方 parent、不伪造 entitlement、不更改 code signing。
- 不做 Windows bridge。

## Decisions

### Decision 1: 先做只读 scanner，不做 launch experiment

Scanner 读取以下 evidence source：

- `Codex.app/Contents/Info.plist`：URL types、document types、bundle id、LS handlers。
- `Codex.app/Contents/PlugIns`、`Resources/plugins/**`：plugin manifest、marketplace metadata、MCP descriptor。
- `SkyComputerUseClient.app/Contents/Info.plist`：bundle id、CFBundleExecutable、XPC/service declarations。
- `*.xpc`、`LaunchServices` 可读 metadata：只枚举路径与 bundle identifiers，不启动服务。

替代方案：直接 `open -a Codex` 携带 URL 或 helper path 做试探。拒绝原因：会把 investigation 变成 launch side-effect，且没有证据表明官方支持该入口。

### Decision 2: Handoff discovery 输出可审计 schema

新增 result 字段建议：

- `kind`: `handoff_candidate_found`、`handoff_unavailable`、`requires_official_parent`、`unknown`
- `methods`: 候选 method 列表，每项包含 `method`, `source`, `identifier`, `confidence`, `notes`
- `evidence`: `codexInfoPlistPath`、`helperInfoPlistPath`、`pluginManifestPath`、`mcpDescriptorPath`、`xpcServiceIdentifiers`、bounded snippets
- `diagnosticMessage`

替代方案：继续把所有结果塞进 `stderrSnippet`。拒绝原因：UI、测试和后续决策无法稳定消费。

### Decision 3: “发现候选入口”不等于“可运行”

即便 scanner 发现 URL scheme、XPC service 或 descriptor，也只能返回 `handoff_candidate_found`，不能自动标记 bridge ready。后续必须有单独提案验证该入口是否公开、稳定、用户授权且无副作用。

替代方案：发现任意入口后直接启用 runtime。拒绝原因：会突破现有 diagnostics-only contract。

### Decision 4: UI 文案必须把结论翻译成人话

用户看到的不是内部 enum，而是下一步判断：

- 找不到入口：当前只能检测/诊断，不能在 mossx 内运行 Computer Use。
- 找到候选入口：需要下一阶段验证，不代表已经启用。
- 证据不足：保守保持 blocked。

替代方案：仅展示原始 plist/descriptor。拒绝原因：用户无法判断下一步。

## Risks / Trade-offs

- [Risk] 官方 app 内部结构随版本变化 → Mitigation: scanner 只做 best-effort evidence，缺失字段返回 unavailable，不 panic。
- [Risk] URL scheme 或 XPC service 是内部实现而非 public API → Mitigation: confidence 分级，候选入口不自动启用 runtime。
- [Risk] 读取 bundle metadata 输出本机路径 → Mitigation: 仅本机 settings surface 展示，snippet 限长，不默认上传。
- [Risk] OpenSpec capability 增多导致语义分散 → Mitigation: 新 capability 只描述 official parent handoff discovery，runtime integration 另开提案。

## Migration Plan

1. 创建 OpenSpec capability 和 delta specs。
2. 后端实现只读 scanner 与 result types。
3. 接入现有 host-contract diagnostics 或新增显式 command，但必须复用 single-flight guard。
4. 前端展示 discovery result，并补齐 i18n。
5. 更新 `.trellis/spec/**/computer-use-bridge.md`。
6. 运行 Rust/TS/Vitest/OpenSpec/large-file/doctor 验证。

Rollback:

- 隐藏 handoff discovery CTA 或关闭 Computer Use activation/host-contract flag。
- 保留 Phase 2.5 `requires_official_parent` diagnostics-only 结论。
- 不影响 Codex、MCP、chat、settings save。

## Open Questions

- 官方 `Codex.app` 是否声明 Computer Use 专属 URL scheme 或 broker endpoint。
- `SkyComputerUseClient.app` 是否包含可读 XPC service / launch service contract。
- MCP descriptor 是否只是 plugin management metadata，还是能表达 runtime handoff。
- 如果 scanner 只发现内部入口，是否应该停止而不是继续尝试调用。
