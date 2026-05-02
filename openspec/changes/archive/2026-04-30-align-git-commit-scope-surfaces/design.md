## Context

当前问题横跨 frontend surface、service wrapper、Tauri command 与 Rust git diff helper 四层：

- 右侧主 Git 面板已经有 `selective commit` contract，包括 `useGitCommitSelection`、`CommitButton`、`InclusionToggle` 与对应的 enable/disable / hint copy 语义。
- Git History/HUB 内的 `GitHistoryWorktreePanel` 仍维护独立的提交区实现，只支持较弱的 staged-first 提交路径，没有复用主面板的 inclusion contract。
- AI commit message generation 当前只接收 `workspaceId + language`，backend 统一调用 `get_workspace_diff`，天然只能看到 workspace 全量 diff 或 staged-first fallback，看不到当前 UI 已选 commit scope。
- 现有 selective commit 真正执行提交时，frontend `useGitCommitController` 会基于 `gitStatus + selectedPaths` 构造 scoped commit plan；但这套 plan 没有被 Git History/HUB 提交区与 commit message generation 链路共享，导致行为漂移。

同时，本次改动触发两个项目级硬约束：

- 后续实现与测试必须遵守 `.github/workflows/heavy-test-noise-sentry.yml`，避免新增重噪音测试输出、快照或调试日志。
- 触碰大型前端 panel/hook/test/css 与 Rust git command 时，必须遵守 `.github/workflows/large-file-governance.yml`，必要时优先抽 helper / 子模块，避免继续放大文件债务。

## Goals / Non-Goals

**Goals:**

- 让 commit scope 成为一个真正贯穿 `UI -> service -> tauri -> backend` 的显式 contract。
- 让 Git History/HUB worktree 提交区与右侧主 Git 面板在 inclusion control、commit hint、commit enablement、AI generation scope 上保持同一语义。
- 保持 partial staged file 的现有 Git index 事实来源，不因 scope-aware generation 或 surface 归一化而改变提交语义。
- 把 Win/mac 路径兼容性收敛到统一 normalize contract，避免 `\\` / `/` 差异导致 folder toggle、selected path matching、diff targeting 结果分裂。

**Non-Goals:**

- 不重构整个 Git History 四栏布局或 branch / PR / diff preview 工具栏。
- 不改变 engine/language 菜单本身的选择模型，只改变它所消费的 diff scope。
- 不在本轮引入新的后端存储模型或新的第三方依赖。
- 不把所有 Git 提交 UI 一次性抽成单个共享 mega-component；优先共享 contract、helper 与局部组件。

## Decisions

### Decision 1：commit message generation request 增加可选 `selectedPaths`

- 选择：
  - `src/services/tauri.ts` 中的 `getCommitMessagePrompt`、`generateCommitMessage`、`generateCommitMessageWithEngine` 增加可选 `selectedPaths?: string[]`。
  - `src-tauri/src/codex/mod.rs` 中的 `get_commit_message_prompt` 与 `generate_commit_message` command 增加对应可选 payload。
  - 保持字段 optional，这样旧调用面在未传 scope 时仍维持兼容行为。
- 原因：
  - 问题根因就是 backend 当前完全不知道 UI 的 commit scope；不显式透传，就不可能做到 scope-aware generation。
  - optional field 能把 breaking change 压到最低，便于 staged rollout 和回滚。
- 备选方案：
  - 方案 A：前端自己拼 prompt / diff 文本，再发给引擎。
    - 放弃原因：会把 diff 采集逻辑复制到前端，破坏 bridge boundary，也更难保持 Codex 与非 Codex engine 路径一致。
  - 方案 B：完全不传 scope，只在生成前临时 stage/unstage 工作树。
    - 放弃原因：副作用过重，容易污染用户工作区或与并发操作冲突。

### Decision 2：backend 使用 source-aware commit scope diff 组装，而不是简单 path-filtered workspace diff

- 选择：
  - 在 Rust git helper 层新增专用 helper，用 `repo status + selectedPaths` 推导 `effective index paths` 与 `effective worktree-only paths`。
  - 对 staged-only / hybrid path，读取 staged diff。
  - 对 selected unstaged-only path，读取 worktree diff。
  - 当没有显式 `selectedPaths` 时，保持当前 quick-generate baseline：有 staged diff 就走 staged；否则走全部 unstaged。
