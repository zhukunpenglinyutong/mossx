## Context

`npm run check:large-files:near-threshold` 当前返回 28 个 watch item，其中 P0 6 个、P1 15 个。它们没有阻塞 gate，但多个文件离 fail 阈值只剩几十行：

- P0: `src-tauri/src/codex/mod.rs` 距 2600 fail 只剩 26 行。
- P1: `src/features/threads/hooks/useThreadsReducer.ts` 距 2800 fail 只剩 15 行。
- P1: `src/features/git-history/components/git-history-panel/components/GitHistoryPanelImpl.tsx` 距 2800 fail 只剩 22 行。
- P1: `src/styles/git-history.part2.css` 距 2800 fail 只剩 24 行。

这些文件分别落在 Rust runtime bridge、thread state hot path、git-history UI hot path 和 CSS cascade hot path。拆分不能只追求行数下降；它必须保护 public contract、测试行为、CSS cascade 与 Windows/macOS 文件系统差异。

现有 `large-file-modularization-governance` 已经定义 domain-aware policy、baseline-aware gate 与 facade preservation。本设计在此基础上补齐 P0/P1 staged split 执行模型。

## Goals / Non-Goals

**Goals:**

- 按 P0/P1 near-threshold 风险建立可执行拆分批次。
- 通过 facade-preserving refactor 降低行数，不改变行为。
- 为 Rust、TypeScript、CSS 三类文件定义不同的拆分模式和验证门禁。
- 在每批拆分中显式处理跨平台兼容：路径分隔符、大小写敏感、换行、shell 行为。
- 让每批改动足够小，可以独立 review、测试和回滚。

**Non-Goals:**

- 不改变 large-file policy 阈值。
- 不同时重构业务状态模型、UI 交互或 command contract。
- 不一次性拆完所有 P0/P1/P2 watch item。
- 不用压缩、合并行或删除测试来制造“行数下降”。
- 不把 P2 测试/i18n watch item 纳入首批。

## Decisions

### 1. 采用 staged split，而不是一次性大重构

每一批只处理一个 coherent code area、runtime module、feature surface 或 stylesheet cascade area。只有当 TypeScript 与 CSS 属于同一个 UI surface，且 CSS cascade order 是同一兼容 contract 的一部分时，才允许同批处理。

队列按下面顺序取：

1. 离 fail 阈值小于 50 行的文件。
2. P0 runtime / bridge 文件。
3. P1 feature hot path 文件。
4. P1 styles 文件。
5. P1 default-source / daemon 文件。

First-wave candidates 是多个互斥小批次，不是一个混合大包：

- Batch 1A: `src/features/threads/hooks/useThreadsReducer.ts`
- Batch 1B: `src/features/git-history/components/git-history-panel/components/GitHistoryPanelImpl.tsx` + 同一 surface 的 `src/styles/git-history.part2.css`
- Batch 1C: `src-tauri/src/codex/mod.rs`
- Batch 1D: `src/app-shell.tsx`

这些文件最容易在后续小改中触发 hard gate。实现时每次只选择一个 batch，避免同时动 threads、git-history、codex runtime 与 app shell orchestration。

### 2. 所有拆分保留原入口 facade

拆分后的原文件继续作为 compatibility facade：

- Rust:
  - `mod.rs` 保留 `pub use`、command registration、type aliases 或 delegation。
  - command name、request/response struct、error mapping 不改。
  - 新模块只承接内部实现细节，例如 parser、broker、diagnostics、tests、platform helpers。
- TypeScript:
  - 原 hook/component 文件保留 public export。
  - reducer 可拆为 action groups、selectors、transition helpers，但 `useThreadsReducer` 的外部类型与 reducer semantics 不改。
  - UI component 可拆 render sections / hooks / presentational parts，但 props 与 className contract 不改。
- CSS:
  - 保留现有 import order。
  - 按功能段拆分到明确命名的 stylesheet，避免选择器 specificity、cascade order 与 media query 顺序漂移。

这样做的代价是 facade 文件短期仍存在一些转发代码，但它能把调用方改动面压到最低。

### 3. 拆分以 domain boundary 为准，不按机械行数切片

禁止把一个文件按“前 1000 行 / 后 1000 行”机械切开。推荐边界：

- Rust runtime:
  - command surface
  - process launching
  - platform detection
  - diagnostics / error classification
  - tests / fixtures
- Threads:
  - action normalization
  - state transition helpers
  - selectors / derived state
  - persistence or runtime side-effect adapters
- Git history:
  - branch menu / compare / preview sections
  - interaction handlers
  - presentational subcomponents
  - tests grouped by user workflow
