## 1. Backend explicit official config mutation

- [x] 1.1 [P0] 在 `src-tauri/src/codex/config.rs` 增加显式写入 `unified_exec = true/false` helper，并补纯函数单测覆盖“新增、替换、保留其他 feature 行”。
- [x] 1.2 [P0] 在 settings command / daemon RPC 增加 `set_codex_unified_exec_official_override`，返回最新 external status，并补 targeted Rust tests。

## 2. Frontend official config actions

- [x] 2.1 [P0] 在 `VendorSettingsPanel` 增加 official config 状态文案与三个显式按钮，动作后刷新 config/status。
- [x] 2.2 [P0] 移除 unified_exec selector，卡片只保留官方配置状态与三个动作按钮。
- [x] 2.3 [P0] official config action 成功后自动 reload 当前 Codex runtime；无连接会话时显示中性提示，不表现成错误。
- [x] 2.4 [P0] 更新 i18n、service wrapper 与 Vitest。

## 3. Verification

- [x] 3.1 [P0] 运行最小验证集并确认通过：
  - `cargo test --manifest-path src-tauri/Cargo.toml settings_core -- --nocapture`
  - `pnpm vitest run src/features/vendors/components/VendorSettingsPanel.test.tsx src/features/settings/components/SettingsView.test.tsx`
  - `pnpm tsc --noEmit`
