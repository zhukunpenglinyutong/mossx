## 1. Spec And Task Setup

- [x] 1.1 创建本次 runtime session lifecycle extraction 的 PRD 与 OpenSpec artifacts `[P0][依赖: 无][输入: 当前 runtime 模块结构与 large-file policy][输出: 可执行的 task/change artifacts][验证: openspec status --change split-runtime-session-lifecycle 显示 tasks ready/done]`

## 2. Runtime Lifecycle Extraction

- [x] 2.1 新建 `session_lifecycle.rs` 并迁移 `close/evict/terminate/replace/rollback` helper `[P1][依赖: 1.1][输入: runtime/mod.rs 的 lifecycle 子域][输出: backend-local lifecycle 子模块][验证: helper 编译通过且未改变 outward contract]`
- [x] 2.2 在 `runtime/mod.rs` 中接线子模块并保持 `crate::runtime::*` outward surface 稳定 `[P0][依赖: 2.1][输入: 现有 runtime public API][输出: 兼容的 façade][验证: 外部调用方无需迁移导入路径]`
- [x] 2.3 确保 `src-tauri/src/runtime/mod.rs` 低于当前 `bridge-runtime-critical` policy 的 fail threshold `[P0][依赖: 2.2][输入: 拆分后的 runtime 模块][输出: 不再触发 retained hard debt 的 runtime/mod.rs][验证: check-large-files:gate 不再将该文件标记为 hard debt]`

## 3. Validation

- [x] 3.1 执行 `npm run typecheck` 验证 lifecycle extraction 未破坏调用面 `[P0][依赖: 2.3][输入: 拆分后的 runtime 模块][输出: 通过的 TS 编译结果][验证: 无新增 type error]`
- [x] 3.2 执行 `cargo test --manifest-path src-tauri/Cargo.toml runtime::tests runtime::recovery_tests` 验证 runtime helper 行为未回退 `[P0][依赖: 2.3][输入: runtime lifecycle 相关测试][输出: 通过的 Rust 测试结果][验证: runtime::tests / runtime::recovery_tests 通过]`
- [x] 3.3 执行 `npm run check:large-files:gate` 与 baseline/watchlist 重算 `[P0][依赖: 2.3][输入: 最新 large-file 状态][输出: 更新后的 baseline/watchlist 文档][验证: gate 通过且 baseline 反映新的 runtime/mod.rs 行数]`
