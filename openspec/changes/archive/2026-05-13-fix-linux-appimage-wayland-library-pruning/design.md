## Context

现有 `src-tauri/src/linux_startup_guard.rs` 已经处理 `Linux + Wayland + AppImage` 下 WebKitGTK renderer fallback：在创建 webview 前按条件设置 `WEBKIT_DISABLE_DMABUF_RENDERER=1`，连续未就绪时再追加 compositing fallback。这条链路解决的是 WebKitGTK 渲染初始化兼容问题。

本次 Arch Linux 报错不同：`/usr/lib/libEGL_mesa.so.0` 在符号解析时找不到 `wl_fixes_interface`。系统 Mesa/EGL 与 AppImage 内 bundled `libwayland-*` 混用，属于 dynamic loader ABI 边界问题。用户验证删除 AppImage 内 `usr/lib/libwayland-*` 后可启动，说明正确修复点在 artifact packaging，而不是 Rust startup guard。

## Decisions

### Decision 1: 修复发生在 AppImage post-process，不进入 runtime startup guard

采用：

- Tauri 生成 AppImage 后，仓库脚本解包并删除 `squashfs-root/usr/lib/libwayland-*`。
- 重新打包生成同名 AppImage。

原因：

- ABI 冲突发生在动态库解析层，startup guard 设置 env 不能可靠改变已经打包进 AppImage 的库优先级。
- post-process 后用户直接运行官方 AppImage 即可修复，不需要手动解包。

### Decision 2: 只删除 `usr/lib/libwayland-*`

采用：

- 删除范围限定为 extracted AppDir 下的 `usr/lib/libwayland-*`。
- 不删除 `libEGL*`、`libgbm*`、`libdrm*`、GTK/WebKitGTK 相关库。

原因：

- 用户 workaround 的最小有效集合就是 `libwayland-*`。
- AppImage 内其他库可能是 ubuntu runner 上为兼容旧发行版所需的依赖，扩大删除面会增加回归风险。

### Decision 3: release workflow 重新签名 pruned artifact

采用：

- `tauri build --bundles appimage` 之后先 prune。
- 删除旧 `.sig`。
- 对 prune 后的 AppImage 执行 `tauri signer sign`。

原因：

- AppImage 内容变更后旧 signature 必然失效。
- updater metadata 读取 `.AppImage.sig`，必须保证 signature 与最终上传 artifact 匹配。

### Decision 4: 使用外部 `appimagetool`，不引入 npm 依赖

采用：

- CI 下载官方 `appimagetool-x86_64.AppImage` 到 `.tools/appimagetool`。
- 脚本通过 `--appimagetool` 或 `APPIMAGETOOL` 定位工具。
- 设置 `APPIMAGE_EXTRACT_AND_RUN=1`，降低 CI FUSE 依赖。

原因：

- AppImage 重新打包是外部 native tool 责任，没必要引入 JS 打包库。
- `appimagetool` 是 AppImage 生态标准工具，维护边界清晰。

### Decision 5: 失败恢复优先保护原始 artifact

采用：

- 重打包前把原 AppImage 移到临时 backup。
- 删除目标路径后执行 `appimagetool`。
- 如果重打包失败且 backup 存在，恢复原始 AppImage，再抛出清晰错误。

原因：

- 本地构建失败时不应留下空 artifact 或半成品。
- CI 应 fail fast，但错误原因必须可诊断。

## Risks / Trade-offs

- [Risk] 某些发行版缺少系统 `libwayland-*`。  
  Mitigation: 目标发行版的 WebKitGTK/Mesa 栈本身依赖系统 Wayland；AppImage 混用 bundled Wayland 才是当前冲突根因。若后续出现旧发行版缺库，可独立评估兼容矩阵。

- [Risk] `appimagetool` 下载源不可用。  
  Mitigation: release workflow fail fast；本地构建也明确报 appimagetool 缺失，不静默发布未修复 artifact。

- [Risk] Tauri 后续 bundler 不再打包 `libwayland-*`，脚本无文件可删。  
  Mitigation: 脚本允许 zero-match 并输出明确日志，保持幂等。

## Migration Plan

1. 新增 OpenSpec delta，固化 Linux AppImage Wayland library pruning contract。
2. 新增 `scripts/prune-appimage-wayland-libs.mjs` 与 targeted tests。
3. 接入 `scripts/build-platform.mjs` 的 Linux 分支。
4. 接入 `.github/workflows/release.yml` 的 Linux job，并在 prune 后重新签名。
5. 运行 targeted Node tests 与 typecheck。
6. 后续由 Arch Linux 用户验证官方 AppImage 可直接启动。

Rollback:

- 回退 workflow 和 build-platform 的 pruning 调用，即恢复原 Tauri AppImage artifact。
- 删除新增脚本与 spec delta。
- 不涉及用户数据迁移。

## Open Questions

- 是否要把 `libwayland-client.so*`、`libwayland-cursor.so*`、`libwayland-egl.so*` 的最终清单写入 release note？首版倾向只在构建日志记录，避免把内部实现细节暴露为用户操作步骤。
- 是否需要扩展到 `.deb` / `.rpm`？当前问题发生在 AppImage bundled library，不扩展。
