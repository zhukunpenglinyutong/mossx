## Context

heavy Vitest 回归已通过，但输出噪音严重失衡。当前最大头不是失败，而是：

- `AskUserQuestionDialog.test.tsx` 在 fake timers 下把 300 秒倒计时 interval 全量跑爆，导致单例用例产生大规模 `act(...)` warning。
- `SpecHub.test.tsx` 中一批 render/click 场景会触发 React `act(...)` warning；这些 warning 目前主要表现为测试输出污染，而不是产品行为失败。
- `useThreadMessaging.ts` 的 DEV instrumentation 在 Vitest 下仍会打印 `[model/resolve/send]`、`[turn/start]` 等日志，占据绝大多数 stdout。
- 少量 `stderr`/KaTeX strict warning 是预期错误路径或 intentional malformed input 覆盖，但当前没有被局部收口。

约束：

- 不能通过全局屏蔽 `console` 来“假装安静”。
- 不能破坏前端真实行为，也不能损失本地开发调试价值。
- 必须保留 heavy suite 对真实失败信号的可见性。

## Goals / Non-Goals

**Goals:**

- 让 heavy suite 输出恢复到“能看懂、能定位”的信号面。
- 只收掉 repo-owned 噪音，保留真实失败与必要诊断。
- 用最小、可审计的测试/调试边界改动完成治理。

**Non-Goals:**

- 不处理 `electron_mirror` 等本机 npm 配置 warning。
- 不重构 `SpecHub` 或 `AskUserQuestionDialog` 的产品逻辑。
- 不把所有第三方库 warning 一律静音。

## Decisions

### Decision 1: 采用 source-specific 治理，而不是全局 console 静音

- Option A: 在 Vitest setup 里统一 mock `console.warn/error/log`
  - Pros: 见效快
  - Cons: 会掩盖真实失败信号，后续调试更难
- Option B: 按噪音来源逐点治理
  - Pros: 可保留真实信号，回归结果可信
  - Cons: 需要逐文件修正

**Decision:** 采用 Option B。噪音治理要提升信号质量，不能靠 blanket mute 达成“表面安静”。

### Decision 2: `useThreadMessaging` 保留 DEV 日志，但在 test mode 下禁止输出

- Option A: 删除所有 DEV instrumentation
  - Pros: 输出立刻干净
  - Cons: 损失本地开发排错能力
- Option B: 保留 DEV instrumentation，但显式排除 test mode
  - Pros: 保留开发诊断价值，同时清理 Vitest stdout
  - Cons: 需要引入稳定的 test-mode helper

**Decision:** 采用 Option B。测试不是调试控制台，DEV 日志应该被 test gate 收敛。

### Decision 3: 对 SpecHub `act(...)` warning 与 intentional warning 采用 test-boundary containment，而不是改产品实现

- Option A: 改生产代码规避 warning
  - Pros: 输出可能更安静
  - Cons: 容易把测试问题转成产品复杂度
- Option B: 在对应测试中局部 spy/assert/mute/filter
  - Pros: 不改变产品语义，职责清晰
  - Cons: 需要逐个上下文补齐

**Decision:** 采用 Option B。`SpecHub` 的 `act(...)` warning、intentional malformed input，以及 expected error-path 都应该先在测试边界内处理，而不是把产品实现改成只为测试安静服务。

## Risks / Trade-offs

- [Risk] `SpecHub` 某些 `act(...)` warning 源于真实异步链，机械加 `waitFor` 可能掩盖逻辑问题  
  → Mitigation: 只针对已确认的 warning 场景做最小异步稳定化，并保留 targeted regression。

- [Risk] test-mode gate 误伤开发期日志  
  → Mitigation: 使用显式 `MODE === "test"` 或等价 helper，仅在 Vitest 下关闭。

- [Risk] 预期错误路径如果被过度静音，会丢失异常分支覆盖价值  
  → Mitigation: 优先使用 spy/assert，其次才是局部 mute。

## Migration Plan

1. 写入 noise cleanliness proposal/spec/tasks，固定治理边界。
2. 先修 `AskUserQuestionDialog` timer/act storm。
3. 再修 `SpecHub` 主要 act hotspots。
4. 为 `useThreadMessaging` 加 test-mode debug gate。
5. 清理剩余 expected stderr / intentional warning。
6. 跑 `npm run lint`、`npm run typecheck`、targeted vitest、`VITEST_INCLUDE_HEAVY=1 npm run test`。

Rollback:

- 相关改动都限定在测试文件和前端 debug instrumentation；若出现意外，可逐文件回退，不涉及 schema/command/data migration。

## Open Questions

- `SpecHub` 是否还存在少量未被当前热点覆盖的 `act(...)` warning，需要在 heavy rerun 后再决定是否纳入第二批。
