## Context

当前 Spec Hub 在行为上已经覆盖 OpenSpec 的主要 artifact 与执行链路，但阅读层还明显偏“实现优先”：

- artifact panel 以 tab + 原始 markdown 长文为主，缺少 requirement / scenario / capability 级导航。
- `SpecHubPresentationalImpl.tsx` 仍是一个超大单文件，视图状态、浮层、artifact 渲染与交互入口耦合严重，继续在这里硬塞 reader 能力只会增加回归风险。
- 仓库里已经存在成熟的 detached file explorer 模式：固定 `WebviewWindow` label、显式 session payload、clientStorage snapshot、router 分流、独立 window shell 和 surface 共存 contract。

这说明本次不适合走 backend 新 command 或“再开一个完整主窗体”的路径，而应该复用现有 detached-window 范式，把 Spec Hub 抽成一个 reader-first surface。

## Goals / Non-Goals

**Goals**

- 为 Spec artifact 提供结构化阅读导航，而不是继续依赖“切 tab + 长滚动”。
- 复用 detached window 模型，把当前 Spec Hub 上下文无损搬到独立窗口。
- 保证 embedded / detached 两个 surface 可以并存、聚焦、重定向，并使用同一套 spec root / artifact 解析 contract。
- 让 reader 相关状态有清晰的 surface 边界，避免主窗体和独立窗口相互污染。

**Non-Goals**

- 不把 detached Spec Hub 做成第二个完整 AppShell。
- 不在 detached surface 中新增 execution console、AI action 或重执行流；仅沿用现有 control center，并保持默认折叠。
- 不重定义 OpenSpec markdown 语法；仍基于现有 artifact 内容做结构化解析。

## Decisions

### Decision 1: Detached Spec Hub 复用 frontend `WebviewWindow` 模式，而不是 `open_new_window`

- 备选 A：调用 `open_new_window` 打开新的应用实例。
  - 问题：只能得到一个新的主应用窗口，没有显式 Spec Hub browsing context handoff，也没有固定单实例 label。
- 备选 B：复用 detached file explorer 的 `WebviewWindow + fixed label + session event + persisted snapshot` 模式。采用。

Rationale：

- 用户要的是“当前这个 Spec Hub 看着看着，直接弹出去继续看”，不是“再开一个应用，自己重新找一遍 Spec Hub”。
- `WebviewWindow` 允许直接定义 `spec-hub` 固定 label、reader-only route 与 cold-start restore 语义。

### Decision 2: Detached surface 维持 reader-first，但保留默认折叠的 control center 入口

- 备选 A：在独立窗口完整复刻三栏 Spec Hub，并默认展开 execution console。
  - 问题：范围膨胀，而且会继续挤压阅读区。
- 备选 B：独立窗口完全移除 execution console。
  - 问题：会丢掉老的执行台入口，用户仍然需要一个低干扰但可达的旧入口。
- 备选 C：独立窗口聚焦阅读流，保留现有 control center toggle 与右侧 pane，但默认折叠，不新增执行能力。采用。

Rationale：

- 这样能把复杂度压在“浏览上下文 + 渲染一致性”，而不是新增第二套执行流。
- 用户仍可在 detached window 中按需展开旧执行台，但默认视图保持 reader-first。
- 执行能力仍沿用现有 Spec Hub contract，避免为 detached surface 发明新行为。

### Decision 3: 引入 shared reader context，并按 `workspace + resolvedSpecRoot + surface` 隔离

定义一个 `SpecHubReaderContext`：

- `workspaceId`
- `resolvedSpecRoot`
- `surface: "embedded" | "detached"`
- `changeId`
- `artifactType`
- `specSourcePath`
- `headingAnchor`
- `updatedAt`

Rationale：

- embedded 和 detached 需要共享“怎么解读当前文档”的 contract，但不能共享“当前选中了哪个 change”这份瞬时状态。
- surface 维度必须进入 key，否则 detached 浏览一个 change 时会把主窗体的当前阅读位置顶掉。

### Decision 4: Artifact outline 由 shared parser 生成，识别 markdown heading 与 OpenSpec 语义块

outline model 由纯 helper 从当前 artifact 原文派生：

