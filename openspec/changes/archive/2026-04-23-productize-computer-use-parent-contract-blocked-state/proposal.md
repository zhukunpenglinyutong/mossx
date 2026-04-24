## Why

上一阶段已经通过只读证据确认：本机 macOS 的官方 Codex / Computer Use plugin / helper 安装态基本成立，但第三方宿主不能满足官方 helper parent contract。当前 UI 仍容易让用户误以为“继续点权限、重试 activation 或重跑 diagnostics”就能通过，需要把该结论产品化成明确、稳定、不可误解的 blocked state。

## 目标与边界

- 目标：把 `requires_official_parent` / `handoff_unavailable` 提升为 Computer Use surface 的一等结论状态。
- 目标：明确区分“Mac 安装与官方签名 OK”与“当前宿主无法运行官方 helper”。
- 目标：在 parent contract 已被确认后停止重复 activation / diagnostics 的主行动诱导，只保留 refresh 或只读证据查看。
- 目标：补齐中英文文案、UI 测试与 OpenSpec/Trellis contract，确保后续不会回退成“继续 direct exec helper”。
- 边界：仍然只影响 settings / Computer Use diagnostics surface，不进入聊天 runtime、MCP relay 或后台 automation。

## 非目标

- 不新增 Tauri command。
- 不实现官方 Computer Use runtime integration。
- 不尝试 `open -a Codex`、URL scheme launch、XPC call 或 direct helper exec。
- 不修改官方 Codex plugin/cache/manifest/helper。
- 不处理 Windows bridge；Windows 继续 explicit unsupported。

## What Changes

- Computer Use status card 增加 parent contract verdict panel，显示“安装/签名证据已通过，但当前宿主不具备官方 parent contract”。
- `host_incompatible` 后的 next-step 文案从“重试 activation”切到“调查宿主契约”；调查完成且结论为 `requires_official_parent` / `handoff_unavailable` 后，隐藏重复 diagnostics CTA。
- official parent evidence 区域增加 stop-condition copy：候选 evidence 不代表 runtime enabled；缺少官方 handoff 时只能保持 diagnostics-only。
- 测试覆盖三段状态：初始 blocked、activation host incompatible、host-contract requires official parent final verdict。
- 同步 `.trellis/spec/frontend/computer-use-bridge.md` 与 OpenSpec delta specs。

## 技术方案对比

| 方案 | 做法 | 取舍 |
|------|------|------|
| UI verdict + action gating | 复用现有 host-contract payload，在前端派生 final verdict 与按钮门禁 | 无后端风险，能直接降低误操作；依赖现有 diagnostics 结果 |
| 后端新增 canonical status 字段 | Rust 直接返回 `parent_contract_blocked` 新状态 | 语义更集中，但会扩大跨层 payload 和 ready/block precedence 范围，本阶段不需要 |
| 继续保持原 UI | 只展示 enum、path 与 snippets | 改动最小，但用户仍看不懂“Mac 过了没有”，容易继续重试错误动作 |

选择：采用 UI verdict + action gating。本阶段不改 backend contract，只把已存在的结构化证据变成明确的产品结论。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `computer-use-helper-host-contract`: host-contract diagnostics 的最终结论必须被 UI 产品化为 diagnostics-only stop condition。
- `computer-use-activation-lane`: `host_incompatible` 后不得把重复 activation 作为主要 remediation；parent contract 结论完成后不得继续诱导重复 diagnostics。
- `codex-computer-use-plugin-bridge`: bridge guidance 必须明确禁止 direct helper workaround，并向用户解释 Mac 安装态与 parent contract 阻塞的区别。

## Impact

- Frontend: `src/features/computer-use/components/ComputerUseStatusCard.tsx` 增加派生 verdict 与行动门禁。
- Frontend tests: `ComputerUseStatusCard.test.tsx` 覆盖 verdict copy 与按钮隐藏。
- i18n: `src/i18n/locales/en.part1.ts`、`src/i18n/locales/zh.part1.ts` 增加用户可读文案。
- Specs: 更新 OpenSpec delta 与 `.trellis/spec/frontend/computer-use-bridge.md`。

## 验收标准

- 当 host-contract diagnostics 返回 `requires_official_parent` 时，UI 明确显示“Mac 安装/签名证据 OK，但当前宿主缺少官方 parent contract”。
- 当 official parent discovery 返回 `handoff_unavailable` 或 `requires_official_parent` 时，UI 显示 diagnostics-only stop condition。
- final verdict 出现后，重复 host-contract diagnostics CTA 不再作为主按钮展示。
- activation host incompatible 后，activation CTA 仍隐藏，next-step 指向 host-contract diagnostics。
- targeted Vitest、typecheck、lint、OpenSpec validate 与 large-file gate 通过。
