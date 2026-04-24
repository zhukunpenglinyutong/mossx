# Fix Linux AppImage Wayland Startup

## Goal

为 `Linux + AppImage + Wayland` 启动链路补齐仓库内可控的 startup compatibility guard，避免官方 release artifact 在主窗口 webview 创建前因 `EGL/GBM/DMABUF` 初始化失败直接 abort，同时保持 `macOS` 与 `Windows` 正常链路不回归。

## Requirements

- 新增 Linux-only startup guard，在高风险上下文下于 webview 创建前注入最小必要 fallback。
- 保留用户显式设置的 `WEBKIT_*` 环境变量优先级，不做粗暴覆盖。
- 复用现有 `bootstrap_mark_renderer_ready` 信号，为 Linux 提供未就绪启动计数与渐进升级能力。
- 保持现有 Windows `startup_guard` 语义不变，macOS 启动路径不受影响。
- 补齐 Rust 定向测试与启动诊断日志。
- 变更不得破坏 `heavy-test-noise` 与 `large-file-governance` 两类门禁。

## Acceptance Criteria

- [ ] Linux `Wayland + AppImage` 高风险上下文会在 webview 创建前应用第一层兼容 fallback。
- [ ] 连续未就绪 Linux 启动会触发第二层降级，并在 renderer-ready 后重置状态。
- [ ] 用户自定义 `WEBKIT_*` env 优先生效。
- [ ] macOS 与 Windows 正常链路行为保持不变。
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` 通过。
- [ ] `npm run lint`、`npm run typecheck`、`npm run check:large-files` 通过。

## Technical Notes

- 变更关联 OpenSpec change：`fix-linux-appimage-wayland-startup`
- 优先采用 Linux 独立模块，避免把多平台 guard 继续堆进单文件。
- 诊断日志至少包含 `XDG_SESSION_TYPE / WAYLAND_DISPLAY / DISPLAY / APPIMAGE / APPDIR` 与实际 fallback 决策。
