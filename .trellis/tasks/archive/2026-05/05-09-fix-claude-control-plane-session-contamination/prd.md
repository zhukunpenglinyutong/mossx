# 修复 Claude 控制面会话污染

## Linked OpenSpec Change

- `openspec/changes/fix-claude-control-plane-session-contamination`

## Problem

用户反馈 Claude Code 引擎自动出现 `app-server`、`developer` 伪会话和空白历史。根因不是单点 UI 渲染，而是 Codex app-server 控制面 payload 在特定环境下进入 Claude transcript，并被历史扫描/loader 当成真实对话。

## Scope

- Codex launch identity gate：真实 Codex app-server capability 才能进入 Codex session。
- Win/mac 兼容边界：平台差异只影响 wrapper/direct launch，不影响 engine identity gate。
- Claude history contamination filtering：后端权威过滤，前端兜底过滤。
- CI gate：focused Rust tests、focused Vitest tests、OpenSpec strict validation。

## Non-Goals

- 不删除用户 Claude JSONL 原文件。
- 不重写多引擎架构。
- 不新增 UI 设置开关。
- 不把本次修复降级成前端隐藏字符串。

## Acceptance

- 缺真实 Codex 或 custom bin 指向 Claude 时，Codex launch fail closed。
- Windows wrapper retry 只适用于 Codex-capable wrapper。
- macOS/Linux direct binary 也必须通过 app-server capability gate。
- control-plane-only Claude transcript 不出现在会话列表。
- mixed transcript 过滤污染但保留真实消息。
- focused Rust/Vitest tests 和 OpenSpec strict validation 通过或明确记录阻塞原因。
