## Context

`useGitHistoryPanelInteractions.tsx` 是 `git-history` 面板的主 orchestration hook，当前约 `2376` 行，并以单个 `scope` object 接收大量状态、setter、service 调用和 UI refs。`react-hooks/exhaustive-deps` warning 高度集中在这个文件里，但并不是所有 warning 风险相同：

- 一类是稳定 setter / stable ref / imported helper 缺失，通常可以通过补全依赖数组收敛。
- 一类是 `create-pr`、`push preview`、`sync preview`、`branch diff` 这类异步链路，依赖数组修复可能影响 effect 重跑、load token、cache/ref 生命周期。
- 还有一类是 context menu / resize / keyboard interaction，虽然多为 UI callback，但稍有不慎就会改掉事件绑定或焦点行为。

因此这轮不能按“lint 自动建议”一把梭，而必须按批次治理。

## Goals / Non-Goals

**Goals:**
- 把 `git-history` 热点 warning 切成低风险可执行批次和高风险 deferred 批次。
- 先清理 `P0` 的 setter/helper/service 级 warning，不改变现有交互 contract。
- 为后续 `create-pr preview`、`push/pull/sync preview`、`diff preview`、`context menu/resize` 批次建立稳定进入条件。

**Non-Goals:**
- 本轮不做 `git-history` hook 拆文件或 state model 重构。
- 本轮不修改 Tauri/Rust contract。
- 本轮不把所有 `70` 条 warning 一次性清零。

## Decisions

### Decision 1: 采用“按风险分批”而不是一次性清零

**Decision:** 先执行 `P0` 低风险批次，再为其余 warning 维持 deferred gate。

**Why:** 该 hook 同时包含 async preview、cache/ref、dialog state、keyboard/menu/resize 行为。一次性修复会把 lint cleanup 和行为变更耦合在一起，任何一个 warning 修复失误都可能被其它 warning 噪音淹没。

**Alternatives considered:**
- **Option A: 一次性补全所有依赖数组**
  - 优点：warning 数字下降快。
  - 缺点：几乎无法定位是哪一组 callback/effect 改坏了行为；风险最高。
- **Option B: 只在本轮补 P0，剩余 warning 进入明确的 deferred batches**
  - 优点：风险可控，验证范围清晰。
  - 缺点：warning 不会一次归零。

### Decision 2: P0 只碰 branch/create-pr bootstrap，不碰 preview/timer/load-token 链

**Decision:** `P0` 聚焦以下 warning 组：
- fallback/workspace selection
- worktree/local/remote scope toggles
- branch checkout/create/rename/open dialog
- create-pr defaults / head repo parse / simple copy handlers

**Why:** 这些 warning 主要是稳定 setter、service helper、纯 derive 依赖，修复后行为面较窄，容易通过 lint/typecheck 和定向 tests 验证。

**Alternatives considered:**
- **Option A: 把 create-pr preview loader 一起拉进 P0**
  - 缺点：涉及 load token、cache ref、selected sha、details effect，已经超出低风险边界。
- **Option B: 先只碰 branch/create-pr bootstrap**
  - 优点：先拿下一批确定性收益，再看 preview 链。

### Decision 3: 高风险 preview/diff/menu/resize 批次必须带专门验证命令

**Decision:** 后续 `P1/P2` 批次进入实现前，必须明确对应的定向 tests 或新增 tests；如果缺测试，先补测试再动依赖数组。

**Why:** 这些批次直接影响 preview 加载、焦点移动、resize、scroll/load more 等交互，不应只靠 lint 判断正确性。

**Alternatives considered:**
- **Option A: 继续只跑 lint/typecheck**
  - 缺点：无法发现 effect 重跑、focus 漂移、preview stale cache 等问题。
- **Option B: 让每一批绑定具体验证**
  - 优点：回归面清楚，适合持续推进。

## Risks / Trade-offs

- [Risk] `scope` 中某些函数如果并不稳定，补依赖后会导致 callback identity 变化频率上升。
  → Mitigation：`P0` 只纳入由 state setter、imported service/helper 或现有 stable refs 组成的 warning。

- [Risk] `create-pr preview` / `push preview` effect 链修复会改变异步重跑时机。
  → Mitigation：本轮 defer，待下一批配合 preview tests 一起处理。

- [Risk] `context menu` / `resize` callback 看起来像 UI 噪音，实际上可能改焦点和拖拽行为。
  → Mitigation：放入 `P2`，不与 `P0/P1` 混做。

## Migration Plan

1. 创建 `git-history` 热点治理的 proposal / design / spec / tasks。
2. 先落 `P0` 低风险批次，并运行 lint/typecheck/定向 tests。
3. 根据 `P0` 的结果，再决定是否继续推进 `P1` preview/push/pull/sync 批次。
4. `P2` 的 context menu / resize 批次只有在有对应交互测试或足够小范围修复时才进入实现。

## Open Questions

- 当前 `git-history` 是否已有足够覆盖 `create-pr preview` / `push preview` / `context menu keyboard` 的定向 tests，还是下一批要先补测试？
- `scope` 里是否存在由上层 inline 构造、并不稳定的 helper/callback，需要通过 helper extraction 而不是直接补依赖来处理？
