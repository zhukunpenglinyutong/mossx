## Why

当前 Codex 对话在短任务下通常正常，但长任务进行几分钟后会出现“UI 持续 loading、没有新的流式输出、任务也不自然结束”的卡死体验。结合现有实现看，当前最紧迫的问题不是“死后怎么提示”，而是**活跃长任务本身没有被系统当成必须保活的对象**：`warm ttl`、budget reconcile、release/cooling 这些面向 idle runtime 的机制，与 active turn / active stream 的保护边界没有被严格拉开。

这导致用户必须通过“固定保留”或手动调大 `Warm TTL` 去对抗连接池回收风险，把本该由系统内部承担的长任务保活职责转嫁给了用户。即使后续补了 `runtime-ended` 感知，如果长任务依然会被池化机制误杀，用户核心痛点仍然没有解决。

## 目标与边界

- 目标：定义 Codex 长任务的 `active work protection` 契约，保证活跃 turn / active stream 在执行期间会自动续持保护，不会因 idle retention、budget reconcile 或 cooling 被误回收。
- 目标：把 `warm ttl` / `pin` 的语义限定回“空闲实例保温策略”，不再让用户手动承担活跃任务保命责任。
- 目标：补齐 backend session lifecycle、runtime manager lease、frontend state teardown 三层联动，让 active work protection 成为系统默认能力。
- 目标：增强 runtime pool console，让用户能区分“被活跃任务保护”与“仅被 warm/pin 保留”。
- 目标：当 runtime 真的退出时，系统仍能确定性退出 loading，并给出可恢复诊断。
- 边界：本变更聚焦 Codex managed runtime，不扩展到新的 provider 或新的 runtime pool 架构。
- 边界：本变更优先保证“长任务不被误杀”，其次才是“失败可观测、可退出、可恢复”，不承诺一次性解决所有 upstream 网络抖动或 provider 侧超时。

## 非目标

- 不通过简单增大默认 `Warm TTL` 来掩盖问题。
- 不要求用户在长任务前手动点击“固定保留”作为常规工作流。
- 不把长任务存活建立在纯前端 heartbeat 猜测或 UI 侧超时补丁上。
- 不重写整个会话架构、thread reducer 或 shared session 模型。
- 不引入新的独立诊断系统；优先复用现有 runtime log、runtime pool console、thread-facing recovery card。

## What Changes

- 为 Codex managed runtime 增加 `active work lease` 契约：从 turn 开始到终态事件到达前，runtime 必须持有可自动续持的 active-work protection，而不是只依赖 warm retention。
- 在 runtime/session 层把 active turn、active stream、pending request 与 runtime bookkeeping 串起来，确保 active work 期间 `reconcile_pool()`、budget overflow、manual cooling/release 都不会误回收 runtime。
- runtime pool console 增加 active-work protection 可视化，明确区分 `active lease`、`warm retention`、`pinned retention` 与异常退出信息，避免用户误把 pin/warm 当作任务保活开关。
- 在 child 真正退出、stdout EOF、stdin write failed 等场景下，补充结构化 `runtime/ended` 兜底收口：系统必须结束 loading、失败 pending request，并提供 recover/resend 路径。
- 增加回归测试，优先覆盖 long-running task 在 pool reconcile / budget pressure / warm ttl 变化下仍可存活，其次覆盖 child exit、stdout EOF、pending request settlement 与 UI processing 收尾。

## 技术方案对比

| 方案 | 做法 | 优点 | 风险/问题 | 结论 |
|---|---|---|---|---|
| A. 只调大 `Warm TTL` 或默认自动 pin | 通过配置延长实例保温时间，减少被回收概率 | 改动最小、短期可缓解 | 正确性依然依赖用户配置；active task 没有被定义成 no-evict；不能覆盖其他 release path | 放弃 |
| B. 只补 `runtime-ended` 感知与 recover | backend 感知 child exit，frontend 结束 loading 并允许重试 | 能改善死后体验，诊断更清晰 | 仍然不能阻止 pool/ttl 误杀长任务，本质上是在做善后 | 放弃作为主方案 |
| C. 建立 active-work protection + no-evict 契约，并保留 runtime-ended 兜底 | backend 用 active work lease 自动续持长任务保护，pool 禁止误回收；若真的退出，再统一收口和恢复 | 直接解决“长任务跑不住”的核心问题，同时保留失败兜底 | 需要明确 lease 来源、续持规则和 console 语义 | 采用 |

