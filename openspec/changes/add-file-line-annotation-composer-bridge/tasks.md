## 1. Contract And State Model

- [x] 1.1 [P0][depends:none][I: 现有 Composer file reference/state model][O: `CodeAnnotationSelection` 类型与 state ownership 设计][V: TypeScript 类型不向 backend payload 泄漏] 定义 Composer-local annotation selection 模型。
- [x] 1.2 [P0][depends:1.1][I: annotation target contract][O: formatter/dedupe/normalization pure helpers][V: unit tests 覆盖 dedupe key、prompt formatter、invalid line range/path/body] 先抽纯函数，避免 UI 层重复拼 prompt。
- [x] 1.3 [P0][depends:1.2][I: layout -> Composer props][O: annotation create/delete callback contract][V: focused component tests 可注入 annotation] 打通 FileView preview mode/FileView edit mode/embedded DiffView/modal DiffView 到 Composer 的前端回调链。

## 2. Code Surface Annotation UI

- [x] 2.1 [P0][depends:1.3][I: FileViewBody CodeMirror editor selection][O: 文件窗体 edit mode 行级标注入口与本地输入框，覆盖 Markdown edit mode][V: Vitest 覆盖 edit mode 选区行号、确认、取消、空 body 禁用，且不写源文件] 先在同一文件窗体的 edit mode 中提供 annotation draft。
- [x] 2.2 [P0][depends:2.1][I: FileViewPanel preview mode + read-only preview selection][O: 文件窗体 preview mode 行级标注入口与本地输入框，覆盖 Markdown preview mode 源行号逻辑关联][V: Vitest 覆盖 preview mode/Markdown preview 行号、确认、取消、空 body 禁用，且不写源文件] 再在同一文件窗体的 preview mode 中提供 annotation draft。
- [x] 2.3 [P1][depends:2.1,2.2][I: DiffBlock line mapping + embedded GitDiffViewer][O: embedded diff 视图可映射新文件行的标注入口][V: added/context 行可标注，deleted-only 行禁用或显示降级提示] 为中间区域 workspace diff 增加安全标注入口。
- [x] 2.4 [P1][depends:2.3][I: modal/independent diff viewer + shared diff line mapping][O: modal diff 与 embedded diff 等价标注入口][V: modal diff 行标注产生同等 `CodeAnnotationSelection`，deleted-only 行同样禁用] 补齐独立弹窗 diff viewer 的标注入口。
- [x] 2.5 [P1][depends:2.2][I: annotation entry affordance][O: selection toolbar + gutter hover 双入口][V: 小白路径可通过选中代码看到 `标注给 AI`，专业路径可用 gutter hover] 补齐 discoverability，不让 gutter hover 成为唯一入口。

## 3. Composer Bridge

- [x] 3.1 [P0][depends:1.3][I: Composer selected context state][O: annotation chip/card 展示与删除能力][V: Vitest 覆盖展示 path、line range、body summary、删除、超长 body 截断展示] 在当前对话框中展示已关联标注。
- [x] 3.2 [P0][depends:3.1][I: Composer send path][O: annotation 序列化到最终 user message][V: Vitest 断言 `@file path#Lx-Ly` 与 `标注：...` 进入 send payload] 发送时注入结构化文本上下文。
- [x] 3.3 [P0][depends:3.2][I: thread/workspace change lifecycle][O: annotation 生命周期清理][V: 切换 thread/workspace 后 draft 不泄漏] 对齐会话切换和发送后清空语义。
- [x] 3.4 [P1][depends:3.1][I: Composer context feedback][O: 发送前可见反馈][V: Composer 显示“将发送 N 条代码标注给 AI”或等价提示，删除后数量同步] 补齐小白反馈闭环。

## 4. Context Ledger And Regression

- [x] 4.1 [P1][depends:3.1][I: context ledger projection][O: annotation file reference block][V: 单测覆盖 annotation 与 active/inline file reference 的去重和展示] 让 Context Ledger 准确展示 annotation 来源。
- [x] 4.2 [P0][depends:4.1][I: touched frontend modules][O: CI 回归验证结果][V: `npm run typecheck`、focused Vitest suites 通过；若触及 Rust/path resolver，则 targeted cargo tests 通过] 跑类型、目标测试与必要 Rust 门禁。
- [ ] 4.3 [P1][depends:4.2][I: Windows/macOS 手动验证矩阵][O: cross-platform manual evidence][V: Windows 路径分隔符/盘符、macOS workspace path、modal popover 定位、键盘确认/取消均符合预期] 完成跨平台兼容性验证。
- [ ] 4.4 [P1][depends:4.3][I: 手动验证矩阵][O: manual evidence][V: 文件窗体 preview mode 标注、文件窗体 edit mode 标注、embedded diff 标注、modal diff 标注、删除标注、发送 payload、切换会话均符合验收标准] 完成最小产品手测矩阵。

## 5. Inline Annotation Experience Calibration

- [x] 5.1 [P0][depends:3.1][I: Composer-local annotation state][O: layout-owned confirmed annotation state][V: Composer 删除/发送/会话切换后 FileView/Diff 回显同步消失] 上移已确认 annotation 的 source-of-truth，避免视图回显漂移。
- [x] 5.2 [P0][depends:5.1][I: FileView preview/edit render path][O: 行内 draft 与 confirmed marker][V: Vitest 覆盖 draft 不在底部、确认后对应行回显、删除后消失] 文件窗体中把标注输入框和回显插入目标行附近。
- [x] 5.3 [P0][depends:5.2][I: Markdown preview mode][O: 正常 Markdown 渲染中的 block 标注入口][V: Vitest 覆盖用户能从 rendered block 创建源行号标注且不写源文件] 重构 Markdown preview 标注入口，不再让用户看不到行号时猜测。
- [x] 5.4 [P1][depends:5.1][I: embedded/modal diff render path][O: diff 行内 draft 与 confirmed marker][V: Diff focused tests 覆盖 embedded/modal 共用行内插入语义] Diff viewer 中把标注输入框和回显插入目标 diff 行附近。
- [x] 5.5 [P0][depends:5.1,5.2,5.3,5.4][I: changed frontend modules][O: regression evidence][V: typecheck、focused Vitest、lint、large-file gate] 跑本轮优化门禁。