- 原因：
  - 真正的 selective commit 并不是简单“按路径过滤 workspace diff”，而是“按 commit plan 组装最终会进入 commit 的 diff 集合”。
  - 若只做 workspace pathspec 过滤，hybrid path 会把 unstaged 部分也混进来，和真实 commit 语义不一致。
- 备选方案：
  - 方案 A：继续复用 `collect_workspace_diff`，只加 pathspec。
    - 放弃原因：无法正确表达 partial staged / staged + selected unstaged 混合场景。
  - 方案 B：在生成前创建临时 index 或临时 stash/worktree。
    - 放弃原因：实现复杂、风险高，且对一个 prompt generation 任务来说过度设计。

### Decision 3：Git History/HUB 提交区复用主 Git 面板的 commit scope primitives，而不是再维护第三套实现

- 选择：
  - `GitHistoryWorktreePanel` 复用 `useGitCommitSelection`、`CommitButton`、`InclusionToggle` 与同一套 hint copy 语义。
  - 若现有 `useGitCommitController` 中的 scoped commit planning 可以拆成 pure helper，则抽到 feature-local shared util，供主面板与 worktree panel 共用。
- 原因：
  - 用户要求“以右侧为主做归一化”，最稳的方式不是在 Hub 再手写一份相似逻辑，而是直接复用同一层 primitive / helper。
  - 抽 pure helper 可以降低行为漂移，同时控制改动面，不必一次性强推共享 UI 容器。
- 备选方案：
  - 方案 A：保留 `GitHistoryWorktreePanel` 独立实现，只做最小 bug 修复。
    - 放弃原因：只能止血，不能阻止未来继续漂移。
  - 方案 B：把两个 surface 一次性改成完全相同的共享组件。
    - 放弃原因：当前范围会被放大成大重构，容易触发 large-file gate 与无关回归。

### Decision 4：commit scope planning 与 path normalization 上升为 shared feature-local contract

- 选择：
  - 提取 `normalizeGitPath / buildScopedCommitPlan` 这类与 commit scope 真值相关的 pure helper，统一放在 git feature 可复用位置。
  - 所有 folder toggle、selection matching、secondary surface parity 与 backend request mapping 都基于同一 normalized path 约束。
- 原因：
  - 现在 commit scope 语义分散在主面板、worktree panel 与 backend helper 中，最容易出现 Win/mac 路径写法不一致。
  - 把 normalize contract 单独抽出来，才能明确保证 `src\\a.ts` 与 `src/a.ts` 在所有 surface 上是同一语义路径。
- 备选方案：
  - 方案 A：各调用方继续各自 `replace(/\\\\/g, \"/\")`。
    - 放弃原因：重复实现会继续引入 drift，而且 review 时很难确认所有边界一致。

### Decision 5：把 CI sentry 与 large-file rule 视为本次实现的显式设计约束

- 选择：
  - design / tasks 中显式要求执行 `npm run check:heavy-test-noise`、`npm run check:large-files:near-threshold` 与 `npm run check:large-files:gate`。
  - 实现上优先抽 helper/子模块，避免把 `GitHistoryWorktreePanel`、`GitDiffPanel`、`useGitCommitController`、Rust git command 继续堆大。
- 原因：
  - 这次改动天然容易碰大文件与测试输出，若不提前写进 design，后续很容易在“只是修小 bug”的借口下跳过门禁。
- 备选方案：
  - 方案 A：把门禁只留在 proposal 文本。
    - 放弃原因：约束不够可执行，实施阶段容易被忽略。

### Decision 6：tree scope topology 必须预聚合，禁止在 render 中反复递归整棵子树

- 选择：
  - `GitDiffPanelCommitScope` 统一先构建 `orderedCommitPaths / stagedPathSet / lockedHybridPathSet`，再单轮派生 `selected / included / excluded / partial`。
  - `GitDiffPanel` 与 `GitHistoryWorktreePanel` 的 tree node 统一预聚合 `descendantPaths`，folder/root row render 只消费预计算结果。
  - folder/root toggle 只在用户交互时惰性筛选 toggleable paths，禁止每次 render 都重新递归收集 descendants。