- CSS:
  - panel layout
  - list rows
  - context menu
  - diff / compare affordances
  - responsive rules

### 4. 跨平台兼容作为拆分时的硬门槛

拆分过程中新增文件或路径逻辑时，必须避免 macOS-only 成功：

- Rust 路径使用 `Path` / `PathBuf` / `join`，不要拼接 `/` 或 `\\`。
- 新文件名不允许只靠大小写区分，例如 `State.ts` 与 `state.ts`。
- TypeScript import path 大小写必须与真实文件名一致。
- Runtime command 不新增 POSIX-only shell 片段；如必须调用 shell，必须显式区分 Windows / macOS / Linux。
- 不依赖 LF/CRLF 差异做解析逻辑；文本解析用 `.lines()` 或等价跨平台 API。

### 5. 验证按批次绑定，不把全量测试当唯一证据

每批至少包含：

- `npm run check:large-files:gate`
- `npm run typecheck`
- 对应 targeted tests：
  - Rust: `cargo test --manifest-path src-tauri/Cargo.toml <module>`
  - Frontend: `npm exec vitest run <test-file>`
  - CSS/UI: 相关 component tests、snapshot tests 或明确手测矩阵
- public contract smoke:
  - `rg` 检查 command name、exported symbol、CSS selector、i18n key 是否仍存在

全量 `npm run test` / `cargo test` 可作为批次完成前的加固，但不能替代 targeted evidence。

## Risks / Trade-offs

- [Risk] 只移动代码但没有验证 facade，导致调用方在大小写敏感文件系统或 Windows 环境失败。  
  Mitigation: 每批要求 public symbol / selector `rg` 检查，并跑 TypeScript typecheck。

- [Risk] CSS 拆分改变 cascade order，视觉上出现轻微但难发现的回归。  
  Mitigation: styles 文件拆分必须保留 import order，并用相关 UI 测试或手测截图记录。

- [Risk] Rust `mod.rs` 拆分后出现 private visibility 或 cyclic module 依赖。  
  Mitigation: 先抽 tests / fixtures / pure helpers，再抽 platform / diagnostics，避免一次重排 command surface。

- [Risk] 分批拆分导致短期文件数量增加，导航复杂度上升。  
  Mitigation: 每个目录内用 domain-oriented 命名，保留原 facade 作为入口，并在后续 `.trellis/spec` 中沉淀目录规则。

- [Risk] 行数下降不足以低于 warn 阈值。  
  Mitigation: 对每批记录 before/after/headroom；若 P0 仍未低于 warn，必须列下一批延续任务。

## Migration Plan

1. 完成 OpenSpec artifacts，并用 strict validation 固化要求。
2. Phase 1: 处理 first-wave independent batches，每次只执行一个 batch。
   - Batch 1A: `useThreadsReducer.ts`
   - Batch 1B: `GitHistoryPanelImpl.tsx` + `git-history.part2.css`
   - Batch 1C: `codex/mod.rs`
   - Batch 1D: `app-shell.tsx`
3. Phase 2: 处理剩余 P0 runtime bridge 文件。
   - `computer_use/mod.rs`
   - `runtime/mod.rs`
   - `engine/claude/tests_core.rs`
   - `engine/gemini.rs`
4. Phase 3: 处理剩余 P1 feature hot path 与 daemon/default-source 文件。
   - `useThreads.ts`
   - `useGitHistoryPanelInteractions.tsx`
   - `local_usage.rs`
   - `cc_gui_daemon.rs`
   - `daemon_state.rs`
5. Phase 4: 处理 P1 styles / settings 文件。
   - `sidebar.css`
   - `spec-hub.css`
   - `SettingsView.tsx`
   - `git-history.part1.css`
   - `messages.part1.css`
   - `tool-blocks.css`
   - `file-view-panel.css`

**Rollback:**

- 每批只提交独立模块拆分；若某批回归，回滚该批 commit。
- 保留 facade 可以让回滚不需要大面积改调用方。
- 不通过提高阈值或更新 baseline 来掩盖失败。

## Open Questions

- `src-tauri/src/codex/mod.rs` 首批应优先抽 command surface、session event parser，还是 tests / fixtures？实现前需要读文件结构决定。
- `git-history.part2.css` 当前 cascade 是否已有显式 import split 点？实现前需要检查 stylesheet import 顺序。
- `useThreadsReducer.ts` 的 reducer tests 是否足够覆盖拆分后的 transition helpers，还是需要先补 characterization tests？
- P1 styles 文件是否应创建统一的 stylesheet section naming convention，还是沿用当前 `partN` 模式逐步收敛？
