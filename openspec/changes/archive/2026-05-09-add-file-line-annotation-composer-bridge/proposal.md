## Why

截图里的 `codex.app` 标注交互之所以顺手，关键不是“多一个评论框”，而是把文件位置、行号范围和用户标注语合并成一份结构化上下文，并在当前对话框里自动可见、可发送。mossx 现在已有 active file reference、inline file reference、文件行选区和 diff/file viewer 底座，但缺少一条从“打开文件内行级标注”到“当前 Composer 自动关联”的闭环。

公开资料层面没有可直接复用的 `codex.app` 客户端源码；本提案基于截图行为、可观察交互和当前 mossx 代码核对结果抽象产品契约。保守实现应先做本地会话级 annotation draft，不直接扩展为远程 PR review comment 或持久化协作评论系统。

## 目标与边界

### 目标

- 在当前客户端所有代码阅读/编辑 surface 中提供统一行级标注入口，至少覆盖 embedded diff 视图、modal diff 弹窗、文件窗体 preview mode、文件窗体 edit mode。
- modal diff 覆盖范围 MUST 包含 Git History、push/sync/create PR preview、Checkpoint、Status Panel、Session Activity 等通过 `GitDiffViewer` / `WorkspaceEditableDiffReviewSurface` 渲染的弹窗或复合 diff surface。
- Markdown 文件的 preview mode 与 edit mode MUST 都提供标注入口；preview mode 标注 MUST 映射到源文件行号，而不是富文本 DOM 位置。
- Markdown preview MUST 保持正常 Markdown 渲染；标注入口只能作为 rendered block 的轻量 affordance 插入，不得把 preview 替换成源码行号表。
- 允许用户通过行号 gutter hover、代码选区 floating toolbar 或等价轻量入口，对单行或行范围输入标注语。
- 用户确认标注后，当前对话框 MUST 自动关联该文件、行号范围和标注语。
- 关联内容在 Composer 中必须可见、可删除，并在发送时进入最终 user message / context projection。
- 发送后的 user message MUST 将 annotation context 解析成独立可折叠的上下文块，避免 `@file ... 标注：...` 原始块污染普通用户正文阅读。
- 标注能力优先复用现有 active file reference、inline file reference、Context Ledger 和文件视图选区机制。
- 标注只作为本地 user-to-agent 上下文输入，不伪装成 GitHub / PR / 远端 review comment。
- 标注内容 MUST NOT 写回、插入、覆盖或污染原文件内容；它只能作为 Composer-local 逻辑关联存在。
- 标注输入框 MUST 是独立输入岛：输入期间不得被文件窗体快捷键、Composer 更新、Markdown preview 重渲染或 IME composition 中断影响。

### 边界

- Phase 1 只覆盖 workspace 内可读文本文件的文件窗体 preview mode、CodeMirror edit mode，以及 embedded/modal 两种 diff viewer 中可映射到新文件行号的 workspace diff。
- Phase 1 的 annotation draft 只需要存在于当前 Composer 会话内；切换 thread/workspace 后可清空。
- Phase 1 不要求跨重启持久化，也不要求多人协作同步。
- Phase 1 不修改 agent/backend 协议；发送时以明确文本块和现有 context ledger 可观测来源表达。
- Phase 1 的 transcript 展示只对本客户端 user message 做解析增强；不会改变实际发送给 agent 的文本 payload。
- Phase 1 不新增第三方编辑器依赖，优先基于现有 `@uiw/react-codemirror` / diff viewer 渲染链路扩展。
- Phase 1 不实现 Markdown rich preview 中任意像素区域到源行号的自由框选；preview 标注以 rendered Markdown block 的 source position 生成源文件行号范围。

## 非目标

- 不实现 GitHub PR review comment 发布、回复、resolve 或远程同步。
- 不实现代码行内长期评论数据库。
- 不重做文件编辑器、diff viewer 或 Composer 架构。
- 不把标注语自动改写为 `/review`、`apply_patch` 或任何隐式命令。
- 不改变历史 transcript 的存储格式；历史中的 annotation 仍以 `@file path#Lx-Ly + 标注：...` 文本块存在，UI 只做解析展示。
- 不支持二进制、图片、PDF、表格、Markdown rich preview 内的任意视觉区域批注。

## What Changes

