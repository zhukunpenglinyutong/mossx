## Context

mossx 已具备三段关键能力，但它们还没有被拼成“行级标注 -> 当前对话框上下文”的闭环：

- 文件视图知道 active file 和 selection line range。
- Composer 能把 active file reference 注入为 `@file \`path#Lx-Ly\``。
- Context Ledger 能把 active/inline file references 投影为可见资源来源。

截图里的交互启发是：标注应发生在用户阅读代码的位置，但标注结果应立即回到当前对话输入区，成为下一轮 agent 的结构化上下文。设计上应避免把 Phase 1 做成完整 review/comment system；它首先是 composer context authoring affordance。

## Decision 1: 标注先建模为 Composer-local selection

采用新的前端局部模型：

```ts
type CodeAnnotationSelection = {
  id: string;
  path: string;
  lineRange: {
    startLine: number;
    endLine: number;
  };
  body: string;
  source: "file-preview-mode" | "file-edit-mode" | "embedded-diff-view" | "modal-diff-view";
};
```

Supporting pure helpers SHOULD be introduced before wiring UI:

```ts
type CodeAnnotationDraftInput = Omit<CodeAnnotationSelection, "id">;

function buildCodeAnnotationDedupeKey(selection: CodeAnnotationDraftInput): string;
function formatCodeAnnotationForPrompt(selection: CodeAnnotationSelection): string;
function normalizeCodeAnnotationTarget(input: CodeAnnotationDraftInput): CodeAnnotationDraftInput | null;
```

该状态由 Composer 所在 layout 层注入或回调更新，生命周期跟随当前 thread/workspace。发送后默认清空，与现有 selected inline file references 行为一致。

该模型是标注唯一写入目标。文件 preview/edit/diff surface MUST 只发出 `CodeAnnotationDraftInput`，不得把 annotation body 拼回源文件 `content`，也不得触发文件保存或后端 write command。Markdown 文件同样遵守该规则：preview mode 的标注是“源文件行号范围 + 标注语”的逻辑关联，不是对 Markdown 文档的 inline comment 写入。

### Rationale

- 与现有 `selectedInlineFileReferences` 心智一致。
- 不需要后端存储和迁移。
- 能在发送前展示、删除、去重和进入 Context Ledger。

## Decision 2: 每个 code surface 负责产生精确目标，Composer 负责上下文管理

embedded diff、modal diff、文件窗体 preview mode、文件窗体 edit mode 只负责收集：

- workspace-relative `path`
- 可发送的新文件行号范围
- 用户输入的 annotation body

Composer 负责：

- 展示 annotation card/chip
- 在 send path 中序列化 annotation
- 清空或保留状态
- 向 Context Ledger 提供 projection input

Layout/App shell 负责持有已确认 annotation 的 source-of-truth，并同时传给 Composer 与当前代码 surface。Composer 删除、发送后清空、thread/workspace 切换清空都 MUST 通过同一份状态反映到文件/diff 视图，避免代码行内回显和 Composer 上下文出现漂移。

### Rationale

标注产生面和发送面不要互相拥有对方状态。代码 surface 不应该直接拼接最终 prompt；Composer 也不应该重新推断 editor selection 或 diff 行号。

## Decision 2.0: 已确认标注状态上移到 layout，draft 留在 surface

当前实现采用两层状态：

- confirmed annotations: layout-owned `selectedCodeAnnotations`，传给 Composer、FileView、DiffView。
- active draft: surface-local `annotationDraft`，只表示当前正在编辑的一个输入框。

确认 draft 后，surface 调用 `onCreateCodeAnnotation`，layout 更新 confirmed annotations，surface 立即关闭当前 draft。Composer 删除、发送后清空、thread/workspace 切换清空都通过 layout-owned state 同步反映回 FileView/DiffView。

### Rationale

这能避免两个反模式：

- Composer 有标注卡片，但文件/diff 行内 marker 没同步消失。
- draft 输入框和 confirmed marker 同时渲染在同一位置，让用户误以为有两个对话框在抢输入。

