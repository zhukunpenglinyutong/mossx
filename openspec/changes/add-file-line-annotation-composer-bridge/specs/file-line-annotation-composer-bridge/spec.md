## ADDED Requirements

### Requirement: Code viewing and editing surfaces MUST create local line annotations for Composer

系统 MUST 允许用户在打开的 workspace 代码查看与编辑 surface 中为单行或行范围创建本地标注，并将标注桥接到当前 Composer。

#### Scenario: user annotates a selected file preview mode line range

- **WHEN** 用户在文件窗体 preview mode 中选择单行或多行并确认标注
- **THEN** 系统 MUST 生成包含 `path`、`startLine`、`endLine` 与 `body` 的本地 annotation selection
- **AND** 该 selection MUST 关联到当前 thread/workspace 的 Composer

#### Scenario: user annotates a selected file edit mode line range

- **WHEN** 用户在文件窗体 edit mode 中选择单行或多行并确认标注
- **THEN** 系统 MUST 生成指向当前编辑文件行号范围的 annotation selection
- **AND** 该 selection MUST NOT 要求用户先保存文件修改

#### Scenario: markdown preview mode can create source-line annotations

- **WHEN** 用户在 Markdown 文件 preview mode 中创建标注
- **THEN** 系统 MUST 提供指向 Markdown 源文件行号范围的 annotation selection
- **AND** 系统 MUST 保持正常 Markdown 渲染作为主预览，不得用源码行列表替代渲染结果
- **AND** 系统 MUST 通过 rendered Markdown block 的 source position 或等价可靠映射生成源行号
- **AND** 当某个渲染块无法可靠映射源行号时，系统 MUST 对该块省略标注入口而不是猜测行号
- **AND** 系统 MUST NOT 将标注语写入 Markdown 原文

#### Scenario: markdown preview nested blocks render annotation once

- **WHEN** Markdown preview 中父 block 与子 block 都覆盖同一 annotation line range
- **THEN** 系统 MUST 只在最具体的匹配 block 附近渲染 draft 或 confirmed marker
- **AND** 系统 MUST NOT 为同一 annotation 在父子 block 上重复渲染多个输入框或多个 marker

#### Scenario: annotation draft is inserted near the target lines

- **WHEN** 用户在文件预览、文件编辑、embedded diff 或 modal diff 中打开 annotation draft
- **THEN** 标注输入 UI MUST 插入到目标行范围附近
- **AND** 系统 MUST NOT 将 draft 统一渲染到当前文件窗体或 diff viewer 底部

#### Scenario: confirmed annotation is visible in the source surface

- **WHEN** 用户确认一条文件或 diff 标注
- **THEN** 当前文件或 diff surface MUST 在对应行范围附近展示该标注摘要
- **AND** 当用户在 Composer 删除该标注或发送后清空上下文时，该 surface 回显 MUST 同步消失
- **AND** 当前 draft 输入框 MUST 关闭，避免 draft 与 confirmed marker 同时占用同一个标注位置

#### Scenario: markdown edit mode can create editor-line annotations

- **WHEN** 用户在 Markdown 文件 edit mode 中选择行范围并确认标注
- **THEN** 系统 MUST 生成指向当前 Markdown 编辑器行号范围的 annotation selection
- **AND** 该 selection MUST NOT 要求用户保存 Markdown 文件

#### Scenario: annotation body is logical context only

- **WHEN** 用户确认、删除或发送任意文件标注
- **THEN** 系统 MUST 只更新 Composer-local annotation state、send payload 或 Context Ledger projection
- **AND** 系统 MUST NOT 修改源文件 content
- **AND** 系统 MUST NOT 调用 workspace/external spec file write API，除非用户另行执行显式保存编辑内容

#### Scenario: annotation draft input is isolated from outer shortcuts and rerenders

- **WHEN** 用户正在 annotation draft textarea 中输入、连续输入英文或使用 IME composition
- **THEN** textarea MUST 保持用户输入的精确内容
- **AND** textarea MUST 保持焦点和光标位置，除非用户主动移动光标或提交/取消 draft
- **AND** 外层 FileView capture shortcuts、Composer context card 更新、Markdown preview rerender MUST NOT 重写 textarea value
- **AND** 当 textarea 聚焦时，文件保存/查找类快捷键 MUST NOT 触发文件保存、mode 切换或查找面板打开

