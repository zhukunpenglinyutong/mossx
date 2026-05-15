## Why

用户反馈的现象是：同时开 3 个 Codex 会话时，当前选中的会话最稳定，后台会话有较高概率看起来被挂起；切过去后才看到数据交互继续。截图中的一个变种是前端把长时间无输出的 turn 判定成 `600 秒` no-progress stalled。

本轮本地压测没有复现“Codex 不能并发”的硬故障：同一 app-server 下 3 个 `gpt-5.4` 并发短 turn 和长输出 turn 都能完成；三进程隔离压测也能完成。但代码核对发现一个更危险的稳定性遗漏点：前端 600 秒无可见 progress 会直接触发 `codex_no_progress_timeout`，随后进入 stalled / quarantine 终态。这会把 provider 长静默、后台 UI 证据缺口、heartbeat 未计入 progress 等“尚未证明死亡”的状态，升级成不可恢复的假死。

因此本变更不把重点放在复杂 debug UI，而是加固 Codex turn liveness contract：前端观察到的无输出只能先进入 soft-suspect；只有 backend authoritative terminal / stalled / runtime-ended 等权威事件才能 hard-stop 或 quarantine turn。

补充澄清：600 秒 watchdog 不能删除。它当初用于防止 UI loading 无限转，这个设计目标仍然成立；需要修正的是 timeout 后的动作。600 秒继续负责“前端长时间无进展的降级提示与诊断留痕”，但不负责“宣判 turn 已死”。换句话说，watchdog 的职责从 `terminalize + quarantine` 收窄为 `degrade UI + record diagnostic + keep monitoring / Stop available`。

## 目标与边界

### 目标

- 将 Codex 前端 600 秒 no-progress timeout 从 hard stalled / quarantine 降级为 soft `suspected-silent`。
- 明确 hard stalled / quarantine 的权威来源：backend terminal event、backend stalled settlement、runtime ended、用户 stop 后的 abandoned / interrupted。
- 扩展 Codex progress evidence：`processing/heartbeat`、`thread/status/changed` active、token usage、item status update、tool / approval / user-input state 变化等非文本事件也能刷新 liveness。
- 让 late event 可以自动解除 soft-suspect 并恢复正常 processing，不要求用户切换会话或手工点 debug。
- 保持现有 Stop 能力：用户仍可主动中止长时间静默 turn。
- 让诊断留痕足够定位：能区分 frontend-only suspected silence、backend authoritative stalled、runtime-ended、user-abandoned。

### 边界

- 本变更只覆盖 Codex foreground turn liveness，不扩展 Claude / Gemini / OpenCode。
- 本变更不重做 runtime pool、workspace session 架构，也不引入新队列调度系统。
- 本变更不新增大而全的 debug 面板，只复用现有 thread diagnostics / runtime diagnostics / log surface。
- 本变更不改变真实 terminal event 的语义：`turn/completed`、`turn/error`、`runtime/ended` 仍然必须确定性结算。
- 本变更不把 provider 长尾延迟伪装成成功，只避免在没有权威死亡证据时过早宣判。

## 非目标

- 不承诺 3 个真实模型请求一定同速返回；provider / network / upstream scheduling 的差异仍可能存在。
- 不做后台 WebView / OS 调度层面的专项重构。
- 不引入用户可配置 timeout。
- 不为每个事件新增用户可见 toast。
- 不改变已有 Codex app-server launch / auth / model selection 逻辑。

## What Changes

- Codex frontend-only no-progress watcher 改为产生 `suspected-silent` 或等效 recoverable state。
- 600 秒 no-progress window 保留，用作 UI 防无限 loading 与诊断触发器，不再作为死亡判定器。
- `suspected-silent` MUST NOT：
  - 标记 turn 为 terminal stalled
  - quarantine turn
  - emit terminal external settlement
  - 阻断 late progress event 更新当前 turn
- hard stalled / quarantine 只允许由权威事件触发：
  - backend `turn/stalled` 或等效 stalled settlement
  - `turn/error`
  - `runtime/ended`
  - 用户 Stop 后产生的 abandoned / interrupted / failed terminal state
  - backend resume-pending timeout 等权威 timeout
