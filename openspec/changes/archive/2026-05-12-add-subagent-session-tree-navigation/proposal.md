## Why

Claude Code 在主会话中启动多个子 agent 并行工作时，Mossx 目前没有把这些子 agent 当成一等 session 来呈现。用户只能在主会话的实时幕布中看到零散或滞后的 agent 输出，子 agent 完成后又被回灌到当前历史会话幕布里，导致两个问题：

- 运行中不可观察：用户无法在子 agent 执行时快速判断每个 agent 在做什么、是否卡住、是否失败。
- 会话关系不可导航：左侧 session 列表没有父子层级，实时幕布也不能点击进入某个子 agent 的完整对话。

这不是单纯的 UI 卡片缺失，而是 session 模型没有表达“主会话 spawn 子会话”的事实关系。正确方向是让父子 session relationship 成为 catalog / activity / curtain 共用的事实源，然后侧边栏、实时幕布和跳转行为都消费同一个关系投影。

## 目标与边界

- 目标：让左侧 session 列表支持轻量父子分层，主会话下可展开/折叠其子 agent sessions。
- 目标：父 session 被移动到 session folder 时，已知子 agent sessions 应随父级一起进入目标 folder，避免父子树被 folder 投影拆散。
- 目标：当父 session 本身位于某个子 folder 内并拉起子 agent 时，child session 默认继承父 session 的有效 folder，避免新 child session 落回 project root。
- 目标：让实时幕布在子 agent 运行中展示可点击的 agent session 卡片，而不是等完成后才回灌。
- 目标：点击实时幕布中的子 agent 卡片时，能够跳转到该子 agent 的独立对话上下文，并保留返回父会话的导航语义。
- 目标：为子 agent session relationship 定义稳定字段，包括 parent session、child session、spawn tool call、agent 名称/角色、运行状态与 jump target。
- 目标：主会话已经产出 final assistant message 且收到 `turn/completed` 后，UI 必须允许主 turn 正常结算；残留的 child-agent tool row 状态只能作为 diagnostic，不得继续把主会话卡在 loading。
- 边界：本变更不实现代码，不重构全量 session store，不改变非 Claude provider 的既有会话行为。

## 非目标

- 不重新设计所有 workspace session catalog、folder tree 或 archive 管理规则。
- 不把子 agent conversation 合并成主会话中的普通 assistant 消息。
- 不要求子 agent 必须复制父会话全部上下文到 UI。
- 不实现跨 engine 的通用多 agent 编排；本提案先覆盖 Claude Code 子 agent 会话关系与导航。
- 不改变现有 fork session / resume session 的语义。
- 不引入强视觉树皮肤：不增加额外 group 背景、边框、连接线或专用 badge，避免破坏普通 session 列表的视觉密度。

## What Changes

- 新增 `subagent-session-tree-navigation` capability，定义子 agent 会话关系、侧边栏树形展示、实时幕布卡片与点击跳转契约。
- session catalog projection 需要能表达 parent-child relationship，至少支持 `parentSessionId`、`childSessionId`、`spawnedByToolCallId`、`agentName`、`agentRole`、`status` 与 `updatedAt`。
- 左侧 session 列表在主会话行下展示子 agent sessions，父子关系不得依赖标题猜测或历史回放文本解析。
- Sidebar 父 session 行必须保持普通 session 的原始位置和对齐，不因拥有 child rows 而额外缩进或换皮肤。
- Sidebar child row 使用普通 session row 外观，只保留轻量缩进表达层级；不展示连接线、分组背景、边框或 `子代理` badge。
- Sidebar parent 的折叠/展开入口放在右侧 meta/icon 区域；点击列表主体必须继续打开 session，不得触发折叠。
- Sidebar child 层级判断以 tree projection 的 `depth` 为准，确保 Claude 与 Codex 子会话视觉对齐；不得只依赖单一 `parentThreadId` 字段。
- Sidebar folder projection 应支持 child session 继承最近父 session 的 folder 归属；当父 session 被移动到其他 folder 时，已稳定的 child sessions 应一起批量更新 folder assignment。
- Folder projection 中来自 catalog/backend 的 `folderId: null` 表示“没有显式 folder assignment”，不得被当成显式 project root；只有本地用户 override 为 root 时，才应阻断 parent folder inheritance。
- Pending child session identity 尚未稳定时，不应强行写入 folder assignment；UI 可先通过父级 folder 继承保持展示一致，待 child session 稳定后再通过既有 pending intent / catalog assignment 收敛。
- 实时幕布在主会话运行中展示子 agent session cards，卡片必须包含状态、名称/角色、最近活动摘要与可点击 jump target。
- 点击子 agent 卡片应激活目标 workspace/thread/session，不中断父会话或其他子 agent 的后台执行。
- 子 agent 完成后，主会话可保留摘要卡片或引用卡片，但不得把完整子 agent 对话误渲染成父会话的连续正文。
- 对 Codex collaboration child-agent 流，`final assistant completion + turn/completed` 是主会话可结算的强证据；即使仍有 `collabAgentToolCall`、`Collab: wait` 或 child agent status 显示 `running`，也不得阻塞主 turn 结束，只能记录为 `remainingBlockers` diagnostic。
- 若尚未看到 final assistant completion，`turn/completed` 遇到 running child-agent blocker 时仍应临时 defer，直到 child terminal update 或 assistant completion 到达，避免回到过早 stopped 的旧问题。