- 新增 `File Line Annotation` 交互契约：用户可在 embedded diff、modal diff、文件窗体 preview mode、文件窗体 edit mode 中对有效行范围创建本地标注。
- Markdown preview 和 markdown edit 是文件窗体能力的强约束场景：两者都必须可创建标注，且标注结果只进入 Composer/context ledger，不改 markdown 文件正文。
- Markdown preview 标注入口包裹正常 rendered block，确认后的 marker 与 draft 渲染在目标 block 附近；父子 block 同时命中时只选择最具体 block，避免重复显示。
- 新增 annotation draft 到 Composer 的桥接：确认后自动插入/关联结构化引用，包含 `path`、`lineRange`、`body`。
- Composer 增加 annotation chip/card 展示，用户可在发送前查看、删除或继续编辑输入文本。
- 发送时将 annotation draft 转换为稳定文本上下文，例如：
  - `@file \`src/App.tsx#L12-L18\``
  - `标注：这里需要解释为什么状态会丢失`
- Context Ledger 将 annotation 作为 file reference 派生来源展示，且不得与普通 active file reference 混淆。
- Messages 渲染链路会从 user message 中解析 annotation block，把普通正文和代码标注上下文分离；代码标注上下文默认折叠，展开后展示文件名、行号范围和标注语。
- embedded diff、modal diff、文件窗体 preview mode、文件窗体 edit mode 新增统一轻量 affordance：基于选区 floating toolbar 或行 gutter action 打开本地标注输入框。
- `CodeAnnotationBridgeProps` 作为跨 surface 传递契约接入 Layout、GitDiffPanel、GitDiffViewer、WorkspaceEditableDiffReviewSurface、GitHistoryPanel、CheckpointPanel、StatusPanel 和 WorkspaceSessionActivityPanel。
- 首次可发现性与发送前反馈纳入产品契约：选中代码后必须有可发现入口，确认标注后 Composer 必须给出明确可见反馈。
- 最大化文件视图不再卸载 Composer；已确认标注必须继续出现在当前对话框并可发送。
- 没有 Composer bridge 的 diff/file surface 不得展示可提交但无效的标注入口。

## 现状代码核对

- `src/features/files/components/FileViewBody.tsx` 已在 CodeMirror `onUpdate` 中上报当前选区行范围，可作为文件编辑窗体行级标注的定位来源。
- `src/features/files/components/FileViewPanel.tsx` 已管理 active file line range、preview/edit mode、CodeMirror extension、git line marker 和插入文本 callback，是同一文件窗体 preview mode 与 edit mode 的集成入口。
- `src/features/files/components/FileMarkdownPreview.tsx` 现在基于 ReactMarkdown rendered node source position 生成 block-level source line range，并保持正常 Markdown 渲染。
- `src/features/files/components/FileViewBody.tsx` 的 inline annotation draft 已使用 textarea DOM value/ref 保存输入，composition 期间不驱动父级重渲染，并拦截输入区域事件冒泡。
- `src/features/files/components/FileViewPanel.tsx` 的 capture 快捷键已对 editable target 做避让，避免标注 textarea 聚焦时触发文件保存/查找。
- `src/features/layout/hooks/useLayoutNodes.tsx` 持有 layout-owned confirmed annotation state，并向 Composer、文件视图和 diff 视图同步下发，保证删除/发送/切换会话后的回显一致。
- `src/app-shell-parts/renderAppShell.tsx` / `src/app-shell-parts/useAppShellLayoutNodesSection.tsx` 已把 annotation bridge 传入 Git History。
- `src/features/git/components/GitDiffViewer.tsx` / `src/features/git/components/DiffBlock.tsx` 已支持 diff 行选择、行内 draft/marker、split mode 新文件侧渲染和 `embedded-diff-view` / `modal-diff-view` source 区分。
- `src/features/git/components/WorkspaceEditableDiffReviewSurface.tsx` 已把同一 bridge 同时传给可编辑 FileViewPanel 和只读 GitDiffViewer。
- `src/features/status-panel/components/CheckpointPanel.tsx`、`src/features/status-panel/components/StatusPanel.tsx`、`src/features/session-activity/components/WorkspaceSessionActivityPanel.tsx`、`src/features/git-history/components/git-history-panel/components/*` 已接入 modal diff annotation bridge。
- `src/features/messages/components/CollapsibleUserTextBlock.tsx` 和 `src/features/messages/components/MessagesRows.tsx` 已解析发送后的 annotation 文本块，并在 user bubble 外渲染可折叠的 code annotation context。
- `src/features/files/components/FileTreePanel.tsx` 已支持 preview selection，并能把 `path:Lx-Ly + code fence` 插入 Composer，说明“只读文件预览选区 -> Composer”链路已有可复用模式。
- `src/features/composer/components/Composer.tsx` 已支持 `activeFilePath + activeFileLineRange` 注入 `@file \`path#Lx-Ly\``，但当前模型没有 annotation body。
- `src/features/composer/utils/composerFileReferences.ts` 的 `InlineFileReferenceSelection` 当前只携带 `id / icon / label / path`，不能表达行号范围和标注语。
- `src/features/context-ledger/utils/contextLedgerProjection.ts` 已把 active/inline file reference 投影为 `file_reference` block，但当前只展示路径/行号，不展示用户标注语。
- `src/features/git/components/GitDiffViewer.tsx` 和 `src/features/git/components/DiffBlock` 是 workspace diff 标注的候选承载面；该能力 MUST 同时覆盖中间区域 embedded diff viewer 与独立/modal diff viewer，且需要保证 diff 行号能映射到新文件行号，避免对删除行制造不可执行引用。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 只把 `path#Lx-Ly` 和标注语拼成普通文本插入 textarea | 改动最小，几乎不动模型 | 用户发送前不可结构化管理；ledger 不可区分；后续很难做删除/编辑/去重 | 不采用 |
| B | 新增 Composer-local `CodeAnnotationSelection`，文件/diff 标注确认后作为结构化 selection 进入 Composer，发送时再序列化为文本上下文 | 复用现有 Composer/context ledger 架构；本地闭环清晰；不引入后端协议 | 需要扩展 Composer state、ChatInputBox 展示和 ledger projection | **采用** |
| C | 引入完整 review comment domain，支持持久化、线程、resolve、远端同步 | 长期协作能力完整 | 明显超出当前需求，会污染 Phase 1 范围并扩大回归面 | 本期不采用 |

