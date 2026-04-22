# Computer Use Bridge Backend Contract

## Scope / Trigger

- 适用文件：
  - `src-tauri/src/computer_use/mod.rs`
  - `src-tauri/src/computer_use/platform/mod.rs`
  - `src-tauri/src/computer_use/platform/macos.rs`
  - `src-tauri/src/computer_use/platform/windows.rs`
  - `src-tauri/src/command_registry.rs`
  - `src-tauri/src/lib.rs`
- 触发条件：
  - 新增或修改 `get_computer_use_bridge_status`
  - 修改 Computer Use availability status / blocked reason / guidance contract
  - 修改 `macOS` / `Windows` 平台分流

## Signatures

### Tauri command

```rust
#[tauri::command]
pub(crate) async fn get_computer_use_bridge_status() -> Result<ComputerUseBridgeStatus, String>
```

### Core types

```rust
enum ComputerUseAvailabilityStatus {
    Ready,
    Blocked,
    Unavailable,
    Unsupported,
}

enum ComputerUseBlockedReason {
    PlatformUnsupported,
    CodexAppMissing,
    PluginMissing,
    PluginDisabled,
    HelperMissing,
    HelperBridgeUnverified,
    PermissionRequired,
    ApprovalRequired,
    UnknownPrerequisite,
}

enum ComputerUseGuidanceCode {
    UnsupportedPlatform,
    InstallCodexApp,
    InstallOfficialPlugin,
    EnableOfficialPlugin,
    VerifyHelperInstallation,
    VerifyHelperBridge,
    GrantSystemPermissions,
    ReviewAllowedApps,
    InspectOfficialCodexSetup,
}
```

## Contracts

### Runtime behavior

- command MUST 使用 `spawn_blocking` 执行磁盘探测，不得在 async runtime 上直接跑 bundle/cache/config 读取。
- Phase 1 MUST 维持 `status-only`：
  - 允许读取 `~/.codex/config.toml`
  - 允许读取 plugin cache / manifest / `.mcp.json`
  - 允许解析 helper 路径并验证文件存在
  - 禁止调用官方 helper
  - 禁止写回官方 Codex 资产

### Status precedence

状态优先级必须固定为：

1. `unsupported`
2. `unavailable`
3. `blocked`
4. `ready`

### Platform contract

- `macOS`：
  - MUST 探测官方 `Codex.app`
  - MUST 探测 bundled marketplace / plugin manifest / helper descriptor
  - MUST 将 `.mcp.json` 中的 `command` 按 `descriptor dir + cwd` 解析真实 helper 路径
- `Windows`：
  - MUST 固定返回 `unsupported`
  - MUST NOT 尝试解析任何 `macOS` bundle/helper 路径

### Ready gate

只有在以下条件全部满足时才允许返回 `ready`：

- 平台受支持
- `Codex.app` 已检测到
- 官方 plugin 已检测到
- 官方 plugin 已启用
- helper 已检测到
- helper bridgeability 已验证
- 系统权限已验证
- app approval 已验证

## Validation & Error Matrix

| Condition | Expected status | Expected reason |
|---|---|---|
| 非 `macOS`/`Windows` 支持平台 | `unsupported` | `platform_unsupported` |
| `Codex.app` 缺失 | `unavailable` | `codex_app_missing` |
| plugin 缺失 | `unavailable` | `plugin_missing` |
| plugin 已安装但 disabled | `blocked` | `plugin_disabled` |
| helper 路径无法解析或目标不存在 | `blocked` | `helper_missing` |
| helper 存在但 bridgeability 未验证 | `blocked` | `helper_bridge_unverified` |
| 权限未验证 | `blocked` | `permission_required` |
| app approvals 未验证 | `blocked` | `approval_required` |

## Good / Base / Bad Cases

### Good

- `macOS` 下已识别到官方 `Codex.app`、plugin、helper 真实路径，但仍保守返回 `blocked`
- `Windows` 下立即返回 `unsupported`，不继续做 bundle 探测

### Base

- 只读取官方状态，不触发任何 helper 执行

### Bad

- 读取到 `.mcp.json` 的相对路径后直接 `PathBuf::from(command).exists()`
- 在 command 中直接执行大量阻塞 IO
- 为了“看起来可用”而在权限/approval 未确认时返回 `ready`

## Tests Required

- `cargo test --manifest-path src-tauri/Cargo.toml computer_use -- --nocapture`
- 必测断言：
  - status precedence
  - missing app / missing plugin / plugin disabled
  - false-positive ready guard
  - relative helper path resolution against `.mcp.json` `command + cwd`

## Wrong vs Correct

### Wrong

```rust
snapshot.helper_path = parse_helper_command_path(&helper_descriptor_path);
snapshot.helper_present = snapshot
    .helper_path
    .as_ref()
    .map(PathBuf::from)
    .is_some_and(|path| path.exists());
```

问题：把 `.mcp.json` 里的相对 `command` 当成绝对路径判断，容易误报 `helper_missing`。

### Correct

```rust
let command = PathBuf::from(server.get("command").and_then(|value| value.as_str())?);
let working_directory = descriptor_dir.join(cwd);
let resolved_path = normalize_path(working_directory.join(command));
```

先按 `descriptor dir + cwd` 解析，再检查 helper 是否存在。
