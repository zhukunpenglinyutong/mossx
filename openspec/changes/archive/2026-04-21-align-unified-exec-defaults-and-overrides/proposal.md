## Why

昨天归档的 `codex-config-flag-boundary-cleanup` 已经收口了私有 feature flags，但它保留了 `unified_exec` 的官方 passthrough 路径。真实用户反馈表明这条剩余路径仍然越过了产品边界：桌面端会在普通设置保存时改写用户全局 `~/.codex/config.toml`，并在 macOS / Linux 上把官方默认应为启用的能力反转成 `false`。

现在需要把 `unified_exec` 从“桌面端接管的全局开关”修正为“官方默认优先、用户显式 override 可选”的模型，否则设置页、runtime reload 与全局 config 之间会继续共享错误的 source-of-truth。

## 目标与边界

### 目标

- 将 `unified_exec` 的产品语义改成 `inherit official default / force enable / force disable` 三态。
- 停止桌面端在普通 `update_app_settings` / restore 流程里回写用户全局 `~/.codex/config.toml`。
- 让显式 override 仅作用于桌面端启动的 Codex runtime，不再依赖静默改写 global config。
- 为已被旧版本写入 `unified_exec` 的用户提供显式 repair 路径，允许“保留 override”或“恢复官方默认”。
- 将外部 config reload 语义与新的 override 模型对齐，避免 inherit 与 explicit override 混淆。

### 边界

- 本提案仅覆盖 Codex `unified_exec` 的设置语义、runtime override、external config reload 和 repair UX。
- 本提案不重做整套 settings 信息架构，也不改动 Claude / Gemini / OpenCode provider 行为。
- 本提案不自动清理所有用户历史 `config.toml`；任何全局文件改动都必须经过显式用户确认。

## 非目标

- 不改变 `collaboration_modes`、`steer`、`collaboration_mode_enforcement` 的 app-local ownership 结论。
- 不把 `unified_exec` 从产品面完全移除。
- 不在本轮扩展更多 official feature passthrough 项。
- 不要求同步修改 OpenAI 官方 CLI 默认值或外部配置格式。

## What Changes

- 将当前布尔型 `experimentalUnifiedExecEnabled` 迁移为三态 unified_exec policy：
  - `inherit official default`
  - `force enable`
  - `force disable`
- 停止在通用 settings save / restore 路径中把 unified_exec 写回 `~/.codex/config.toml`。
- 在 Codex runtime 启动 / refresh 链路中增加 launch-scoped unified_exec override，使显式 override 只影响桌面端拉起的运行时。
- 为 legacy global `unified_exec` entry 增加检测与 repair UX：
  - 保留现有 override
  - 恢复官方默认
- 更新设置页文案与平台说明：
  - Windows 默认跟随官方 `false`
  - macOS / Linux 默认跟随官方 `true`
- 调整 external config reload 语义：
  - inherit 模式可继续消费 official external config
  - explicit override 模式由桌面端策略优先，不再要求 global config mutation

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 保留现有布尔 passthrough，只按平台修正默认值 | 代码改动最小 | 仍然由桌面端接管用户 global config，普通设置保存仍会越权写文件 | 不采用 |
| B | 完全移除桌面端对 unified_exec 的控制，只依赖外部 config | ownership 最干净 | 产品失去可控 override 能力，也无法提供修复旧污染配置的路径 | 不采用 |
| C | 三态 app-local policy + launch-scoped runtime override + 显式 repair action | 与官方默认一致，避免静默污染 global config，同时保留高级用户控制能力 | 需要迁移旧布尔值、改 runtime 启动链路与 repair UX | **采用** |

## Capabilities

### New Capabilities

- `codex-unified-exec-override-governance`: 定义 unified_exec 的官方默认继承、显式 override、launch-scoped 生效与 legacy repair 行为。

### Modified Capabilities

- `codex-external-config-runtime-reload`: external config reload 与 settings restore 需要遵守 unified_exec 的 inherit-vs-override 边界，且普通设置保存不得再回写 official config。

## 验收标准

- 当用户未设置 explicit override 时：
  - Windows MUST 跟随 official default `false`
  - macOS / Linux MUST 跟随 official default `true`
- 桌面端 MUST 提供 unified_exec 三态设置，而不是单一布尔 toggle。
- 任意普通设置保存、恢复或非 repair 流程 MUST NOT 改写 `~/.codex/config.toml` 中的 `unified_exec`。
- 当用户选择 `force enable` 或 `force disable` 时，下一次由桌面端启动或刷新的 Codex runtime MUST 体现该策略，且 MUST NOT 依赖静默修改 global config。
- 当检测到 legacy global `unified_exec` entry 时，桌面端 MUST 提供显式 repair 入口，并且只有用户明确确认后才允许修改 global config。
- external config reload 在 inherit 模式 MUST 继续消费 official external unified_exec；在 explicit override 模式 MUST 以桌面端策略优先。
- 必须补齐针对 settings bridge、runtime launch / reload、repair UX 的最小回归测试与验证命令。

## Impact

- Affected backend/runtime:
  - `src-tauri/src/shared/settings_core.rs`
  - `src-tauri/src/codex/config.rs`
  - `src-tauri/src/shared/codex_core.rs`
  - `src-tauri/src/backend/app_server.rs`
  - `src-tauri/src/types.rs`
- Affected frontend:
  - `src/features/settings/components/SettingsView.tsx`
  - `src/features/settings/hooks/useAppSettings.ts`
  - related i18n strings and repair surface
- Affected specs:
  - `openspec/specs/codex-external-config-runtime-reload/spec.md`
  - new `codex-unified-exec-override-governance`
- Affected validation:
  - targeted `cargo test`
  - targeted `vitest`
  - `npm run lint`
  - `npm run typecheck`
