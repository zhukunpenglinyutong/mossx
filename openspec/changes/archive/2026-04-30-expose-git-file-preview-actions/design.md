## Context

右侧主 Git 面板的 changed file row 目前把两种 preview 行为拆成了两层隐式手势：

- row 单击：切换中间区域的 diff 预览
- row 双击：打开 modal diff 预览

实现本身已经存在，问题在于 action 没有被显式表达。用户面对行尾的 `stage / unstage / discard` controls 时，只能看见“改动处理”类按钮，看不见“查看差异”的直达入口。因为这次只影响主 Git 面板，而且 preview 行为已经存在，所以这更适合做成局部 UI contract 收口，而不是扩展成新的 service 或 runtime contract。

## Goals / Non-Goals

**Goals:**

- 为每个 changed file row 提供两个可见、可点击的 preview action buttons。
- 两个 buttons 分别复用现有 inline preview 与 modal preview 行为。
- 在 flat / tree 两种列表模式下都保持同样的 action layout。
- 不破坏现有 row click / double-click 路径。

**Non-Goals:**

- 不修改 Git History/HUB worktree 面板的 preview 行为。
- 不重构 diff viewer 或 modal 组件。
- 不新增跨层 command、storage 或 backend contract。

## Decisions

### Decision 1：新增的是显式 action buttons，不是被动提示 icon

- 选择：
  - 在 `diff-row-actions` 中新增两个可点击 button，分别触发 inline preview 与 modal preview。
- 原因：
  - 用户原话是“把两个功能做成 2 个 icon”，这意味着 icon 本身应该是功能入口，而不只是提示符号。
  - 只有做成 action，才能真正解决“能力存在但用户无法感知”的问题。
- 备选方案：
  - 方案 A：只显示两个被动 icon，不可点击。
    - 放弃原因：只是把隐式能力换成视觉说明，仍然不够直接。

### Decision 2：preview buttons 放在 mutation actions 前，但不替代它们

- 选择：
  - 按用户指定，preview buttons 放在 `+ / - / 回退` 之前。
  - 继续保留 stage / unstage / discard 原有按钮与行为。
- 原因：
  - 这样既满足用户指定的布局位置，又能维持“先看 diff，再决定处理改动”的操作节奏。
- 备选方案：
  - 方案 A：把 preview buttons 放到文件名附近。
    - 放弃原因：更易干扰 file label，可点击热区也更混乱。

### Decision 3：只收口主 Git 面板，不把 worktree mirror 一起改成另一套不一致 contract

- 选择：
  - 本次 capability 只定义主 Git 面板 changed file row 的 preview affordance。
- 原因：
  - 当前 `GitHistoryWorktreePanel` 并不具备与主面板完全等价的 inline preview + modal preview 双路径，直接强行加相同按钮会造成假一致。
  - 这次目标是精准修复 discoverability，而不是扩展另一个 surface 的预览模型。
- 备选方案：
  - 方案 A：同时给 `GitHistoryWorktreePanel` 也加两个 preview buttons。
    - 放弃原因：会隐式引入新的行为归一化范围，超出本次边界。

## Risks / Trade-offs

- [Risk] 行尾 action 区变拥挤，尤其在窄宽度下影响可读性
  → Mitigation：沿用现有 `diff-row-action` 尺寸体系，只增加最小必要 icon，并通过 tooltip 承载详细语义。

- [Risk] 新增 preview buttons 与 row click / double-click 同时存在，造成重复入口
  → Mitigation：明确把 buttons 视为 discoverability affordance；旧手势继续保留，熟练用户与新用户都能受益。

- [Risk] button click 冒泡到 row，导致触发两次或触发错路径
  → Mitigation：preview buttons 必须 `stopPropagation()`，并直接调用各自目标 callback。

## Migration Plan

1. 在 OpenSpec 中补 capability 与任务定义。
2. 在 `GitDiffPanel` / `GitDiffPanelFileSections` 中增加 inline preview / modal preview action callbacks。
3. 在 `diff.css` 中收口 preview action button 样式。
4. 补充 i18n 文案与 Vitest 回归测试。
5. 同步主 specs，并在实现通过后进入 verify / archive。

回滚策略：

- 若新增 action buttons 造成 UI 密度或事件冒泡回归，可先只回退新增 preview buttons，保留原有 row click / double-click 行为不变。

## Open Questions

- 如果后续要把 Git History/HUB worktree 面板也归一化为同一 preview affordance，是否应另开一个独立 change，把 inline preview 能力一起补齐？