- proposal/design/tasks/verification：优先识别 `# / ## / ###` heading。
- specs：在 heading 基础上额外识别 `### Requirement:` 与 `#### Scenario:` 语义块，生成 requirement/scenario 级跳转节点。
- tasks：在 heading outline 之外，再根据当前 DOM 中的 checklist checked state 派生“哪些导航分组仍有未完成项”，供导航按钮显示提醒点。
- 多 source change：outline 仅绑定当前 active spec source，切 source 后重算。

Rationale：

- 这样 embedded 与 detached 都能共用一套导航结构，不需要双份解析逻辑。
- 解析基于原文即可，不要求修改 markdown renderer 协议。

### Decision 5: proposal → specs 的跳转只做“能力级定位”，不做任意全文智能链接

- 备选 A：对全文任何看起来像 capability/path 的文本做自动 link。
  - 问题：误判率高，成本大。
- 备选 B：只对 proposal `Capabilities` 区域和 spec source switcher 建立显式跳转。采用。

Rationale：

- 用户最常见的阅读路径就是“proposal 里提到了 capability，想看它对应 spec”。
- 先把高价值导航打通，避免为了智能 link 引入一套脆弱 parser。

### Decision 6: 视图实现上抽 shared viewer surface，限制 `SpecHubPresentationalImpl.tsx` 继续膨胀

建议抽出：

- `SpecHubArtifactReader`
- `SpecHubArtifactOutline`
- `SpecHubChangeBrowser`
- `DetachedSpecHubWindow`
- `specHubReaderContext.ts`
- `specHubArtifactOutline.ts`

Rationale：

- 当前 presentational 文件已经接近不可维护边界；本轮如果继续把 detached/window/outline 逻辑堆进去，后续回归测试和 large-file gate 都会更脆弱。
- shared reader surface 可以同时供 embedded 与 detached 使用，避免两套 UI 漂移。

### Decision 7: Reader layout 采用 surface-scoped 双侧 pane，并把布局偏好持久化

layout contract：

- 左侧：change browsing pane，可折叠、可拖拽调宽。
- 中间：artifact body，保持唯一主阅读面。
- 右侧：reader outline pane，默认折叠，按需展开。
- embedded / detached 各自持久化自己的 `changesCollapsed`、`changesWidth`、`outlineCollapsed`。

Rationale：

- 用户新增的核心诉求不是“多一个按钮”，而是降低阅读时的横向噪音，所以 outline 不应该默认常驻展开。
- change browsing 区在不同 surface 下占用宽度诉求不同，必须分 surface 存储，避免 detached 调宽后反向挤压主窗体。

### Decision 8: Detached Spec Hub shell 对齐 detached file explorer 的窗口壳层模式

实现要点：

- detached window 使用独立的 shell 容器，占满 `100vw x 100vh`。
- 顶部提供轻量 menubar / drag region，语义上对齐文件独立窗口。
- reader surface 与 unavailable state 都挂在该 shell 里，避免依赖 `min-height: 100vh` 之类的脆弱内层补丁。

Rationale：

- 当前 detached 布局问题的本质是尺寸链不闭合，以及旧样式把 reader header host 隐掉后造成控制区缺失。
- 先把壳层做成稳定的“专用 detached workbench”，再在内部复用 shared reader surface，风险最低。

### Decision 9: `Spec Hub` 的通用入口默认走 detached launcher，而不是主窗体 tab toggle

适用入口：

- sidebar / market rail / workspace home / main header 的 `Spec Hub` 按钮
- file tree root action 中的 `Spec Hub` 按钮

Rationale：

- 用户新的明确偏好是把 Spec Hub 当成独立阅读工作台，而不是聊天区里的一个临时 overlay layer。
- 把按钮语义统一成“open/focus detached reader”后，入口行为更稳定，也避免用户误以为按钮失效或还在旧的中间层工作流里。

### Decision 10: macOS drag region 做显式加固并补手动拖动兜底，Windows 继续依赖原生标题栏

兼容性判断：