#### Scenario: file mode switch preserves annotation availability

- **WHEN** 用户在同一文件窗体中从 preview mode 切换到 edit mode 或从 edit mode 切换回 preview mode
- **THEN** 当前 mode 的标注入口 MUST 继续可用
- **AND** 系统 MUST NOT 因 mode 切换丢失已确认并进入 Composer 的 annotation

#### Scenario: annotation entry is available from the active code surface

- **WHEN** 用户正在 embedded diff、modal diff、文件窗体 preview mode 或文件窗体 edit mode 中查看代码
- **THEN** 系统 MUST 提供与当前 surface 相匹配的轻量标注入口
- **AND** 不同 surface 产出的 annotation MUST 使用同一 selection model

#### Scenario: missing composer bridge hides confirmable annotation entry

- **WHEN** 当前 file 或 diff surface 没有接收到 `onCreateCodeAnnotation` bridge
- **THEN** 系统 MUST NOT 展示可确认提交的标注入口
- **AND** 系统 MUST NOT 允许用户录入标注后静默丢失到 Composer 之外

#### Scenario: selected code reveals a beginner-friendly annotation action

- **WHEN** 用户在支持的代码 surface 中选择一段代码
- **THEN** 系统 SHOULD 显示 `标注给 AI` 或等价文案的 floating action
- **AND** 系统 MUST NOT 只依赖隐藏的 gutter hover 入口

#### Scenario: empty annotation body cannot be confirmed

- **WHEN** 标注输入框为空或只包含空白字符
- **THEN** 系统 MUST 禁止确认
- **AND** 用户 MUST 能取消该 draft 而不改变 Composer 内容

#### Scenario: maximized file view keeps composer annotation bridge alive

- **WHEN** 用户在最大化文件视图中确认 annotation
- **THEN** Composer MUST 仍保持 mounted 并接收该 annotation
- **AND** 当前对话框 MUST 展示该 annotation 并允许发送或删除

### Requirement: Embedded and modal diff annotations MUST reference valid current-file lines

系统 MUST 只允许 embedded 与 modal workspace diff 中能映射到当前文件新行号的行创建标注，避免生成不可打开或误导 agent 的文件引用。

#### Scenario: embedded diff added or context lines can be annotated

- **WHEN** 用户在 embedded workspace diff 中对可映射到新文件行号的 added、modified 或 context 行创建标注
- **THEN** annotation selection MUST 使用当前文件路径和新文件行号范围

#### Scenario: modal diff added or context lines can be annotated

- **WHEN** 用户在 modal 或独立 diff viewer 中对可映射到新文件行号的 added、modified 或 context 行创建标注
- **THEN** annotation selection MUST 使用当前文件路径和新文件行号范围
- **AND** 该 selection MUST 与 embedded diff viewer 产出的 selection 结构等价

#### Scenario: all diff modal hosts receive the composer annotation bridge

- **WHEN** 用户在 Git History、push preview、sync preview、create PR preview、Checkpoint、Status Panel 或 Session Activity 中打开 diff modal
- **THEN** modal diff viewer MUST receive `onCreateCodeAnnotation`、`onRemoveCodeAnnotation` and `codeAnnotations`
- **AND** annotation source MUST be `modal-diff-view`
- **AND** 确认后的 annotation MUST 出现在当前 Composer 中

#### Scenario: editable diff review surface preserves annotation bridge in both modes

- **WHEN** `WorkspaceEditableDiffReviewSurface` 在 editable FileView mode 与 readonly diff review mode 之间切换
- **THEN** FileView mode MUST pass the annotation bridge to `FileViewPanel`
- **AND** diff review mode MUST pass the same annotation bridge to `GitDiffViewer`
- **AND** mode switch MUST NOT lose confirmed annotations already held by layout

#### Scenario: deleted-only diff lines are not mapped to fake current lines

- **WHEN** 用户尝试对 deleted-only 行创建标注
- **THEN** 系统 MUST 禁用确认或显示无法关联到当前文件行的降级提示
- **AND** 系统 MUST NOT 生成虚假的 `path#Lx-Ly` 引用

#### Scenario: split diff renders annotations only on the new side

