## Why

`desktop-cc-gui#379` 暴露出一个已经跨版本存在的 Linux 启动稳定性问题：在 `Arch Linux + Wayland` 环境下，`0.4.4` 到 `0.4.7` 的 `AppImage` 在主窗口 webview 创建前就会因 `GBM/EGL` 初始化失败直接 abort，用户看到的是 `Could not create GBM EGL display` 或 `Could not create surfaceless EGL display: EGL_BAD_ALLOC`，随后进程 core dump。

这个问题已经不再能被解释成“某一块 Nvidia 显卡的偶发现象”。issue 评论补充表明 `Intel Xe` 与混合显卡的 `Wayland` 机器也会复现；而当前仓库代码只在 Linux 启动时设置了 `__NV_PRIME_RENDER_OFFLOAD=1`，没有对 `WebKitGTK/Wry` 在 `Wayland/AppImage` 下的 `DMABUF/compositing/EGL display` failure mode 建立真正的兼容 fallback 或可诊断 guard。因此现在需要把它提升为一个明确的 Linux startup hardening change，而不是继续依赖用户自行换环境或手工设置变量。

## 现状核对（2026-04-23）

- `src-tauri/src/lib.rs` 当前 Linux 启动分支仅设置 `__NV_PRIME_RENDER_OFFLOAD=1`；这既没有命中评论里已确认存在的 `Intel Xe` 场景，也没有触及 `WebKitGTK` 的关键兼容变量。
- 当前 `startup_guard` 仅存在于 Windows 路径，用于 `WebView2` compat/gpu fallback；Linux 没有等价的启动守护、失败计数或渐进降级策略。
- Linux release 当前由 `.github/workflows/release.yml` 的 `ubuntu-24.04` job 生成 `AppImage`；提案必须假设“仓库产物要直接面对 Arch/Wayland 用户”，不能把问题外包给本地手工运行方式。

## 目标与边界

### 目标

- 为 `Linux + AppImage + Wayland` 启动链路建立一个 **Linux-only、启动前、可诊断** 的兼容 fallback，避免 `WebKitGTK/Wry` 在主窗口创建前因 `EGL/GBM/DMABUF` 初始化失败直接 abort。
- 保持 `macOS` 与 `Windows` 正常链路不变；本修复不得把 Linux 的兼容策略写成跨平台共享分支，也不得污染现有 `Windows WebView2 startup_guard` 语义。
- 将 fallback 收口到受控边界：优先采用最小范围的 `WebKitGTK` 环境变量与条件判定，不用“大而化之”的全局渲染禁用开关。
- 补齐启动诊断信息，至少能在日志中区分 `XDG_SESSION_TYPE / WAYLAND_DISPLAY / DISPLAY / APPIMAGE` 与实际启用的 fallback 集合，避免再次出现“用户只看到 core dump，仓库无真值”的局面。
- 把实现门禁显式写入本次 change：新增/修改的测试不得破坏 `heavy-test-noise` sentry 的信号纯度；启动逻辑拆分不得绕过 large-file governance，而应遵循增量提取和兼容 facade 原则。

### 边界

- 本变更只处理 **Linux 启动兼容与诊断**，聚焦 `src-tauri` 启动前到主窗口 webview 创建这一段；不顺手重构 frontend、session runtime 或其他无关主链路。
- 首期 fallback 只覆盖仓库可控的 host-side 兼容变量、条件判定和失败后渐进降级，不承诺“一次修完所有 Linux 桌面/驱动/发行版组合”。
- 不把 Linux 修复扩展成新的跨平台通用 startup guard 框架；若需要状态持久化，也必须是 Linux 独立实现，不能复用或污染 `Windows` 的 `startup_guard.json` 语义。
- 不通过“让用户自己改 shell env”来完成仓库责任；用户侧 workaround 可以作为补充文档，但不能代替仓库默认行为。
- 不以牺牲可维护性为代价做一次性热补丁；若启动逻辑增长，必须拆到独立模块，遵守 large-file governance。

## 非目标

- 不在本变更内承诺 Linux 所有图形环境、所有显卡驱动、所有发行版都 100% 启动成功。
- 不重写 Tauri/Wry/WebKitGTK 上游实现，也不引入自定义 Linux launcher/daemon。
- 不改变 `macOS` 的 `WKWebView` 配置、窗口策略或白屏兜底路径。
- 不改变 `Windows` 的 `WebView2` compat mode / gpu fallback 阈值与持久化格式。
- 不把本次修复扩散为“统一图形栈调优工程”；只做当前 issue 相关、最小必要、可验证的 host-side startup hardening。

## What Changes

- 在 Linux 启动前新增独立的 startup compatibility guard：
  - 识别 `Wayland/AppImage` 等高风险上下文；
  - 在创建主窗口 webview 之前注入最小必要的 `WebKitGTK` fallback env；
  - 记录本次实际启用的 fallback 决策，供日志与测试校验。
