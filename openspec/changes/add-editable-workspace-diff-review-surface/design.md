## Context

当前仓库已经有两条成熟但分离的能力链路：

- `GitDiffViewer`
  - 负责 patch 审查、split/unified 切换、全文 diff、anchor 导航
  - 已被主 Git 面板、底部 `结果 / Checkpoint`、右侧 `workspace session activity`、Git History 等多个 surface 复用
- `FileViewPanel`
  - 负责 workspace 文本文件读取、编辑、保存、dirty-state、changed-line markers、外部变更感知
  - 已在 editor/file surface 中稳定运行

所以这次需求的根问题不是“没有编辑器”，而是“diff review shell 和编辑器还没接起来”。如果直接把 `GitDiffViewer` 改成完整 merge editor，会复制现有 editor/saving/runtime contract；如果只新增 `Open in editor` 按钮，又不能满足“在 diff 区域顺手改”的真实诉求。

同时还要处理一个产品边界：并不是所有 diff 都可写。当前应用里既有 workspace working tree diff，也有 commit history / PR compare / rewind review 这类历史基线 diff。只有前者才安全映射到当前真实文件并允许直接保存。

## Goals / Non-Goals

**Goals:**

- 抽一个共享的 workspace editable diff review shell，让 workspace-backed review surfaces 在同一容器内完成 `review -> edit -> save -> refresh`。
- 让主 Git 面板、`结果 / Checkpoint`、右侧 activity panel 三个入口复用同一套 editable contract。
- 复用 `FileViewPanel` 的保存、dirty-state、line markers 与 text-file capability，而不是平行造一套 editor state machine。
- 在保存后刷新 live workspace diff，而不是继续显示进入弹层那一刻的历史 patch snapshot。
- 明确 editable eligibility，避免历史 diff、只读文件、外部路径被误开放。

**Non-Goals:**

- 不重做 `GitDiffViewer` 底层 patch renderer。
- 不实现 3-way merge、chunk apply/reject、left/right 双向可编辑 compare。
- 不让 commit history、PR compare、rewind review、external absolute file review 在第一阶段变成可写。
- 不改变现有 file/editor 主 surface 的保存协议或 external change contract。

## Decisions

### Decision 1：新增共享 review shell，而不是直接把 `GitDiffViewer` 变成“大一统编辑器”

**方案 A：继续让各入口自己拼 modal**

- 优点：局部改动快。
- 缺点：Git / Checkpoint / Activity 会各自复制一套 editor wiring、save refresh 和 eligibility 逻辑，后续必漂移。

**方案 B：抽 `WorkspaceEditableDiffReviewSurface` 共享壳**

- 优点：diff shell、file rail、editable eligibility、dirty guard、save refresh 可以统一；三个入口只负责把当前文件与上下文喂进来。
- 缺点：需要一次性梳理几条入口的参数契约。

**采用方案 B。**

共享壳职责：

- 输入：
  - `workspaceId`
  - `workspacePath`
  - 当前 review file 列表
  - 初始选中文件
  - diff shell variant（embedded / modal）
  - 外层 close / maximize hooks
- 输出：
  - 当前选中文件切换
  - 保存成功后的 refresh callback
  - dirty close guard

### Decision 2：编辑底座复用 `FileViewPanel`，review 底座继续复用 `GitDiffViewer`

**方案 A：在 `GitDiffViewer` 内直接嵌 CodeMirror 并接保存**

- 优点：视觉更接近 IntelliJ 的“直接在右侧 diff pane 修改”。
- 缺点：会复制 `FileViewPanel` 的读取/保存/dirty/external sync/shortcut 逻辑；第一阶段回归面太大。

**方案 B：review shell 内在 `diff` 与 `edit` 两种 mode 间切换**

- 优点：复用现有两条稳定能力；实现成本可控；对现有测试资产友好。
- 缺点：第一阶段不是 1:1 左右双栏可编辑 compare，而是“同壳切换式编辑”。

**采用方案 B。**

review shell 的 mode 语义：

- `diff`
  - 展示 `GitDiffViewer`
  - 保留 split/unified、全文/局部、anchor、file rail
- `edit`
  - 展示 `FileViewPanel`
  - 默认打开当前选中文件
  - 继续显示同一文件 rail，保证 review context 不丢

### Decision 3：只允许 workspace-backed live diff 进入 editable mode

**方案 A：所有 `GitDiffViewer` 都显示 Edit**

- 优点：入口最统一。
- 缺点：commit history / PR / rewind review 没有稳定的“当前文件真身”语义，保存会产生误导。

