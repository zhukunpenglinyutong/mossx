# Codex Unified Exec Override Contract

## 适用范围

- `src-tauri/src/types.rs`
- `src-tauri/src/shared/settings_core.rs`
- `src-tauri/src/codex/config.rs`
- `src-tauri/src/codex/args.rs`
- `src-tauri/src/settings/mod.rs`
- `src/services/tauri.ts`
- `src/features/settings/hooks/useAppSettings.ts`
- `src/features/settings/components/SettingsView.tsx`

## 核心原则

`unified_exec` 是 official runtime capability，不是 desktop-local bool flag。

- 桌面端对外只暴露 official config actions，不再暴露 selector
- 官方 `~/.codex/config.toml` 只允许被显式 official config action lane 修改
- 普通 settings save / restore 不得再改写 global config

## Settings Contract

### Rust / TS settings 字段

- 新字段：`codexUnifiedExecPolicy`
- 兼容值仍存在于 Rust / TS contract 中，但当前产品行为必须归一化为 `inherit`

### Legacy migration

- legacy 字段 `experimentalUnifiedExecEnabled` 只用于兼容旧 settings 输入
- 迁移规则：
  - 任意值 -> `inherit`
- 迁移完成后不得再把 legacy 字段写回 settings.json / frontend payload

## Runtime Contract

当前产品路径不再暴露 desktop-local unified_exec override。

- runtime 默认跟随：
  - external/global config 中的显式值
  - official platform default
- official config action 完成后，桌面端 SHOULD 触发 runtime reload
- 若当前没有已连接 Codex 会话，提示必须为中性结果，而不是错误

## Global Config Contract

### Allowed reads

- 允许检测 external `config.toml` 中是否存在显式 `unified_exec`
- 允许读取显式值 `true / false / invalid`

### Forbidden writes

- 禁止在以下路径中写 global config：
  - `get_app_settings`
  - `update_app_settings`
  - settings rollback / restore
  - 普通 settings save

### Allowed writes

- 允许的 global config mutation 仅包括：
  - 显式写入 `[features].unified_exec = true`
  - 显式写入 `[features].unified_exec = false`
  - 显式删除 `[features].unified_exec` 以恢复官方默认
- 所有 mutation 都必须来自 settings UI 中的独立 official config action lane
- selector / 普通 settings save / restore 不得承担这些 mutation

## Frontend Contract

### Settings UI

- “后台终端”必须显示为官方配置卡片，不再暴露 tri-state selector
- UI 必须显示 official default 的平台说明
- UI 必须额外显示 official config 当前状态与显式 action buttons
- action buttons 固定为：
  - 启用
  - 停用
  - 跟随官方默认
- reload 成功但无连接会话时，界面不得拼接 `failed` / `applied` 前缀制造误解

### Command bridge

- 新 command:
  - `get_codex_unified_exec_external_status`
  - `restore_codex_unified_exec_official_default`
  - `set_codex_unified_exec_official_override`
- payload:
  - `configPath: string | null`
  - `hasExplicitUnifiedExec: boolean`
  - `explicitUnifiedExecValue: boolean | null`
  - `officialDefaultEnabled: boolean`

## 验证矩阵

- Rust:
  - legacy migration
  - 普通 settings save 不写 global config
  - external status / repair helper
  - explicit global config write helper
- Frontend:
  - hook 归一化 legacy bool -> inherit
  - vendor settings 渲染 official default + official config actions
  - explicit official config action 会触发 runtime reload
  - no-session reload 文案不带错误前缀

## 变更触发器

下次只要改到以下任一项，就必须重新审视本 contract：

- `AppSettings` 字段结构
- `src/services/tauri.ts` settings 相关 command
- vendor settings UI
- global Codex config repair 流程
