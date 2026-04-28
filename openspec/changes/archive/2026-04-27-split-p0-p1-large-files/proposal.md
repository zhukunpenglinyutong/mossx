## Why

当前 large-file governance 已经能把 hard gate 与 near-threshold watch 分开，但 `check:large-files:near-threshold` 仍显示多处 P0/P1 hot path 文件贴近 fail 阈值。若继续在这些文件内追加逻辑，下一次局部修复就可能把门禁打爆，并放大 review、merge 与跨平台回归成本。

本变更要把 P0/P1 大文件拆分从“临时止血”推进为可执行的模块化计划：按风险分批抽取内部模块，保持外部行为、导出路径、Tauri command contract、CSS selector 与测试语义不变。

## 目标与边界

### 目标

- 为 P0/P1 near-threshold 文件建立分阶段模块拆分 proposal，优先处理离 fail 阈值最近、且位于 runtime / feature hot path / styles 的文件。
- 每一批拆分 MUST 是 behavior-preserving refactor：外部 import path、command name、payload shape、CSS class / selector、user-visible copy 与 persisted state 语义保持兼容。
- Rust backend 拆分 MUST 使用跨平台写法：路径处理基于 `Path` / `PathBuf` / `join`，避免硬编码 `/`、大小写仅差异文件名、平台专属 shell 假设。
- Frontend / CSS 拆分 MUST 保持 Windows 与 macOS 文件系统兼容：新文件名使用 kebab-case 或既有目录命名风格，禁止只靠大小写区分模块，禁止引入平台相关换行或路径拼接。
- 每一批拆分后 MUST 跑对应 targeted tests 与 large-file gate，确保 watch item 行数下降且没有新增 hard debt。

### 边界

- 本变更只定义 P0/P1 watch 文件的模块拆分策略与验收门禁，不改变 large-file policy 阈值本身。
- 本变更不修改业务行为、不新增 UI 能力、不改变 storage schema、不改变 Tauri command API。
- 本变更不要求一次性拆完全部 watch 文件；按风险批次逐步完成，每批可独立 review、验证、回滚。
- P2 测试与 i18n watch 文件暂不纳入首批拆分，只在 P0/P1 稳定后另行排期。

## 非目标

- 不以移动代码为名重写业务逻辑或调整用户体验。
- 不在拆分过程中重命名 public command、public hook、public component prop、CSS class 或 i18n key。
- 不为了降低行数而删除测试覆盖、删除兼容 facade、压缩代码可读性，或把逻辑转移到更难维护的巨型 helper。
- 不把大文件治理改成“提高阈值绕过问题”。
- 不在同一批次同时重构多个跨层主链路，避免 review 面积失控。

## What Changes

- 新增 P0/P1 大文件模块拆分执行计划，以 `check:large-files:near-threshold` 的 watch 输出作为输入队列。
- 修改 `large-file-modularization-governance` 的执行要求：对 P0/P1 watch 文件增加 staged split、compatibility facade、cross-platform naming/path guard 与 per-batch validation matrix。
- 将 P0 watch 文件列为最高优先级：
  - `src-tauri/src/codex/mod.rs`：2574 / 2600，剩余 26 行。
  - `src-tauri/src/computer_use/mod.rs`：2475 / 2600，剩余 125 行。
  - `src-tauri/src/runtime/mod.rs`：2372 / 2600，剩余 228 行。
  - `src/app-shell.tsx`：2301 / 2600，剩余 299 行。
  - `src-tauri/src/engine/claude/tests_core.rs`：2259 / 2600，剩余 341 行。
  - `src-tauri/src/engine/gemini.rs`：2207 / 2600，剩余 393 行。
- 首批只定义 first-wave candidates，不把多个无关 hot path 合成同一个实现批次：
  - Threads reducer batch：`src/features/threads/hooks/useThreadsReducer.ts`。
  - Git history UI batch：`GitHistoryPanelImpl.tsx` 与同一 surface 的 `git-history.part2.css` 可同批处理。
  - Codex runtime batch：`src-tauri/src/codex/mod.rs`。
  - App shell orchestration batch：`src/app-shell.tsx`。
- 将 P1 watch 文件按“贴线程度 + 热点风险”排序：
  - `src/features/threads/hooks/useThreadsReducer.ts`：2785 / 2800，剩余 15 行。
  - `src/features/git-history/components/git-history-panel/components/GitHistoryPanelImpl.tsx`：2778 / 2800，剩余 22 行。
  - `src/styles/git-history.part2.css`：2776 / 2800，剩余 24 行。
  - `src-tauri/src/local_usage.rs`：2929 / 3000，剩余 71 行。
  - `src/features/threads/hooks/useThreads.ts`：2705 / 2800，剩余 95 行。
  - `src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelInteractions.tsx`：2692 / 2800，剩余 108 行。
  - `src-tauri/src/bin/cc_gui_daemon.rs`：2880 / 3000，剩余 120 行。
  - 其他 P1 styles / settings / daemon state 文件进入第二批。
