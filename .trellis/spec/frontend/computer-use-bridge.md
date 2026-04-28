# Computer Use Bridge Frontend Contract

## Scope / Trigger

- 适用文件：
  - `src/services/tauri/computerUse.ts`
  - `src/services/tauri.ts`
  - `src/features/computer-use/constants.ts`
  - `src/features/computer-use/hooks/useComputerUseBridgeStatus.ts`
  - `src/features/computer-use/components/ComputerUseStatusCard.tsx`
  - `src/features/settings/components/settings-view/sections/CodexSection.tsx`
  - `src/types.ts`
  - `src/i18n/locales/en.part1.ts`
  - `src/i18n/locales/zh.part1.ts`
- 触发条件：
  - 修改 Computer Use status surface
  - 修改 frontend bridge type / hook / i18n keys
  - 修改 settings 中的挂载位置

## Signatures

### Service bridge

```ts
export async function getComputerUseBridgeStatus(): Promise<ComputerUseBridgeStatus>
export async function runComputerUseActivationProbe(): Promise<ComputerUseActivationResult>
export async function runComputerUseHostContractDiagnostics(): Promise<ComputerUseHostContractDiagnosticsResult>
export async function runComputerUseCodexBroker(request: ComputerUseBrokerRequest): Promise<ComputerUseBrokerResult>
```

### Shared type

```ts
export type ComputerUseBridgeStatus = {
  featureEnabled: boolean;
  activationEnabled: boolean;
  status: "ready" | "blocked" | "unavailable" | "unsupported";
  platform: string;
  codexAppDetected: boolean;
  pluginDetected: boolean;
  pluginEnabled: boolean;
  blockedReasons: ComputerUseBlockedReason[];
  guidanceCodes: ComputerUseGuidanceCode[];
  codexConfigPath: string | null;
  pluginManifestPath: string | null;
  helperPath: string | null;
  helperDescriptorPath: string | null;
  marketplacePath: string | null;
  diagnosticMessage: string | null;
  authorizationContinuity: ComputerUseAuthorizationContinuityStatus;
};

export type ComputerUseAuthorizationContinuityStatus = {
  kind:
    | "unknown"
    | "no_successful_host"
    | "matching_host"
    | "host_drift_detected"
    | "unsupported_context";
  diagnosticMessage: string | null;
  currentHost: ComputerUseAuthorizationHostSnapshot | null;
  lastSuccessfulHost: ComputerUseAuthorizationHostSnapshot | null;
  driftFields: string[];
};

export type ComputerUseAuthorizationHostSnapshot = {
  displayName: string;
  executablePath: string;
  identifier: string | null;
  teamIdentifier: string | null;
  backendMode: "local" | "remote";
  hostRole: "foreground_app" | "daemon" | "debug_binary" | "unknown";
  launchMode: "packaged_app" | "daemon" | "debug" | "unknown";
  signingSummary: string | null;
};

export type ComputerUseActivationResult = {
  outcome: "verified" | "blocked" | "failed";
  failureKind:
    | "activation_disabled"
    | "unsupported_platform"
    | "ineligible_host"
    | "host_incompatible"
    | "already_running"
    | "remaining_blockers"
    | "timeout"
    | "launch_failed"
    | "non_zero_exit"
    | "unknown"
    | null;
  bridgeStatus: ComputerUseBridgeStatus;
  durationMs: number;
  diagnosticMessage: string | null;
  stderrSnippet: string | null;
  exitCode: number | null;
};

export type ComputerUseHostContractDiagnosticsResult = {
  kind:
    | "requires_official_parent"
    | "handoff_unavailable"
    | "handoff_verified"
    | "manual_permission_required"
    | "unknown";
  bridgeStatus: ComputerUseBridgeStatus;
  evidence: {
    helperPath: string | null;
    helperDescriptorPath: string | null;
    currentHostPath: string | null;
    handoffMethod: string;
    codesignSummary: string | null;
    spctlSummary: string | null;
    durationMs: number;
    stdoutSnippet: string | null;
    stderrSnippet: string | null;
  };
  durationMs: number;
  diagnosticMessage: string;
};

export type ComputerUseOfficialParentHandoffDiscovery = {
  kind:
    | "handoff_candidate_found"
    | "handoff_unavailable"
    | "requires_official_parent"
    | "unknown";
  methods: Array<{
    method: string;
    sourcePath: string | null;
    identifier: string;
    confidence: string;
    notes: string;
  }>;
  evidence: {
    codexInfoPlistPath: string | null;
    serviceInfoPlistPath: string | null;
    helperInfoPlistPath: string | null;
    parentCodeRequirementPath: string | null;
    pluginManifestPath: string | null;
    mcpDescriptorPath: string | null;
    codexUrlSchemes: string[];
    serviceBundleIdentifier: string | null;
    helperBundleIdentifier: string | null;
    parentTeamIdentifier: string | null;
    applicationGroups: string[];
    xpcServiceIdentifiers: string[];
    durationMs: number;
    stdoutSnippet: string | null;
    stderrSnippet: string | null;
  };
  durationMs: number;
  diagnosticMessage: string;
};

export type ComputerUseBrokerRequest = {
  workspaceId: string;
  instruction: string;
  model?: string | null;
  effort?: string | null;
};

export type ComputerUseBrokerResult = {
  outcome: "completed" | "blocked" | "failed";
  failureKind:
    | "unsupported_platform"
    | "bridge_unavailable"
    | "bridge_blocked"
    | "authorization_continuity_blocked"
    | "workspace_missing"
    | "codex_runtime_unavailable"
    | "already_running"
    | "invalid_instruction"
    | "permission_required"
    | "timeout"
    | "codex_error"
    | "unknown"
    | null;
  bridgeStatus: ComputerUseBridgeStatus;
  text: string | null;
  diagnosticMessage: string | null;
  durationMs: number;
};
```

