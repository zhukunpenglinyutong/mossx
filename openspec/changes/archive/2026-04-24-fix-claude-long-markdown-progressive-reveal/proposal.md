## Why

本次问题应当从 `fix-claude-windows-streaming-visibility-stall` 独立出来，原因有两个：

1. 旧 change 的根因边界是 `Windows native Claude Code visible stall`，核心是平台专属 mitigation。
2. 本次新增证据表明：`Claude Code` 在本地 CLI / backend 等价模式下，长正文 Markdown **本身可以真实流式输出**。问题不在“最终长文只能 completed 才出现”，而在于 **GUI 中后段 progressive reveal 在部分 Claude 会话里失真**。

本轮本地后端采样结果：

- argv prompt 测试中，Claude 在最终 `assistant/result` 之前实际输出了 `51` 个 `content_block_delta/text_delta`。
- 完全等价当前 backend `--input-format stream-json` 的多行输入测试中，Claude 在最终 `assistant/result` 之前实际输出了 `24` 个 `content_block_delta/text_delta`。

这说明“长 Markdown 不能流式”并不是根因。进一步排查后又确认了第二个缺口：

- 当前 Claude parser 会把 `stream_event/content_block_delta/text_delta` 当作 realtime delta 正常下发；
- 但 turn 末尾额外到来的 `assistant` 全量 snapshot 没有与前面的 streamed deltas 共用同一条 cumulative-text tracker；
- 结果就是末尾 full snapshot 会被错误当成“新的整段 delta”再次下发，既制造“最后一大坨突然出现”，也会在 synthetic completed 路径里把长 Markdown 再拼一份。

因此本次问题实际分成两层：

1. **render-side visible stall recovery blind spot**
2. **backend-side cumulative snapshot dedupe blind spot**
3. **live canvas middle-step collapse 把 latest reasoning 文案留在了 loading 区**

## Goals

- 保持现有 `Windows + Claude` 候选 mitigation 路径不回退。
- 新增 `Claude engine-level` 的 long-markdown progressive reveal recovery。
- 当 `assistant text delta` 已到达，但可见文本在 bounded window 内不再增长时，系统 MUST 能自动切换到 plain-text live surface，直到 completed 再回到最终 Markdown。
- 当 `assistant` 首个正文 chunk 还未出现，但 Claude 已经产生 latest reasoning 与后续 tool activity 时，消息幕布 MUST 继续保留 latest reasoning row，而不是只让底部 loading 区显示那句文案。
- Claude backend MUST 让 streamed `text_delta` 与后续 `assistant` cumulative snapshot 共用同一套已发文本跟踪，避免末尾 full snapshot 被重复下发。
- Claude realtime chain MUST 为 reasoning 与 assistant text 维持独立 render item identity，不能因为 provider 复用原生 item id 而让两者在 conversation curtain 中互相覆盖。
- 保持 provider/model 只作为 correlation 维度，不作为该问题的主入口。
- 不改动 Claude backend event contract，不引入新的持久化 schema。

## Non-Goals

- 不重写 Claude CLI 调用方式。
- 不对所有引擎统一降级到 plain-text live surface。
- 不扩大成全局 Markdown 渲染重构。
- 不顺手处理无关的 timeline / tool card / scroll 行为。

## What Changes

- 新增 `Claude` 专属 engine-level stream recovery profile，用于 long-markdown visible stall 恢复。
- 将 `visible-output-stall-after-first-delta` timer / activation 从 Windows-only 条件放宽到 Claude engine-level evidence path。
- 调整 Claude live middle-step collapse：在首个 assistant chunk 前保留 latest reasoning row，并避免 `WorkingIndicator` 变成该 reasoning 文案的唯一可见承载面。
- 修正 Claude backend 的 cumulative-text tracker：`stream_event text_delta` 与后续 `assistant` snapshot 共享同一累计状态，避免 full snapshot 在末尾被再次转成整段 delta。
- 修正 Claude realtime render item routing：reasoning 与 assistant text 不再复用同一个幕布 item id，conversation curtain / assembler 也不再允许同 id 跨 kind 互相覆盖。
- 补充 completed merge 兜底：当已有 live markdown 已经包含 completed 主体时，不再把长正文再拼一遍。
- Claude turn completed 后补一次 history reconcile，使用 session history authoritative snapshot 刷新终态，清掉 realtime 路径残留的重复正文或尾部偏差。
- 保留既有 `claude-qwen-windows-render-safe` 与 `claude-windows-visible-stream` 的 Windows 候选 /激活行为，避免回退既有 #399 修复。
- 修改稳定 spec，使其明确：当 live Markdown progressive reveal 失真时，系统可以在 streaming 中间态切换到 plain-text visible surface，并在 completed 时立即收敛回最终 Markdown。

## Acceptance

- Claude 长正文流式会话在非 Windows 平台出现 visible stall evidence 时，系统 MUST 能激活 engine-level recovery profile。
- 激活后 live assistant surface MUST 从 stalled Markdown path 恢复到可见增长的 plain-text streaming surface。
- Claude 在首个 assistant message 还未出现、但 latest reasoning 与 tool cards 已经存在时，消息幕布 MUST 保留 latest reasoning row；底部 `WorkingIndicator` MUST NOT 成为该 reasoning 文案的唯一可见承载面。
- Claude turn 末尾若收到与已流式正文等价的 `assistant` / completed cumulative snapshot，系统 MUST NOT 再把整篇 Markdown 作为新增 delta 或 completed duplication 追加一次。
- Claude provider 若在同一 turn 内复用原生 item id 承载 reasoning 与 assistant text，系统 MUST 仍然在幕布上保留两条独立 live item，不得让 assistant 正文被 reasoning 条目覆盖掉。
- Claude turn completed 后，系统 MUST 允许按 session history 做一次 authoritative reconcile；若 history 中的最终 assistant 正文与本地 realtime 终态不同，history snapshot MUST 覆盖本地重复尾段或脏终态。
- completed 后消息 MUST 立即回到最终稳定 Markdown，不得停留在临时降级态。
- Windows Claude 原有 candidate/evidence 路径 MUST 继续保持。
- 非 Claude 引擎 MUST 保持现有基线行为。
