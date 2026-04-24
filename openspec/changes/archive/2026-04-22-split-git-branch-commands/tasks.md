## 1. Spec And Task Setup

- [x] 1.1 创建本次 git branch command extraction 的 PRD 与 OpenSpec artifacts `[P0][依赖: 无][输入: 当前 git command 结构与 large-file policy][输出: 可执行的 task/change artifacts][验证: openspec status --change split-git-branch-commands 显示 tasks ready/done]`

## 2. Git Branch Command Extraction

- [x] 2.1 新建 `commands_branch.rs` 并迁移 branch lifecycle + compare 子域 `[P1][依赖: 1.1][输入: git/commands.rs 中的 branch 子域][输出: 独立的 branch command 子模块][验证: branch commands 编译通过且未改变 outward contract]`
- [x] 2.2 在 `commands.rs` 中挂载并 re-export branch 子模块，保持 `crate::git::*` outward surface 稳定 `[P0][依赖: 2.1][输入: 现有 git public API][输出: 兼容的 command façade][验证: command registry 与 daemon dispatch key 无需迁移]`
- [x] 2.3 确保 `src-tauri/src/git/commands.rs` 低于当前 `bridge-runtime-critical` policy 的 fail threshold `[P0][依赖: 2.2][输入: 拆分后的 git command 模块][输出: 不再触发 retained hard debt 的 git/commands.rs][验证: check-large-files:gate 不再将该文件标记为 hard debt]`

## 3. Validation

- [x] 3.1 执行 `npm run typecheck` 验证 branch extraction 未破坏调用面 `[P0][依赖: 2.3][输入: 拆分后的 git command 模块][输出: 通过的 TS 编译结果][验证: 无新增 type error]`
- [x] 3.2 执行 `cargo test --manifest-path src-tauri/Cargo.toml git::` 验证 git command 相关行为未回退 `[P0][依赖: 2.3][输入: git 相关 Rust 测试][输出: 通过的 Rust 测试结果][验证: git 域测试通过]`
- [x] 3.3 执行 `npm run check:large-files:gate` 与 baseline/watchlist 重算 `[P0][依赖: 2.3][输入: 最新 large-file 状态][输出: 更新后的 baseline/watchlist 文档][验证: gate 通过且 baseline 反映新的 git/commands.rs 行数]`
