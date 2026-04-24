## Context

`cc_gui_daemon` 不是 GUI `tauri dev` 默认启动的主目标，但它仍然属于当前仓库的 Rust 交付面。daemon 入口通过大量 `#[path = ...]` 直接复用 shared modules，这让 `cargo check --bin cc_gui_daemon` 同时暴露出三类问题：

- daemon 自己的 stub / helper 没有真正接线
- desktop-oriented shared modules 被 daemon 被动拖进编译面
- 少量 compatibility shim 为了让 shared code 在 daemon 下可编译而保留

当前 warning family 分布已经很集中：`local_usage` 53 条、`shared engine + engine_bridge` 41 条、`runtime` 25 条，其余是 `session_management/workspaces_core/git_utils` 尾部 warning。这说明最值得做的不是“把 137 条逐条消音”，而是先把 daemon 的 import surface 和 reachability 边界理顺。

## Goals / Non-Goals

**Goals:**

- 建立 `cc_gui_daemon` warning ownership baseline，并把 daemon warning 与 GUI startup warning 分开治理。
- 以 family 为单位设计 warning cleanup 批次，而不是按文件零散扫尾。
- 约束实现策略：优先 remove / reconnect / boundary split，只允许窄口 residual `allow(dead_code)`。
- 确保清理过程中不破坏 daemon RPC contract，也不回退 desktop app 的共享模块行为。

**Non-Goals:**

- 不在本 change 里重做 daemon 架构或抽离独立 crate。
- 不把所有 shared modules 的 desktop-only helpers 一次性清零。
- 不顺手引入新的 runtime / engine / local usage 功能。

## Decisions

### Decision 1: 按 target ownership 治理，而不是按源码物理位置治理

- 选项 A：看到 warning 落在哪个源码文件，就把它当成那个模块自己的问题。
- 选项 B：按 `cc_gui_daemon` 编译目标的 reachability 来判断 ownership，再决定是改 daemon 自己还是改 shared module 的 boundary。

选择 B。

原因：很多 warning 虽然出现在 `src-tauri/src/local_usage.rs` 或 `src-tauri/src/runtime/*`，但它们之所以暴露出来，是因为 daemon 通过 `#[path = ...]` 把整块 desktop-oriented 代码编进来了。先按 target ownership 拆，才能避免误删 GUI 侧仍在用的共享逻辑。

### Decision 2: 优先缩减 daemon import surface，而不是优先加 `#[allow(dead_code)]`

- 选项 A：先用模块级或文件级 `allow(dead_code)` 把 warning 压平。
- 选项 B：先缩 daemon import surface、拆 desktop-only wrappers、恢复真实调用边界；只有 intentional shim 才允许窄口 `allow`。

选择 B。

原因：这条 change 的价值在于恢复信号质量。如果一开始就 blanket allow，只是把真实的 reachability 漂移藏起来，后续改 daemon 还是会在错位边界上继续积债。

### Decision 3: 分三批治理，而不是一次性把 137 条 warning 打平

- 选项 A：一次性扫完整个 daemon warning 面。
- 选项 B：按 family 分三批：
  1. daemon-owned surface
  2. `local_usage` + `engine bridge/shared engine`
  3. `runtime/session_management/workspaces_core/git_utils` + residual policy

选择 B。

原因：warning 成因不一样。`daemon-owned` 更像入口接线问题，`local_usage` 更像 shared desktop wrappers 被误带入，`runtime/session_management` 则更像 boundary 过宽。分批做更容易验证，也更容易在每一批结束后重新评估 residual warning。

### Decision 4: residual warning 必须带 justification，而不是默认接受“先留着”

- 选项 A：只要功能没坏，少量 warning 可以默认保留。
- 选项 B：任何 residual warning 都必须在任务/验证里明确记录 ownership、保留原因、后续处理策略。

选择 B。

原因：daemon 这块以前就是因为“反正不是主启动路径”才慢慢堆出了 137 条 warning。如果 residual policy 不写进 change，后面很快又会回到同样的状态。

## Risks / Trade-offs

- [误删 shared module 中 GUI 仍在使用的 helper] → 先按 daemon target 的 import/reachability 做审计，再决定删改；必要时补 targeted Rust tests。
- [缩 daemon import surface 时破坏 RPC 行为] → 优先改 stub / wrapper 边界，不直接改 RPC params 和 response contract。
- [为了减少 warning 而引入大量 `cfg(test)` / `cfg(feature)` 噪音] → 只在确有编译边界语义时使用；否则优先拆出更小的 daemon-local bridge/helper。
- [残留 warning 归因不清，导致治理半途而废] → 每一批结束都重新跑 `cargo check --bin cc_gui_daemon --message-format short`，更新 baseline。

## Migration Plan

1. 记录当前 `cc_gui_daemon` warning inventory 与 family 分布，形成 ownership baseline。
2. 先治理 daemon-owned surface，缩小入口级 warning。
3. 再处理 `local_usage` 与 `shared engine/engine_bridge`，把 desktop-only wrappers 从 daemon import surface 剥离。
4. 最后处理 `runtime/session_management/workspaces_core/git_utils`，并定义 residual warning policy。
5. 每一批都复跑 `cargo check --bin cc_gui_daemon`；最终补 `cargo test --manifest-path src-tauri/Cargo.toml` 验证共享模块未回退。

## Resolved Residual Policy

- `cargo check --manifest-path src-tauri/Cargo.toml --bin cc_gui_daemon --message-format short` 现在为 `0 warnings`。
- 为了避免 daemon target 再次把 desktop-oriented shared modules 的未用 surface 混成 warning debt，本轮在 daemon import boundary 上保留了窄口 `#[allow(dead_code)]`：
  - `local_usage`
  - `runtime`
  - `session_management`
  - `shared`
  - `git_utils`
  - daemon `engine_bridge` 内的 `claude` / `claude_message_content` / `manager` / `status`
- 这些 suppressions 只作用于 `cc_gui_daemon` 目标，不改变 GUI lib/main target 的 warning policy，也不允许在 shared source 文件内部继续扩散 blanket allow。

## Open Questions

- `local_usage.rs` 中哪些 helper 实际值得抽成 daemon/shared core，而不是继续让 daemon 引整块 desktop analytics 代码？
- `engine_bridge.rs` 与 `../../engine/*` 之间，是否已经到了该抽一层 daemon-facing minimal engine core 的程度？
- 如果最终仍有少量 compatibility shim warning，是否需要同步增加一条面向贡献者的 backend guideline，避免后续再把 desktop-only surface 拖进 daemon？
