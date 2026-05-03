## Context

阶段一到三已经让 `Context Ledger` 具备：

- 当前态来源账本
- 最近变化对比
- session 边界收口
- source navigation

当前缺口不在“有没有 panel”，而在“治理语义是否说人话”。尤其是 `carried_over` block，系统知道它来自上一轮 keep，但 UI 只给了一个状态名，用户仍然要自己猜生命周期。

## Decisions

### 1. `carry-over reason` 独立于 `participationState`

- `participationState` 继续表达当前参与态：
  - `selected`
  - `pinned_next_send`
  - `carried_over`
- 新增 `carryOverReason` 表达生命周期解释：
  - `will_carry_next_send`
  - `inherited_from_last_send`

原因：

- `state` 负责 machine truth，`reason` 负责 human explanation。
- 后续 batch governance / diff explainability 可以复用同一 reason model，而不是再堆新的布尔字段。

### 2. `clear carried-over` 是独立治理动作，不复用文案层的 `exclude next send`

- `exclude next send` 继续用于当前轮显式选中的 block。
- `clear carried-over` 专门作用于 `carried_over` block。
- 执行动作后立即从当前准备态移除该 block，并清理 retained state。

原因：

- 用户当前面对 inherited block 时，真正的问题不是“排除下一轮”，而是“把上轮留下来的这条现在清掉”。
- 语义不准会让治理 surface 再次显得愚蠢。

### 3. batch governance 建立在统一 eligibility matrix 上

- 可批量治理的 block 仍限于显式 block：
  - `manual_memory`
  - `note_card`
  - `helper_selection`
- file reference 继续单点治理，不并入第一轮 batch。

原因：

- 这三类已有稳定 sourceRef 与 keep/exclude contract。
- file reference 当前还混合 active file 与 inline file，先不在首轮 batch 扩边界。

### 4. attribution hardening 只增强 truthfulness，不追求本期更细 runtime signal

- 保留 `backendSource + attributionKind` 主模型。
- 新增 confidence / degraded explainability copy，明确告诉用户哪些是 coarse attribution。
- 不在本次引入新的 backend contract。

原因：

- 当前主要问题是“表达不诚实”，而不是“完全拿不到 signal”。
- 先把 truthfulness 收紧，收益高于扩协议。

## Validation

- projection tests：
  - retained / pinned block carry-over reason
  - clear carried-over 后 projection 即时收敛
- panel tests：
  - carry-over explanation 渲染
  - clear carried-over action
- composer tests：
  - inherited block 可以被清掉
  - pending keep 与 inherited 状态不会混淆

## Follow-up

- batch governance surface
- attribution confidence badge / explainability
