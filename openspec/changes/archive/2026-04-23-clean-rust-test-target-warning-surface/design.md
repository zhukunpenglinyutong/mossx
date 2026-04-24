## Context

这轮 warning 不是 runtime path，也不是 GUI startup path，而是 Rust test target 自己的编译噪音。数量已经压缩到 `8` 条，分布很集中：

- `client_storage.rs`：test-only import 没有用到
- `shared/thread_titles_core.rs`：测试编译面引入了未使用的 `app_paths`
- `startup_guard.rs`：部分 helper/constant 在当前 test target 下未触达
- `window.rs`：测试目标不走 appearance override
- `workspaces/settings.rs`：daemon test target 没有使用 `sort_workspaces`

所以这里最合理的策略不是再做大范围 target boundary 治理，而是按 warning 本身的真实 ownership 直接收尾。

## Goals / Non-Goals

**Goals:**

- 让 `cargo test` 的 test-target warning surface 清零或接近清零。
- 只做最小行为风险修复：删未用 import、收窄 dead code、必要时做窄口 `cfg`。
- 保持运行时行为和测试行为一致，不因为“清 warning”引入副作用。

**Non-Goals:**

- 不扩大到其他 Rust target。
- 不顺手改 startup/runtime 架构。
- 不为追求绝对形式主义而引入新的抽象层。

## Decisions

### Decision 1: 直接按 warning source 修，而不是再走大范围 boundary split

- 选项 A：再做一轮 target boundary 重构。
- 选项 B：按这 8 条 warning 的真实来源做最小修复。

选择 B。

原因：数量已经足够小，再做大范围拆分只会引入不必要风险。

### Decision 2: 优先删除 / 限定编译边界，而不是 blanket allow

- 选项 A：对测试目标整体加 `allow(dead_code)` / `allow(unused_imports)`。
- 选项 B：优先删掉未用 import、把 truly test-inactive 的 helper 放到更准确的编译边界。

选择 B。

原因：这批 warning 本身就足够小，没有必要为了省几行改动把后续信号再污染回去。

## Risks / Trade-offs

- [误删 helper 实际被非测试目标用到] → 先用搜索确认引用，再做最小删除或 `cfg` 收窄。
- [startup_guard / window 的 dead code 其实是未来要用] → 若属于 intentional compatibility hook，则用窄口 `allow`，并写进 residual policy。
- [清理 test-target warning 时影响运行时编译面] → 统一补跑 `cargo test --manifest-path src-tauri/Cargo.toml`。

## Migration Plan

1. 记录 `lib test 6 + daemon test 2` baseline。
2. 清理未用 import。
3. 收窄 `startup_guard / window / workspaces/settings` 的 dead code 暴露面。
4. 复跑 `cargo test --message-format short` 与完整 `cargo test`。

## Open Questions

- `startup_guard.rs` 的未用符号是应该继续保留为未来 fallback hook，还是已经可以继续收口到更窄边界？
