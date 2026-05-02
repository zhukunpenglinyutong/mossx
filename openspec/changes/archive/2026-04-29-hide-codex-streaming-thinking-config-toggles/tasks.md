## 1. OpenSpec 契约落盘（P0）

- [x] 1.1 [P0][depends:none][verify: proposal review] 新建 OpenSpec change `hide-codex-streaming-thinking-config-toggles`，明确问题是 `Codex` composer config menu 中 streaming/thinking 暴露与暗状态漂移。
- [x] 1.2 [P0][depends:1.1][verify: design/spec consistency] 在 proposal 中收口目标、非目标、方案对比、验收标准与 impact。
- [x] 1.3 [P0][depends:1.2][verify: openspec status] 补齐 `design.md`、delta `specs/` 与 `tasks.md`，让本次行为变更具备完整 artifact 链。

## 2. Frontend 行为收口（P0）

- [x] 2.1 [P0][depends:1.2][verify: Vitest ConfigSelect] 在 `ConfigSelect` 中为 `Codex` provider 隐藏 streaming/thinking 菜单项与相关 divider。
- [x] 2.2 [P0][depends:1.2][verify: Vitest ChatInputBoxAdapter] 在 `ChatInputBoxAdapter` 中为 `Codex` provider 引入 effective defaults：`streamingEnabled=true`、`alwaysThinkingEnabled=true`。
- [x] 2.3 [P0][depends:2.2][verify: Vitest ChatInputBoxAdapter] 阻断 `Codex` 路径继续读取本地 streaming 持久化值与 `Claude` thinking fallback 逻辑。
- [x] 2.4 [P0][depends:2.1,2.2][verify: targeted review] 保持 `Speed / Review / Plan Mode / 实时用量` 与非 `Codex` 旧行为不回退。

## 3. 自动化验证（P0）

- [x] 3.1 [P0][depends:2.1][verify: vitest] 更新 `ConfigSelect.test.tsx`，覆盖 `Codex` 下隐藏、`Claude` 下保留的菜单行为。
- [x] 3.2 [P0][depends:2.2,2.3][verify: vitest] 更新 `ChatInputBoxAdapter.test.tsx`，覆盖 `Codex` 下 effective 值恒为开启且跳过 `Claude` 设置读取。
- [x] 3.3 [P0][depends:3.1,3.2][verify: `pnpm vitest run src/features/composer/components/ChatInputBox/selectors/ConfigSelect.test.tsx src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.test.tsx`] 执行 targeted 组件测试并通过。
- [x] 3.4 [P0][depends:2.1,2.2,2.3][verify: `pnpm typecheck`] 执行 TypeScript 零错误校验并通过。
- [x] 3.5 [P1][depends:3.3,3.4][verify: manual app smoke] 在真实应用中手工验证：`Codex` 菜单不显示两项，`Claude` 菜单仍显示两项。

## 4. 归档前门禁（P1）

- [x] 4.1 [P1][depends:1.3,3.3,3.4][verify: `openspec validate "hide-codex-streaming-thinking-config-toggles" --type change --strict`] 运行 OpenSpec 校验并通过，确认 artifacts 结构合法。
- [x] 4.2 [P1][depends:4.1][verify: change review] 人工确认 proposal/spec/design/task 与实际代码改动一致，再决定是否进入 archive。
