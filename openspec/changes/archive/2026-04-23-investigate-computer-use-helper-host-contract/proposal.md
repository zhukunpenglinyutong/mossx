## Why

Phase 2 已经证明 mossx 可以发现官方 Computer Use 安装态，并能把 helper direct exec 的 macOS crash 收敛成 `host_incompatible` 的 diagnostics-only failure。下一阶段的问题不再是 UI 接线，而是必须弄清楚官方 `SkyComputerUseClient` 是否存在父进程、签名、entitlement 或 app-bundle launch contract 限制。

如果不先证明安全宿主契约，就直接进入 conversation runtime integration，会把一个已知可能被 macOS code-signing policy 杀掉的 helper 路径扩散到主聊天链路。

## 目标与边界

- 目标：调查并固化官方 Computer Use helper 的宿主启动契约、可支持 handoff 方式、不可支持路径与证据采集模型。
- 目标：在 settings surface 内提供更明确的 host-contract diagnostics，帮助判断 `host_incompatible` 是永久限制、可由官方 app handoff 解决，还是需要等待官方 API。
- 目标：保持所有 probe/handoff 都是用户显式触发、bounded、single-flight、kill-switchable。
- 边界：本阶段仍不进入 conversation 主链路，不把 Computer Use 暴露为通用 tool relay，不自动修改官方 app、plugin、permissions 或 approval 配置。
- 边界：Windows 继续保持 explicit unsupported；本阶段只处理 macOS host contract。

## 非目标

- 不实现完整 runtime integration。
- 不复制、重签名、重打包或修改官方 helper / app bundle。
- 不绕过 macOS code-signing、TCC、entitlement 或 sandbox 约束。
- 不把 `host_incompatible` 伪装成 `ready`。
- 不承诺 helper contract 一定可被第三方宿主桥接。

## What Changes

- 新增 host-contract investigation capability，定义可执行的诊断步骤、证据字段和结果分类。
- 修改 activation lane：在 `host_incompatible` 之后允许显式运行更窄的 host-contract diagnostics，而不是继续 direct exec nested helper。
- 修改 macOS platform adapter：把 nested app-bundle helper 的父进程/签名限制作为一等分类，不再只作为普通 launch failure。
- 修改 plugin bridge：增加官方 app handoff / unsupported boundary 的决策规则，防止实现阶段把 scope 偷偷扩大到聊天主链路。
- 补齐手测矩阵与自动化 guard，验证 diagnostics 不触发系统 crash report、不污染普通流程。

## Capabilities

### New Capabilities

- `computer-use-helper-host-contract`: 定义 macOS 官方 helper 的宿主契约调查、handoff 证据、结果分类与安全边界。

### Modified Capabilities

- `computer-use-activation-lane`: 在 activation failure 后新增显式 host-contract diagnostics lane，并保持 bounded/single-flight/kill-switchable。
- `computer-use-platform-adapter`: 将 macOS nested app-bundle helper 的 host incompatibility 分类为平台契约问题。
- `codex-computer-use-plugin-bridge`: 明确官方资产 ownership boundary 与可支持 handoff 规则，禁止隐式进入 conversation 主链路。

## 技术方案选项

### Option A: 继续 direct exec helper 并收集失败证据

- 优点：实现最简单，沿用 Phase 2 probe。
- 缺点：已被 macOS 实机证明会触发 `SkyComputerUseClient` crash report，用户体验和安全边界不可接受。
- 结论：拒绝。

### Option B: 只保留 diagnostics-only，不再调查 handoff

- 优点：最安全，风险最低。
- 缺点：无法回答“是否存在官方支持的启动路径”，也无法为 Phase 3 runtime integration 提供决策依据。
- 结论：作为 fallback 保留，但不足以作为下一阶段主目标。

### Option C: 显式 host-contract investigation lane

- 优点：保留安全边界，同时用可复现证据判断 official app handoff、bundle open、descriptor contract、签名/父进程约束是否存在可支持路径。
- 缺点：需要更多分类、手测矩阵和 guard。
- 结论：采用。

## 验收标准

- host-contract diagnostics MUST 不直接 exec 已知会 crash 的 nested helper。
- diagnostics MUST 返回结构化结果，至少区分 `requires_official_parent`、`handoff_unavailable`、`handoff_verified`、`manual_permission_required`、`unknown`。
- diagnostics MUST 包含 bounded evidence，例如 helper path、descriptor path、parent host path、codesign/spctl 摘要、handoff method 与 stderr/stdout snippet。
- 普通 status refresh、settings save、chat send、MCP 管理 MUST NOT 触发 host-contract diagnostics。
- kill switch 关闭后 MUST 回退到 Phase 2 diagnostics-only surface。
- macOS 手测矩阵 MUST 覆盖当前第三方宿主 `host_incompatible`，并确认不再出现系统 crash report。

## Impact

- Backend: `src-tauri/src/computer_use/**` host-contract diagnostics、platform adapter 分类、command registration。
- Frontend: `src/features/computer-use/**` host-contract result rendering、CTA gating、i18n copy。
- Services/types: `src/services/tauri.ts`、`src/services/tauri/computerUse.ts`、`src/types.ts`。
- Specs/docs: OpenSpec delta specs、manual test matrix、`.trellis/spec/**/computer-use-bridge.md`。
- No new third-party dependency is expected.