**方案 B：引入显式 eligibility**

- 条件：
  - 有 `workspaceId`
  - review file 可解析到当前 workspace 相对路径
  - 文件不是 deleted
  - 文件 render profile 支持 edit
  - 当前 surface 属于 live workspace review，而非历史 compare

- 优点：真实、可控，不会把只读历史面伪装成可写。
- 缺点：第一阶段覆盖面更窄。

**采用方案 B。**

### Decision 4：保存后必须刷新 live diff，不继续依赖初始 snapshot

如果用户在 Checkpoint / Activity review modal 中保存文件，而弹层继续展示进入时那份 diff，这个能力就是假的。

因此共享壳在 `edit -> save success` 后必须：

1. 调用外部 `onRefreshReviewState`
2. 对 workspace-backed surface 重新取 live diff
3. 重新计算当前文件 additions/deletions
4. 更新 changed-line markers
5. 如果 diff 为空，展示“已无差异”空态，而不是旧 patch

主 Git 面板天然有 `useGitStatus` + `useGitDiffs`，可直接复用 refresh。  
Checkpoint / Activity 则不能只用静态 tool snapshot，需要在 review shell 内按当前选中文件调用 live workspace diff，并用 live diff 覆盖该文件的展示内容。

### Decision 5：主 Git 面板的 editable 入口绑定“明确文件”，不绑定漂浮 sticky file

主 Git 面板默认可能处于多文件聚合视图。这里如果把 `Edit` 绑定到 sticky header 当前推导文件，会造成语义漂移。

因此第一阶段规则是：

- inline preview / modal preview 已经绑定了具体 file row
- editable review 只从这些明确 file-scoped 入口进入
- 多文件 aggregate viewer 顶部不额外提供一个模糊的全局 `Edit` 按钮

这也更接近 IntelliJ 的使用节奏：先选中某个文件，再进入针对该文件的细看和修改。

## Risks / Trade-offs

- [Risk] `FileViewPanel` 被嵌入 review modal 后，需要额外参数（open app targets、shortcuts、maximize hooks），增加接线复杂度  
  → Mitigation：在共享壳内提供稳定默认值，尽量复用 `useLayoutNodes` 已有 editor wiring。

- [Risk] Checkpoint / Activity 当前依赖历史 snapshot，保存后如果不刷新 live diff，会出现“文件已改但 patch 不变”的假象  
  → Mitigation：共享壳接入 live diff refresh；静态 snapshot 只作为 initial fallback。

- [Risk] deleted / binary / preview-only 文件误进入 edit mode  
  → Mitigation：在进入前统一走 eligibility guard，并提供只读原因。

- [Risk] 未保存修改时切换文件或关弹层导致内容丢失  
  → Mitigation：复用 `FileViewPanel` 现有 dirty close guard，并在 file rail 切换时加同类确认。

- [Risk] Git status refresh 与 diff refresh 时序不一致，短时间内出现 `+/-` 抖动  
  → Mitigation：save success 后优先 refresh diff，再触发 git status refresh；对外层 summary 允许短暂 eventual consistency。

## Migration Plan

1. 先在 OpenSpec 中新增共享 capability，并修改 Git / OpenCode / Activity 相关 spec。
2. 新建 feature-local shared review shell：
   - 组合 `GitDiffViewer`
   - 组合 `FileViewPanel`
   - 管理 `diff/edit` mode、selected file、eligibility、dirty guard、refresh callback
3. 主 Git 面板先接入：
   - 从 file preview modal 进入 editable review
   - 保存后刷新 `useGitDiffs` / `useGitStatus`
4. Checkpoint 接入：
   - review diff modal 改为共享壳
   - 初始使用 snapshot diff，保存后切到 live diff
5. Activity panel 接入：
   - dedicated file preview modal 改为共享壳
   - 同样采用 snapshot -> live refresh 模式
6. 增加 focused tests、跑 lint/typecheck/vitest。

回滚策略：

- 若共享壳导致 modal/editor 交互不稳定，可先回退到各入口原有只读 `GitDiffViewer` modal。
- `FileViewPanel` 本身不改保存协议，回滚时只需去掉 editable wiring，不需要回退底层文件编辑能力。

## Open Questions

- 第一阶段的 `Edit` 文案是否统一叫 `Edit`，还是按中文语境用 `直接修改` / `在此编辑` 更清晰？
- 主 Git 面板后续是否要进一步演进到 IntelliJ 风格的“左侧只读 base / 右侧可编辑 current file”双栏终态？如果要，这应作为第二阶段独立 change。