## Decision 2.1: 标注入口矩阵

| Surface | 入口 | 行号来源 | Phase 1 行为 |
|---|---|---|---|
| 文件窗体 preview mode / read-only code preview | 选区 floating toolbar；可选行号 hover button | preview rendered line number | 同一 FileViewPanel 的 preview mode 必须允许单行/多行标注，确认后进入 Composer |
| Markdown 文件 preview mode / rendered Markdown preview | 正常 Markdown 渲染块 hover/focus 标注入口；draft/marker 插入渲染块附近 | rendered node source position 对应的 Markdown 源文件行号 | 必须保持正常 Markdown 阅读体验；源行号只作为逻辑关联数据，不得用源码行列表替代主预览 |
| 文件窗体 edit mode / CodeMirror editor | CodeMirror selection toolbar；可选 gutter hover button | editor document line number | 同一 FileViewPanel 的 edit mode 必须允许直接标注当前文件行，不保存文件也可创建上下文 |
| embedded workspace diff viewer | diff 行 hover/gutter button；可选选区 toolbar | 新文件行号 mapping | 中间区域 diff 必须支持标注，deleted-only 行禁用或提示 |
| modal / 独立 diff viewer | diff 行 hover/gutter button；可选选区 toolbar | 新文件行号 mapping | 弹窗 diff 必须与 embedded diff 等价产出 annotation，不得只读不可标注 |
| Git History / PR preview / push preview / sync preview diff modal | 复用 `GitDiffViewer` 的 diff 行入口 | 新文件行号 mapping | 通过 `CodeAnnotationBridgeProps` 从 AppShell/Layout 透传，source 标记为 `modal-diff-view` |
| Checkpoint / Status Panel / Session Activity diff modal | 复用 `WorkspaceEditableDiffReviewSurface` 内的 FileView 或 GitDiffViewer 入口 | FileView 行号或新文件 diff 行号 | 可编辑 diff 走 FileView bridge，只读 diff 走 GitDiffViewer bridge，均进入同一 Composer |

### Rationale

入口要贴近用户正在看的代码，而不是强迫用户切到 Git diff。所有入口必须共享同一个 output model，否则 Composer 和 Context Ledger 会被迫理解多套来源语义。

## Decision 2.3: Markdown preview 使用 rendered block affordance，不替换主渲染

Markdown preview 的主视图 MUST 继续是正常 Markdown 渲染。实现允许对具备可靠 source position 的 rendered block 做轻量 wrapper：

- wrapper 只提供 `标注给 AI` affordance、draft 插入位和 confirmed marker 插入位。
- source line range 来自 rendered node position，并叠加 frontmatter/body offset。
- 缺失可靠 source position 的 rendered node 不展示标注入口。
- 当父子 block 都覆盖同一 annotation range 时，draft/marker 只渲染在最具体的子 block 上。
- hover/focus affordance 不使用 opacity/transform transition；按钮显隐必须即时完成，避免 Markdown preview 打开后因首屏 paint、既有鼠标位置或 focus 恢复触发闪烁。

### Rationale

用户在 Markdown preview 里要读的是文档，不是源码行表。把 preview 降级成 source-line list 虽然方便做行号，但破坏阅读体验；正确做法是保持语义渲染，再在 block 附近做逻辑关联。

标注入口属于辅助 affordance，不是内容本身。它可以在 hover/focus 时出现，但不应通过动画参与布局或合成层变化；否则打开 Markdown 文档时，鼠标若已停留在预览区域，多个 block 的按钮透明度过渡会被用户感知为 preview 闪烁。

## Decision 2.4: Annotation draft textarea 是输入岛

文件/Markdown preview 的 React draft 和 CodeMirror widget draft 都必须满足输入岛契约：

