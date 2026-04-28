## ADDED Requirements

### Requirement: Claude Sidebar Reopen Surface MUST Stay Anchored During Late Reconcile

当用户从 sidebar 或 recent conversations 重新激活 `Claude` 历史会话时，只要当前幕布已经存在可读 surface，late reconcile MUST 维持该 surface 或替换为显式 reconcile/failure，不得直接把内容清空。

#### Scenario: late reconcile preserves readable history or explicit reconcile surface
- **WHEN** 用户重新打开某条 `Claude` sidebar entry
- **AND** 当前幕布已经显示出可读 history rows
- **AND** native session truth 仍在 late reconcile、canonical resolve 或 existence check 中
- **THEN** 系统 MUST 保留 readable history surface 或显示显式 reconcile surface
- **AND** 系统 MUST NOT 在无说明的情况下把当前幕布清空

#### Scenario: truth mismatch does not blank the selected sidebar conversation
- **WHEN** 当前选中的 `Claude` sidebar entry 与 authoritative native session truth 不一致
- **THEN** 系统 MUST 将该 entry 置于 reconcile 或 recoverable failure
- **AND** 系统 MUST NOT 先显示该 entry 的历史，再在晚到 truth mismatch 后直接掉回空白 conversation

### Requirement: Canonical Claude Replacement MUST Converge The Selected Sidebar Entry

当 `Claude` 历史 entry 需要 canonical replacement 时，系统 MUST 让 selected sidebar entry 与实际打开的 native session truth 收敛到同一目标，不得留下会自行消失的 duplicate conversation。

#### Scenario: selected sidebar entry converges to canonical replacement
- **WHEN** 当前选中的 `Claude` sidebar entry 经过 canonical resolve 后应当指向另一条 native session identity
- **THEN** selected sidebar state 与 conversation surface MUST 一起收敛到该 canonical replacement
- **AND** 系统 MUST NOT 让旧 entry 与 replacement entry 同时表现为“当前会话”

#### Scenario: canonical replacement does not surface as a temporary ghost thread
- **WHEN** `Claude` reopen / continue 过程中出现 canonical replacement
- **THEN** replacement MUST 作为当前 selected conversation 的 truth convergence 结果呈现
- **AND** 系统 MUST NOT 生成一个短暂可见、完成后又自行消失的 ghost `Claude` thread
