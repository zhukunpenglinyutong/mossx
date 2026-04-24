## Why

`2026-04-23-add-codex-computer-use-plugin-bridge` 已经完成了 `status-only` Phase 1：客户端现在能正确发现官方 `Computer Use` plugin、展示 `blocked/unavailable/unsupported` 真值，并在 `Windows` 上稳定收敛到 `unsupported`。但这条链路目前停在“知道为什么不能用”，还没有进入“显式验证能不能桥接”的阶段。

对 `macOS` 而言，当前最大的未决问题已经不是 discovery，而是 **helper bridgeability / permissions / approvals 的真实可验证性**。如果不补一个受控的 activation/probe lane，状态面板会长期停留在 `helper_bridge_unverified` / `permission_required` / `approval_required`，团队无法把“理论可桥接”收敛为“宿主真的能桥接”或“宿主明确不能桥接”的工程事实。因此需要开启第二阶段，但必须是**窄范围、显式触发、可回滚**的第二阶段，而不是直接把整个客户端升级成新的 `Computer Use runtime host`。

## 目标与边界

### 目标

- 在 `macOS` 上引入一个 **explicit activation lane**，让用户可以在设置面板内手动触发 helper bridge verification / bounded diagnostics，而不是继续停留在纯状态展示。
- 把 `helper_bridge_unverified` 从“静态推断”推进到“显式验证结果”，让系统能区分：
  - helper 已能在当前宿主中安全拉起
  - helper 因宿主/官方约束无法桥接
  - helper 已验证，但后续仍被 `permission_required` / `approval_required` 阻塞
- 保持 `Windows` 继续走独立 `unsupported` contract，不把第二阶段写成“跨平台即将支持”。
- 保持主流程最小侵入：仅允许通过 Computer Use 设置入口或等价显式动作触发，不自动挂到现有聊天 / 线程 / MCP 主链路。
- 保留整块 kill switch 与阶段回退路径；若 activation lane 不稳定，可退回 Phase 1 的 `status-only` surface。

### 边界

- Phase 2 只做 **activation / probe / bounded invoke verification**，不直接承诺“任意 Computer Use tool call 已可在会话主链路中稳定运行”。
- Phase 2 只覆盖官方 `computer-use@openai-bundled`，不扩展到其他 plugin 或通用 marketplace lifecycle。
- Phase 2 只在 `macOS` 上开放 activation lane；`Windows` 继续明确 `unsupported`。
- Phase 2 允许显式调用官方 helper 做受控验证，但不得把“helper 能被当前宿主拉起”自动扩大解释成“所有 GUI automation、权限与 approval 场景都已稳定支持”。
- 普通设置保存、Codex 会话发送、MCP 管理与工作区流程在未触发 activation lane 时必须保持现状。

## 非目标

- 不把 mossx 变成新的官方 plugin host 或通用 plugin installer。
- 不复制、重打包、重签名、反编译或重新分发官方 helper / app 资产。
- 不在本期实现 generic `Computer Use` 会话自动路由、后台常驻 orchestration 或任意 payload relay。
- 不在本期承诺 `Windows` 支持、Linux 支持，或“未来很快支持”的产品语义。
- 不在本期重写现有 Codex conversation/tool protocol。

## What Changes

- 新增一个 `macOS-only` 的 `Computer Use activation lane`：
  - 用户在设置中的 Computer Use 面板显式触发
  - backend 执行 bounded helper probe / diagnostics verification
  - 返回结构化 activation result，而不是只给布尔值或字符串
- 扩展 backend bridge contract：
  - 在保留 `get_computer_use_bridge_status` 的同时，新增 activation/probe command
  - 把 `helper_bridge_unverified` 的验证过程和结果结构化
  - 对 `permission_required` / `approval_required` 保持显式 blocked guidance，而不是假装已经自动验证
  - 明确 activation failure taxonomy、timeout、stderr/exit evidence 与 rollback 行为
- 扩展 frontend availability surface：
  - 在满足前置条件的 `macOS` 场景展示显式 verify / activate action
  - 渲染 running / succeeded / failed / blocked after probe 的状态反馈
  - 提供可读的 diagnostics / next steps，而不是把失败吞掉
