## Why

当前 AI 对话里的同一轮文件修改，至少已经分裂成三套用户可见 surface：

- 消息幕布里的 `File changes` tool card
- 右侧 `workspace session activity` 面板
- 底部 `status panel` 的文件变更区

用户已经明确反馈两个问题：

1. 一次对话实际修改的文件，在幕布里能看到完整列表，但右侧实时面板只显示了被压缩后的少量条目，数量明显不一致。
2. `git diff` 的 `+/-` 统计在不同 surface 上口径不一致，用户无法信任“这轮 AI 到底改了多少文件、改了多少行”。

进一步核对代码后，根因不是单纯的 UI 漏渲染，而是事实抽取已经分叉：

- 右侧 `session activity` 当前通过 `summarizeFileChangeItem(...)` 把一次多文件变更压成单条摘要，天然丢失完整文件列表。
- 底部 `status panel` 走 `extractFileChangeSummaries(...)`，有自己的一套文件推断与统计规则。
- 消息幕布则更靠近原始 `item.changes[]`，所以经常比右侧看到更多文件。

此外，右侧文件条目的当前交互也不够完整：点击后只是沿用既有 `onOpenDiffPath` 打开左侧文件/差异 surface，但不会自动最大化编辑区，也没有独立的 `diff` 弹窗快捷入口。

本提案的目标不是“再补一层显示”，而是把 AI 对话中的文件变更收敛成统一 contract：文件集合、路径身份、`+/-` 统计、打开动作与 diff 预览动作在各 surface 上必须语义一致。

## Current Status (2026-05-05)

- `src/features/session-activity/adapters/buildWorkspaceSessionActivity.ts` 当前用 `summarizeFileChangeItem(...)` 生成 `fileChange` event；该 summary 默认只保留 primary file + `fileCount` + 聚合 `+/-`。
- `src/features/status-panel/hooks/useStatusPanelData.ts` 当前用 `extractFileChangeSummaries(...)` 构建底部文件列表；其推断逻辑与右侧 activity adapter 不同。
- `src/features/messages/components/toolBlocks/GenericToolBlock.tsx` / `EditToolGroupBlock.tsx` 仍然直接以 `item.changes[]` 为主要展示源，因此更容易保留完整文件明细。
- 右侧文件跳转仍复用 `onOpenDiffPath`，而 app shell 已存在 `isEditorFileMaximized` / `setIsEditorFileMaximized` 能力，但当前 activity panel 文件点击不会触发“打开后最大化”的体验闭环。

## Goals

- 让右侧 `workspace session activity` 面板对 AI 对话中的文件变更展示完整文件集合，而不是只保留压缩摘要。
- 让消息幕布、右侧 activity panel、底部 status panel 对同一 file-change fact 的文件数量、路径身份、`additions`、`deletions` 保持一致。
- 让右侧 activity panel 的文件主点击行为升级为：打开目标文件并最大化编辑区。
- 在右侧 activity panel 为文件条目提供独立 icon 按钮，点击后弹出该文件的 diff 预览窗体，而不是挤占当前主布局。
- 保持历史回放、文件跳转、line marker、高亮与现有 diff 打开链路稳定，不因本提案产生新的身份分叉。

## Non-Goals

- 不重做整套消息幕布 UI，也不重写 `toolBlocks` 总体交互结构。
- 不在本期把所有文件相关 surface 都改造成同一种视觉样式；本期只要求语义归一，不要求视觉完全统一。
- 不改写 Git diff engine、Tauri Git commands、持久化 schema 或 conversation storage 格式。
- 不把“最大化打开文件”扩展成新的全局窗口模式；本期仅在当前 editor/file surface 已支持的最大化 contract 内复用现有能力。
- 不为普通 commit history / Git History / detached file explorer 入口强行套用同一交互；本期主范围是 AI 对话相关右侧 `activity panel` 与底部 `status panel`。

## What Changes

### 1. 引入共享的 file-change presentation contract

把“AI 对话里的文件变更”从“按 surface 各自推断”改成“先归一成 canonical file entries，再分别渲染”：

- 每个 file-change fact 最终归一为 `entries[]`
- 每个 entry 至少包含：
  - `filePath`
  - `fileName`
  - `status`
  - `additions`
  - `deletions`
  - `diff` / preview evidence（若可用）
