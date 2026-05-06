# Fix conversation curtain visible copy tail

## Goal

清掉幕布剩余的高置信可见中文尾债，重点覆盖 generated image 卡片、agent badge 可访问名称和 Claude MCP 路由提示。

## Requirements

- `MessagesRows.tsx` 中 generated image 与 agent badge copy 改为纯 i18n。
- `useThreadMessaging.ts` 中的 MCP route notice 改为 locale-driven 文案。
- 补 focused tests，避免这批可见文案再次漂回中文。

## Acceptance Criteria

- [ ] 英文 locale 下，generated image 卡片不再显示中文状态/提示/按钮标签。
- [ ] 英文 locale 下，agent badge `aria-label` 不再是中文。
- [ ] 英文 locale 下，Claude MCP route notice 不再显示中文解释性文案。
- [ ] 相关 Vitest 与 OpenSpec validate 通过。

## Technical Notes

- 优先复用现有 generated image locale key。
- 新增 agent badge / MCP route notice key 时，尽量放在 `messages` 或相近命名空间，避免平行散落。