- textarea value 在输入期间由 DOM/ref 持有，不把每个字符提升为 React source-of-truth。
- composition start/end 期间不得用父级 render 改写输入内容。
- draft root 阻断鼠标、点击、键盘事件冒泡，避免触发外层文件行选择、CodeMirror focus 或 Composer/global shortcut。
- FileView capture shortcuts 遇到 editable target 必须跳过，避免 Cmd/Ctrl+S、Cmd/Ctrl+F 在标注框聚焦时触发保存/查找。
- submit 时读取 textarea 当前 DOM value；空白 body 在确认 handler 中拦截。

### Rationale

标注框不是普通配置表单，而是嵌在高频渲染的文件/Markdown/diff surface 里。只要它把每个字符反向驱动父级 state，或不隔离 capture shortcut，就会出现粘连输入、光标跳回行首、确认按钮抢焦点等问题。

## Decision 2.5: `CodeAnnotationBridgeProps` 是跨 surface 的唯一桥接契约

所有能创建或回显 annotation 的宿主只接收同一组 props：

```ts
type CodeAnnotationBridgeProps = {
  onCreateCodeAnnotation?: (annotation: CodeAnnotationDraftInput) => void;
  onRemoveCodeAnnotation?: (annotationId: string) => void;
  codeAnnotations?: CodeAnnotationSelection[];
};
```

传播路径为：

- `useLayoutNodes` 持有 confirmed annotations，并生成 bridge props。
- AppShell 把 bridge 传给 GitHistoryPanel。
- StatusPanel / CheckpointPanel / WorkspaceSessionActivityPanel 把 bridge 继续传给 `WorkspaceEditableDiffReviewSurface`。
- `WorkspaceEditableDiffReviewSurface` 在 edit mode 传给 `FileViewPanel`，在 review mode 传给 `GitDiffViewer`。
- `GitDiffViewer` 传给每个 DiffCard/DiffBlock，并用 `codeAnnotationSurface` 区分 `embedded-diff-view` 与 `modal-diff-view`。

### Rationale

标注能力跨越多个 UI 宿主。如果每个宿主单独定义 callback，很容易出现某个弹窗能输入但无法关联 Composer 的断链。统一 bridge props 让缺失链路可以通过类型、测试和 grep 直接发现。

## Decision 2.2: 小白入口优先 selection toolbar，专业入口补 gutter

Phase 1 的主入口 SHOULD 是“选中代码后出现 `标注给 AI` floating action”。行号 gutter hover 可以作为专业用户的快速入口，但不得成为唯一入口。

Composer 中的 annotation 展示 SHOULD 使用 compact card/chip：

- `文件名 · Lx-Ly`
- 标注语摘要
- 删除按钮
- 发送前上下文提示，例如 `将发送 1 条代码标注给 AI`

### Rationale

标注不是普通代码评论，而是给 AI 的上下文。小白用户必须能理解“点了以后会进入当前对话”，否则会误判为本地评论或 PR comment。

## Decision 3: 发送序列化使用显式文本块，不改 agent 协议

Phase 1 发送时把 annotation 转换为明确、稳定、可读的文本块：