- **macOS**：由于 detached window 使用 `titleBarStyle: overlay`，拖动能力依赖前端显式声明的 drag region；因此需要保证 menubar 与其文字区都可拖、不可误选、且不被正文覆盖。
- **macOS**：仅靠 `data-tauri-drag-region` 仍可能因为 overlay titlebar 与层级关系出现拖动不稳定，因此需要在 menubar 上补一层 `startDragging()` 手动兜底。
- **macOS**：手动 drag fallback 不能假设事件目标一定是 `HTMLElement`；当用户按在 menubar 标题文本上时，target 可能是 `Text node`，实现必须先判定 `Element` 再做 interactive guard，否则会出现“看起来按在标题栏上却拖不动”的假失效。
- **Windows**：当前未启用 overlay titlebar，系统原生标题栏仍可拖动；前端 menubar 主要承担视觉统一，不应通过过度 hack 破坏系统行为。

Rationale：

- 当前“拖不动”更像 drag handle 设计与窗口 permission 对齐不足，而不是窗口创建参数错误。
- 所以修复策略应聚焦在前端 drag region、`startDragging()` 兜底与 detached window capability 映射，而不是盲目改 `WebviewWindow` option。

### Decision 11: Detached Spec Hub 默认窗口高度对齐 detached file explorer 的紧凑基线

- 备选 A：继续使用更高的 reader window 默认高度。
  - 问题：在中等高度屏幕上会放大 menubar + header + 三栏布局的垂直占用，正文与侧栏节奏都显得偏松。
- 备选 B：回到与 detached file explorer 接近的默认高度基线。采用。

Rationale：

- detached Spec Hub 虽然是 reader-first surface，但它并不需要比 detached file explorer 更高的默认壳层才可用。
- 统一默认高度基线后，独立窗口家族在 macOS / Windows 上更容易形成一致预期，也更利于后续共享 window shell 调参经验。

## Data Flow

```text
Embedded Spec Hub
  -> openDetachedSpecHub(readerContext)
  -> write detached session snapshot
  -> create/focus WebviewWindow("spec-hub")
  -> emit reader session event

Detached Spec Hub Router
  -> read latest session snapshot
  -> subscribe detached session event
  -> restore reader context
  -> render shared SpecHub reader surface

Shared reader surface
  -> load current change/artifact via existing Spec Hub snapshot
  -> derive outline from artifact content
  -> restore surface-scoped layout preferences
  -> render change pane + markdown body + collapsible outline pane
```

## Risks / Trade-offs

- [Risk] detached surface 与 embedded surface 共用一部分 hook，容易无意带入 execution-state 依赖  
  → Mitigation：reader-only component 与 action/control-center 依赖彻底切开，避免 detached surface 引用执行相关 props。

- [Risk] outline anchor 与 markdown 实际 DOM heading 不一致，导致跳转漂移  
  → Mitigation：统一使用 shared anchor-id 生成策略，markdown renderer 与 outline helper 共用同一套 slug 规则。

- [Risk] 独立窗口 session snapshot 过旧，导致打开后落到不存在的 change/spec source  
  → Mitigation：restore 时做存在性校验；失败则回退到 recoverable unavailable state 或当前 scope 的首个合法 change。

- [Risk] 继续在超大 presentational 文件上增量修改导致 large-file gate / review 难度恶化  
  → Mitigation：本轮把新增 reader/detached 能力尽量外提成独立组件或 helper；必要时保持入口文件压缩形态，但逻辑不再集中堆积。

- [Risk] detached shell 与旧 `spec-hub.css` 的选择器冲突，导致 header action 或高度链再次失效  
  → Mitigation：把 detached 布局覆盖集中到独立 `spec-hub.reader-layout.css`，并明确覆盖旧的 hidden / min-height 规则。

## Validation Plan

1. reader helper 测试：
   - outline parser 对 heading / requirement / scenario 的抽取。
   - proposal capability 到 spec source 的匹配与跳转上下文。
2. UI 测试：
   - embedded reader 的 outline 可见性与 jump 行为。
   - outline 默认折叠、展开/收起行为，以及 detached surface 不重复渲染 detach action。
   - change pane 折叠与拖拽调宽。
   - 多 spec source 切换与 surface-scoped 恢复。
3. detached window 测试：
   - fixed label 复用。
   - snapshot restore + live retarget。
   - shell menubar 与 unavailable state 同时受控于 detached window layout contract。
   - router 在 `windowLabel === "spec-hub"` 时渲染 detached surface。
4. 质量门禁：
   - `pnpm vitest run src/features/spec/**`
   - `npm run typecheck`
   - `npm run check:large-files`
   - `openspec validate spec-hub-viewer-and-detached-window --strict`
