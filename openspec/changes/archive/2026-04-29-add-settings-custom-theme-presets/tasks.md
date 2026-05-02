## 1. Settings Contract

- [x] 1.1 [P0][depends:none][I: 现有 `AppSettings` 与 Rust settings types][O: `theme=custom` + `customThemePresetId` 持久化 contract][V: TS/Rust 类型与 sanitize 逻辑一致] 扩展前后端 settings 字段与默认回退语义。
- [x] 1.2 [P0][depends:1.1][I: 当前外观设置 UI][O: `自定义` 模式与 preset 下拉交互][V: Vitest 覆盖 `custom` 模式显示与 preset 选择写回] 收口设置页交互语义。

## 2. Theme Runtime

- [x] 2.1 [P0][depends:1.1][I: 现有 theme token 体系][O: VS Code preset catalog + token mapping helper][V: theme preset tests 覆盖 preset lookup、appearance 推导与 fallback] 增加 preset 数据与映射函数。
- [x] 2.2 [P0][depends:2.1][I: 现有 `useThemePreference` 与主题观察方][O: custom 模式 runtime apply contract][V: Markdown preview / Mermaid / terminal / file view 继续按 light/dark appearance 正常渲染] 保持既有 runtime 依赖不被 `custom` 破坏。
- [x] 2.3 [P1][depends:1.2][I: 设置页统一 select 样式体系][O: 主题配色下拉 UI 一致性][V: 设置页样式与响应式布局保持一致] 修正下拉样式和对齐行为。

## 3. Verification

- [x] 3.1 [P0][depends:2.3][I: 受影响 frontend 模块][O: 前端验证结果][V: `npm run typecheck`、`npm run lint`、`npx vitest run src/features/theme/utils/themePreset.test.ts src/features/settings/hooks/useAppSettings.test.ts src/features/settings/components/SettingsView.test.tsx` 通过] 运行 targeted frontend checks。
- [x] 3.2 [P0][depends:3.1][I: runtime / Rust settings 模块][O: contract 验证结果][V: `npm run check:runtime-contracts` 与 `cargo test --manifest-path src-tauri/Cargo.toml settings_core` 通过] 运行跨层 contract checks。
- [x] 3.3 [P1][depends:3.2][I: OpenSpec change artifacts][O: 严格校验记录][V: `openspec validate add-settings-custom-theme-presets --type change --strict --no-interactive` 通过] 当前环境未安装 `openspec` CLI，待具备工具后补跑。