```text
@file `src/features/foo.ts#L12-L18`
标注：这里需要解释状态为什么会在重试后丢失
```

多条 annotation 按创建顺序附加到用户输入前或后，最终位置在实现阶段统一，但必须稳定可测试。

### Rationale

- 不要求 Codex/Claude/Gemini 后端新增结构化 payload。
- 用户和 agent 都能理解。
- 失败时可直接在 transcript 中审计。

## Decision 3.1: user message 中的 annotation block 解析为气泡外上下文

发送 payload 仍然包含可审计文本块：

```text
@file `src/main.ts#L10-L12`
标注：这里需要解释状态来源
```

但消息渲染层在 user message 中识别该模式，并执行展示分离：

- `CollapsibleUserTextBlock` 解析 annotation blocks，普通正文只展示用户原始问题。
- `UserCodeAnnotationContextBlock` 在 message bubble 外渲染代码标注上下文。
- 该 context block 默认折叠，只展示“代码标注 + N 条”；展开后显示文件名、行号范围、父路径和标注语。
- 解析展示不改变 transcript 存储，也不改变发送给 agent 的 payload。

### Rationale

agent 需要看到显式文本块，但用户不应该在自己的消息气泡里反复看到大段 `@file ... 标注：...` 原文。气泡外折叠上下文既保留审计性，又降低对话阅读噪音。

## Decision 4: embedded/modal diff 标注只允许映射到新文件行

Embedded diff 和 modal diff 标注必须遵守同一套可执行引用原则：

- added / modified / context 行可映射到新文件行号时允许标注。
- deleted-only 行没有新文件行号，Phase 1 禁用标注或提示“无法关联到当前文件行”。
- embedded diff viewer 和 modal diff viewer MUST 复用同一套 diff-line mapping helper，避免两个入口产生不同 line range。
- split diff mode 只在 new pane 渲染 annotation draft/marker；old pane 不渲染确认型 marker，避免旧文件侧重复或错位。
- 复合 diff surface 例如 GitHistory、Checkpoint、StatusPanel、SessionActivity 必须通过同一 `GitDiffViewer` / `WorkspaceEditableDiffReviewSurface` path 接入，而不是各自实现 line mapping。
- 如果某个 diff viewer 当前无法提供可靠 new-line mapping，该入口 MUST 显示受限提示，而不是生成 annotation。

### Rationale

`path#Lx-Ly` 必须可打开、可定位。对删除行制造虚假当前文件行号会污染 agent context。

## Decision 5: CI 与跨平台兼容性作为交付门禁

本能力触达 path、line range、selection UI、diff mapping 和 Composer send payload，不能只靠 macOS 手测。

CI / verification baseline：

- `npm run typecheck`
- focused Vitest:
  - Composer annotation state / send serialization
  - File preview annotation selection
  - File editor annotation selection
  - Embedded diff line mapping
  - Modal diff line mapping
  - Context Ledger annotation projection
- 若实现改到 Tauri/Rust path normalization、workspace path resolver 或 file contract，追加 targeted `cargo test --manifest-path src-tauri/Cargo.toml ...`

Windows/macOS compatibility baseline：