## 实施切片

1. 先抽 `CodeAnnotationSelection` 类型、formatter、dedupe key 和 Composer-local state，不接任何 UI。
2. 接 `FileViewPanel` edit mode，利用现有 CodeMirror selection line range 打通最短闭环。
3. 接 `FileViewPanel` preview mode，复用同一 callback 和 Composer card。
4. 抽 shared diff-line mapping helper，再接 embedded diff viewer。
5. 复用 helper 接 modal / 独立 diff viewer，并验证 popover 挂载在 modal 内。
6. 最后补 Context Ledger projection、i18n、CI focused tests 和 Win/macOS 手测矩阵。

## Capabilities

### New Capabilities

- `file-line-annotation-composer-bridge`: 定义 embedded diff、modal diff、文件窗体 preview mode、文件窗体 edit mode 中的本地行级标注如何创建、预览、确认，并桥接到当前 Composer。

### Modified Capabilities

- `composer-active-file-reference`: 扩展 Composer 文件引用语义，使其能同时表达 path、line range 与 annotation body。
- `context-ledger-attribution`: 扩展 Context Ledger attribution，使用户标注的 file annotation 作为可见上下文来源被准确展示与去重。

## 验收标准

- 用户在文件窗体 preview mode 中选择单行或多行后，MUST 能创建一条本地标注，并看到目标文件与行号范围。
- 用户在文件窗体 edit mode 中选择单行或多行后，MUST 能创建一条本地标注，并且该标注 MUST 指向当前编辑文件的文件行号。
- 用户打开 Markdown 文件时，preview mode 与 edit mode MUST 都有可用标注入口；确认标注后，Markdown 原文件内容 MUST 保持不变，除非用户另行执行保存编辑内容。
- 标注确认、删除、发送和会话切换 MUST 只改变 Composer-local annotation state / send payload / Context Ledger projection，不得调用文件写入接口或修改 `content`。
- 用户在 embedded workspace diff 中对新增/修改后行创建标注时，MUST 生成指向新文件行号的引用；对无法映射的新文件行号的删除行，MUST 禁用或降级提示。
- 用户在 modal / 独立 diff viewer 中执行相同标注动作时，MUST 获得与 embedded diff viewer 等价的标注能力和 Composer 桥接结果。
- 用户在 Git History、push/sync/create PR preview、Checkpoint modal、Status Panel diff、Session Activity diff 中打开 modal diff 时，MUST 获得与 embedded diff 等价的标注能力和 Composer 桥接结果。
- 用户确认标注后，当前 Composer MUST 自动展示该 annotation，且包含文件路径、行号范围和标注语摘要。
- 用户确认标注后，当前代码/diff 视图 MUST 在被标注的行范围附近回显该标注，用户不需要只去 Composer 才能确认自己标了哪里。
- annotation draft 输入框 MUST 插入到目标行范围附近，而不是统一堆到文件窗体或 diff viewer 底部。
- Markdown preview mode MUST 提供可见源行号标注入口；不得只暴露脱离内容上下文的行号输入框，让用户在看不到行号时猜测。
- Markdown preview mode MUST NOT 破坏正常 Markdown 阅读体验；标注 UI 只能插入到目标 rendered block 附近。
- Markdown preview 中同一 annotation MUST 只渲染一次；当父 block 和子 block 都覆盖同一源行号范围时，系统 MUST 选择最具体的 block 渲染 draft/marker。
- annotation textarea MUST 在输入期间保持焦点、光标与已输入文本稳定；IME composition、连续英文输入、文件窗体保存/查找快捷键和 Composer card 更新 MUST NOT 造成粘连输入、重复输出或跳回行首。
- 用户确认标注后，Composer MUST 明确提示“将把 N 条代码标注发送给 AI”或等价反馈，避免用户误以为只是本地评论。
- 用户发送消息时，annotation MUST 被序列化进 user message，agent 能看到精确 `path#Lx-Ly` 和标注语。
- user message 渲染时，annotation block MUST 从普通正文中分离，并作为气泡外可折叠上下文展示；普通正文不应重复显示 annotation 原始文本块。
- 用户删除 annotation chip/card 后，发送内容与 Context Ledger MUST 不再包含该标注。
- 标注交互 MUST NOT 改变现有 active file reference 开关、inline file reference token 和普通发送行为。
- 标注入口 MUST 对小白可发现：选中代码后 SHOULD 显示 `标注给 AI` 或等价文案的 floating action，不得只依赖隐藏的 gutter hover。
- 切换 thread/workspace 后，未发送的本地 annotation draft MUST 不泄漏到其他会话。
- 最大化文件视图时，Composer MUST 仍保持 mounted，使标注确认后能被当前对话框引用。
- 没有 `onCreateCodeAnnotation` bridge 的 surface MUST 隐藏确认型标注入口，避免用户录入后无法进入 Composer。
- CI MUST 至少覆盖 `npm run typecheck` 与相关 focused Vitest suites；若实现触及 Tauri/Rust path normalization 或 file read/write contract，还 MUST 覆盖对应 Rust tests。
- Windows/macOS MUST 使用同一套 path normalization 与 line-range contract；Windows 路径分隔符、盘符大小写、macOS restored absolute path 不得导致 annotation 去重、打开或发送引用失效。

