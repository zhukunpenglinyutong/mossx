## Context

当前 `npm run tauri dev` 的 warning surface 混了两层来源：

- 顶层 / 嵌套 `npm` 命令读取用户本机配置后打印 `electron_mirror` unknown config warning
- `cargo run` 编译 `src-tauri` 时打印大量 `dead_code` / `unused` warning

其中第一类并不完全由仓库代码控制，第二类则属于明确的 repo-owned debt。若不先按 ownership 拆开，后续清理很容易变成“为了让控制台安静而误改用户环境”。

## Goals / Non-Goals

**Goals:**

- 建立 `tauri dev` warning ownership baseline，区分 repo-owned 与 environment-owned。
- 消除仓库内部由于 `beforeDevCommand: "npm run dev"` 带来的重复 npm warning 放大器。
- 分批清理当前 dev build 中最明显的 Rust `dead_code/unused` warning。
- 保证 dev startup 行为不回退，Tauri/Vite 联调链路不被破坏。

**Non-Goals:**

- 不改用户全局 `.npmrc`、shell profile、CI 机器环境。
- 不把所有历史 Rust warning 一次性清零。
- 不顺手做 runtime feature 重构。

## Decisions

### Decision 1: 先按 ownership 拆 warning，而不是把所有 warning 都当成代码问题

- 选项 A：把 `npm run tauri dev` 看到的所有 warning 全部视为仓库问题。
- 选项 B：先拆成 `repo-owned` 与 `environment-owned`，只对仓库可控面建治理任务。

选择 B。

原因：`npm run tauri dev` 的顶层 `npm` warning 由用户本机 config 直接触发，仓库代码无法在不修改用户环境的前提下完全消除。先分类，才能让后续治理目标真实可执行。

### Decision 2: 去掉 Tauri 内部嵌套 `npm run dev`，改成 direct frontend bootstrap

- 选项 A：继续使用 `beforeDevCommand: "npm run dev"`。
- 选项 B：改成 direct bootstrap（例如单独的 `node scripts/tauri-dev-frontend.mjs`），由脚本内部串起 `ensure-dev-port + vite`。

选择 B。

原因：当前链路里，用户手动敲一次 `npm run tauri dev` 已经会触发一层 npm warning；仓库再通过 `beforeDevCommand` 继续嵌套 `npm run dev`，只会把同类 warning 放大成多次重复打印。

### Decision 3: Rust warning 以“移除 / 重新接线 / platform split”为主，`#[allow(dead_code)]` 只做窄口兜底

- 选项 A：用模块级 `#[allow(dead_code)]` 快速压平 warning。
- 选项 B：优先删除 orphaned code、恢复真实引用、或把 Windows-only / test-only 代码拆到更准确的编译边界；只有确属 intentional compatibility shim 时，才做窄口 `allow`。

选择 B。

原因：这波治理的目标不是让控制台安静，而是降低真实技术债。模块级 blanket allow 会把未完成 scaffolding、失联 helper、平台边界漂移一起藏起来。

### Decision 4: Rust warning 按子域分批治理，而不是一次性大扫除

- 选项 A：一个 commit/一轮改完全部 Rust warning。
- 选项 B：按 `startup/path`、`backend auto-compaction`、`engine adapters/events` 三批推进。

选择 B。

原因：warning 的成因不同。`startup_guard` 更像 platform split 问题，`app_server` 更像 orphaned scaffolding，`engine/*` 则混有 compatibility types 和未接线 adapter。分批做更容易验证不回退。

## Risks / Trade-offs

- [Direct frontend bootstrap 改错会导致 `tauri dev` 起不来] → 用独立脚本承接现有 `ensure-dev-port + vite` 逻辑，并用 `npm run tauri dev` 真实启动验证。
- [误删 Rust warning 背后的“未来要用”代码] → 每个 warning group 先做 reference audit；无法确认是否还要保留的符号，不允许直接删除。
- [Windows-only startup guard 拆分后跨平台行为漂移] → 保持现有 public API 名称不变，只把内部实现拆到更准确的 `cfg` 边界。
- [用户仍然会看到顶层 npm config warning，误以为治理失败] → 在 proposal/spec/tasks 和最终验证说明中显式标注 residual warning ownership。

## Migration Plan

1. 记录当前 `npm run tauri dev` warning inventory，标注 ownership。
2. 调整 frontend bootstrap，先解决仓库内部重复 npm warning。
3. 分批治理 Rust warning：
   - `startup_guard / app_paths`
   - `backend/app_server`
   - `engine/*`
4. 重新跑 `npm run tauri dev`、`cargo test --manifest-path src-tauri/Cargo.toml`，更新 warning inventory。
5. 若 direct bootstrap 破坏 dev 启动，回退到当前 `beforeDevCommand`，保留 warning baseline 文档继续推进 Rust 清理。

## Open Questions

- 是否需要额外提供一个 `doctor`/`check` 命令，专门提示“当前顶层 npm warning 来自用户环境”？
- `engine/codex_adapter.rs` 与 `engine/events.rs` 里的部分未用类型，是准备中的扩展点，还是已经失联的遗留 scaffolding？