## Contracts

### Boundary rules

- feature / hook / component MUST 通过 `src/services/tauri.ts` 使用 bridge，不得在 UI 内直接 `invoke()`
- user-visible copy MUST 走 i18n，不得硬编码
- `ENABLE_COMPUTER_USE_BRIDGE` 关闭时：
  - hook 不应触发读取
  - card 不应渲染
- activation lane MUST 额外同时受 `ENABLE_COMPUTER_USE_BRIDGE_ACTIVATION` 与 backend `status.activationEnabled` 控制。
- `useComputerUseActivation` MUST 防止同一 render tick 内重复调用 service；不能只依赖 React state 更新后的 disabled button。
- `useComputerUseHostContractDiagnostics` MUST 防止同一 render tick 内重复调用 service，并在 lane disabled / refresh 时清理 stale result。
- status / activation hooks MUST 使用 request id、mounted guard 或等价机制忽略 stale async response。
- 手动刷新 status 前 MUST 清除旧 activation result，避免 stale probe result 覆盖刷新后的真实 status。
- 手动刷新 status 前也 MUST 清除旧 host-contract diagnostics result，避免 stale evidence 覆盖刷新后的真实状态。
- `useComputerUseBroker` MUST 防止同一 render tick 内重复调用 service，并使用 request id / mounted guard 忽略 stale async response。
- broker request MUST trim instruction 后再提交；空 instruction 不应触发 service 调用。
- broker panel MUST 只通过 `runComputerUseCodexBroker` service 访问 Tauri command，不得在 component / hook 内直接 `invoke()`。
- broker result MUST 在手动刷新 status 时清理，避免旧任务结果误导当前 bridge 状态。

### UI behavior

- surface MUST 明确展示：
  - status
  - platform
  - `Codex App` detected
  - plugin detected/enabled
  - authorization continuity summary
  - current authorization host
  - last successful authorization host
  - blocked reasons
  - guidance
  - path diagnostics
- activation affordance 只允许在以下条件全部满足时显示：
  - feature flag 开启
  - `activationEnabled = true`
  - `platform = "macos"`
  - `status = "blocked"`
  - app/plugin/helper 前置条件齐全
  - `blockedReasons` 包含 `helper_bridge_unverified`
