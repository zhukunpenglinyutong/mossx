## Why

Arch Linux 用户反馈最新版 AppImage 无法启动，错误集中在 Mesa/EGL 加载 Wayland 符号时：

```text
/usr/lib/libEGL_mesa.so.0: error: symbol lookup error: undefined symbol: wl_fixes_interface
Could not create surfaceless EGL display: EGL_BAD_ALLOC. Aborting...
```

用户侧验证显示：解包 AppImage 后删除 `squashfs-root/usr/lib/libwayland-*`，再运行 `AppRun` 可以启动。这说明问题不是现有 Linux startup guard 覆盖的 WebKitGTK runtime fallback，而是 AppImage 内 bundled `libwayland-*` 与 Arch 系统 Mesa/EGL ABI 不兼容。系统 Mesa 从 `/usr/lib` 加载，却优先链接了 AppImage 内较旧或不匹配的 Wayland client 库，导致符号缺失。

本变更要把这个用户 workaround 收敛为仓库发布流程的一部分：Linux AppImage 构建完成后自动剔除 bundled `libwayland-*`，重新打包并重新签名，避免让用户手工解包。

### 后续验证记录

- 2026-05-15：`desktop-cc-gui#379` 对应问题已确认修复方向正确。根因不是运行时 `WEBKIT_*` fallback 缺失，而是 AppImage 内 bundled `libwayland-*` 与 Arch Wayland/Mesa/EGL ABI 混用；将 `libwayland-*` pruning 固化到 AppImage packaging 后，问题闭环。

## 目标与边界

### 目标

- 修复 Linux AppImage 在 Arch Linux / Wayland / Mesa 环境下因 bundled `libwayland-*` ABI 冲突导致的启动失败。
- 将修复限定在 Linux AppImage artifact post-process，不影响 macOS `.app/.dmg`、Windows NSIS/MSI、Rust 启动 guard 或前端 runtime。
- 保证 release workflow 中重新打包后的 AppImage 会重新生成 updater signature，避免发布签名与 artifact 内容不一致。
- 提供可测试的构建脚本逻辑，明确只删除 `usr/lib/libwayland-*`，不误删其他系统库。

### 边界

- 不移除所有 Linux bundled libraries；只处理已确认冲突的 `usr/lib/libwayland-*`。
- 不改变 `WEBKIT_DISABLE_DMABUF_RENDERER` / `WEBKIT_DISABLE_COMPOSITING_MODE` startup guard 策略。
- 不在运行时动态删除 AppImage 内容；修复必须发生在发布 artifact 阶段。
- 不新增第三方 npm 依赖；使用 Node 内置模块与外部 `appimagetool`。

## What Changes

- 新增 AppImage post-process 脚本：
  - 在临时目录中执行 `<AppImage> --appimage-extract`。
  - 删除 `squashfs-root/usr/lib/libwayland-*`。
  - 使用 `appimagetool` 重新打包到原 AppImage 路径。
  - 若重打包失败，恢复原始 AppImage，避免留下半成品。
- 更新 Linux release workflow：
  - 下载 `appimagetool`。
  - `tauri build --bundles appimage` 后执行 Wayland library pruning。
  - 删除旧 `.sig` 并重新签名修复后的 AppImage。
- 更新本地 Linux build 脚本：
  - `npm run build:linux-*` 生成 AppImage 后执行同一 pruning 脚本。
- 新增 Node targeted tests：
  - 验证 pruning predicate 只命中 `usr/lib/libwayland-*`。
  - 验证 CLI 参数缺失时 fail fast。
  - 验证 repack failure 会尝试恢复原始 artifact。

## 技术方案对比

| 方案 | 描述 | 优点 | 风险 | 结论 |
|---|---|---|---|---|
| A | 只把用户 workaround 写进 release note | 零代码改动 | 默认 AppImage 仍然崩；把仓库责任转嫁给用户 | 不采用 |
| B | 运行时设置更多 `WEBKIT_*` / EGL env | 不需要重打包 | 对 ABI 符号缺失不对症；动态库加载已失败时来不及 | 不采用 |
| C | AppImage 构建后删除 bundled `libwayland-*` 并重打包签名 | 命中根因；Linux-only；用户无感 | 需要 appimagetool 与重新签名流程 | 采用 |
| D | 禁止 AppImage bundler 打包大量系统库 | 长期更干净 | Tauri/linuxdeploy 配置面有限，容易误伤其他必要库 | 后续观察 |

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `linux-appimage-startup-compatibility`: 增加 Linux AppImage artifact 必须剔除 bundled Wayland client libraries 的发布时兼容要求。

## 验收标准

- Linux release artifact MUST NOT contain `usr/lib/libwayland-*` inside the final AppImage.
- Linux release workflow MUST sign the pruned AppImage, not the pre-prune AppImage.
- macOS and Windows release jobs MUST NOT call the AppImage pruning script.
- Local Linux `build:linux-x64` / `build:linux-arm64` MUST run the same pruning step after AppImage build.
- Pruning script MUST fail with a clear error when `appimagetool` is unavailable or repack fails.
- Pruning script MUST restore the original AppImage if repack fails after deleting the target path.
- Tests MUST cover the library selection boundary and failure recovery behavior.
- `desktop-cc-gui#379` MUST be recorded as an affected-user validation reference once the AppImage packaging fix is confirmed.

## Impact

- Release/build:
  - `.github/workflows/release.yml`
  - `scripts/build-platform.mjs`
  - `scripts/prune-appimage-wayland-libs.mjs`
  - `scripts/prune-appimage-wayland-libs.test.mjs`
- Specs:
  - `openspec/changes/fix-linux-appimage-wayland-library-pruning/specs/linux-appimage-startup-compatibility/spec.md`
- No frontend runtime impact.
- No Windows/macOS artifact impact.
