## Context

`ChatInputBox` 已有 Linux-only IME event guard，但 issue 新反馈说明 `v0.4.11` 与 `v0.4.13` 仍无法中文输入，并且“外部先切换输入法到中文也无法输入中文”。这更接近 WebKitGTK 初始化 IM context 时缺少正确 `GTK_IM_MODULE` / `XMODIFIERS` 环境，而不是前端误消费某个 Enter/Space 事件。

Linux 桌面输入法通常通过环境变量把 GTK/Qt 应用接入 fcitx/ibus。Tauri/Wry 的 WebKitGTK webview 必须在创建前继承这些变量；如果 AppImage/desktop 启动链路没有带上 module env，前端 contenteditable 不会收到正常中文 composition 结果。

## Decision

在 `linux_startup_guard` 中扩展 Linux 启动上下文，记录：

- `GTK_IM_MODULE`
- `QT_IM_MODULE`
- `XMODIFIERS`
- `CLUTTER_IM_MODULE`

新增纯推导函数，根据上下文生成待补齐的 IME env：

- 若已有 `GTK_IM_MODULE`，不改。
- 若已有 `QT_IM_MODULE`，不改。
- 若 `XMODIFIERS` 或 `CLUTTER_IM_MODULE` 指向 `fcitx`，为缺失的 GTK/Qt module 补 `fcitx`。
- 若任一输入法信号指向 `ibus`，为缺失的 GTK/Qt module 补 `ibus`。
- 无可识别信号时不注入。

`apply_launch_env` 在 WebView 创建前应用这些缺失变量，与现有 `WEBKIT_DISABLE_*` fallback 同一启动边界。

## Why This Shape

- 只补缺失值，避免覆盖用户 shell/desktop file 显式配置。
- 不执行外部命令，不读取系统配置文件，避免启动路径变慢或引入不可控依赖。
- 推导函数可单测，避免真实环境变量测试互相污染。
- 与现有 Linux startup guard 复用同一日志和启动时机，不新增平行启动系统。

## Alternatives

- **Frontend fallback**：继续在 `ChatInputBox` 里新增 composition 条件。拒绝，因为新反馈显示 IME 模式本身无法进入，上层 DOM event 未必可用。
- **强制 fcitx**：直接设置 `GTK_IM_MODULE=fcitx`。拒绝，因为会破坏 ibus 用户或已有自定义 module。
- **系统探测**：执行 `pgrep fcitx5` / `ibus` 或查配置文件。拒绝，因为启动路径不应依赖外部命令，也不保证 sandbox/AppImage 环境可用。

## Risks

- 如果用户系统安装的是 fcitx5 但 module 名称仍期望 `fcitx`，当前策略符合 GTK 常见命名；若个别发行版使用不同 module 名称，需要后续基于新证据扩展。
- 如果 desktop launcher 完全清空所有 IME 信号，本变更会按边界选择不盲注，仍可能需要用户提供环境诊断。

## Rollback

回滚 `linux_startup_guard` 中的 IME env 推导和 OpenSpec delta 即可。该变更不写持久数据，不影响 backend API。