- 保持现有 platform split：
  - `macOS` adapter 增加 activation/probe contract
  - `Windows` adapter 仍只返回 `unsupported`，不出现虚假的 activation affordance
- 增加 targeted tests 与最小人工矩阵，验证 activation lane 不污染现有设置 / Codex 主流程。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 直接把会话主链路接到官方 helper，默认允许真实 `Computer Use` invoke | 用户体感最强，似乎“一步到位” | 风险最大；helper bridgeability 尚未被证明，容易把 settings 级实验直接扩散到 runtime 主链路 | 不采用 |
| B | 先做 `macOS-only`、用户显式触发的 activation/probe lane，验证 helper launch/host bridgeability，并把权限/approval 继续保留为 blocked guidance，再决定是否进入会话级 integration | 风险可控；能把未知收敛为工程真值；回滚半径小 | 用户价值比“一步到位”更克制，需要额外一次显式操作 | **采用** |
| C | 继续停留在 Phase 1 的 `status-only` surface，不做 activation/probe | 最安全，零新增 invoke 风险 | 功能停滞；永远无法证明 bridgeability，状态面板会长期卡在 blocked diagnostics | 不采用 |

采用 `B` 的原因很直接：当前第二阶段最需要验证的是“宿主能不能桥接官方 helper”，不是“先把功能假装连通”。只有先把 activation/probe 的事实跑通，后续是否进入会话级 integration 才有可靠基线。

## Capabilities

### New Capabilities

- `computer-use-activation-lane`: 定义 `macOS` 上显式触发的 helper activation/probe/invoke verification contract、结果模型、失败证据与回退边界。

### Modified Capabilities

- `codex-computer-use-plugin-bridge`: 从 Phase 1 的 `status-only` bridge 扩展为“允许显式 activation lane，但仍禁止隐式/后台 invoke”的第二阶段 contract。
- `computer-use-platform-adapter`: 扩展 `macOS` adapter 的 activation/probe 执行语义与结果判定，同时保持 `Windows` explicit unsupported 不变。
- `computer-use-availability-surface`: 从纯状态诊断面板扩展为“状态 + 显式 verify/activate feedback”的 surface contract。

## 验收标准

- 在 `macOS` 上，当前置条件满足且存在 `helper_bridge_unverified` 时，用户 MUST 能通过显式 activation action 触发一次 bounded helper probe / diagnostics verification，并获得结构化结果。
- activation 过程 MUST 不在用户未触发时自动运行；未进入 Computer Use surface 的用户流程 MUST 与当前版本一致。
- 若 helper 无法桥接、官方 helper 返回错误或超时，系统 MUST 返回明确失败分类与 diagnostics；若 helper 已验证但权限/approval 仍未知，系统 MUST 保持 `blocked`，MUST NOT 伪装成 `ready`。
- `Windows` 上 MUST 继续保持 `unsupported`，不得出现 verify / activate 按钮或等价误导入口。
- activation lane 若出现回归，系统 MUST 可通过 feature flag 或等价 kill switch 整块关闭，并退回 Phase 1 `status-only` 行为。
- targeted tests MUST 覆盖：
  - `macOS` activation success / timeout / helper failure / permission blocked / approval blocked
  - `Windows` 无 activation affordance
  - activation lane 不污染现有 settings / Codex 主流程
  - command mapping 与 structured result parsing

## Impact

- Frontend:
  - `src/features/computer-use/**`
  - `src/features/settings/components/settings-view/sections/CodexSection.tsx`
  - `src/services/tauri/computerUse.ts`
  - `src/services/tauri.ts`
  - `src/types.ts`
  - `src/i18n/locales/{zh,en}.part1.ts`
- Backend:
  - `src-tauri/src/computer_use/**`
  - `src-tauri/src/command_registry.rs`
  - 可能新增 activation/probe command 与结果类型
- Systems / Contracts:
  - official helper invocation boundary
  - `macOS` permission / approval diagnostics
  - feature flag / rollback path for activation lane
