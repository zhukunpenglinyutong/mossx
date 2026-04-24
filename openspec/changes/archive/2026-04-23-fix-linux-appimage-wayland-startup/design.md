## Context

当前 `ccgui` 的主窗口是在 `src-tauri/src/lib.rs` 中直接创建 `WebviewWindowBuilder`。Linux 启动前只有一个非常弱的兼容分支：若未设置 `__NV_PRIME_RENDER_OFFLOAD` 就补成 `1`。这条逻辑既没有覆盖 issue #379 中已经出现的 `Intel Xe` 复现场景，也没有命中 Tauri/Wry 上游已经公开记录的 `Wayland/AppImage + WebKitGTK` 兼容变量。

与此相对，Windows 已经有完整的 `startup_guard` 机制：启动前决策、失败计数、renderer-ready 清零、逐步打开 compat / gpu fallback。前端也已经在 `src/bootstrapApp.tsx` 中调用 `bootstrap_mark_renderer_ready`，只是非 Windows 平台当前返回 no-op。这个现状给 Linux 提供了一个很好的切入点：我们无需发明新的 renderer-ready 信号，只需要把 Linux 的决策与状态持久化补起来，并保持平台隔离。

本变更的主要约束有三条：

1. 只修 Linux AppImage/Wayland 启动链路，不能误伤 macOS/Windows。
2. 不能把 fallback 做成不可解释的“全局重锤”，必须保留条件边界、用户覆盖优先级和日志证据。
3. 实现必须遵守仓库现有治理门禁，尤其是 `.github/workflows/heavy-test-noise-sentry.yml` 与 `.github/workflows/large-file-governance.yml` 代表的测试信号纯度和大文件硬门禁。

## Goals / Non-Goals

**Goals:**

- 为 `Linux + AppImage + Wayland` 建立单独的 startup compatibility guard，在创建 webview 之前做可控 fallback 决策。
- 复用现有 `bootstrap_mark_renderer_ready` renderer-ready 信号，为 Linux 增加“未就绪启动”检测与渐进式 fallback 升级能力。
- 把 Linux fallback 决策从 `lib.rs` 主入口中提取出来，避免平台特判继续膨胀。
- 保留用户手动设置的 `WEBKIT_*` 环境变量优先级，并在日志中清楚记录仓库默认决策是否生效。
- 通过 Rust unit tests 覆盖 guard 决策、状态迁移和用户覆盖边界，不引入不必要的前端测试噪音。

**Non-Goals:**

- 不构建新的跨平台通用 startup guard framework。
- 不改变 macOS `WKWebView` 或 Windows `WebView2` 的既有 guard 语义。
- 不把 Linux 所有发行版、所有图形后端、所有驱动组合一口气纳入同一个自动兼容矩阵。
- 不为了补 Linux guard 去重做整个 Tauri app bootstrap 流程。

## Decisions

### Decision 1: Linux 启动兼容逻辑拆为独立平台模块，而不是继续堆在现有 `startup_guard.rs`

- 采用：
  - 新增 Linux 专用 guard 模块，负责环境探测、状态持久化、fallback 决策和日志字段。
  - 现有 Windows `startup_guard` 保持原语义；共享入口只保留非常薄的 facade。
- 原因：
  - Linux 与 Windows 的底层 webview、失败模式、fallback 变量、状态文件语义完全不同，放在同一实现块中只会制造平台分支缠绕。
  - 这也符合 large-file governance 对“增量提取、保留兼容 facade”的要求。
- 备选：
  - 直接继续在 `startup_guard.rs` 内堆 `#[cfg(target_os = "linux")]` 分支。实现快，但会让文件很快变成多平台混合状态机，不采用。

### Decision 2: 第一阶段 fallback 只对 `Wayland + AppImage` 风险上下文默认启用 `WEBKIT_DISABLE_DMABUF_RENDERER=1`

- 采用：
  - 风险上下文判定：
    - `XDG_SESSION_TYPE=wayland` 或存在 `WAYLAND_DISPLAY`
    - 且存在 `APPIMAGE` 或 `APPDIR`
  - 在该上下文中，如果用户未显式设置 `WEBKIT_DISABLE_DMABUF_RENDERER`，仓库默认写入 `1`。
- 原因：
  - issue #379 与 Tauri 上游文档问题都把主风险集中在 `Wayland/AppImage`。
  - 这样可以优先覆盖官方 release artifact 的默认用户路径，同时避免把 fallback 扩大到所有 Linux 启动。
- 备选：
  - 只要 Linux + Wayland 就一律关闭 dmabuf。命中面更广，但会扩大误伤面，不采用。
  - 完全依赖用户手动 env。不能满足仓库默认行为修复目标，不采用。

### Decision 3: 第二阶段 fallback 采用“连续未就绪启动后追加 `WEBKIT_DISABLE_COMPOSITING_MODE=1`”