- host-contract diagnostics affordance 只允许在 activation result 明确返回 `failureKind = "host_incompatible"` 后显示。
- `host_incompatible` 后 SHOULD 隐藏重复 activation CTA，并引导用户进入 host-contract diagnostics；diagnostics 不得自动链式运行。
- host-contract diagnostics result MUST 明确展示 diagnostic-only notice，不得暗示 conversation runtime 已启用。
- host-contract diagnostics result MUST 展示 official parent handoff discovery evidence；`handoff_candidate_found` 只能表达候选证据，不得渲染为 runtime enabled。
- host-contract diagnostics result 返回 `requires_official_parent` 或 official parent handoff 返回 `handoff_unavailable` / `requires_official_parent` 时，status card MUST 渲染 parent contract verdict：
  - 表达 macOS 侧 Codex / plugin / helper evidence 已可读；
  - 表达当前宿主不是官方 Codex parent，不能 direct run official helper；
  - 表达重复 activation、继续授权权限或重跑 diagnostics 不是 remediation；
  - 保持 `blocked`，不得渲染为 `ready` 或 runtime enabled。
- parent contract verdict 已出现后，host-contract diagnostics CTA MUST 不再作为主行动展示；仅保留普通 refresh 作为环境变化后的重新读取入口。
- `handoff_candidate_found` MUST 只展示为 evidence-only，并且 MUST NOT 渲染 parent contract final verdict 或重新触发 activation。
- Phase 1 文案 MUST 明确说明：
  - 这是 `status-only`
  - 不调用官方 helper
- broker affordance 只允许在以下条件全部满足时显示可运行态：
  - `platform = "macos"`
  - app/plugin/helper 前置条件齐全
  - helper bridge blocker 不存在
  - `authorizationContinuity.kind` 不是 `host_drift_detected` / `unsupported_context`
  - `status = "ready"` 或仅剩 `permission_required` / `approval_required` soft manual blockers
  - 至少存在一个 connected workspace
- broker UI MUST 明确说明这是 Codex CLI / official Codex runtime handoff，不是 mossx direct helper execution。
- broker UI MUST 将 `permission_required` 显示为 macOS 权限或 allowed-app approval 阻塞，而不是普通 Codex 错误。
- broker UI MUST 将 `authorization_continuity_blocked` 显示为 distinct verdict，并明确提示用户去当前显示的 exact host 重新授权，而不是泛化成 “再去系统设置里开权限”。
- 对于 local packaged app 但 signing identity 不稳定（如 `adhoc` / `linker-signed`）的场景，UI MUST 明确提示“当前包不适合作为最终授权 sender”，而不是继续暗示用户只差勾选 macOS 权限。
- status card MUST 展示 `authorizationContinuity.currentHost` / `lastSuccessfulHost` 的 backend mode、host role、launch mode、identifier、team identifier、signing summary。
- 当 `authorizationContinuity.kind = "matching_host"` 时，UI MUST 保留 generic permission / approval 分支，不得把所有 `-10000` 都渲染成 drift。
- broker UI MUST 展示 workspace selector、task instruction textarea、running state、outcome、duration、failure kind、diagnostic message 与 bounded text result。
- broker UI MUST 在 bridge gate 未满足时展示阻塞说明，而不是显示可点击运行按钮。
- broker completed / blocked / failed 三类结果 MUST 使用不同文案表达，不得把 `blocked` 渲染成成功。

### Windows contract

- `unsupported` 状态 MUST 渲染成明确不支持，而不是“去安装 / 去启用”的假动作
- `blockedReasons = ["platform_unsupported"]`
- `guidanceCodes = ["unsupported_platform"]`

## Validation & Error Matrix

