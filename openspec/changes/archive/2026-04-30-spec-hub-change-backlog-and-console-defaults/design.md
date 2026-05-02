## Context

当前 Spec Hub 的 change list 只承载 lifecycle 维度，无法区分“正在推进的 active working set”和“暂时搁置但未归档的 proposal pool”。随着 active change 增多，左侧列表越来越像线性堆栈，不利于用户快速找到本期真正要推进的 change。  
同时，右侧 execution console 现在默认展开，这对“先看 proposal/design/specs 内容，再决定要不要执行 action”的阅读路径不友好，尤其在窄宽度下会压缩 artifact panel。

现有实现已经具备几类 workspace-scoped persisted state：

- `mode`（managed / byo）
- `specRoot`
- `verify` evidence

这说明本次最合适的落点不是 backend，也不是 OpenSpec artifact 本身，而是复用 Spec Hub runtime 的本地 overlay 模式。

## Goals / Non-Goals

**Goals:**

- 在不改变 OpenSpec 事实语义的前提下，为 change list 增加 backlog triage 层。
- 让 execution console 采用“首次默认折叠 + 之后尊重用户偏好”的交互。
- 保持 filter、status、gate 之间的关系可解释，不制造新的隐式状态机。
- 把 right-click triage 入口做成可访问的交互，而不是只服务鼠标用户。

**Non-Goals:**

- 不把 backlog membership 写入 `openspec/changes/**`。
- 不扩展成 kanban、priority board 或 change ownership 系统。
- 不重构 Spec Hub 三栏布局，只在现有 surface 上做可控增量。

## Decisions

### Decision 1: `需求池` 采用 workspace + spec-root scoped local overlay，而不是 spec metadata

- 备选 A：把 backlog 信息写回 change 文件或新 metadata 文件。
  - 问题：这会让“个人工作集整理”污染团队共享 spec 资产。
- 备选 B：只放在组件 state。
  - 问题：刷新即丢失，不满足真实整理诉求。
- 采用：runtime 复用 `clientStorage` 持久化 overlay，key 按 `workspaceId + resolvedSpecRoot scope` 隔离。

Rationale：

- backlog 是 UI triage，不是 domain status。
- 同一 workspace 可能切换不同 external spec root，组织态必须跟着 spec scope 走，不能只按 workspace 粗暴复用。

### Decision 2: backlog membership 与 lifecycle status 正交，filter 以“overlay + status”联合派生

- 备选 A：把 backlog 当成新的 `SpecChangeStatus`。
  - 问题：会污染 `draft/ready/blocked/verified/archived` 这些由 artifact/gate 推导出的事实状态。
- 备选 B：backlog 仅作为附加 membership。
  - 优点：status 继续服务 gate 与语义展示；backlog 只影响某些视图分流。

采用规则：

- `active`：非 archived、非 blocked、且不在 backlog membership 中的 change。
- `backlog`：在 backlog membership 中且未 archived 的 change。
- `blocked`：所有 blocked change，不论是否也在 backlog。
- `all`：全部 change，但 backlog 成员需要可见提示。

这样 blocked 风险不会因为被丢进 backlog 而“消失”，同时 active working set 也能真正降噪。

### Decision 3: execution console 采用“首次默认折叠 + 显式用户偏好恢复”

- 备选 A：每次进入都强制折叠。
  - 问题：对重执行流用户不友好，每次都要重新展开。
- 备选 B：首次默认折叠；一旦用户交互，就持久化最终选择。采用。

Rationale：

- 首次默认态解决“进入先看内容”的主诉。
- 显式偏好恢复解决“我就是常开执行台”的高频用户效率问题。

### Decision 4: backlog 操作入口采用 right-click 为主，keyboard-accessible 等价入口为辅

- 备选 A：只做 right-click context menu。
  - 问题：键盘不可达，也不利于 discoverability。
- 备选 B：每行常驻按钮。
  - 问题：会让窄列表进一步拥挤。
- 采用：secondary click 打开 triage menu，同时提供 focused row 的 keyboard/context-menu 等价入口（例如 overflow trigger 或系统 context menu shortcut）。

Rationale：

- 满足用户明确提出的“右键移动到需求池”。
- 不为了右键而牺牲 accessibility。

## Risks / Trade-offs

- [Risk] backlog 作为本地 overlay 不会跨机器同步  
  → Mitigation：在 proposal 中把它明确定义为 workspace-scoped personal triage，不承诺团队共享。

- [Risk] 同一条 change 可能同时出现在 `blocked` 与 `backlog` 视图，用户初次会困惑  
  → Mitigation：在 backlog row 上继续显示底层 status，并在空态/tooltip 文案中解释“backlog 不改变状态，只改变工作集归属”。

- [Risk] spec root 变化后旧 backlog key 残留，导致脏 membership  
  → Mitigation：runtime refresh 时按当前 visible changes 做 stale-id cleanup；archived / missing ids 自动剔除。

- [Risk] 只改视图层但不补测试，后续很容易被大文件重构冲掉  
  → Mitigation：把 hook/UI 的回归测试列为显式任务，覆盖默认折叠、filter 派生、membership 持久化、context-menu 文案切换。

## Migration Plan

1. 增加 runtime overlay key 与 restore logic，但先保持 UI 不消费，确保 state 初始化稳定。
2. 接入 execution console collapsed preference，验证首次默认态与已保存偏好恢复。
3. 接入 backlog membership 派生规则与 filter chip。
4. 接入 change row triage menu 与 i18n copy。
5. 补 hook / component 测试，并执行 targeted quality gates。

Rollback:

- 若 backlog overlay 逻辑引入异常，可直接停止读取对应 store key，change list 会回退到原始 lifecycle-driven 视图。
- 若默认折叠行为引起强烈反弹，可保留 preference key 结构，仅把初始默认值改回 expanded，回滚成本低。

## Open Questions

- 暂无阻塞性开放问题。当前方案默认 backlog 为“个人本地视图能力”；若未来需要团队共享，再单独提 change 讨论 sidecar / spec metadata 方案。