- 将当前散落在 `lib.rs` 中的 Linux 启动兼容逻辑提取为独立模块，避免继续向主入口累积平台特判。
- 引入渐进式 Linux fallback 策略，对至少两类方案做取舍：
  - `DMABUF renderer` 级 fallback
  - 更重的 compositing fallback
  - 明确何时启用、是否始终启用、是否需要“失败后升级”的策略边界
- 为 Linux startup guard 增加 targeted Rust tests，覆盖：
  - `Wayland/AppImage` 命中 fallback
  - 非 Linux 平台不受影响
  - 已存在用户自定义 env 时不粗暴覆盖
  - 多次失败/渐进策略（若采用）行为稳定
- 视实现需要补充 Linux 启动诊断文案或 release guidance，但该文案不得替代默认仓库修复。
- 将本次变更的工程约束写清楚：
  - 新增/修改测试若进入 heavy regression 范围，必须保持 `.github/workflows/heavy-test-noise-sentry.yml` 对 repo-owned noise 的 hard fail 预期不被破坏；
  - 启动逻辑的拆分与新测试文件必须保持 `.github/workflows/large-file-governance.yml` 的 hard gate 可通过，禁止用“临时塞回大文件”方式完成修复。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/代价 | 结论 |
|---|---|---|---|---|
| A | 保持现状，只补 release note / issue 评论中的手工 workaround | 仓库改动最小 | 仍把默认责任转嫁给用户；`AppImage` 默认行为继续崩；无法形成可验证契约 | 不采用 |
| B | 在 Linux 上无条件启用一组重量级渲染禁用 env，直接“全局保守模式”启动 | 止血最快，命中率可能较高 | 影响面过宽；可能误伤原本正常的 Linux 配置；难以解释何时降级与为何降级 | 不采用 |
| C | 新增 Linux-only startup guard，在 `Wayland/AppImage` 等高风险上下文下按最小必要原则启用 fallback，并保留诊断与渐进升级能力 | 兼容性与回归风险可控；可测试、可观察、可继续迭代 | 实现复杂度略高，需要明确条件边界与测试 | **采用** |

采用 `C` 的原因很直接：这类问题不是“多开几个 env 总会好”的脚本式修复，而是启动边界治理问题。仓库需要一个可解释的 Linux-only compatibility contract，而不是新的平台漂移源。

## Capabilities

### New Capabilities

- `linux-appimage-startup-compatibility`: 定义 `Linux + AppImage + Wayland` 启动前兼容 guard、fallback 决策边界、日志诊断与跨平台隔离要求。

### Modified Capabilities

- None.

## Impact

- Backend startup path:
  - `src-tauri/src/lib.rs`
  - 新增或拆分的 Linux startup guard 模块（路径待 design 决定）
- Release/runtime context:
  - `.github/workflows/release.yml`
  - `src-tauri/tauri.conf.json`（若需要补充 Linux bundle/runtime 说明）
- Quality / governance guardrails:
  - `.github/workflows/heavy-test-noise-sentry.yml`
  - `.github/workflows/large-file-governance.yml`
  - `package.json` 中对应检查脚本
- Tests:
  - Linux startup guard Rust tests
  - 如新增前端/集成测试，需验证不会引入 repo-owned heavy noise

## 验收标准

- 在 Linux 高风险启动上下文中，系统 MUST 在主窗口 webview 创建前应用受控 fallback，而不是让 `WebKitGTK/Wry` 直接以未受保护模式进入 `EGL/GBM` 初始化。
- `macOS` 与 `Windows` 的默认启动链路 MUST 保持现状，不得因为本变更新增 Linux fallback env、共享 guard 状态或修改共享 builder 顺序而改变行为。
- Linux startup guard MUST 保留用户显式设置的相关 env 优先级；仓库默认值不得粗暴覆盖用户已有配置。
- 若采用多级 fallback，系统 MUST 记录实际启用的层级与原因；日志中 MUST 能看出 `XDG_SESSION_TYPE / WAYLAND_DISPLAY / DISPLAY / APPIMAGE` 与 fallback 决策结果。
- Rust tests MUST 覆盖 Linux-only 决策边界与用户 env 保留语义；如引入失败计数/渐进升级，必须覆盖状态迁移。
- 本变更新增/修改的测试与日志处理不得引入 repo-owned heavy regression noise；`.github/workflows/heavy-test-noise-sentry.yml` 代表的 hard gate 预期必须保持成立。
- 本变更不得通过扩大现有大文件或新建超阈值文件来完成；若启动逻辑增长，必须按 facade-preserving extraction 方式拆分，并保持 `.github/workflows/large-file-governance.yml` 对 hard debt 的 gate 可通过。