## Capabilities

### New Capabilities

- `codex-long-task-runtime-protection`: 定义 Codex managed runtime 在活跃长任务期间的自动续持保护、hard no-evict 边界，以及异常退出后的 recovery fallback。

### Modified Capabilities

- `conversation-runtime-stability`: 现有 runtime stability requirement 需要先覆盖“active conversation work 自动保护不被 idle policy 打断”，再覆盖 child process exit / EOF / pending turn 未终结时的兜底收口。
- `runtime-pool-console`: 现有 runtime console requirement 需要补充 active-work protection 与 idle retention 的区分、异常退出原因、以及为何被回收/未回收的可诊断信息。

## Impact

- Backend / runtime:
  - `src-tauri/src/backend/app_server.rs`
  - `src-tauri/src/runtime/mod.rs`
  - `src-tauri/src/codex/session_runtime.rs`
  - 可能涉及 `src-tauri/src/shared/codex_core.rs`
- Frontend:
  - `src/features/app/hooks/useAppServerEvents.ts`
  - `src/features/threads/hooks/useThreadsReducer.ts`
  - `src/features/messages/components/runtimeReconnect.ts`
  - `src/features/messages/components/RuntimeReconnectCard.tsx`
  - `src/features/settings/components/settings-view/sections/RuntimePoolSection.tsx`
- Specs:
  - `openspec/specs/conversation-runtime-stability/spec.md`
  - `openspec/specs/runtime-pool-console/spec.md`
  - `openspec/changes/harden-codex-runtime-exit-recovery/specs/codex-long-task-runtime-protection/spec.md`
- APIs / runtime events:
  - 新增或扩展 active-work lease / runtime-ended / exit-reason 相关 app-server event contract
  - 不引入第三方依赖

## 验收标准

- 长任务执行 10 分钟、30 分钟、60 分钟期间，只要 active turn / stream 仍存活，runtime reconcile 不得因 `Warm TTL`、budget overflow 或 cooling/release policy 回收实例。
- `pin` 与 `warm ttl` 仍只影响 idle retention；不需要用户手动 pin 才能让活跃任务存活。
- runtime pool console 必须明确显示某实例是“被 active work 保护”还是“仅被 warm/pin 保留”。
- 若 Codex managed child 真的被 kill、异常退出、或 stdout 提前 EOF，前端仍必须在有界时间内退出 loading，不能永久停留在 processing。
- 上述异常路径必须生成结构化 runtime 诊断，且能在 thread-facing recovery UI 与 runtime pool console 中被关联查看。
- 发生 runtime-ended 后，用户可以通过 recover / resend 路径继续，而不是只能刷新整个应用。
- 至少补齐 backend + frontend 回归测试，覆盖 active-work protection、lease-protected reconcile、child exit、timeout、processing teardown 与 recover card 展示。

## 分阶段 Plan

1. Phase 1: 收口契约
   - 为 active turn / stream 建立自动续持的 active-work lease 契约，并把它定义成 runtime survival 的第一优先级。
2. Phase 2: Lease 与回收保护
   - 禁止 idle retention、budget reconcile、manual cooling/release 在有效 active-work lease 存在时回收 runtime。
3. Phase 3: Recovery 兜底
   - 为 child exit / EOF 建立统一 `runtime-ended` event、pending request fail-fast 与前端 processing teardown。
4. Phase 4: 可观测性与验证
   - runtime pool console 增强 active-work protection / exit diagnostics，补齐 regression tests 与手工验证矩阵。
