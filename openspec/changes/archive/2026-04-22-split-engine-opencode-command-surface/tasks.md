## 1. Spec And Task Setup

- [x] 1.1 创建本次 engine OpenCode command extraction 的 PRD 与 OpenSpec artifacts `[P0][依赖: 无][输入: 当前 engine command 结构与 large-file policy][输出: 可执行的 task/change artifacts][验证: openspec status --change split-engine-opencode-command-surface 显示 tasks ready/done]`

## 2. Engine OpenCode Command Extraction

- [x] 2.1 新建 `commands_opencode.rs` 并迁移 OpenCode command surface `[P1][依赖: 1.1][输入: engine/commands.rs 中的 OpenCode command 子域][输出: 独立的 OpenCode command 子模块][验证: OpenCode commands 编译通过且未改变 outward contract]`
- [x] 2.2 在 `commands.rs` 中挂载并 re-export OpenCode 子模块，保持 `crate::engine::*` outward surface 稳定 `[P0][依赖: 2.1][输入: 现有 engine public API][输出: 兼容的 command façade][验证: command registry 与 workspace cleanup 不需要迁移]`
- [x] 2.3 确保 `src-tauri/src/engine/commands.rs` 低于当前 `bridge-runtime-critical` policy 的 warn threshold `[P0][依赖: 2.2][输入: 拆分后的 engine command 模块][输出: 不再触发 retained hard debt 且低于 warn threshold 的 commands.rs][验证: check-large-files:gate 不再将该文件标记为 hard debt]`

## 3. Validation

- [x] 3.1 执行 `cargo test --manifest-path src-tauri/Cargo.toml engine::` 验证 engine extraction 未破坏行为 `[P0][依赖: 2.3][输入: 拆分后的 engine command 模块][输出: 通过的 Rust 测试结果][验证: engine 域测试通过]`
- [x] 3.2 执行 `npm run check:large-files:gate` 与 baseline/watchlist 重算 `[P0][依赖: 2.3][输入: 最新 large-file 状态][输出: 更新后的 baseline/watchlist 文档][验证: gate 通过且 baseline 反映新的 engine/commands.rs 行数]`
