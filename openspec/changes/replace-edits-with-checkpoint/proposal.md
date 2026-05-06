## Why

当前底部 `status panel` 中的 `Edits` 区块已经失去独立产品价值。  
同一轮文件改动事实已经在消息区 `File changes`、右侧 `session activity`、真实 diff/file view 中可见，`Edits` 只是在底部再次复述文件名与 `+/-`，既不利于新手理解，也无法帮助老手做决策。

与其继续优化一个“改动复读机”，不如把这块升级为一个面向决策的结果判断模块，让用户在最稀缺的底部位置一眼知道：当前回合是否可信、卡在什么地方、下一步最该做什么。

## 目标与边界

### 目标

- 用新的 `Checkpoint` 模块替换底部 `Edits` 模块，用户侧默认文案使用更直观的 `结果`。
- 让该模块从“展示文件变化”升级为“压缩当前回合结论”，回答 `现在进行到哪 / 是否可继续 / 下一步做什么`。
- 建立清晰的数据 ownership：
  - 系统写入结构化事实
  - 规则计算 verdict
  - 模型仅生成受约束的人话摘要
- 保持现有底部 `dock` 风格，只允许 icon 点缀与现有轻量按钮语言，不引入胶囊风格、营销式按钮或新的装饰型卡片体系。

### 边界

- 本提案覆盖现有 `status panel` 的两种宿主形态：
  - 底部 `dock` 作为 canonical rich surface
  - composer 上方 `popover` 作为 compact surface
- 替换两种形态中旧 `Edits` 子视图的主语义，但不重做右侧 `session activity`。
- 不改写 `git history`、`file diff viewer`、消息幕布中的 file-change 事实来源。
- 不把该模块做成完整的 console、完整的 Git browser 或完整的提交流程向导。

## 非目标

- 不在本轮重构整个 `status panel` 的所有 tab。
- 不要求首期就覆盖所有引擎特有验证来源；缺失数据时允许显示 `Not observed / Not run`。
- 不让大模型自由生成整个模块内容，也不把 `Ready / Blocked` 之类核心结论交给模型决定。
- 不引入与现有右侧 `session activity` 平行的新时间线系统。

## What Changes

- 下线底部旧 `Edits` 模块的主语义，不再把“文件列表 + `+/-`”作为底部区域的核心信息。
- 引入新的 `Checkpoint` 模块，用户侧 tab 名称默认使用 `结果`，内部 capability 与数据 contract 使用 `checkpoint` 命名。
- `dock` 与 `popover` 都不再暴露 legacy `Edits` 主语义：
  - `dock` 提供完整 `Checkpoint` 骨架
  - `popover` 提供 compact 结果判断视图，但不回退成旧文件列表
- 将模块内容重构为固定骨架：
  - `Verdict`
  - `Evidence`
  - `Key Changes`
  - `Risks`
  - `Next Action`
- 建立 `facts -> verdict -> summary` 三层结构：
  - facts 来自 file changes、commands、tasks/plan、validation、recent turn state
  - verdict 由固定规则判断
  - summary/risk wording 允许模型参与，但必须受固定 schema 约束
- 明确复用现有 canonical file-change facts，不再为 `Checkpoint` 重建一套平行文件统计口径。
- 调整底部 visibility / i18n / tests / settings copy，使旧 `Edits` 入口迁移到 `Checkpoint/结果`。

## 方案选项与取舍

### 方案 A：保留 `Edits`，只优化视觉

- 优点：实现成本低，变更面最小。
- 缺点：信息结构仍然错误，只是把低价值内容做得更漂亮；无法解决新手看不懂、老手不需要的问题。

### 方案 B：把模块直接改名成 `Ready`

- 优点：更贴近“提交前判断”。
- 缺点：语义过窄。真实使用里还存在 `运行中 / 阻塞 / 待复核` 等状态，直接把模块命名成 `Ready` 会误导用户以为这里只服务最后一公里。

### 方案 C：内部 `Checkpoint`，用户侧 `结果`，固定骨架 + 分层 ownership

- 优点：既覆盖 `运行中 / 阻塞 / 待复核 / 可继续` 全状态，也兼顾新手易懂与内部架构稳定；能明确区分事实、规则、模型叙述三层。
- 缺点：需要一次性调整 status panel、visibility、i18n 和若干相关 spec。

**采用方案 C。**

## Capabilities

### New Capabilities

- `status-panel-checkpoint-module`: 定义底部 `status panel` 中新的 `Checkpoint/结果` 模块，包括信息结构、数据 ownership、verdict 规则、视觉约束与老 `Edits` 的替换契约。

### Modified Capabilities

- `client-ui-visibility-controls`: 将底部可见性控制从 `Edits` 迁移到 `Checkpoint/结果`，并定义 legacy preference 的兼容策略。
- `opencode-mode-ux`: 将统一 status panel 在 OpenCode conversation mode 下的 `Edits` 语义升级为 `Checkpoint/结果`，并接住 canonical file facts 的复用契约。
- `status-panel-latest-user-message-tab`: 更新底部 tab 并列关系描述，使 `用户对话` 与 `结果` 等 sibling tab 的契约保持一致。

## Impact

- Affected code:
  - `src/features/status-panel/**`
  - `src/features/client-ui-visibility/**`
  - `src/i18n/locales/**`
  - 与底部 `status panel` 相关的 tests 和数据聚合 hooks
- Affected systems:
  - 底部 `status panel`
  - appearance settings / UI visibility persistence
  - file-change / command / validation / task 事实聚合链路
  - OpenCode mode unified status panel contract
- Dependencies:
  - 继续复用现有 canonical file-change facts
  - 需要与 active change `normalize-conversation-file-change-surfaces` 保持语义一致，避免一边继续强化 `Edits`，另一边又用 `Checkpoint` 取代它
  - 需要新的 checkpoint view-model 聚合层
  - 模型摘要必须是可选层，模块在无模型时仍可工作

## 验收标准

- 底部旧 `Edits` tab 不再作为用户主语义出现，新的 `结果` tab 可替代其位置。
- `dock` 与 `popover` 两种 status panel 形态都不得再向用户暴露 legacy `Edits` 主语义。
- 折叠态能够在一行内稳定展示 verdict 与关键 evidence，不再默认堆叠文件名。
- 展开态必须有固定结构，且结构化事实在无模型时仍可完整展示。
- verdict 不得由模型自由决定；未观察到的验证必须明确显示为 `Not run` 或等效文案。
- 新模块必须继续复用 canonical file-change facts，不得重新引入独立的 `+/-` 统计分叉。
- 模块视觉语言必须延续现有 dock/status panel 风格：允许 icon 点缀，不引入胶囊风格按钮。
