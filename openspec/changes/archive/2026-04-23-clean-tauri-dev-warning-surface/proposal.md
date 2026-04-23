## Why

当前仓库的前端 `eslint` 告警已经清零，但开发者运行 `npm run tauri dev` 时仍会看到两类 warning：

1. 由本机 `npm` user/env config 注入的 `electron_mirror` / `electron-mirror` unknown config warning  
2. 来自 `src-tauri/src/**` 的 Rust `dead_code` / `unused` warning

这会让启动日志持续带噪，掩盖真实启动错误，也降低团队对 dev console 的信任度。现在处理的原因很直接：前端 warning 治理已经完成，`tauri dev` warning surface 成了下一块最明显的工程噪音。

## 目标与边界

- 目标：降低 `npm run tauri dev` 默认启动链路中的 repo-owned warning，尤其是 Rust `dead_code/unused` warning 和仓库内部触发的重复 npm config warning。
- 目标：明确区分“仓库可治理 warning”和“用户本机环境 warning”，避免后续再把外部环境噪音误判成代码回归。
- 边界：本轮只覆盖 `tauri dev` 启动可见的 warning surface，不处理业务 feature，不改 Tauri command contract，不修改用户全局 npm 配置。

## 非目标

- 不试图通过仓库代码强行清理用户本机 `.npmrc` 或 shell 环境变量。
- 不把所有 Rust warning 一次性升级成 `deny(warnings)`。
- 不夹带 runtime / frontend 行为变更。

## What Changes

- 新建一条 OpenSpec change，专门治理 `tauri dev` 启动 warning surface。
- 建立 warning ownership baseline，区分：
  - `repo-owned startup warnings`
  - `environment-owned startup warnings`
- 调整 `tauri dev` 的 frontend bootstrap 路径，去掉仓库内部重复嵌套的 `npm run ...` 调用，减少重复的 npm config warning。
- 分批清理 `src-tauri/src/**` 中当前 dev build 下暴露出来的 `dead_code` / `unused` warning：
  - `startup_guard` / `app_paths` 这类 platform/path 边界
  - `backend/app_server` 的 auto-compaction scaffolding
  - `engine` 相关 adapter / payload / helper 的 orphaned symbols
- 增加一条明确的验证说明：如果用户继续使用 `npm run tauri dev`，顶层 `npm` 因本机 config 打出来的 warning 属于 environment-owned，不计入仓库 warning debt。

## Capabilities

### New Capabilities

- `tauri-dev-warning-cleanliness`: 约束仓库在默认 `tauri dev` 启动链路中区分 warning ownership，并持续压低 repo-owned startup warnings。

### Modified Capabilities

- None.

## Impact

- Affected code:
  - `src-tauri/tauri.conf.json`
  - `src-tauri/src/app_paths.rs`
  - `src-tauri/src/startup_guard.rs`
  - `src-tauri/src/backend/app_server.rs`
  - `src-tauri/src/engine/mod.rs`
  - `src-tauri/src/engine/claude.rs`
  - `src-tauri/src/engine/codex_adapter.rs`
  - `src-tauri/src/engine/events.rs`
  - `src-tauri/src/engine/manager.rs`
- Potential new scripts:
  - `scripts/tauri-dev-frontend.mjs` or equivalent direct frontend bootstrap helper
- Affected workflow:
  - `npm run tauri dev`
  - `cargo test --manifest-path src-tauri/Cargo.toml`

## Acceptance Criteria

- `npm run tauri dev` 启动时，仓库内部重复触发的 npm unknown-config warning 被消除或显著减少。
- `npm run tauri dev` 启动时，repo-owned Rust `dead_code/unused` warning 明显下降，并有明确 baseline / target。
- 对于无法由仓库代码消除的用户环境 warning，提案和后续实现必须明确标注 ownership，不再混淆成代码债务。
- 本轮治理不引入新的 frontend/runtime 行为回归。

## Inventory Snapshot

### Before cleanup

- `npm run tauri dev` 顶层会打印 `Unknown user config "electron_mirror"`；该 warning 来自本机 npm 配置，归类为 `environment-owned`。
- `beforeDevCommand: "npm run dev"` 会再次触发一层 npm bootstrap，导致 unknown-config warning 在仓库链路里被重复放大，归类为 `repo-owned amplification`。
- `cargo check --manifest-path src-tauri/Cargo.toml --no-default-features --message-format short` 的 `cc-gui (lib)` 共有 `40` 条 warning，其中 `startup_guard/app_paths`、`backend/app_server`、`engine/*` 是本轮治理范围。

### After cleanup

- `npm run tauri:dev:hot` 启动日志中，unknown-config warning 只保留顶层 `1` 次，不再出现仓库内部重复放大。
- 同一启动日志里，`cc-gui (lib)` warning summary 已消失，说明 `tauri dev` 默认可见的 repo-owned Rust warning 已清零。
- `cargo check --manifest-path src-tauri/Cargo.toml --no-default-features --message-format short` 现在只剩 `cc-gui (bin "cc_gui_daemon") generated 137 warnings`；这属于 daemon bin 的独立 warning 面，不再计入本 change 的 `tauri dev` startup debt。

## Residual Warning Policy

- 保留的 `Unknown user config "electron_mirror"` 继续归类为 `environment-owned`。只要用户仍通过当前本机 npm config 启动 `npm run tauri dev`，这条 warning 预期会继续存在。
- 本 change 的完成标准不是让用户全局 npm 环境静默，而是：
  - 仓库内部不再重复放大该 warning
  - `tauri dev` 默认可见的 `cc-gui (lib)` warning 清零
  - 剩余 daemon bin warning 不混淆成当前 GUI startup debt