- 原因：
  - 这次用户复现的“切到右侧 Git 面板并打开 Git His 大面板后卡死”本质上是 commit scope tree 在镜像 surface 上做了重复全量扫描，打开大面板后形成明显的 render 热点。
  - 该问题不会体现在行为 spec 的 happy path 里，但会直接破坏主链路可用性，所以必须作为实现约束显式记录。
- 备选方案：
  - 方案 A：只对 `GitHistoryWorktreePanel` 做局部节流或 `useMemo` 包裹。
    - 放弃原因：热点同时存在于主 Git 面板与 Git His worktree 面板，局部包裹无法保证 parity，也容易留下第二个卡点。
  - 方案 B：继续保留 render-time `collectTreePaths` 递归，只靠数据量较小时“问题不明显”。
    - 放弃原因：这是典型的隐性性能债，worktree 一大就会再次卡死。

## Risks / Trade-offs

- [Risk] frontend scoped commit plan 与 backend scope diff plan 语义不一致  
  → Mitigation：把核心 plan 规则提炼成可测试的 pure helper；前后端分别补针对 staged-only / unstaged-only / hybrid / Win-path 的对照测试。

- [Risk] `GitHistoryWorktreePanel` 补齐 inclusion control 后文件与样式体积继续增长  
  → Mitigation：优先复用已有 primitive/component；必要时把 worktree-specific row/section rendering 再拆小，避免突破 large-file sentry。

- [Risk] 无显式选择时的“生成提交信息”默认范围改变，打断现有 quick-generate 心智  
  → Mitigation：保持既有 baseline：有 staged 时按 staged；没有 staged 时按全部 unstaged；只有在存在显式 selected scope 时才切到 scoped generation。

- [Risk] tree scope parity 修复把每次 render 的路径聚合成本放大，导致右侧 Git / Git His 大面板卡死  
  → Mitigation：统一预聚合 descendants 与 selection topology，禁止在 folder/root row render 中递归扫描整棵子树。

- [Risk] Windows 路径归一化处理不完整，导致 tree folder toggle 与 selected path matching 偶发失效  
  → Mitigation：显式为 `\\` / `/` 混合路径补前端与后端测试；design/specs 中把 path normalization 写成 requirement。

- [Risk] 生成链路 command payload 扩展后遗漏非 Codex engine 路径  
  → Mitigation：统一从 `generateCommitMessageWithEngine` 入口透传 `selectedPaths`；Codex 与 non-Codex 都通过同一 service contract 进来。

## Migration Plan

1. 先落地 OpenSpec delta specs，明确 `git-selective-commit`、`git-commit-message-generation`、`git-history-panel` 的新 requirement。
2. 扩展 frontend service/Tauri command payload，增加 optional `selectedPaths`。
3. 在 Rust git helper 中实现 source-aware scope diff 收集，并把 commit message generation 链路切到新 helper。
4. 在主 Git 面板调用生成入口时透传 `selectedCommitPaths`。
5. 在 `GitHistoryWorktreePanel` 中引入与主面板一致的 inclusion control / scoped commit / scoped generation contract。
6. 补齐 Vitest 与 Rust tests，最后执行 heavy-test-noise / large-file gate / typecheck / 目标测试。

回滚策略：

- 若 scoped generation 或 worktree parity 引入回归，可先保留 proposal/specs，代码上回退到“不传 `selectedPaths` 时保持旧行为”的兼容路径。
- 因为新增字段是 optional，回滚时可先让 backend 忽略该字段，再逐步回退 frontend surface 变更，避免 command contract 硬断裂。

## Open Questions

- `GitHistoryWorktreePanel` 是否需要进一步接入与主 Git 面板相同的 preview/open-file selection 交互，还是本次只收敛 commit 区 contract 即可？
- Rust 侧 source-aware diff helper 最终落在 `git/mod.rs` 还是 `git/commands.rs` 更符合当前模块边界？实现前需结合 large-file 现状再确认一次。