- `session activity` 与 `status panel` 必须消费同一套 canonical file-entry 结果，而不是一边走 `summarizeFileChangeItem(...)`，另一边走 `extractFileChangeSummaries(...)`

这意味着右侧面板可以保留 event-level 时间线语义，但文件展示粒度必须下沉到完整 `entries[]`，不得再只展示 primary file。

### 2. 右侧 activity panel 展示完整文件列表

对一次多文件 file-change：

- 时间线节点仍可保留 event summary（例如 tool / turn / session provenance）
- 但事件展开态下 MUST 展示该次变更涉及的全部文件
- 文件数量 MUST 与消息幕布里对应 `File changes` 卡片保持一致
- 文件级 `+/-` 与 event 聚合 `+/-` 必须可追溯回同一 canonical source

如果某些历史 payload 只有部分 diff / 部分 path 信息，则 fallback 推断仍允许存在，但 fallback 结果必须被所有 surface 共用，不能再出现“幕布一套、右侧一套、底部一套”的分叉。

### 3. 归一化 `+/-` 统计口径

本提案要求统一以下统计语义：

- 单文件 `additions` / `deletions`
- 单次 file-change event 的聚合 `+/-`
- 当前线程/当前 surface 汇总 `+/-`

归一化后：

- 消息幕布 file card header
- 右侧 activity panel 文件列表与汇总
- 底部 status panel `Edits` tab 汇总

对同一事实 MUST 保持一致。

### 4. 右侧文件主点击改为“打开并最大化”

当前右侧文件点击只是走已有 `onOpenDiffPath`，但不会自动展开编辑区。

变更后：

- 点击右侧 activity panel 的文件主区域时，系统 MUST 打开目标文件
- 并在当前已有 editor/file surface 支持的前提下，将文件编辑区切换到最大化状态
- 如果当前平台或当前布局不支持 meaningful maximize，则系统 MUST 回退到既有打开行为，而不是失败或无响应

这里的“最大化”是复用现有 `isEditorFileMaximized` contract，而不是引入新的并行 maximize state。

### 5. 新增独立 diff icon 按钮

右侧 activity panel 的每个文件条目增加一个独立 icon 按钮：

- 点击后打开该文件的 diff 预览窗体
- 该预览应尽量复用现有 diff modal / diff preview 能力，而不是再造一套 viewer
- 打开 diff 弹窗时，当前主布局上下文 SHOULD 保持不丢失
- 关闭弹窗后，用户 MUST 能无缝回到当前会话上下文

主点击与次按钮的职责分离如下：

- 主点击：打开文件 + 最大化编辑区
- 次按钮：弹出 diff 预览窗体

## Technical Strategy And Trade-Offs

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 只补右侧 UI，把 `summarizeFileChangeItem(...)` 改得“看起来像更多文件” | 改动最小，短期见效快 | 根因未解，`status panel` 与幕布仍可能继续漂移；后续历史回放/rewind 仍会反复出错 | 不采用 |
| B | 抽共享 file-change presentation layer，让 activity panel 与 status panel 共用 canonical entries | 从根上统一文件数与 `+/-` 统计；兼容现有 surface；回归面可控 | 需要梳理 adapter/hook 间职责，补一轮测试 | **采用** |
| C | 新建全局 runtime 事件模型，彻底替换现有 message/activity/status 三条文件事实链 | 长期最统一 | 改动面过大，超出本期“先把体验打齐”的边界 | 本期不采用 |

## Gate Constraints（门禁约束）

本提案实现时必须显式通过以下门禁：

### 行为门禁

- 多文件 file-change 在消息幕布、右侧 activity panel、底部 status panel 中的文件数量 MUST 一致。
- 同一文件在三个 surface 上的 `status`、`additions`、`deletions` MUST 一致。
- 右侧 activity panel 文件主点击后 MUST 进入“文件已打开 + 编辑区最大化”结果；若 maximize 不可用，必须可解释地回退到既有打开结果。
- 右侧新增 diff icon 按钮后，主点击与 diff 预览动作 MUST 明确分离，不能互相覆盖。
- 历史 reopening / replay 场景下，上述一致性 MUST 继续成立，不能只在 realtime 正常。

### 质量门禁

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- 若修改大 CSS 文件或样式分片，额外执行 `npm run check:large-files`

### 测试门禁