## Capabilities

### New Capabilities

- `subagent-session-tree-navigation`: 定义 Claude Code 子 agent 作为一等子 session 的关系事实源、树形导航、实时幕布可观察性与跳转行为。

### Modified Capabilities

- `workspace-session-catalog-projection`: 后续实现需要让共享 session projection 暴露 parent-child relationship，但 membership 仍由原 scope resolver 决定。
- `workspace-session-radar-overview`: 后续实现需要复用现有 direct navigation 语义跳转到子 agent session。
- `conversation-curtain-normalization-core`: 后续实现需要把子 agent 卡片视为结构化 activity / reference surface，而不是普通 assistant 正文去重对象。

## Impact

- Frontend sidebar：需要支持轻量 session tree、父子行顺序、child row 小缩进、右侧 icon 折叠/展开、pending child 降级打开父 session，以及父 session folder move 带动 child subtree。
- Frontend folder projection：需要把 folder assignment 与 session tree depth 合流，支持 child 默认继承 parent folder，同时保留 child 显式 root / 显式 folder override。
- Conversation curtain：需要展示运行中的 subagent cards，并支持 click-to-open。
- Session activity / radar：需要承载子 agent relationship 和 jump target。
- TypeScript contract：需要补充子 agent relationship view model 与 navigation target 类型。
- Backend / runtime events：需要从 Claude Code 子 agent spawn / progress / completion 信号中提取稳定关系字段。
- Tests：需要覆盖树形 projection、运行中卡片可见、点击跳转、完成后不重复回灌、缺失 child session 的降级展示，以及 Codex child-agent final assistant / `turn/completed` 乱序结算回归。
- Dependencies：不新增第三方依赖。

## 验收标准

- 当主 Claude 会话启动 3 个子 agent 时，左侧 session 列表能在主会话下展示 3 个子 session。
- 父 session 行与普通 session 行保持同一左侧对齐；child rows 显示在父 session 后方，并只通过轻量缩进表达层级。
- 父 session 移动到任一 session folder 后，其已稳定 child sessions 跟随父级进入同一 folder；没有显式 folder assignment 的 child rows 通过 parent folder 继承保持同组展示。
- 当用户在某个子 folder 内开启父 session 并拉起子 agent 时，没有显式 folder assignment 的 child session 默认显示在该子 folder 内，而不是 project root。
- 若 child session 被显式移动到 project root 或其他 folder，该显式 assignment 优先于 parent folder 继承。
- 折叠/展开只由父 session 右侧 icon 触发；点击父 session 或 child session 行主体仍执行打开 session 行为。
- Claude 与 Codex child rows 使用一致的层级缩进规则，不因 relationship 字段来源不同而错位。
- 子 agent 运行中，实时幕布能看到每个子 agent 的卡片、状态和最近活动信息。
- 用户点击任一子 agent 卡片后，可以进入该子 agent 的完整对话上下文。
- 从子 agent 返回父会话时，父会话仍保持原运行/历史状态，后台执行不被中断。
- 子 agent 完成后，父会话中只保留结构化摘要或引用，不出现完整子 agent 对话被重复塞入父会话正文的问题。
- Codex 主会话在 final assistant message 与 `turn/completed` 都已到达后必须退出 loading；残留 child-agent blocker 不得继续阻塞，只能进入 diagnostic。
- Codex 主会话尚未出现 final assistant completion 时，running child-agent blocker 仍可 defer `turn/completed`，防止子 agent 未完成时过早显示 stopped。
- 非 Claude provider 不受影响。
