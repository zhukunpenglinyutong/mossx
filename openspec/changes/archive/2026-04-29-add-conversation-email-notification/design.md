## Context

mossx 已完成 `email-sending-settings`：Settings 页面能保存 SMTP 配置，Rust `email` module 负责 secret 读取、测试发送、SMTP timeout 和结构化错误。这个基础能力刻意没有绑定 conversation completion 策略。

当前对话完成语义主要在 frontend thread lifecycle 中收敛：`useThreadEventHandlers` 在 `turn/completed` 后调用 `onTurnCompletedExternal`，`useThreads` 已用该入口做 history reconcile。composer 控件在 `ChatInputBox` / `ButtonArea` 内组织，适合新增一个轻量 icon toggle。结构化消息事实已统一为 `ConversationItem`，本次邮件正文只消费其中的 `message` 与 `fileChange` 可见事实。

本变更的关键不是 SMTP，而是 opt-in intent 的作用域：按钮必须是 thread-scoped one-shot，不得变成全局通知开关，也不得让 late completion 或跨 thread 切换触发误发。

## Goals / Non-Goals

**Goals:**

- 在 composer control area 增加 email icon toggle，表达“当前 thread 下一次 completion 后发邮件”。
- 使用 frontend thread-scoped one-shot intent 绑定目标 turn，完成、失败、取消或超时后自动清理。
- completion 后从 normalized `ConversationItem[]` 组装最后一轮 user + assistant + `fileChange` 卡片摘要。
- 通过 `src/services/tauri.ts` typed bridge 调 backend 受控邮件发送 command。
- 复用 `email` module 的 settings、secret store、SMTP timeout 与结构化错误。

**Non-Goals:**

- 不新增持续订阅模式，不把按钮状态持久化成长期 preference。
- 不改 SMTP provider、secret 存储、Settings 邮件配置或测试发送语义。
- 不发送附件，不引入 HTML 模板编辑器，不支持多收件人/抄送。
- 不让 backend runtime 主动监听所有 completion 并发送邮件。

## Decisions

### Decision 1: One-shot intent 保存在 frontend thread state 旁路

采用 thread-scoped map 保存邮件 intent，而不是写入 AppSettings 或 backend storage。建议形态：

- key: `threadId`
- value: `{ targetTurnId?: string | null; armedAt: number; status: "armed" | "sending" }`

用户在 idle 状态点亮按钮时，intent 暂无 `targetTurnId`，下一次 submit 时绑定当前 submit 产生的 turn；用户在 active generation 中点亮按钮时，优先绑定 `activeTurnIdByThread[threadId]`。切换 thread 只读取对应 key。

备选方案是 backend 持久化 subscription。未采用，因为本需求是一次性提醒，持久化会引入重启恢复、重复发送、取消语义和 storage migration 的复杂度。

### Decision 2: Completion 入口复用 terminal lifecycle hook

邮件发送触发点应接在 terminal completion 后，而不是 assistant content delta 或 item completed。可在 `useThreads` 中扩展现有 `onTurnCompletedExternal` 链路：保留 `handleTurnCompletedForHistoryReconcile`，新增 email completion handler，并在 reducer/lifecycle 已结算后读取当前 thread items。

绑定检查必须包含 `threadId` 和 `turnId`：只有 intent 的 `targetTurnId` 为空且本次 completion 是下一次 submit 绑定结果，或 `targetTurnId` 与 completion `turnId` 一致时才发送。发送开始前将 status 标记为 `sending`，并记录 sent key，避免 duplicate terminal events 造成重复邮件。

备选方案是在 backend app-server event pipeline 监听 `turn/completed`。未采用，因为邮件正文依赖 frontend normalized visible facts，backend 不掌握 UI 最终归并后的 message/tool card 语义。

### Decision 3: 邮件正文由 normalized conversation items 组装

正文组装放在 frontend utility 中，输入为目标 thread 的 `ConversationItem[]`、target turn context 和当前 workspace/thread metadata。MVP 不要求 HTML；plain text 更稳定、测试更简单。

建议正文结构：

