## Why

当前设置只提供 `system / light / dark` 两种实际主题族，扩展性不足；同时“主题颜色”在交互上依赖先切换主题再切换颜色，用户认知成本偏高。项目已经有完整的 light/dark token 体系，因此更合适的方案不是引入一套独立渲染系统，而是在现有 token contract 之上增加“自定义主题”模式，并用 VS Code 常见主题配色作为 preset 来源。

## 目标与边界

- 目标：在设置页增加 `自定义` 主题模式，并在该模式下展示统一的主题配色下拉。
- 目标：提供多套热门 VS Code 风格 preset，映射到当前项目需要的主题 token。
- 目标：保持既有 `system / light / dark` 行为不变，不破坏依赖 `data-theme` 的组件逻辑。
- 目标：让 Tauri window appearance、Mermaid、Markdown preview、terminal 等继续基于 `light / dark` appearance 工作。
- 边界：本次只支持 preset 选择，不支持用户任意编辑单个颜色 token。
- 边界：不引入外部 theme marketplace、在线下载、云同步。

## 非目标

- 不实现 VS Code 主题 JSON 的通用导入器。
- 不把 `custom` 直接当成全局 `data-theme` 枚举写入 DOM。
- 不重构现有 light/dark 组件 token 体系。

## What Changes

- `AppSettings.theme` 新增 `custom`；持久化设置新增 `customThemePresetId`。
- 设置页新增 `自定义` 主题选项，且仅在 `theme === "custom"` 时展示 `主题配色` 下拉。
- 主题配色下拉展示全部 preset，不再按 light/dark 先分层选择。
- 新增热门 VS Code 风格 preset，并把 preset 颜色映射到当前项目的主题 token。
- runtime 主题应用继续把 `data-theme` 维持为 `light / dark` appearance，同时额外写入 `data-theme-preset` 与 `data-theme-preset-appearance`。
- Rust settings sanitize 与 window appearance 推导链路同步支持 `custom` + `custom_theme_preset_id`。

## 技术方案对比

| 方案 | 做法 | 优点 | 风险 | 结论 |
|---|---|---|---|---|
| A. 继续扩展 `light/dark` 下的颜色分支 | 在现有主题按钮下增加更多颜色变体 | 代码改动表面较少 | 交互层级混乱，theme 与 color 语义继续耦合 | 放弃 |
| B. 新增 `custom` 模式 + preset catalog | `theme` 负责模式，preset 负责配色 | 用户认知清晰，兼容现有 light/dark appearance contract | 需要跨 frontend/Rust/settings/runtime 统一字段 | 采用 |
| C. 直接导入 VS Code 原始 theme JSON | 通用导入器 + 动态 token 解析 | 理论扩展性最高 | 复杂度过高，映射边界不稳定，本项目暂不需要 | 本次不做 |

## Capabilities

### New Capabilities

- `settings-custom-theme-presets`: 定义设置页自定义主题模式、preset 选择与 runtime appearance 对齐行为。

### Modified Capabilities

- `client-global-ui-scaling`: 外观设置区新增主题模式与 preset 选择，但不改变既有缩放/宽度设置 contract。

## Impact

- Affected code:
  - `src/features/theme/**`
  - `src/features/settings/**`
  - `src/features/layout/hooks/useThemePreference.ts`
  - `src/features/files/components/FileMarkdownPreview.tsx`
  - `src/features/files/components/FileViewPanel.tsx`
  - `src/features/messages/components/MermaidBlock.tsx`
  - `src/features/terminal/hooks/useTerminalSession.ts`
  - `src-tauri/src/settings/mod.rs`
  - `src-tauri/src/shared/settings_core.rs`
  - `src-tauri/src/types.rs`
- Verification:
  - `npm run typecheck`
  - `npm run lint`
  - `npx vitest run src/features/theme/utils/themePreset.test.ts src/features/settings/hooks/useAppSettings.test.ts src/features/settings/components/SettingsView.test.tsx`
  - `npm run check:runtime-contracts`
  - `cargo test --manifest-path src-tauri/Cargo.toml settings_core`
