## Why

右侧主 Git 面板的 changed file list 目前已经支持两种预览能力：单击 file row 会在中间区域切换 diff，双击 file row 会打开弹窗 diff。但是这两个入口都藏在 row 手势里，用户几乎无法从界面直接感知到，导致能力存在但不可发现，尤其在 tree / flat 两种列表模式下都不够显式。

这个问题现在需要收敛，因为它不是“功能缺失”，而是 discoverability 缺失。继续依赖隐式 click / double-click 手势，会让用户只能靠试错或口口相传发现能力，Git 面板的可用性和完成度都被低估。

## 目标与边界

### 目标

- 在右侧主 Git 面板的 changed file row 行尾增加两个显式 preview action icons。
- 第一个 icon 直接触发“在中间区域预览 diff”。
- 第二个 icon 直接触发“打开弹窗 diff 预览”。
- tree / flat 两种列表模式下都保持同一 affordance。
- 保留现有 row 单击 / 双击语义，不做破坏性替换。

### 边界

- 只处理右侧主 Git 面板的 changed file list，不顺带重做 Git History/HUB worktree 面板。
- 只新增 preview action button 与相关文案 / 样式 / 测试，不修改 diff viewer 布局或 modal 内容。
- 不改变 stage / unstage / discard 的业务语义，只调整 action 区的可发现性。

## 非目标

- 不修改 Git History 面板当前的 worktree preview 交互模型。
- 不新增第三种 preview 模式。
- 不重做整行 hover、selection、commit scope 的交互规则。

## What Changes

- 在右侧主 Git 面板 file row 的行尾 action 区、`+ / - / 回退` 按钮前，新增两个显式 preview action buttons。
- 新增 “inline preview” 与 “modal preview” 的 tooltip / aria / i18n 文案。
- 让新增 buttons 在 tree / flat 列表下都可见，并保持与现有行内 action 同一视觉层级。
- 保留现有 row 单击切中间预览、双击开 modal 的原有手势语义，新增 buttons 只是显式入口，不替代旧入口。

## 方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 只加说明文案或 hover hint，继续依赖 row 单击/双击手势 | 改动最小 | 发现路径仍然隐式，用户必须先 hover/试错 | 不采用 |
| B | 在 file row 行尾增加两个显式 action buttons，分别直达 inline preview / modal preview | 可发现性最直接，语义清晰，改动集中 | 行尾 action 区更紧，需要控制密度 | **采用** |
| C | 移除 row 单击/双击，仅保留显式 buttons | 心智最确定 | 破坏现有熟练用户手势路径，属于不必要倒退 | 不采用 |

## Capabilities

### New Capabilities

- `git-file-preview-affordance`: 定义右侧主 Git 面板 changed file row 的显式 inline preview / modal preview action contract。

### Modified Capabilities

- 无

## 验收标准

- 在右侧主 Git 面板的 tree / flat changed file list 中，每个 file row MUST 在 `+ / - / 回退` 前显示两个 preview action buttons。
- 当用户点击第一个 preview button 时，系统 MUST 执行与“单击 row”一致的中间区域 diff 预览行为。
- 当用户点击第二个 preview button 时，系统 MUST 执行与“双击 row”一致的 modal diff 预览行为。
- 新增 preview buttons MUST NOT 移除或替代现有 stage / unstage / discard actions。
- 现有 row 单击 / 双击手势 MUST 继续可用，不得因新增 buttons 失效。

## Impact

- Affected frontend:
  - `src/features/git/components/GitDiffPanelFileSections.tsx`
  - `src/features/git/components/GitDiffPanel.tsx`
  - `src/features/git/components/GitDiffPanel.test.tsx`
  - `src/styles/diff.css`
  - `src/i18n/locales/*.ts`
- Dependencies:
  - 不引入新第三方依赖。
- Systems / rules:
  - 保持现有 Git panel row click / double-click contract。
