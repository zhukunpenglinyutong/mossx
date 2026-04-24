## Context

`discover-computer-use-official-parent-handoff` 已经把 helper direct exec 的问题收敛为 read-only evidence：官方 helper 存在、签名/公证可读、parent team / application group 可读，但第三方 host 不是官方 Codex parent。继续扩大探测或重复按钮只会制造噪音；下一步应降低用户认知成本，把结论转成稳定的 UX contract。

## Goals / Non-Goals

**Goals:**

- 在不新增后端字段的前提下，从现有 `ComputerUseHostContractDiagnosticsResult` 派生 verdict。
- 用 verdict panel 解释三件事：Mac 侧安装态、官方签名证据、parent contract 阻塞。
- 调整 CTA：host diagnostics 完成且结论明确后，不再展示重复 diagnostics 主按钮。
- 让测试锁住“不能误报 ready / 不能继续诱导 direct exec”的 UX。

**Non-Goals:**

- 不新增 Rust scanner。
- 不新增 Tauri command。
- 不修改 bridge status enum。
- 不把 Computer Use 接入 conversation runtime。

## Data Flow

```text
ComputerUseHostContractDiagnosticsResult
  -> evidence.officialParentHandoff.kind
  -> deriveParentContractVerdict()
  -> verdict panel + action gating
```

输入只来自现有 host-contract diagnostics result：

- `kind = requires_official_parent | handoff_unavailable`
- `evidence.officialParentHandoff.kind = requires_official_parent | handoff_unavailable | handoff_candidate_found | unknown`
- `bridgeStatus` 继续保持 `blocked`

输出只影响 UI：

- verdict title/body/primary facts
- diagnostics-only stop condition copy
- host diagnostics CTA visibility

## Decisions

### Decision 1: 前端派生 verdict，不改 backend status

理由：backend 已返回足够证据；新增 `parent_contract_blocked` status 会牵动 blocked reason set、service mapping、Rust serialization、现有 tests。当前问题是“展示与行动误导”，不是“缺少后端分类”。

替代方案：新增 backend canonical enum。拒绝原因：收益不足，增加 cross-layer surface。

### Decision 2: final verdict 后隐藏重复 diagnostics CTA

理由：如果已得到 `requires_official_parent` 或 `handoff_unavailable`，重复运行 diagnostics 的价值低，反而让用户以为“再点一次可能会过”。刷新状态仍保留，用户可以在升级 Codex 或变更环境后重新开始。

替代方案：保留按钮并改名“重新调查”。拒绝原因：仍然把重复调查作为主操作，不符合 stop condition。

### Decision 3: 候选入口仍显示为 evidence-only

如果 `handoff_candidate_found` 出现，UI 不渲染 final blocked verdict，而是保留 candidate evidence 和 diagnostics-only notice。后续是否验证候选入口必须另开 proposal。

## Edge Cases

- `hostContractResult = null`：不显示 verdict。
- `kind = unknown` 且 official parent evidence 不完整：不显示 final verdict，只保留 diagnostics 原始结果。
- `handoff_candidate_found`：不显示“可运行”，不隐藏 evidence；仍不进入 runtime。
- Windows / unsupported：不出现 host diagnostics CTA，不出现 macOS parent contract verdict。

## Rollback

- 删除 verdict panel 与 CTA gating 逻辑即可回到上一阶段 UI。
- 不涉及后端状态、文件写入或官方资产修改。
- 失败时保留已有 host-contract diagnostics 和 official parent evidence 展示。
