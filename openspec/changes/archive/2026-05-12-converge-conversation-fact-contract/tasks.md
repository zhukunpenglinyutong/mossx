## 1. Contract Inventory

- [x] 0.1 [P0][depends:none][I: `openspec/docs/client-stability-conversation-implementation-readiness-2026-05-11.md`][O: Conversation ownership boundary recorded in task notes][V: `request_user_input`、`modeBlocked`、recovery control-event 与 Composer pointer 边界无冲突] 冻结跨 change ownership matrix，确认 Conversation 负责 transcript fact truth，不负责 runtime retry 或 Composer primary action。
- [x] 1.1 [P0][depends:none][I: existing adapters/loaders/reducer/render item types][O: conversation fact 分类表与污染样本清单][V: 清单覆盖 Claude、Codex、Gemini 至少三类来源] 盘点当前 visible item 类型、provider payload 来源、control-plane marker 与 history hydrate 差异。
- [x] 1.2 [P0][depends:1.1][I: current conversation curtain specs + code hotspots][O: realtime/history 差异矩阵][V: 矩阵覆盖 user、assistant、reasoning、tool、request_user_input、modeBlocked] 明确哪些现象属于事实层问题，哪些属于 presentation state。

## 2. Normalization Core

- [x] 2.1 [P0][depends:1.2][I: `conversationNormalization`、`threadItemsAssistantText`、真实污染样本][O: shared user/assistant/reasoning normalization helpers][V: pure function unit tests 覆盖 wrapper stripping、near duplicate、自然语言误伤] 收敛 message text normalization。
- [x] 2.2 [P0][depends:2.1][I: normalized text helpers][O: semantic equivalence helper][V: tests 覆盖 optimistic/authoritative user collapse、assistant completed replay collapse、不同 turn 相似文本不误合并] 建立 fact 等价判断。

## 3. Control-Plane Classification

- [x] 3.1 [P0][depends:2.2][I: Claude/Codex control markers][O: hidden-control-plane / compact control-event 分类][V: tests 断言 synthetic approval marker、No response requested、queue bookkeeping 不显示普通气泡] 收敛 control-plane filtering。
- [x] 3.2 [P0][depends:3.1][I: modeBlocked / resume failed / interrupted events][O: compact status row fact][V: tests 断言诊断事件可见但不混入 assistant 正文] 将用户可理解控制事件格式化为 control row。

## 4. request_user_input Lifecycle

- [x] 4.1 [P0][depends:3.1][I: existing request_user_input hooks/cards/events][O: pending/submitted/timeout/dismissed/cancelled/stale lifecycle contract][V: tests 覆盖每个 settled state 不阻塞新输入] 收敛 request_user_input 状态机。
- [x] 4.2 [P1][depends:4.1][I: message surface + Composer pointer][O: stale card dismiss 与 submitted/timeout 表达][V: RequestUserInputMessage tests 覆盖 dismiss/focus target，Composer tests 覆盖 settled request 不阻塞输入] 补齐 request_user_input 用户可感知行为。

## 5. Realtime / History Parity Gate

- [x] 5.1 [P0][depends:2.2,3.2,4.1][I: `realtimeHistoryParity.test.ts` fixtures][O: Claude/Codex parity regression tests][V: tests 覆盖 realtime、completed、history hydrate、reopen 后 visible row cardinality 一致] 扩展 parity 门禁。
- [x] 5.2 [P1][depends:5.1][I: Gemini/OpenCode representative fixtures][O: legacy-safe parity coverage][V: realtime/history parity tests 覆盖 Gemini/OpenCode representative fixtures] 扩展非 P0 provider 覆盖。

## 6. Messages Render Boundary Cleanup

- [x] 6.1 [P0][depends:5.1][I: normalized facts][O: `MessagesTimeline` 按 normalized item type 渲染的边界][V: render/parity tests 断言不新增 raw provider payload 分支] 收窄 render layer 职责。
- [x] 6.2 [P1][depends:6.1][I: tool grouping + presentation profile][O: tool presentation 与 fact classification 分离][V: tests 覆盖 legacy tool payload 不崩溃] 清理 tool card 与 presentation state 边界。

## 7. Verification

- [x] 7.1 [P0][depends:6.1][I: changed frontend modules][O: focused test results][V: relevant Vitest suites pass] 运行 normalization、parity、request_user_input、Messages focused tests。
- [x] 7.2 [P1][depends:7.1][I: changed frontend modules][O: baseline quality gate][V: `npm run typecheck` pass] 执行 typecheck 并修复 contract drift。
