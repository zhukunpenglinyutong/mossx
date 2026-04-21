## Why

当前桌面端会把一组语义不同的 Codex 相关开关统一双向同步到 `~/.codex/config.toml` 的 `[features]` 表中，导致项目私有开关、官方 CLI 配置项和历史遗留字段混在一起。结果是用户会看到已经不再属于官方当前配置面的字段被持续写回，桌面端自身的 settings 边界也被外部配置文件反向污染。

这个问题已经形成真实用户缺陷：`collab`、`collaboration_modes`、`steer`、`collaboration_mode_enforcement` 会被自动写入 `config.toml`，而它们中只有 `unified_exec` 还与官方当前配置面保持一致。现在需要把 ownership 边界收紧，否则后续 runtime reload、协作模式、模式 enforcement 都会继续建立在错误的 source-of-truth 上。

## 目标与边界

### 目标

- 收敛 Codex 相关配置的 ownership boundary，区分：
  - app-local settings
  - official Codex external config passthrough
  - historical/dead flags
- 停止桌面端把私有开关自动写入或读回 `~/.codex/config.toml`。
- 保留当前真实还在使用的本地能力：
  - collaboration mode UI gating
  - steer queue/fusion behavior
  - collaboration mode runtime enforcement
- 仅保留 `unified_exec` 作为显式官方配置透传项。
- 让 proposal/design/tasks/spec 进入可直接实现状态，而不是停留在问题描述。

### 边界

- 本提案仅覆盖 Codex 相关 config ownership、runtime reload 边界、相关 settings UI 与 runtime contract。
- 本提案不改变 Claude、Gemini、OpenCode 的 provider 行为。
- 本提案不重做整套 settings 信息架构，只收敛这五个字段的边界与文案。
- 本提案不要求自动清理用户历史 `config.toml` 中已经存在的旧字段。

## 非目标

- 不在本轮重构 Codex 全部 settings 持久化模型。
- 不在本轮改变 collaboration mode、steer、mode enforcement 的功能语义。
- 不在本轮把 `unified_exec` 也完全移出 external config；它继续作为官方配置透传项存在。
- 不在本轮自动删除用户现有 `config.toml` 里的历史字段，避免对用户外部文件做静默破坏性改写。

## What Changes

- 停止将以下桌面端私有或遗留字段读写同步到 `~/.codex/config.toml`：
  - `collab`
  - `collaboration_modes`
  - `steer`
  - `collaboration_mode_enforcement`
- 将这些字段重新定义为 app-local ownership：
  - `experimentalCollaborationModesEnabled`
  - `experimentalSteerEnabled`
  - `codexModeEnforcementEnabled`
- 将 `experimentalCollabEnabled` 视为 dead flag：
  - 不再参与 external config 同步
  - 从产品能力面退出，避免“多代理”设置与实际行为脱节
- 保留 `experimentalUnifiedExecEnabled` 对 `unified_exec` 的显式透传，但必须在文案与实现上标明其属于 official Codex config。
- 收敛设置页文案与说明：
  - 私有开关不再宣称“存储在默认 CODEX_HOME config.toml 中”
  - `unified_exec` 单独标注为 external Codex config passthrough
- 让 runtime reload 与 app settings 恢复逻辑忽略历史私有 feature flags，避免外部文件继续反向覆盖桌面端 settings。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 保持现状，只修 issue 文案 | 改动最小 | 继续污染 `config.toml`，source-of-truth 仍错误 | 不采用 |
| B | 五个字段全部从 external config 同步中移除 | 边界最干净 | `unified_exec` 失去官方透传入口，和官方配置面脱节 | 不采用 |
| C | 私有字段退回 app-local，死字段退出产品面，`unified_exec` 单独保留为官方透传项 | ownership 清晰，兼顾兼容性和用户预期 | 需要改 settings 文案、Rust bridge、测试 | **采用** |

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `codex-external-config-runtime-reload`: external config reload 与 settings 恢复逻辑需要遵守 official-vs-private ownership boundary。
- `codex-chat-canvas-collaboration-mode`: collaboration mode UI gating 需要只受 app-local settings 控制，不再被 external feature flags 反向覆盖。
- `codex-collaboration-mode-runtime-enforcement`: mode enforcement toggle 需要保留为本地 runtime safety 开关，而不是 external config feature flag。

## 验收标准

- 更新任意 app-local 私有开关后，桌面端 MUST NOT 再向 `~/.codex/config.toml` 写入：
  - `collab`
  - `collaboration_modes`
  - `steer`
  - `collaboration_mode_enforcement`
- 读取 app settings 或执行 runtime reload 时，桌面端 MUST 忽略上述四个历史 feature flags，不得再用它们反向覆盖本地 settings。
- `experimentalCollabEnabled` 不得继续作为“多代理”有效能力暴露给用户；若保留兼容字段，也必须不再参与真实行为与 external config 同步。
- `experimentalCollaborationModesEnabled` 关闭时：
  - collaboration selector 不显示
  - collaboration 快捷键不注册
  - 该行为 MUST 仅由 app-local settings 控制
- `experimentalSteerEnabled` 仍继续控制 queued send / same-run continuation 行为，且不依赖 `config.toml` 中的 `steer`。
- `codexModeEnforcementEnabled` 仍继续控制 plan/code runtime enforcement 行为，且不依赖 `config.toml` 中的 `collaboration_mode_enforcement`。
- `experimentalUnifiedExecEnabled` 如继续存在，必须只映射 `unified_exec`，并在 UI 文案上明确其属于 official Codex config passthrough。
- 必须补齐针对 settings bridge、runtime reload、settings UI 的最小回归测试与验证命令。

## Impact

- Affected backend/runtime:
  - `src-tauri/src/codex/config.rs`
  - `src-tauri/src/shared/settings_core.rs`
  - `src-tauri/src/codex/session_runtime.rs`
  - `src-tauri/src/shared/codex_core.rs`
- Affected frontend:
  - `src/features/settings/components/SettingsView.tsx`
  - `src/features/settings/hooks/useAppSettings.ts`
  - `src/features/app/hooks/useMenuAcceleratorController.ts`
  - `src/features/collaboration/hooks/useCollaborationModes.ts`
- Affected validation:
  - settings / runtime bridge tests
  - collaboration mode UI gating tests
  - `npm run lint`
  - `npm run typecheck`
  - targeted `vitest` / `cargo test`
