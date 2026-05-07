## Why

Issue `desktop-cc-gui#453` 在 `v0.4.11` 与 `v0.4.13` 仍反馈 Linux Mint + RIME 无法输入中文，且即使在外部先切换到中文输入法，应用内仍无法输入中文。上一轮只收紧 `ChatInputBox` 前端事件拦截，不足以覆盖 WebKitGTK 进程启动时没有继承或初始化 GTK IM module 的场景。

## What Changes

- 在 Linux 启动兼容守卫中增加 WebKitGTK IME 环境补齐：仅在 `GTK_IM_MODULE` / `QT_IM_MODULE` 缺失且存在输入法信号时注入最小默认值。
- 保留用户显式环境变量，仓库默认值只做 additive repair，不覆盖已有 `GTK_IM_MODULE`、`QT_IM_MODULE`、`XMODIFIERS`。
- 将修复限定在 Linux WebKitGTK 启动环境，不修改 Windows/macOS 启动链路，也不继续扩大前端 `ChatInputBox` 事件分支。
- 补充 Rust 单测锁定 fcitx/RIME 与 ibus 推导边界、无信号不注入、显式配置不覆盖。

## 目标与边界

- 目标：让 Linux AppImage/deb 在启动 WebView 前具备可被 GTK/WebKitGTK 识别的 IME module 环境，降低 RIME/fcitx 无法进入中文输入模式的风险。
- 目标：保留上一轮 composer 事件层 guard，但不把本问题继续误判为单纯 React composition event 问题。
- 边界：只修改 `src-tauri/src/linux_startup_guard.rs` 和相关 OpenSpec artifacts。
- 边界：不新增第三方依赖，不扫描系统进程，不执行外部命令，不覆盖用户已有输入法环境。

## 非目标

- 不把 Linux composer 回退为 textarea。
- 不实现用户可配置的输入法策略面板。
- 不承诺一次性覆盖所有 Linux 桌面环境和所有 IME 组合。
- 不修改 macOS / Windows 的启动恢复策略。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `linux-appimage-startup-compatibility`: 增加 Linux WebKitGTK IME 环境补齐要求，保证启动兼容守卫能在 WebView 创建前补齐缺失的 GTK IM module 默认值。

## 技术方案对比与取舍

| 方案 | 做法 | 优点 | 风险 | 结论 |
|---|---|---|---|---|
| A | 继续只修前端 `ChatInputBox` composition/key event | 改动局部 | 新反馈显示外部切中文后仍无效，前端事件层可能根本拿不到 IME 上屏文本 | 不采用 |
| B | Linux 启动时补齐缺失 IME env，保留用户显式配置 | 命中 WebKitGTK/GTK IM context 初始化边界；改动小、可测试、可回滚 | 无法覆盖用户系统本身未安装 fcitx/ibus module | 采用 |
| C | 强制设置 `GTK_IM_MODULE=fcitx` | 对 RIME/fcitx 用户可能有效 | 会破坏 ibus 或自定义用户环境，边界过粗 | 不采用 |

## Impact

- Affected code:
  - `src-tauri/src/linux_startup_guard.rs`
- Affected specs:
  - `openspec/specs/linux-appimage-startup-compatibility/spec.md` via change delta
- Validation:
  - `cargo test --manifest-path src-tauri/Cargo.toml linux_startup_guard`
  - `openspec validate fix-linux-webkitgtk-ime-env --strict --no-interactive`

## 验收标准

- 当 Linux 环境存在 `XMODIFIERS=@im=fcitx` 且 `GTK_IM_MODULE` / `QT_IM_MODULE` 缺失时，启动守卫 MUST 在 WebView 创建前补齐 `fcitx`。
- 当 Linux 环境存在 ibus 信号且 module env 缺失时，启动守卫 SHOULD 补齐 `ibus`。
- 当用户已显式设置任一 module env 时，启动守卫 MUST NOT 覆盖该值。
- 当没有可识别输入法信号时，启动守卫 MUST NOT 盲目注入 module env。
- macOS / Windows 行为不受影响。
