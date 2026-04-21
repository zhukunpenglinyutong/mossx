## Why

issue #377 想解决的核心不是“支持任意 shell 命令”，而是让用户能稳定地告诉桌面端：Codex 到底该用哪个可执行文件、带哪些额外参数启动。当前系统实际上已经具备这两类能力的底座：global `codexBin` / `codexArgs` 与 workspace `codex_bin` / `codexArgs`，但设置表达方式、优先级可见性和运行前校验仍然太弱，用户很难判断 GUI 最终会执行什么。

因此最稳的方向不是再造一套复杂启动系统，而是把现有能力产品化：明确“Launch Configuration”的概念，补足 preview / doctor / 继承可见性，同时保证未修改设置的用户完全不受影响。

## 目标与边界

### 目标

- 用最小改动把现有 `codexBin` / `codexArgs` 与 workspace overrides 产品化为可理解的 Codex Launch Configuration。
- 明确展示 global default、workspace override、worktree inherit 的优先级与实际生效结果。
- 提供 preview / validate / doctor 三类门禁，让用户在真正影响下次启动前就能看到 effective launch context。
- 保持当前正常功能稳定：未修改设置的用户，启动行为 MUST 与当前版本一致。
- 保持当前 connected Codex runtime 稳定：普通保存 MUST 只影响下次启动，不得打断当前会话。

### 边界

- Phase 1 只覆盖 `executable + arguments`，不引入 `environment` 编辑能力。
- Phase 1 不新增即时 `Apply` 能力，不做 active runtime replacement。
- Phase 1 不引入新的 persisted settings schema；优先复用现有 `codexBin`、`codexArgs`、workspace `codex_bin`、workspace `codexArgs`。
- Phase 1 不修改 external config reload 语义，也不改写用户 `~/.codex/config.toml`。
- Phase 1 不扩展到 Claude / Gemini / OpenCode。

## 非目标

- 不支持 raw shell command、pipeline、redirection、subshell 作为 primary UX。
- 不重做整套 SettingsView 架构。
- 不把 `codexHome` 合并进 Launch Configuration。
- 不做 remote backend parity 扩展；remote 现有行为保持不变即可。

## What Changes

- 将 Codex 设置区的核心概念收口为 `Launch Configuration`，明确区分：
  - default executable path
  - default additional arguments
  - workspace-level executable override
  - workspace-level args override
- 新增 effective preview，展示：
  - resolved executable
  - wrapper kind
  - user arguments
  - injected internal suffix（如 `-c ...` 与 `app-server`）
- 复用并增强现有 `codex_doctor`，使其与 preview 共享同一套 launch resolution。
- 在 workspace 配置区明确 inherit / override 关系，尤其是 worktree 从 parent workspace 的继承路径。
- 保持保存行为为 next-launch only：
  - 保存后更新持久化配置
  - 不自动重启当前 connected Codex runtime
  - 不改变未触碰该配置的用户现有启动行为

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 新增单个 `custom command` 字符串文本框，直接拼接执行 | UI 变化最直观 | shell 语义不确定，难做 preview/doctor，安全边界差，容易影响现有稳定链路 | 不采用 |
| B | 保守版 Launch Configuration：复用现有 `bin + args` 字段，补 preview / doctor / 继承可见性 | 改动面最小，兼容成本最低，对现有正常功能影响最小 | 表达力有限，Phase 1 不支持 env 与即时 Apply | **采用** |
| C | 一步到位上完整 Launch Profile：`executable + args + env + apply + reload boundary` | 长期能力最完整 | 会把设置增强变成 runtime 生命周期重构，回归面明显扩大 | 本期不采用 |

## Capabilities

### New Capabilities

- `codex-launch-profile-settings`: 定义 Codex Launch Configuration 在 settings 中的编辑、预览、校验与“不影响当前正常功能”的门禁行为。
- `codex-launch-profile-resolution`: 定义 backend 对现有 `bin + args` 启动配置的解析、继承、预览与 doctor 对齐语义。

### Modified Capabilities

- （无）

## 验收标准

- 设置页 MUST 提供清晰的 Codex Launch Configuration 编辑能力，但 Phase 1 只包含 `executable` 与 `arguments`。
- 用户保存 Launch Configuration 后，下一次由桌面端启动的 Codex runtime MUST 使用该配置。
- workspace override MUST 继续高于 app-global defaults；worktree 在自身未设置时 MUST 继承 parent workspace，再回退到 app-global。
- preview 与 doctor MUST 展示相同的 resolved executable / wrapper kind / injected suffix 语义。
- 普通 `Save` MUST NOT 打断当前已连接的 Codex runtime。
- 未修改该配置的用户，其启动行为 MUST 与当前版本保持一致，不得因本能力引入功能回退。
- Phase 1 MUST NOT 引入新的 external config 写入，不得改写 `~/.codex/config.toml`。
- 质量门禁至少覆盖：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - 受影响 launch resolution / settings flow 的 targeted tests

## Impact

- Frontend:
  - `src/features/settings/components/SettingsView.tsx`
  - `src/features/settings/components/settings-view/sections/CodexSection.tsx`
  - `src/features/settings/hooks/useAppSettings.ts`
  - `src/features/workspaces/hooks/useWorkspaces.ts`
  - `src/services/tauri.ts`
  - `src/types.ts`
  - i18n locale files
- Backend:
  - `src-tauri/src/backend/app_server.rs`
  - `src-tauri/src/backend/app_server_cli.rs`
  - `src-tauri/src/settings/mod.rs`
  - `src-tauri/src/types.rs`
  - `src-tauri/src/codex/args.rs`
- Contracts:
  - additive preview contract
  - `codex_doctor` result alignment
- Specs:
  - new `codex-launch-profile-settings`
  - new `codex-launch-profile-resolution`