- 必须新增/更新 `session activity` focused tests，覆盖多文件 file-change 的完整列表展示与 diff icon 交互。
- 必须新增/更新 `status panel` focused tests，覆盖与幕布/右侧同一事实下的文件数与 `+/-` 一致性。
- 必须补 history replay / reopen regression，用例证明历史恢复后的 file-change 仍不丢文件、不漂统计。
- 必须补“点击右侧文件后最大化”行为测试，至少锁定 `isEditorFileMaximized` 被正确驱动或正确 fallback。

## Compatibility Guards（兼容性约束）

### 1. 现有文件身份 contract 不得破坏

- `filePath` 仍是 conversation file-change 的 canonical identity
- 现有 line marker / highlight / file-open pipeline MUST 保持兼容
- external spec root / workspace root 的 path-domain routing MUST 保持既有行为

### 2. 现有 `onOpenDiffPath` 链路不得被硬切断

- 本提案允许在 activity panel 上层增加“打开后最大化”的编排
- 但底层既有 `onOpenDiffPath` / diff 打开链路 MUST 保持可复用
- 其他入口（消息幕布 tool card、Git surface、历史面板）MUST NOT 因本提案被迫改成新 contract

### 3. 历史与持久化兼容

- 本提案不修改 conversation storage schema
- 不要求历史数据回填新字段
- 对旧 payload 缺失完整 diff/path 证据的场景，系统 MAY 继续 fallback 推断
- 但 fallback 结果必须被统一抽取并共享，避免同一历史事实在不同 surface 上再出现分叉

### 4. 最大化行为必须是 additive，不得破坏普通打开链路

- 若当前布局、平台或 surface 不支持 meaningful maximize，系统 MUST 回退为现有打开行为
- 系统 MUST NOT 因 maximize 失败导致文件打不开
- 系统 MUST NOT 把“打开 diff 弹窗”误当成“最大化打开文件”

### 5. diff 预览按钮必须是 additive affordance

- 新按钮只是在右侧 activity panel 文件条目上新增快捷入口
- 它 MUST NOT 改变现有消息幕布或 Git History 中“点击文件弹 diff”的既有语义
- 它 MUST NOT 强迫所有文件点击都改成弹窗模式

## Capabilities

### New Capabilities

- `conversation-file-change-surface-parity`
- `session-activity-file-open-affordances`

### Modified Capabilities

- `codex-chat-canvas-workspace-session-activity-panel`
- `conversation-tool-card-persistence`
- `opencode-mode-ux`

## Success Criteria

- 用户在一次 AI 对话结束后，看到的文件数量在幕布、右侧、底部三处一致。
- 用户在三处看到的 `+/-` 汇总一致，不再出现明显“左边 13 个文件，右边 3 个文件”的割裂。
- 右侧点击文件后，能直接进入“文件已打开且编辑区展开”的更强操作态。
- 用户能通过独立 icon 按钮快速弹出 diff 预览，而不打断当前主布局阅读。
- 对历史 reopening、multi-session child activity、外部 spec 路径、line markers 等现有能力无明显回归。

## Impact

### Frontend

- `src/features/session-activity/adapters/buildWorkspaceSessionActivity.ts`
- `src/features/session-activity/components/WorkspaceSessionActivityPanel.tsx`
- `src/features/session-activity/components/WorkspaceSessionActivityPanel.test.tsx`
- `src/features/status-panel/hooks/useStatusPanelData.ts`
- `src/features/status-panel/components/FileChangesList.tsx`
- `src/features/status-panel/components/StatusPanel.tsx`
- `src/features/operation-facts/operationFacts.ts`
- `src/features/operation-facts/operationFacts.test.ts`
- `src/features/messages/components/toolBlocks/GenericToolBlock.tsx`
- `src/features/messages/components/toolBlocks/EditToolGroupBlock.tsx`
- `src/app-shell-parts/useAppShellSections.ts`
- `src/app-shell-parts/useAppShellLayoutNodesSection.tsx`
- i18n locale files

### Contracts / Specs

- `openspec/specs/codex-chat-canvas-workspace-session-activity-panel/spec.md`
- `openspec/specs/conversation-tool-card-persistence/spec.md`
- `openspec/specs/opencode-mode-ux/spec.md`

### Styling

- `src/styles/session-activity.css`
- 视具体实现决定是否触达 `messages` / `status-panel` 相关样式