## 6. Modal Diff Bridge Regression Fix

- [x] 6.1 [P0][depends:5.4][I: all modal/independent diff viewer call sites][O: annotation bridge props reach GitDiffPanel preview modal、checkpoint modal、activity modal、GitHistory modals][V: focused Vitest asserts modal review surfaces receive `onCreateCodeAnnotation`、`codeAnnotations`、`modal-diff-view`] 修复多个弹窗 diff 录入后无法关联当前 Composer 的断链。
- [x] 6.2 [P0][depends:6.1][I: GitDiffViewer without annotation bridge][O: no false-positive annotation entry when callback is absent][V: Diff/Git focused tests prevent silent draft submit without Composer bridge] 没有 Composer bridge 的 diff surface 不再显示可提交但无效的标注入口。
- [x] 6.3 [P1][depends:6.1][I: split diff render mode][O: inline annotation draft/marker only renders in unified/new pane][V: DiffBlock split-mode test covers one marker in new pane] 修复 split diff 在旧文件栏重复或错位回显的风险。

## 7. Markdown Preview Rendering Regression Fix

- [x] 7.1 [P0][depends:5.3][I: FileMarkdownPreview normal render path][O: annotation affordance wraps rendered Markdown blocks instead of replacing preview with source-line list][V: FileViewPanel focused test asserts `file-markdown-preview` remains normal rendered Markdown and source-line list is absent] 修复 Markdown preview 标注破坏正常渲染的问题。
- [x] 7.2 [P0][depends:7.1][I: ReactMarkdown node source positions][O: rendered block click maps to Markdown source line range][V: focused test asserts annotation payload uses block source line range and no file write APIs are called] 用渲染块 source position 做逻辑关联，不把行号作为主 UI。
- [x] 7.3 [P0][depends:7.1][I: Markdown preview annotation draft input][O: textarea typing stays local until submit][V: focused test asserts incremental typing remains exact and submit payload uses final local body] 修复 Markdown preview 标注输入时由整棵 preview 重渲染导致的粘连/重复输入风险。
- [x] 7.4 [P0][depends:7.3][I: File edit CodeMirror annotation widget][O: widget textarea stores local DOM value and submit passes final body without rebuilding widget on each keystroke][V: typecheck + focused FileViewPanel regression; manual review confirms click propagation is stopped on draft root/actions] 修复编辑态标注输入粘连和确认按钮点击被 CodeMirror 抢焦点/吞事件的风险。

## 8. Maximized File View And Draft Focus Regression Fix

- [x] 8.1 [P0][depends:3.1][I: DesktopLayout editor maximized mode][O: maximized editor keeps Composer mounted so layout-owned annotations remain visible/sendable][V: DesktopLayout focused test asserts composer remains mounted with `is-editor-file-maximized`] 修复最大化文件视图标注后无法被当前对话框引用的问题。
- [x] 8.2 [P0][depends:7.3,7.4][I: FileView inline annotation draft inputs][O: draft textarea uses local DOM value during typing and focuses only once per target line range][V: FileViewPanel focused test asserts rerender keeps value, focus, and cursor position] 修复标注输入框无故刷新焦点到行首的问题。

## 9. Markdown Preview Duplicate And Sticky Input Regression Fix

- [x] 9.1 [P0][depends:7.1][I: Markdown preview nested rendered blocks][O: draft/marker only renders on the most specific matching block][V: FileViewPanel focused tests cover list block draft and marker render exactly once] 修复 Markdown preview 中父子 block 同时命中导致标注重复渲染的问题。
- [x] 9.2 [P0][depends:7.3][I: Markdown preview annotation draft input][O: input updates only local state + parent ref, never rewrites annotation draft state per keystroke][V: focused test covers repeated incremental typing exact value and submit body] 修复输入几个字出现一串粘连输出的问题。

## 10. Annotation Input Isolation Regression Fix

- [x] 10.1 [P0][depends:9.2][I: Markdown preview annotation textarea + FileView capture shortcuts][O: annotation draft behaves as an isolated input island with composition-safe DOM value and no file shortcut interception][V: focused test covers IME composition, exact body, no save/find shortcut side effect, and draft closes after submit] 修复标注输入框与文件窗体/Composer 更新链路互相干扰导致的粘连输入问题。

## 11. Multi-host Bridge And Message Rendering Spec Backfill

- [x] 11.1 [P0][depends:6.1][I: GitHistory/Checkpoint/StatusPanel/SessionActivity diff hosts][O: proposal/design/spec document all modal diff bridge propagation paths and `CodeAnnotationBridgeProps` as the shared contract][V: OpenSpec strict validation] 回写多个 diff 弹窗宿主的 Composer bridge 设计。
- [x] 11.2 [P1][depends:3.2][I: sent user message annotation blocks][O: proposal/design/spec document message parser splits annotation context outside the user bubble and renders it collapsed by default][V: OpenSpec strict validation] 回写发送后标注上下文的消息展示设计。
