## Context

仓库当前的 `react-hooks/exhaustive-deps` warning 不是均匀分布，而是高度集中在少数热点文件中。`src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelInteractions.tsx` 一处就占 `70/109`，而其余 warning 多为单点、叶子或中等复杂度组件。

近期仓库刚完成一轮 large-file modularization，`app-shell`、`threads`、`runtime` 等主链刚被拆到较健康的文件边界。此时若采用“见 warning 就补依赖”的机械修法，最容易把刚稳定下来的 orchestration 边界再次打散。

## Goals / Non-Goals

**Goals:**

- 为当前 `109` 条 warning 建立可执行的 triage 模型，而不是只给出一次性“大扫除”建议。
- 定义一批 `P0` 低风险治理项，使后续实现可以在单次会话内完成并验证。
- 为高风险热点建立 defer gate，避免在没有设计前置时修改 effect/callback 时序。

**Non-Goals:**

- 不试图在同一个 change 中完成所有 warning 清零。
- 不引入新的 lint override、rule downgrade 或 suppression comment。
- 不把 `git-history`、`threads`、`app-shell` 的 warning 修复和 leaf 组件 warning 混成同一批。

## Decisions

### Decision 1：采用“风险分桶 + 批次执行”，而不是全仓一次性清理

- **Why**：warning 类型混杂，既有“多余依赖”这类机械修复，也有“缺少依赖导致 effect 时序变化”这类行为修复。一次性清理会把低风险收益和高风险回归绑在一起。
- **Chosen**：按 `低风险 immediate` 与 `deferred hotspot` 拆桶，先执行 `11` 条 `P0` warning。
- **Alternative A**：全仓清零。
  - Rejected，因为主链回归风险过高。
- **Alternative B**：仅在改到文件时顺手清理。
  - Rejected，因为 warning 永远不会显著下降，也无法形成团队执行节奏。

### Decision 2：Immediate 批次只接受 3 类修复形态

- **Accepted shapes**：
  - `useMemo` 去掉多余依赖
  - 局部 `useCallback` / `useMemo` 稳定化
  - 叶子组件中边界清晰的 `t` / panel manager / theme sync 依赖补齐
- **Why**：这些修复对副作用时机的影响最小，也最容易通过 lint/typecheck/局部测试验证。
- **Alternative**：把 `useEffect` 缺失依赖和 callback identity 问题一并推进到所有模块。
  - Rejected，因为会波及初始化时机、订阅清理和父级 contract。

### Decision 3：热点模块必须在专门批次内处理

- **Hotspots**：
  - `git-history`
  - `threads`
  - `app-shell`
- **Why**：这些 warning 大多属于 orchestration hook，修复前必须先明确“当前 effect 的语义是不是故意稳定”“上游 callback 是否需要先稳定化”“是否需要引入 ref/latest snapshot”。
- **Alternative**：单独逐条挑 warning 修。
  - Rejected，因为缺少模块级 design review 时，容易在多轮小修里反复引入时序漂移。

### Decision 4：P0 批次拆成两个单会话子批次

- **P0-A（7 条）**：
  - `OpenCodeControlPanel`
  - `FileViewPanel`
  - `GitDiffPanel`
  - `ReadToolBlock`
  - `SearchPalette`
  - `useSpecHub`
- **P0-B（4 条）**：
  - `WebServiceSettings`
  - `ProjectMemoryPanel`
  - `useSystemResolvedTheme`
- **Why**：每个子批次都可以在一个会话内做完并独立验证，避免半途混入高风险 warning。

### Decision 5：带“重算哨兵”语义的 warning 延期，不做机械修复

- **Affected files**：
  - `useSessionRadarFeed`
  - `ButtonArea`
- **Why**：这两处 warning 虽然被 lint 标成“多余依赖”，但实际承担了 `timer/localStorage` 变化驱动重算的语义。如果直接移除依赖，会破坏运行态刷新与自定义模型重载。
- **Alternative**：通过删除依赖或加 `eslint-disable` 立即消 warning。
  - Rejected，因为前者会改坏语义，后者会掩盖需要专门设计的模式问题。

## Risks / Trade-offs

- **[Risk] `t` 依赖补齐后 memo/callback 触发频率增加** → 通过受影响组件定向测试和文本渲染检查验证，必要时把纯 derive 逻辑前移为 `useMemo`。
- **[Risk] `OpenCodeControlPanel` 的 helper 稳定化改变 effect 触发节奏** → 只稳定 `inferModelProvider` 的 identity，不改 effect 主体语义。
- **[Risk] `ProjectMemoryPanel` / `useSystemResolvedTheme` effect 补依赖后重复执行** → 明确验收为“不新增重复 cleanup / duplicate side effect”。
- **[Trade-off] warning 总量不会立刻大幅下降** → 先换取 P0 的低回归收益，再为热点模块留出专门批次。

## Migration Plan

1. 固化 current snapshot 与两张 triage 表。
2. 先执行 `P0-A`，跑 `npm run lint`、`npm run typecheck` 和相关定向 `vitest`。
3. 执行 `P0-B`，重复同样的验证矩阵。
4. 更新 warning 剩余清单，确认 deferred hotspots 与 sentinel warnings 未被顺手改动。
5. 后续再为 `app-shell`、`threads`、`git-history` 以及 sentinel patterns 建单独 change 或后续批次。

## Open Questions

- `FileTreePanel` 的 `onInsertText` 是否应该在父层稳定化，而不是在本文件直接补依赖？
- `TaskCreateModal` 的初始化 effect 是否需要先转成 reducer / initializer pattern，再谈 lint 修复？
- `git-history` 热点是应该先做 warning batch，还是先进一步模块化 `useGitHistoryPanelInteractions`？
- `localStorage`/timer 驱动的重算哨兵是否应该统一收敛到显式 external-store hook，而不是继续留在 `useMemo` 依赖数组里？