1. 标题：`mossx conversation completed`
2. Thread / workspace / engine 摘要
3. `User`：最后一条 user message
4. `Assistant`：该 user 后续最近的 final assistant answer
5. `File changes`：同轮可见 `fileChange` 卡片摘要

`fileChange` activity 至少列 path；非 `fileChange` 的 tool / diff / review / generated image / explore 卡片不写入邮件正文。若无法解析 assistant final answer，不发送成功邮件，改为清理 intent 并反馈 skipped/failure。

### Decision 4: Backend 新增受控 conversation email command

当前 `send_test_email` 只发送固定测试正文。需要新增 command，例如 `send_conversation_completion_email`，注册到 `command_registry.rs`，并由 `src/services/tauri.ts` 暴露 typed function。

请求 payload 只包含非敏感内容：

- `workspaceId`
- `threadId`
- `turnId`
- `subject`
- `textBody`
- optional `recipient`

backend 在 `email` module 内读取 settings 和 credential store，默认使用已保存 recipient。该 command 复用现有 `send_email`，但不回显 secret，不记录正文中的敏感 SMTP 信息。

备选方案是复用 `send_test_email` 加参数。未采用，因为测试发送和 conversation 邮件在审计、subject、正文、调用方语义上不同，混用会让 contract 变脏。

### Decision 5: 失败反馈只降级 side effect，不影响 conversation terminal state

邮件发送是 completion 的附加 side effect。任何 disabled、not configured、missing secret、invalid recipient、SMTP reject、timeout 都必须表现为可恢复反馈，并自动清理 one-shot intent。失败不能把 thread 改回 processing，也不能隐藏 assistant answer 或原本可见的卡片。

UI 反馈可先复用 toast / debug event；后续若需要更强可观测性再加入 thread-level notice。MVP 不要求 retry button，用户重新点亮按钮并重跑下一轮即可。

## Risks / Trade-offs

- [Risk] `turnId` 在部分 legacy event 中缺失，导致绑定不稳定。  
  Mitigation: active generation 点亮时优先使用 active turn id；缺失时只允许绑定“下一次 submit 后可确认的 turn”，无法确认则清理并反馈 skipped。

- [Risk] terminal completion 后 history reconcile 可能异步改写 visible items，邮件正文过早读取会漏掉 final content。  
  Mitigation: email handler 在 terminal event 后读取当前 normalized items，并在 Codex/Claude 已有 reconcile 窗口内采用 bounded microtask / post-settlement queue；测试覆盖 final assistant 与 `fileChange` 可见后发送。

- [Risk] duplicate `turn/completed` 事件造成重复邮件。  
  Mitigation: intent status `sending` + sent key `threadId:turnId` 去重，发送开始即占位，finally 清理 intent。

- [Risk] 邮件正文可能包含用户对话中的敏感业务内容。  
  Mitigation: 该功能显式 opt-in 且一次性；不做自动全局发送；SMTP secret 不进入 frontend payload、日志或错误对象。

- [Risk] ButtonArea 已有控件密度高，新增 icon 可能挤压 composer。  
  Mitigation: 使用 icon-only button、tooltip 和 selected state；CSS 复用现有 toolbar button 尺寸，在窄屏只保留图标。

## Migration Plan

1. 新增 frontend intent state、composer props 和 email icon button。
2. 新增 email body assembler utility 与单元测试。
3. 新增 backend conversation completion email command，复用 `email` module sender，并注册到 command registry。
4. 在 `src/services/tauri.ts` 增加 typed bridge。
5. 在 terminal completion handler 接入 one-shot send path，确保 duplicate guard 和 finally cleanup。
6. 增加 i18n、CSS 和 focused tests。

Rollback 策略：移除 composer props / button 和 terminal email handler 即可停止触发；backend 新 command 未被调用时不会改变现有 Settings、SMTP、conversation lifecycle 行为。

## Open Questions

- 红框位置的准确 DOM 插入点需要实现时结合截图确认：默认优先放在 `button-area-right`、send/stop 左侧。
- 失败反馈第一版使用 toast 还是 thread inline notice，需要按现有通知系统最小侵入实现。
- 若目标 turn 只有 tool activity 但没有 assistant 文本，第一版按 skipped/failure 处理；未来可考虑发送“任务无文本输出”的活动摘要邮件。