- 每个拆分批次都必须保留 facade：
  - Rust：原 `mod.rs` 或原入口文件继续 re-export / delegate，外部调用方不需要改 contract。
  - TypeScript：原 hook / component / loader 入口保留 public exports，内部实现拆到 domain 子模块。
  - CSS：原 import 链与 selector 语义保持，按功能段移动到 part 文件时保留 cascade order。
- 每个拆分批次都必须包含兼容性检查：
  - `rg` 检查 public symbol / command / selector 仍存在。
  - targeted tests 覆盖拆分模块。
  - `npm run check:large-files:gate` 确认没有 hard debt。
  - 必要时运行 `cargo test --manifest-path src-tauri/Cargo.toml <module>`、`npm run typecheck`、相关 Vitest。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险 / 成本 | 结论 |
|---|---|---|---|---|
| A | 只在文件超过 fail 阈值后 JIT 拆分 | 当前成本最低 | 贴线文件只需一次小改就会阻塞门禁；拆分发生在紧急上下文中，review 质量差 | 不采用 |
| B | 按 P0/P1 watch list 分批做 behavior-preserving 模块拆分，保留 facade 与 targeted validation | 可提前降低 hard gate 风险；每批变更可独立 review；兼容性边界清晰 | 需要持续规划与验证，短期会产生多个小 refactor PR | 采用 |
| C | 一次性拆完所有 P0/P1/P2 watch 文件 | 行数风险一次性清零 | 改动面积过大，merge 冲突与行为回归风险高；P2 优先级不值得同批处理 | 不采用 |
| D | 提高 policy 阈值或把更多文件移入 baseline | 改动最快 | 掩盖架构债务，削弱门禁信号 | 不采用 |

## Capabilities

### New Capabilities

- 无。该变更不新增用户可见能力。

### Modified Capabilities

- `large-file-modularization-governance`: 增加 P0/P1 near-threshold 文件的分阶段拆分要求、兼容 facade 要求、跨平台路径/命名约束与每批验收矩阵。

## 验收标准

- 每个实施批次完成后，`npm run check:large-files:gate` MUST 通过，并且不得新增 fail 阈值以上 hard debt。
- 被拆分文件的外部 public contract MUST 保持兼容：
  - Tauri command 名、参数、返回结构不变。
  - exported hook / component / helper 名称不变，除非同批提供兼容 re-export。
  - CSS class / selector 与 import order 不变，避免视觉行为漂移。
- P0 文件拆分后 SHOULD 至少下降到 warn 阈值以下；若批次过小无法做到，MUST 至少保留 150 行以上 headroom，或在任务中说明为什么需要下一批继续。
- P1 文件拆分后 SHOULD 至少保留 200 行以上 headroom；贴线文件（剩余小于 50 行）MUST 优先处理。
- Rust 拆分 MUST 避免平台专属路径写法：
  - 使用 `Path` / `PathBuf` / `join`；
  - 不硬编码 `/` 或 `\\`；
  - 不新增只靠大小写区分的文件名；
  - 不新增依赖 POSIX shell 行为的 runtime command。
- Frontend 拆分 MUST 保持 TypeScript strict 零错误，并避免大小写敏感路径在 macOS 通过但 Windows / Linux 失败。
- 每批拆分 MUST 记录 targeted validation：
  - 相关 Rust tests 或 Vitest；
  - `npm run typecheck`；
  - `npm run check:large-files:gate`；
  - 对 CSS / UI 热点变更，至少执行相关 snapshot / component tests 或手测说明。

## Impact

- Backend / Rust:
  - `src-tauri/src/codex/mod.rs`
  - `src-tauri/src/computer_use/mod.rs`
  - `src-tauri/src/runtime/mod.rs`
  - `src-tauri/src/engine/claude/tests_core.rs`
  - `src-tauri/src/engine/gemini.rs`
  - `src-tauri/src/local_usage.rs`
  - `src-tauri/src/bin/cc_gui_daemon.rs`
  - `src-tauri/src/bin/cc_gui_daemon/daemon_state.rs`
- Frontend / TypeScript:
  - `src/app-shell.tsx`
  - `src/features/threads/hooks/useThreadsReducer.ts`
  - `src/features/threads/hooks/useThreads.ts`
  - `src/features/git-history/components/git-history-panel/components/GitHistoryPanelImpl.tsx`
  - `src/features/git-history/components/git-history-panel/hooks/useGitHistoryPanelInteractions.tsx`
  - `src/features/settings/components/SettingsView.tsx`
- Styles:
  - `src/styles/git-history.part1.css`
  - `src/styles/git-history.part2.css`
  - `src/styles/sidebar.css`
  - `src/styles/spec-hub.css`
  - `src/styles/messages.part1.css`
  - `src/styles/tool-blocks.css`
  - `src/styles/file-view-panel.css`
- Specs / governance validation inputs（本 proposal 默认只读，除非 scanner/policy mismatch 被单独证明）:
  - `openspec/specs/large-file-modularization-governance/spec.md`
  - `scripts/check-large-files.policy.json`
  - `docs/architecture/large-file-baseline.json`