## Impact

- Frontend:
  - `src/features/files/components/FileViewBody.tsx`
  - `src/features/files/components/FileViewPanel.tsx`
  - `src/features/files/components/FileTreePanel.tsx`
  - `src/features/git/components/GitDiffViewer.tsx`
  - `src/features/git/components/DiffBlock.tsx`
  - `src/features/git/components/WorkspaceEditableDiffReviewSurface.tsx`
  - `src/features/git/components/GitDiffPanel.tsx`
  - `src/features/git-history/components/git-history-panel/components/*`
  - `src/features/status-panel/components/CheckpointPanel.tsx`
  - `src/features/status-panel/components/StatusPanel.tsx`
  - `src/features/session-activity/components/WorkspaceSessionActivityPanel.tsx`
  - `src/features/composer/components/Composer.tsx`
  - `src/features/composer/components/ChatInputBox/*`
  - `src/features/messages/components/CollapsibleUserTextBlock.tsx`
  - `src/features/messages/components/MessagesRows.tsx`
  - `src/features/composer/utils/composerFileReferences.ts`
  - `src/features/context-ledger/types.ts`
  - `src/features/context-ledger/utils/contextLedgerProjection.ts`
  - `src/features/layout/hooks/useLayoutNodes.tsx`
  - `src/app-shell-parts/renderAppShell.tsx`
  - `src/app-shell-parts/useAppShellLayoutNodesSection.tsx`
  - `src/i18n/locales/*`
- Styles:
  - `src/styles/diff-viewer.css`
  - `src/styles/file-view-panel.css`
  - `src/styles/composer.part2.css`
  - `src/styles/messages.part1.css`
  - `src/styles/main.css`
- Tests:
  - focused Vitest for Composer annotation state, file view line selection, diff line mapping, modal bridge wiring, message annotation parsing, context ledger projection
  - CI gate: typecheck + focused Vitest；涉及 Rust bridge 时追加 targeted cargo tests
- Dependencies:
  - 不引入新第三方依赖。
