## Context

当前项目的主题语义由 `theme` 偏好、DOM `data-theme`、Tauri window appearance，以及若干依赖 light/dark 的渲染组件共同构成。直接把 `custom` 当成新的 appearance 会破坏这些既有依赖，因此 `custom` 只能是“设置模式”，不能是下游 runtime 的最终 appearance。

VS Code 主题本身包含大量编辑器语义颜色，但当前项目真正需要的是一组稳定的 UI token。因此实现重点不是完全复制 VS Code 主题，而是从热门 preset 中提取适合本项目的 surface / text / border / accent 等颜色，映射到现有 token。

## Goals / Non-Goals

**Goals:**

- 增加 `custom` 主题模式。
- 用 preset catalog 暴露多套 VS Code 风格配色。
- 保持现有 `light / dark` appearance contract 不变。
- 让设置页交互保持与现有 UI 一致，包括下拉样式统一。

**Non-Goals:**

- 不做 arbitrary color editor。
- 不要求 1:1 复刻 VS Code 全量语义 token。
- 不改变非主题设置项的数据流或持久化策略。

## Decisions

### Decision: separate mode selection from preset selection

`theme` 决定用户当前是否处于 `system / light / dark / custom` 模式；`customThemePresetId` 仅在 `custom` 模式下生效。这样可以避免“先选 light 再选颜色”的双重语义耦合。

### Decision: resolve custom preset to light/dark appearance before runtime consumption

`custom` 模式下，runtime 仍只消费 preset 派生出的 `appearance`，并继续写入 `data-theme=light|dark`。额外的 preset identity 通过 `data-theme-preset` 与 `data-theme-preset-appearance` 暴露给需要更细粒度信息的组件。

### Decision: map curated VS Code colors to existing app tokens

预设实现采用 curated preset + mapping helper，而不是运行时导入原始 VS Code theme 文件。这样可控、可测试，也更符合当前项目的 token 结构。

## Risks / Trade-offs

- [Risk] `custom` 被错误传播到下游 DOM / Rust appearance → Mitigation: 统一通过 preset `appearance` 解析。
- [Risk] preset 缺失或旧值损坏导致启动异常 → Mitigation: sanitize 时回退到默认 preset。
- [Risk] 设置页新增下拉与现有 UI 不一致 → Mitigation: 复用统一 `settings-select-wrap + settings-select` 样式契约。

## Migration Plan

1. 扩展 `AppSettings` 与 Rust settings fields。
2. 新增 preset catalog、appearance helper、token mapping helper。
3. 改造 settings UI，增加 `custom` 模式与 preset 下拉。
4. 改造 runtime theme apply / window appearance / theme observers。
5. 跑 targeted tests、lint、typecheck、runtime contract、Rust settings_core tests。

## Open Questions

- 无。
