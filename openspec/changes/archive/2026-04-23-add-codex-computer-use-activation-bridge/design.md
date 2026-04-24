## Context

Phase 1 已经把 `Computer Use Bridge` 收敛成一个稳定的 `status-only` 模块：

- backend 能发现官方 `Codex.app`、plugin manifest、helper descriptor，并给出 `ready / blocked / unavailable / unsupported` 的 deterministic status。
- frontend 已有独立的 status surface、hook、typed facade 与 i18n copy。
- `Windows` 明确 `unsupported`，`macOS` 在 helper bridgeability / permissions / approvals 未验证时保持 `blocked`。

这意味着当前真正的缺口已经从“发现状态”转向“如何在不污染主链路的前提下，显式验证 helper 是否真的能在当前宿主里拉起并完成最小桥接验证”。如果直接把会话主链路挂上官方 helper，等于把一个尚未证明稳定的桥接实验扩散到 runtime 核心链路；但如果永远停留在 `status-only`，团队又无法得到可执行的工程真值。

因此第二阶段的设计目标不是“现在就做完整 runtime integration”，而是引入一个 **bounded activation lane**：

- 只在 `macOS`
- 只在用户显式触发时运行
- 只做 helper activation/probe/diagnostics verification
- 结果结构化、可诊断、可回滚

## Goals / Non-Goals

**Goals:**

- 在现有 discovery/status contract 之上增加一个显式 activation/probe lane。
- 保持 `get_computer_use_bridge_status` 作为纯状态读取入口，同时新增独立 activation command。
- 用结构化 activation result 表达 helper verification success / blocked / failed / timeout，而不是只返回文案字符串。
- 让 activation 成功后的验证结果在**当前 app session** 内可复用，避免用户每次刷新都回到 `helper_bridge_unverified`。
- 继续把 `permission_required` / `approval_required` 视为显式 blocked guidance；本期不承诺自动机读验证这两类前置条件。
- 保持 `Windows` 在第二阶段依然 explicit `unsupported`。
- 保持整块 feature flag / rollback path，必要时回退到 Phase 1 `status-only`。

**Non-Goals:**

- 不把 activation lane 直接接到 conversation 主链路或 generic tool relay。
- 不在本期设计通用 plugin lifecycle、plugin installer、marketplace host。
- 不在本期持久化 activation trust 到磁盘或官方资产。
- 不承诺 activation 成功就代表所有 `Computer Use` 场景都已稳定支持。
- 不改变 `Windows` / Linux 的平台策略。

## Decisions

### Decision 1: 第二阶段仍然以设置页为主入口，不进入 conversation 主链路

**Decision**

- activation lane 只通过 `Computer Use` surface 的显式 action 触发。
- 不允许普通聊天发送、设置保存、背景刷新或 session 恢复隐式调用官方 helper。

**Why**

- 当前需要验证的是“宿主能否桥接官方 helper”，不是“把未验证能力提前挂到主路径”。
- 把实验留在 settings surface 内，失败半径最小，回滚也最简单。

**Alternative considered**

- 直接接入 Codex conversation/tool path。
  - 缺点：一旦 helper 卡死、父进程约束不兼容或权限弹窗异常，会把问题扩散到主线程与 runtime 体验。

### Decision 2: 读取状态与执行验证必须分成两个独立 command

**Decision**

- 保留现有只读 command：

```rust
#[tauri::command]
async fn get_computer_use_bridge_status() -> Result<ComputerUseBridgeStatus, String>
```

- 新增显式 activation/probe command：

```rust
#[tauri::command]
async fn run_computer_use_activation_probe() -> Result<ComputerUseActivationResult, String>
```

**Why**

- `status` 与 `probe` 有完全不同的副作用语义：前者必须保持只读，后者允许 bounded invoke。
- 把两者拆开后，前端可以明确区分“刷新状态”和“开始验证”，测试与回滚边界也更清晰。

**Alternative considered**

- 让 `get_computer_use_bridge_status` 带一个 `probe=true` 参数。
  - 缺点：把纯状态读取变成潜在副作用接口，容易让后续调用点误触发 helper。

### Decision 3: activation result 必须结构化，并携带 failure taxonomy 与 evidence

**Decision**

- 新增独立结果模型，至少包含：
  - `outcome`: `verified | blocked | failed | unsupported`
  - `failureKind`: 如 `timeout`、`helper_launch_failed`、`handshake_failed`、`host_incompatible`
  - `bridgeStatus`: 最新 `ComputerUseBridgeStatus`
  - `diagnosticMessage`
  - `stderrSnippet` / `exitCode` / `durationMs` 等 bounded evidence

**Why**

- 第二阶段的核心价值就是把“helper_bridge_unverified”变成“可解释的 helper activation 真值”。
- 如果仍然只返回一个 `bool` 或模糊字符串，前端无法区分回滚、重试、还是引导用户去改权限。

**Alternative considered**

- 只返回更新后的 `ComputerUseBridgeStatus`。
  - 缺点：丢失 probe 过程证据，难以区分 `blocked` 与 `failed` 的工程含义。

### Decision 4: activation verification 只在当前 app session 生效，且绑定 helper identity

**Decision**

- activation 成功后的验证结果只写入 app memory，不持久化到磁盘。
- cache key 至少绑定：
  - platform
  - `Codex.app` path
  - plugin manifest path
  - helper path

**Why**

- 权限、approval、helper binary 与宿主兼容性都可能变化；磁盘持久化很容易造成 stale trust。
- session-scoped cache 已足够支持“本次 host session 内不再重复显示 `helper_bridge_unverified`”的产品价值，而不必假装权限/approval 也已经被自动验证。

**Alternative considered**