- **WHEN** diff viewer 处于 split mode
- **THEN** annotation draft and confirmed marker MUST render only in the new-file pane
- **AND** old-file pane MUST NOT render duplicate annotation UI for the same annotation

#### Scenario: diff annotation popover stays scoped to the active viewer

- **WHEN** 用户在 modal diff viewer 中打开 annotation draft
- **THEN** 标注输入 UI MUST 保持在当前 modal viewport 内
- **AND** 系统 MUST NOT 将 popover 挂载到被遮挡的 main window surface

### Requirement: Composer MUST expose pending annotations before send

当前 Composer MUST 展示待发送的 annotation selection，使用户能在发送前理解和调整将被提交给 agent 的上下文。

#### Scenario: annotation appears in current composer

- **WHEN** 文件或 diff 标注确认完成
- **THEN** 当前 Composer MUST 展示该标注的文件路径、行号范围和标注语摘要
- **AND** 用户 MUST 能删除该标注

#### Scenario: composer explains pending annotation context before send

- **WHEN** 当前 Composer 存在一条或多条 annotation
- **THEN** Composer MUST 显示将发送代码标注给 AI 的可见反馈
- **AND** 删除 annotation 后反馈数量 MUST 同步更新

#### Scenario: long annotation body is readable without losing send content

- **WHEN** annotation body 超过 Composer card 的展示预算
- **THEN** Composer MAY 截断摘要展示
- **AND** send payload MUST 保留完整 annotation body

#### Scenario: deleted annotation is excluded from send

- **WHEN** 用户在 Composer 中删除某条 annotation
- **THEN** 下一次发送 MUST NOT 包含该 annotation 的文件引用或标注语

### Requirement: Sending MUST serialize annotations into agent-visible context

系统 MUST 在发送消息时把待发送 annotation 转换成 agent 可见的稳定文本上下文。

#### Scenario: annotation is included in send payload

- **WHEN** 当前 Composer 存在一条 annotation selection
- **AND** 用户发送消息
- **THEN** send payload MUST 包含精确的 `@file` path line reference
- **AND** send payload MUST 包含用户输入的标注语

#### Scenario: sent annotation is rendered as collapsed user context

- **WHEN** 已发送 user message 包含 `@file \`path#Lx-Ly\`` followed by `标注：body`
- **THEN** message render path MUST parse that block as code annotation context
- **AND** user message bubble MUST show the remaining plain text without duplicating the raw annotation block
- **AND** code annotation context MUST render outside the user bubble and be collapsed by default
- **AND** expanding the context MUST show file display name、line range and annotation body

#### Scenario: annotation parser preserves normal user prose

- **WHEN** user message contains prose that mentions `@file` or `标注` but does not match a valid annotation block
- **THEN** message render path MUST keep that text in the normal user bubble
- **AND** system MUST NOT create a fake code annotation context block

#### Scenario: annotation lifecycle is scoped to current thread and workspace

- **WHEN** 用户切换 thread 或 workspace
- **THEN** 未发送的 annotation draft MUST 从 Composer 清空
- **AND** 该 annotation MUST NOT 泄漏到新的会话上下文

### Requirement: Annotation delivery MUST pass CI and cross-platform compatibility gates

系统 MUST 在交付 annotation 能力时通过前端 CI 门禁，并保持 Windows/macOS path、line range 与弹窗定位语义一致。

#### Scenario: frontend CI covers annotation behavior

- **WHEN** annotation 能力进入实现验证
- **THEN** CI MUST run `npm run typecheck`
- **AND** CI MUST run focused Vitest suites covering Composer serialization、file preview annotation、file editor annotation、embedded diff annotation、modal diff annotation、Context Ledger projection

#### Scenario: platform path normalization remains stable

- **WHEN** annotation target path uses Windows separators, Windows drive-letter case variants, or macOS restored absolute paths
- **THEN** 系统 MUST normalize the target into a stable workspace-relative reference when possible
- **AND** dedupe、open-file navigation 与 send payload MUST remain consistent across Windows and macOS

#### Scenario: Rust gate runs when backend path contracts change

- **WHEN** 实现修改 Tauri/Rust path normalization、workspace resolver 或 file read/write contract
- **THEN** verification MUST include targeted `cargo test --manifest-path src-tauri/Cargo.toml`