- progress evidence 扩展为非文本事件也可刷新 no-progress window。
- soft-suspect UI 使用低干扰表达，例如“长时间未收到输出，仍在监听运行状态...”，Stop 按钮继续可用。
- late event 到达时，若身份仍匹配当前 turn，系统必须自动清除 soft-suspect 并恢复正常活动态。
- 诊断记录必须包含 source：`frontend-no-progress-suspected` 与 `backend-authoritative-stalled` 不能混淆。

## Review 后加固补充

- `suspected-silent` MUST 落到可被 UI 消费的 thread status，而不是只写 debug diagnostic；否则 600 秒 watchdog 仍会退化成普通无限 loading。
- Messages 工作指示 MUST 在 Codex suspected-silent 时显示低干扰文案，并保持 Stop 可用。
- soft-suspect MUST 在 matching progress、terminal settlement 或 processing 结束时清理，避免状态残留。
- `thread/status/changed` / `runtime/status/changed` 这类 status event 只有在携带并匹配当前 active `turnId` 时，才能刷新 Codex no-progress window；未归属 status 只能作为诊断事实，不能证明当前 turn 仍有进展。
- backend authoritative `turn/stalled`、`turn/error`、`runtime/ended`、user Stop 仍保留 hard settlement / quarantine 权力。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 保持现状，继续把 600 秒前端无进展当 hard stalled 并 quarantine | 实现成本为零，pseudo-processing 不会无限挂住 | 容易把 provider 长静默或 progress evidence 缺口误判为死亡；late event 被 quarantine 后无法自然恢复 | 不采用 |
| B | 加复杂诊断补丁 / debug UI，让用户手动判断后台会话是否还活着 | 证据更丰富，排查时有帮助 | 用户交互负担高，不能根治 lifecycle 误判；后台假死仍可能被 terminal 化 | 不作为主线 |
| C | 前端 no-progress 先 soft-suspect，hard stalled 只接受 backend 权威 settlement；扩展 progress evidence 并自动 late-event recovery | 改动点集中在 liveness contract；避免 false quarantine；用户无需额外 debug 操作 | 需要梳理现有 stalled 语义和测试回放；真实死亡状态可能晚一点呈现 | **采用** |
| D | 重构 runtime scheduler，为同 workspace Codex turn 增加全局队列 / admission control | 能治理同进程竞争 | 当前证据未证明并发本身不可行；会扩大 blast radius，可能降低吞吐 | 本期不采用 |

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `codex-stalled-recovery-contract`: 调整 Codex no-progress settlement，区分 frontend-only suspected silence 与 backend authoritative stalled。
- `codex-conversation-liveness`: 增加 silent turn 的 soft-suspect、progress evidence、late-event recovery 与诊断契约。

## 验收标准

- Codex foreground turn 仅因前端 600 秒无输出时，MUST 进入 soft `suspected-silent` 或等效状态，MUST NOT quarantine。
- soft-suspect 期间收到同一 active turn 的 stream delta、heartbeat、status active、item update、tool/user-input/approval 事件时，MUST 自动清除 suspected state。
- backend authoritative `turn/stalled`、`turn/error`、`runtime/ended` 或用户 Stop 后的 abandoned / interrupted 仍然 MUST 确定性结算并清理 active turn。
- late event 对已 backend-authoritative stalled / abandoned 的旧 turn 仍然 MUST 只作为 diagnostic，不得复活旧终态。
- diagnostics MUST 能区分：
  - `frontend-no-progress-suspected`
  - `backend-authoritative-stalled`
  - `runtime-ended`
  - `user-abandoned`
- UI MUST 维持低干扰：soft-suspect 不弹强提示，不要求用户打开 debug 面板；Stop 仍可用。
- 最小验证覆盖：
  - 前端 no-progress timer 不再调用 hard quarantine path
  - heartbeat / status / item update 刷新 Codex progress evidence
  - soft-suspect late event 自动恢复
  - backend authoritative stalled 仍 quarantine late events
  - `openspec validate harden-codex-silent-turn-liveness --strict --no-interactive`

## Impact

- Frontend:
  - `src/features/threads/hooks/useThreadEventHandlers.ts`
  - Codex no-progress timer / progress evidence / stalled settlement 相关 tests
  - 可能涉及 thread processing / diagnostics 类型定义
- Backend:
  - 原则上不要求重构；若已有 backend stalled event 语义不清，需要补充 normalized stalled source 字段
- Specs:
  - `codex-stalled-recovery-contract`
  - `codex-conversation-liveness`