- path normalization MUST accept `/` and `\` separators.
- Windows drive-letter case MUST NOT break dedupe or open-file navigation.
- macOS restored absolute paths MUST normalize back to workspace-relative references when possible.
- UI positioning for floating toolbar / draft popover MUST remain inside the active window or modal viewport; modal diff 标注不得把 popover 错挂到背后的 main window。
- Keyboard focus / Esc cancel / Enter confirm 行为 MUST 在 macOS 和 Windows 保持一致，不依赖平台专属 modifier 作为唯一入口。
- Annotation draft input MUST be tested against IME composition and file-view capture shortcuts; this is part of the input responsiveness gate, not optional polish.

## Decision 6: bridge absence means no confirmable annotation UI

如果某个 FileView/DiffView surface 没有收到 `onCreateCodeAnnotation` bridge，它 MUST 隐藏确认型标注入口，或降级为不可提交状态。禁止显示可输入、可点击确认、但最终不会进入 Composer 的假入口。

### Rationale

标注的产品语义是“标注给 AI”。如果缺少 Composer bridge，录入后不进入当前对话框就是数据丢失，比没有入口更糟。

## Implementation Order

1. `CodeAnnotationSelection` types + pure helpers + unit tests.
2. Composer card/chip + send serialization tests.
3. FileView edit mode entry, because CodeMirror line selection is already available.
4. FileView preview mode entry.
5. Shared diff-line mapping helper + embedded diff entry.
6. Modal diff entry using the same mapping helper and modal-scoped popover.
7. Context Ledger projection + cross-platform verification.

This order keeps the first usable slice small: edit mode -> Composer -> send payload.

## Data Flow

1. 用户在 FileView preview mode / FileView edit mode / embedded DiffView / modal DiffView 选择目标行。
2. UI 展示本地 annotation draft 输入框。
3. 用户输入标注语并确认。
4. code surface 调用 `onCreateCodeAnnotation(selection)`。
5. Layout/App shell 将 selection 传给 Composer。
6. Composer 展示 annotation card/chip，并纳入 Context Ledger projection。
7. 用户发送后，Composer 将 annotation 序列化进最终 user message，并清空本地 selection。
8. Layout-owned annotation state 清空后，FileView/DiffView 的 confirmed marker 同步消失。
9. Messages render path 解析已发送 user message 中的 annotation blocks，并在 bubble 外展示折叠上下文。

## Error And Boundary Handling

- 空 body 不允许确认；只允许取消。
- `startLine/endLine` 必须是有限正整数，且 `startLine <= endLine`。
- path 必须是 workspace-relative 或可被现有 workspace path resolver 规范化。
- annotation confirmation MUST NOT call file write APIs and MUST NOT mutate the file `content` state; only explicit editor changes plus save action may write files.
- Markdown preview 标注 MUST preserve the normal rendered Markdown view. Annotation UI MAY wrap rendered blocks with lightweight affordances, but MUST NOT replace the preview with a source-line table/list.
- Markdown preview 标注 MUST use source line numbers derived from rendered node source positions when available. If a rendered node lacks a reliable source position, that node MUST omit the annotation affordance instead of guessing.
- Markdown preview nested block rendering MUST prefer the most specific block for draft/marker placement to prevent duplicate annotation cards.
- Annotation draft UI MUST render near the target line/range in the active surface. Confirmed annotations MUST render back into the active file/diff view using the same layout-owned annotation state that Composer sends.
- Annotation draft textarea MUST preserve value, focus and cursor across non-target rerenders, and MUST NOT let file-view capture shortcuts mutate file state while the textarea is focused.
- 同一 `path + lineRange + body` 重复创建应去重或合并展示。
- annotation body 应 trim；超长 body 在 Composer card 中截断展示，但发送 payload MUST 保留完整 body。
- Composer card 删除必须只删除 annotation，不得删除用户正文或其他 file references。
- 切换 workspace/thread 时必须清空未发送 annotation，避免跨上下文泄漏。
- user message annotation parser MUST only remove valid `@file path#Lx-Ly` + `标注：body` blocks from visible plain text. Normal prose that merely mentions `@file` or `标注` MUST remain in the user bubble.
- message annotation context block MUST be collapsed by default, and expansion MUST NOT alter the stored message text.

## Validation

- Composer 单测覆盖 annotation 增删、发送序列化、发送后清空。
- Pure helper 单测覆盖 dedupe key、prompt formatter、invalid target normalization。
- Context Ledger 单测覆盖 annotation block 展示、重复引用去重、与 active file reference 共存。
- FileViewPanel 单测覆盖 preview mode 与 edit mode 切换后标注入口仍可用。
- File preview mode 单测覆盖 read-only code preview 选区到 annotation draft 的传递。
- File edit mode 单测覆盖 CodeMirror 编辑态选区到 annotation draft 的传递。
- Markdown preview/edit 单测覆盖两种 mode 都能创建 annotation，并断言 annotation confirm 不调用 `writeWorkspaceFile` / `writeExternalSpecFile`。
- Markdown preview 单测覆盖正常渲染不被源码行列表替代、nested list draft/marker 只渲染一次、输入 composition 不粘连、文件保存/查找快捷键不劫持标注输入。
- Diff view 单测覆盖可映射行允许标注、deleted-only 行禁用。
- Embedded diff 和 modal diff 都必须有覆盖，不能只测中间区域 diff。
- GitHistoryPanel、CheckpointPanel、StatusPanel、WorkspaceSessionActivityPanel 必须有 focused tests 或 bridge-prop assertion，防止弹窗 diff 漏传 `onCreateCodeAnnotation` / `codeAnnotations`。
- Messages rich-content tests 必须覆盖 annotation block 从 user bubble 分离，并默认折叠展示。
- Desktop layout 单测覆盖 maximized editor mode 下 Composer 仍 mounted，确保标注可被当前对话框引用。
- CI 至少跑 typecheck 和 focused Vitest；跨平台风险点要进入手测矩阵。
- 回归现有 `Composer.file-reference-token`、`Composer.context-source-grouping` 和 file view tests。