- 每次读取状态都重新 probe。
  - 缺点：副作用过重，用户体验差，容易触发重复弹窗或重复 helper 启动。
- 把验证结果落磁盘。
  - 缺点：状态漂移与失真风险大，本期收益不值得。

### Decision 5: activation lane 必须 single-flight，并带硬超时与 kill switch

**Decision**

- 同一时刻只允许一个 activation probe 在跑。
- probe 必须受统一 timeout 限制。
- activation lane 增加独立 host kill switch：
  - backend status 暴露 `activationEnabled`
  - `MOSSX_DISABLE_COMPUTER_USE_ACTIVATION=1|true|yes|on` 时，backend 不执行 probe，稳定返回 `activation_disabled`
  - frontend 以 `activationEnabled=false` 隐藏 `验证 helper bridge` affordance，并回退到 Phase 1 `status-only` notice

**Why**

- helper 如果挂起、卡死或出现多次并发拉起，会直接破坏可诊断性。
- 第二阶段本质是实验性 bridge，必须先把故障域锁住。
- kill switch 需要同时存在于 backend 与 frontend：只隐藏按钮不够，backend command 也必须显式拒绝执行；只拦 backend 也不够，UI 仍会制造错误期待。

**Alternative considered**

- 允许并发 probe 或不设 timeout。
  - 缺点：失败难以归因，出现卡死后也没有清晰恢复点。
- 只用 frontend build-time flag。
  - 缺点：无法覆盖运行时部署回退，也不能阻止被误调用的 backend command。

### Decision 6: `Windows` 在第二阶段依然保持 explicit unsupported

**Decision**

- 即使新增 activation lane，`Windows` 也不展示 verify / activate 动作。
- backend 不为 `Windows` 尝试 helper invoke。

**Why**

- 当前没有证据表明官方 `Computer Use` 在 `Windows` 上具备同等 bridge contract。
- 把第二阶段写成“即将支持 Windows”只会制造错误预期。

### Decision 7: nested helper app-bundle 不再直接 exec，改为 diagnostics-only fallback

**Decision**

- 继续读取官方 `.mcp.json` 中的 command、cwd 与 args，例如 `args = ["mcp"]`。
- 但当 helper command 位于嵌套 `.app/Contents/MacOS/...` 路径，并且当前宿主不是官方 `Codex.app` 时，不再直接执行该 helper。
- 该场景返回结构化 `failed / host_incompatible`，并携带 diagnostic evidence，而不是继续尝试 `--help` 或 `mcp --help`。

**Why**

- macOS 实机验证显示，从 `cc-gui` 直接启动 `SkyComputerUseClient` 会触发系统问题报告，crash report 为 `SIGKILL (Code Signature Invalid)`。
- `codesign` / `spctl` 显示官方资产本身签名与 notarization 通过，因此失败更像是嵌套 app-bundle helper 的宿主/父进程 launch contract 不兼容，而不是普通二进制损坏。
- 继续直接 exec 会把 verification action 变成可重复 crash 触发器，已经超出“bounded activation/probe”的安全边界。

**Alternative considered**

- 改成 `SkyComputerUseClient mcp --help`。
  - 缺点：`.mcp.json` 的 `args = ["mcp"]` 的确说明之前的参数层级不完整，但当前 crash 发生在更早的 code-signing kill 阶段，换子命令不足以证明安全。
- 继续保留直接 exec 并把 `SIGKILL` 当作 failure evidence。
  - 缺点：每次用户点击都会弹系统 crash report，体验与安全边界都不可接受。

## Risks / Trade-offs

- [Risk] 官方 helper 可能存在签名、父进程或宿主绑定约束，导致第三方宿主无法完成 activation。
  - Mitigation: 对嵌套 app-bundle helper 使用 diagnostics-only fallback；不把失败扩散到 conversation/runtime 主链路。

- [Risk] `permission_required` / `approval_required` 当前没有足够安全、稳定的自动验证入口。
  - Mitigation: Phase 2 只自动验证 helper launch/bridgeability；权限与 approval 继续通过 blocked guidance 向用户显式暴露。

- [Risk] session-scoped verification 在 app 重启后会丢失。
  - Mitigation: 这是有意取舍；Phase 2 先验证 bridgeability，若后续稳定，再讨论持久化信任。

- [Risk] UI 如果文案过度乐观，会让用户误以为已经支持完整 Computer Use workflow。
  - Mitigation: 所有 copy 明确说明这是 activation/probe lane，而不是完整 runtime support claim。

- [Risk] activation lane 新增 command/state，可能引入 concurrency 或 cleanup 边界问题。
  - Mitigation: single-flight、timeout、kill switch、targeted tests 和 localized error surface 一起上。

## Migration Plan

1. 扩展 OpenSpec delta specs，明确 Phase 2 contract 与 rollback boundary。
2. backend 新增 activation command、session-scoped verification cache 与 structured result type。
3. frontend 新增 activation affordance、running/result rendering 与 targeted tests。
4. 执行 `macOS` 最小人工矩阵，确认 success / blocked / failure paths；`Windows` 再次确认无误导入口。
5. 若任一步出现不稳定：
   - 关闭 activation feature flag
   - 保留 Phase 1 `status-only` status surface
   - 不回滚 Phase 1 的 discovery/status contract

## Open Questions

- 当前无阻塞性 open question。
- 若实现阶段发现官方 helper 不存在足够安全的 no-op / handshake 入口，则本 change 必须自动降级为“显式 launch + bounded diagnostics verification”，而不是强行推进 conversation 级 invoke。
- 2026-04-23 macOS 实机验证已经确认直接 exec 嵌套 helper 会触发 `SIGKILL (Code Signature Invalid)`，因此当前实现已降级为 diagnostics-only fallback，而不是继续显式 launch。