| Input status | Expected UI |
|---|---|
| `blocked` + reasons/guidance | 渲染阻塞原因列表与建议列表 |
| `unsupported` on Windows | 渲染 unsupported 状态、platform_unsupported reason、unsupported_platform guidance |
| hook error | 渲染 load failed error surface |
| feature flag off | 不渲染 card |
| `activationEnabled=false` | 不渲染 activation CTA，显示 Phase 1 notice |
| activation result present then user refreshes | 先 reset activation result，再刷新 status |
| host-contract result present then user refreshes | 先 reset host-contract result，再刷新 status |
| repeated activation calls before re-render | service 只被调用一次 |
| repeated host-contract diagnostics calls before re-render | service 只被调用一次 |
| out-of-order status refresh responses | 只保留最新 refresh 结果 |
| `host_incompatible` activation result | 展示 host-contract diagnostics CTA，隐藏重复 activation CTA |
| official parent handoff `requires_official_parent` | 展示 parent team / application group / bundle id，并保持 blocked |
| official parent handoff `handoff_candidate_found` | 展示 candidate methods，但不展示 ready 或 runtime enabled |
| parent contract final verdict | 展示 diagnostics-only stop condition，并隐藏重复 host-contract diagnostics 主按钮 |
| broker gate ready + connected workspace | 展示 task textarea、workspace selector、Run with Codex CTA |
| broker gate only permission/approval blockers | 允许 CTA，提示官方 Codex runtime 可能继续请求权限 |
| broker gate helper_bridge_unverified | 禁用 CTA，展示 bridge blocked |
| `authorizationContinuity.kind = "host_drift_detected"` | 展示 drift badge、current/last host snapshot、exact-host remediation，并禁用 broker CTA |
| `authorizationContinuity.kind = "unsupported_context"` | 展示 unsupported continuity verdict，并禁用 broker CTA |
| local packaged app + `adhoc` / `linker-signed` signing summary | 视为 unsupported continuity，提示需要稳定签名身份的 packaged app |
| broker result `authorization_continuity_blocked` | 展示 sender identity drift / unsupported context 文案，不得误导为 generic permission |
| no connected workspace | 禁用 CTA，提示选择/连接 workspace |
| empty broker instruction | 不调用 service，保持输入错误/空任务状态 |
| repeated broker calls before re-render | service 只被调用一次 |
| out-of-order broker responses | 只保留最新 broker result |
| broker result present then user refreshes | 先 reset broker result，再刷新 status |
| broker result failed/blocked/completed | 展示 outcome、failure kind、diagnostic message、duration 与 text snippet |
| broker result `permission_required` | 展示权限/approval 阻塞文案，并保留 Codex CLI 返回的 tool failure 详情 |

## Good / Base / Bad Cases

### Good

- 在设置页显式入口渲染状态卡片
- `Windows` 上显示 unsupported，而不是误导用户“安装后可用”
- 在 macOS 且 CLI cache contract 可用时，允许用户从当前客户端提交一个显式 Computer Use task 给 Codex runtime

### Base

- 刷新状态只重新拉取 bridge 结果，不改设置
- broker 运行只依赖用户显式点击，不随 status refresh 自动执行

### Bad

- 在组件内部直接 `invoke("get_computer_use_bridge_status")`
- 在组件内部直接 `invoke("run_computer_use_codex_broker")`
- 把 `blocked` 渲染成“ready but needs setup”
- 缺少 path diagnostics，导致用户无法自查 bundle/cache/descriptor 路径
- 把当前客户端包装成官方 helper parent，或暗示 mossx 已直接获得 macOS app control 权限

## Tests Required

- `npx vitest run src/features/computer-use/components/ComputerUseStatusCard.test.tsx`
- `npx vitest run src/features/computer-use/hooks/useComputerUseActivation.test.tsx`
- `npx vitest run src/features/computer-use/hooks/useComputerUseHostContractDiagnostics.test.tsx`
- `npx vitest run src/features/computer-use/hooks/useComputerUseBroker.test.tsx`
- `npx vitest run src/features/computer-use/hooks/useComputerUseBridgeStatus.test.tsx`
- `npx vitest run src/services/tauri.test.ts`
- 必测断言：
  - blocked reasons + guidance 渲染
  - unsupported Windows surface 渲染
  - error surface 渲染
  - `getComputerUseBridgeStatus` 调用正确 command name
  - activation CTA gating、result rendering、refresh reset
  - host-contract CTA gating、evidence rendering、refresh reset
  - official parent handoff discovery evidence rendering
  - parent contract final verdict rendering
  - parent contract final verdict hides repeated host diagnostics action
  - candidate handoff method remains evidence-only
  - activation duplicate trigger guard
  - host-contract duplicate trigger guard
  - broker CTA gating、workspace selector、result rendering、refresh reset
  - broker duplicate trigger guard
  - status stale response guard

## Wrong vs Correct

### Wrong

```ts
const result = await invoke("get_computer_use_bridge_status");
```

问题：绕过 `src/services/tauri.ts`，会让 type mapping 与测试入口分裂。

### Correct

```ts
import { getComputerUseBridgeStatus } from "@/services/tauri";

const { status } = useComputerUseBridgeStatus({
  enabled: ENABLE_COMPUTER_USE_BRIDGE,
});
```

统一通过 bridge service + hook 读取状态。
