# settings-custom-theme-presets Specification

## Purpose

Defines the settings-custom-theme-presets behavior contract, covering Settings MUST Expose A Dedicated Custom Theme Mode.

## Requirements
### Requirement: Settings MUST Expose A Dedicated Custom Theme Mode

系统 MUST 在现有 `system / light / dark` 之外提供 `custom` 主题模式，用于承载 preset 化主题配色选择。

#### Scenario: custom theme mode is visible in appearance settings

- **WHEN** 用户打开外观设置
- **THEN** 系统 MUST 展示 `自定义` 主题选项
- **AND** 当前激活主题 MUST 保持可识别状态

#### Scenario: preset selector appears only for custom mode

- **WHEN** 用户未选择 `custom` 主题模式
- **THEN** 系统 MUST NOT 展示主题配色下拉
- **WHEN** 用户切换到 `custom`
- **THEN** 系统 MUST 展示主题配色下拉并允许直接选择 preset

### Requirement: Custom Theme Presets MUST Preserve The Existing Light/Dark Runtime Contract

`custom` 主题模式 MUST 在 runtime 层解析为 preset 对应的 `light` 或 `dark` appearance，而不是把 `custom` 直接传播到下游渲染 contract。

#### Scenario: custom preset resolves to dark appearance safely

- **WHEN** 用户选择一个 dark appearance 的 preset
- **THEN** 系统 MUST 继续把运行时 appearance 解析为 `dark`
- **AND** 依赖 `data-theme` 的组件 MUST 不需要理解 `custom` 字面值也能继续工作

#### Scenario: custom preset resolves to light appearance safely

- **WHEN** 用户选择一个 light appearance 的 preset
- **THEN** 系统 MUST 把运行时 appearance 解析为 `light`
- **AND** window appearance、Mermaid、Markdown preview、terminal 等 light/dark 观察方 MUST 继续可用

#### Scenario: invalid persisted preset falls back

- **WHEN** 持久化的 `customThemePresetId` 缺失或无效
- **THEN** 系统 MUST 回退到一个有效默认 preset
- **AND** 启动与设置保存流程 MUST 继续正常工作

### Requirement: Preset Catalog MUST Offer Popular VS Code Style Choices

系统 MUST 提供一组 curated 的 VS Code 风格 preset，覆盖浅色与深色常见选择。

#### Scenario: preset catalog contains both dark and light popular themes

- **WHEN** 用户展开主题配色下拉
- **THEN** 系统 MUST 提供多套热门 VS Code 风格 preset
- **AND** 其中 MUST 同时包含 light 与 dark appearance 的可选项

#### Scenario: selecting a preset updates custom theme identity

- **WHEN** 用户在 `custom` 模式下选择新的 preset
- **THEN** 系统 MUST 持久化新的 preset identity
- **AND** 当前 UI 配色 MUST 随之更新