- 采用：
  - Linux guard 持久化 `launch_in_progress` 与 `consecutive_unready_launches`。
  - 前端 render commit 后继续通过 `bootstrap_mark_renderer_ready` 清零。
  - 当风险上下文下出现连续未就绪启动时，guard 在下一次启动时追加 `WEBKIT_DISABLE_COMPOSITING_MODE=1`，作为第二层降级。
- 原因：
  - `DMABUF` 是更窄的第一层 fallback；`COMPOSITING_MODE` 更重，不应默认对所有风险上下文立即启用。
  - 复用既有 renderer-ready 信号可把“是否真的没起来”变成可测试、可持久化的事实。
- 备选：
  - 始终同时打开两个变量。止血更粗暴，但正常 Wayland/AppImage 用户也会被拉入最保守模式，不采用。
  - 完全不做第二层 fallback，只靠第一层 dmabuf。无法覆盖更顽固的启动失败，不采用。

### Decision 4: 用户环境变量始终优先，仓库默认值只做“补位”不做“覆盖”

- 采用：
  - 若用户已设置 `WEBKIT_DISABLE_DMABUF_RENDERER` 或 `WEBKIT_DISABLE_COMPOSITING_MODE`，guard 只记录 diagnostics，不覆盖值。
  - diagnostics 输出中区分 `repo_default_applied` 与 `user_override_detected`。
- 原因：
  - Linux 图形栈兼容性高度依赖用户环境，仓库不能把用户本来已经验证好的 workaround 覆盖掉。
- 备选：
  - 仓库总是覆盖成自己认为正确的值。这样会破坏用户自定义兼容路径，不采用。

### Decision 5: 验证以 Rust unit tests + 定向 lint/type/test 为主，不新增高噪音重型前端回归

- 采用：
  - 主要在 Rust 层验证 guard 决策和状态机；
  - 前端复用现有 `bootstrap_mark_renderer_ready` 调用，不增加新的 UI contract；
  - 验证时显式关注 `heavy-test-noise` 与 `large-file` 两类治理门禁。
- 原因：
  - 本修复主要位于 host startup 边界，没必要为了守护逻辑去引入高噪音重型前端测试。
  - 这样可以减少 repo-owned test noise 回归的风险。
- 备选：
  - 补一整套跨端集成测试。成本高、噪音大、对当前问题的 ROI 低，不采用。

## Risks / Trade-offs

- [Risk] `Wayland + AppImage` 判定过窄，某些非 AppImage Linux 分发方式仍可能中招  
  → Mitigation: 首期只覆盖官方 release artifact 路径；diagnostics 中保留上下文证据，后续若 issue 扩展可安全放宽条件。

- [Risk] 第一层 dmabuf fallback 仍不足以覆盖全部失败场景  
  → Mitigation: 增加连续未就绪启动后的第二层 compositing fallback，并复用 renderer-ready 信号做事实判定。

- [Risk] 若 Linux guard 与 Windows guard 共用状态文件或语义，可能污染既有 Windows 恢复行为  
  → Mitigation: Linux 使用独立状态文件与独立决策结构，不共享 Windows 阈值或命名。

- [Risk] 继续把平台判断堆在 `lib.rs` 会很快触发大文件治理和可维护性退化  
  → Mitigation: Linux guard 采用独立模块，`lib.rs` 只保留薄调用面。

- [Risk] 新增验证或日志处理不当，可能引入 heavy suite stdout/stderr 噪音  
  → Mitigation: 优先使用 Rust unit tests；若补前端/脚本测试，保持本地断言与局部静音，不把预期警告泄露到全局输出。

## Migration Plan

1. 新增 Linux startup guard 模块与决策数据结构。
2. 在 app 启动入口接入 Linux guard facade，并保留现有 Windows guard 行为不变。
3. 将 `bootstrap_mark_renderer_ready` 扩展为 Linux 可用的 guard reset 路径。
4. 为 guard 决策、用户 env 优先级、状态迁移补充 Rust tests。
5. 运行定向验证：
   - `cargo test --manifest-path src-tauri/Cargo.toml`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run check:large-files`
   - 若存在新增前端测试或脚本验证，再确认 heavy-test-noise 相关检查不回归

**Rollback strategy**

- 若 Linux guard 导致意外回归，可在单次提交内回退 Linux-only facade 接入，恢复到现有启动路径；
- 由于 macOS/Windows 不共享该 guard 状态与 env 注入，回滚范围限定在 Linux 启动分支。

## Open Questions

- 是否需要在本次变更中同步补一条面向 Linux 用户的 release troubleshooting 文案，还是先只做代码与日志修复？
- 第二层 compositing fallback 的触发阈值是否采用“首次未就绪后下一次启动即追加”，还是允许更高阈值；首版倾向复用 Windows 现有的单次失败后升级思路，但最终以实现简洁度为准。
