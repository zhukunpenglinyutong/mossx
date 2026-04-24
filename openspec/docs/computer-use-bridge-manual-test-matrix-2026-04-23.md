# Computer Use Bridge 手测矩阵

## 目的

补齐 `add-codex-computer-use-plugin-bridge` 的 `E.3` 人工验证证据，确认：

- `Windows` 固定呈现 `unsupported`
- `macOS` 能按本机真实安装态呈现 `ready` 或 `blocked`
- 现有设置 / Codex 主流程未被 `Computer Use Bridge` 污染

## 已有自动化覆盖

- `src/services/tauri.test.ts`
- `src/features/computer-use/components/ComputerUseStatusCard.test.tsx`
- `src-tauri/src/computer_use/mod.rs` 内部测试

这些测试已经覆盖 command mapping、状态优先级、false-positive `ready` guard、Windows unsupported surface 与基础 UI 文案。

## 人工验证记录

### Windows

- 日期：2026-04-23
- 证据来源：用户补充截图
- 结果：通过

观察到的 UI 真值：

- `status`: `不支持`
- `platform`: `windows`
- `codexAppDetected`: `否`
- `pluginDetected`: `否`
- `pluginEnabled`: `否`
- blocked reason: `当前桌面平台不受支持。`
- guidance: `请在受支持的平台上使用官方 Codex App。`

结论：

- `Windows` 路径正确收敛到 `unsupported`
- UI 未出现“去启用 / 去安装后即可使用”的误导性动作
- 与 `computer-use-platform-adapter` / `computer-use-availability-surface` spec 一致

### macOS

- 日期：2026-04-23
- 证据来源：用户补充截图
- 结果：通过

观察到的 UI 真值：

- `status`: `被阻塞`
- `platform`: `macos`
- `codexAppDetected`: `是`
- `pluginDetected`: `是`
- `pluginEnabled`: `是`
- blocked reasons:
  - `当前宿主尚未验证是否能安全桥接官方 helper。`
  - `必需的系统权限尚未验证。`
  - `始终允许的应用审批尚未验证。`
- guidance:
  - `请确认当前宿主能安全桥接官方 helper。`
  - `请授予或确认 Screen Recording 与 Accessibility 权限。`
  - `请检查 Codex Computer Use 设置中的始终允许应用列表。`

结论：

- `macOS` 在 plugin 已检测且已启用时，没有误报 `ready`
- `helper_bridge_unverified` / `permission_required` / `approval_required` 正确收敛为 `blocked`
- 与 false-positive `ready` guard spec 一致
- 从截图可见状态面板本身工作正常，未见对其他设置主流程的干扰

## 当前结论

- `Windows` 与 `macOS` 人工验证均已补齐
- `Windows` 正确固定为 `unsupported`
- `macOS` 在未验证 helper/权限/approval 时正确保持 `blocked`
- `E.3` 已完成，可进入归档
