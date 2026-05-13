## 1. Contract Inventory

- [x] 0.1 [P0][depends:none][I: `openspec/docs/client-stability-conversation-implementation-readiness-2026-05-11.md`][O: Composer projection boundary recorded in task notes][V: Composer readiness 只消费 Runtime / Conversation structured state，不重新解释 raw runtime errors 或 raw provider payload] 冻结跨 change ownership matrix，确认 Composer 只负责 send-intent projection。
- [x] 1.1 [P0][depends:none][I: current Composer / ChatInputBox / queued send state][O: Composer send readiness 状态输入清单][V: 清单覆盖 target、context、readiness、activity、request_user_input] 盘点 Composer 发送前状态来源。
- [x] 1.2 [P0][depends:1.1][I: current disabled / queue / stop / request UI][O: disabled reason 与 primary action 优先级表][V: review 确认 modeBlocked、runtime recovering、awaitingUserInput、config loading 不互相覆盖] 定义发送动作优先级。
- [x] 1.3 [P1][depends:1.1][I: component line counts and ownership][O: 大组件护栏清单][V: 明确新增逻辑进入 viewModel / selectors / summary helpers] 标记需要避免继续膨胀的组件边界。

## 2. Send Readiness ViewModel

- [x] 2.1 [P0][depends:1.2][I: selected engine/model/mode/context/thread state][O: `ComposerSendReadiness` 类型与 pure builder][V: unit tests 覆盖 Claude / Codex 基础 target summary] 建立 view model 核心。
- [x] 2.2 [P0][depends:2.1][I: context ledger、skills、notes、files、images][O: context summary helper][V: tests 覆盖 compact label 与 detail label] 收敛上下文摘要。
- [x] 2.3 [P0][depends:2.1][I: runtime / mode / config / request state][O: disabled reason helper][V: tests 覆盖 runtime recovering、modeBlocked、config loading、awaitingUserInput] 收敛不可发送原因。

## 3. Readiness Bar UX

- [x] 3.1 [P1][depends:2.2,2.3][I: ComposerSendReadiness][O: 发送前 summary bar][V: render tests 断言显示 engine / model / mode / context summary] 接入发送前可解释性 bar。
- [x] 3.2 [P1][depends:3.1][I: narrow layout constraints][O: compact / collapsed display][V: tests 或 story/manual evidence 覆盖窄屏不挤压输入区] 补齐响应式展示。
- [x] 3.3 [P1][depends:3.1][I: high-risk access modes][O: mode impact copy][V: render tests 覆盖 mode impact label] 展示模式影响。

## 4. Queue / Fuse Activity Projection

- [x] 4.1 [P0][depends:2.1][I: `useQueuedSend` state and stream activity phase][O: activity projection helper][V: tests 覆盖 processing、waiting、ingress、queued、fusing、blocked] 统一输入活动状态。
- [x] 4.2 [P1][depends:4.1][I: MessageQueue component][O: queue / fuse 用户文案][V: render tests 覆盖 queued、fusing、cannot fuse、slash command cannot fuse、can fuse] 整理队列和融合状态表达。
- [x] 4.3 [P1][depends:4.2][I: existing cancel/stop affordances][O: primary/secondary action mapping][V: readiness tests 断言 Stop、Queue、Jump to request 等动作不冲突] 对齐主次动作。

## 5. request_user_input Pointer

- [x] 5.1 [P0][depends:2.3][I: `useThreadUserInput` / request lifecycle state][O: Composer request pointer view model][V: tests 覆盖 pending、submitted、timeout、dismissed、cancelled、stale] 建立 request_user_input 轻提示状态。
- [x] 5.2 [P1][depends:5.1][I: message request card focus/jump affordance][O: Composer pointer UI][V: render tests 断言 active request 可跳转、settled request 不阻塞输入] 接入轻提示，不替代幕布卡片。
- [x] 5.3 [P1][depends:5.2][I: modeBlocked request cases][O: request blocked action hint][V: readiness tests 覆盖 awaiting-user-input primary action 不与普通 disabled reason 混淆] 补齐阻塞文案。

## 6. Large Component Guardrail

- [x] 6.1 [P1][depends:2.1][I: new view model files][O: `Composer.tsx` / `ChatInputBox.tsx` 最小 glue 接入][V: code review 确认不新增大段业务判断] 接入时保持大组件瘦身。
- [x] 6.2 [P1][depends:6.1][I: ButtonArea / ContextBar responsibilities][O: presentation-only props contract][V: focused tests 确认组件只消费 view model props] 收窄按钮区和上下文条职责。
- [x] 6.3 [P2][depends:6.1][I: component size trend][O: guardrail checklist or test][V: `check:large-files:gate` 不回退] 增加防回胀验证。

## 7. Verification

- [x] 7.1 [P0][depends:2.3,4.1,5.1][I: view model helpers][O: unit test results][V: readiness / context / activity / request pointer tests pass] 跑 pure helper tests。
- [x] 7.2 [P1][depends:3.1,4.2,5.2][I: Composer UI changes][O: focused render test results][V: Composer / ChatInputBox / ButtonArea / ContextBar / MessageQueue tests pass] 跑 UI focused tests。
- [x] 7.3 [P1][depends:7.2][I: existing input behaviors][O: regression evidence][V: IME、slash command、file reference、prompt history、queued send tests pass] 跑输入链路回归。
- [x] 7.4 [P1][depends:7.3][I: project quality gates][O: baseline quality result][V: `npm run typecheck` and relevant Vitest suites pass] 执行基础质量门禁。
