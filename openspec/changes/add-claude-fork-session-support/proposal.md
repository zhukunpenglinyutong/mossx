## Why

Mossx 目前已经在客户端侧具备 “fork thread / 从消息分叉” 的 UI 概念，用户可以从历史消息链路发起一个新的分支会话。问题在于，Claude engine 路径仍然主要依赖客户端自己管理 `threadId` / `sessionId` 映射，分叉语义本质上是前端在替 Claude CLI “拼” 一条新的会话上下文。

这会带来两个直接成本：

- 客户端需要维护额外的 session 映射与恢复规则，逻辑更脆，边界更难审计。
- 同一个“从历史会话开新分支”的动作，在 UI、thread truth 和 Claude CLI 三层之间没有原生统一语义，后续容易继续分叉。

Claude Code 当前 CLI 已提供 `--fork-session`，并要求与 `--resume` 或 `--continue` 配合使用。Mossx 可以把这件事降级成一个原生 CLI 能力的透传问题：客户端只表达“从哪个历史 session 分叉”，Claude Code 自己负责生成新分支会话。这能显著减少伪造上下文、手工重建映射和 session 恢复补丁的复杂度。

一句话：它就是 Claude Code 的“基于历史会话开新分支”，让 Mossx 不再手搓 fork 语义。

## 目标与边界

- 目标：让 Claude engine 在创建 fork session 时，使用已验证的 `--resume <parent-session-id> --fork-session` contract，而不是由客户端伪造 session 分叉。
- 目标：让客户端的 “fork thread” UI 动作直接映射到 Claude CLI 的 fork 能力，而不是先恢复旧 session 再伪造一个新 thread。
- 目标：保留现有 session resume / history reopen 语义不变，fork 只是新增一种从历史上下文开新分支的路径。
- 边界：本变更不重构通用 session store，不改变非 Claude engine 的 thread/session 管理策略。

## 非目标

- 不改写 Claude session 历史持久化格式。
- 不重做 thread list / sidebar 的数据模型。
- 不把 fork 能力扩展到 Codex、Gemini 或其他 engine。
- 不新增一套独立的 “fork resume” 前端状态机；fork 只是既有会话能力上的一个原生执行分支。

## What Changes

- Claude engine 增加 fork session 启动参数支持，允许从既有历史 session 派生出新 session。
- 前端 fork thread 动作在 Claude provider 下优先走 CLI 原生 fork 语义，不再依赖客户端手工拼接 session 映射。
- 现有 resume session 语义继续保留，但 fork 与 resume 的契约边界更清晰：
  - resume：回到同一条历史 session。
  - fork：从历史 session 开出新分支。
- 需要补齐前端传参、engine command 构建、以及 fork 场景的回归测试。

## 技术方案取舍

### 方案 A：在 Claude engine 中直接支持原生 fork session contract

- 做法：新增 fork session 参数契约，由 Claude engine 负责构建 `--resume <parent-session-id> --fork-session` CLI 命令，前端只传递目标历史 session 标识。
- 优点：语义最直接，客户端不用再模拟 Claude CLI 的 session 分叉行为，契约边界清晰。
- 缺点：需要补齐前端到 backend 的参数透传和命令构建测试。

### 方案 B：继续由客户端伪造 fork session

- 做法：沿用现有 thread/session 映射逻辑，在前端或 service 层自己生成新 session 关系。
- 优点：短期改动少。
- 缺点：会继续放大状态分叉和恢复逻辑复杂度，长期维护成本高，和现有 UI 的 fork thread 概念不一致。

### 结论

选择方案 A。fork session 是 Claude CLI 原生能力边界内的问题，应该由 engine 自己完成分支创建，而不是由客户端替它模拟 session 生命周期。本变更按已验证的 `--resume <parent-session-id> --fork-session` contract 实现。

## Capabilities

### New Capabilities

- `claude-fork-session-support`: 定义 Claude engine 对历史 session 分叉、fork 参数透传、fork/resume 边界与错误处理的契约。

## Impact

- 前端：fork thread 动作需要识别 Claude provider 的 fork 能力，并传递目标历史 session 标识。
- TypeScript contract：需要新增与 fork session 相关的可选参数或命令上下文字段。
- Tauri service / IPC mapping：需要把 fork session 信息完整传到 backend。
- Rust backend：Claude engine command builder 需要支持 `--fork-session` 语义，并处理非法或缺失参数。
- Tests：需要补前端 action 测试、service mapping 测试、以及 Claude command 构建测试。
- Existing resume/reopen flow：保持现有 Claude 历史会话恢复语义不变，不因 fork contract 的引入而改变。
- Dependencies：不新增第三方依赖。

## 验收标准

- 当用户从 Claude 历史会话发起 fork 时，Claude CLI 启动命令包含 fork session 参数，而不是由客户端手工拼接新的 session 映射。
- 当用户执行 resume 时，系统仍然恢复原 session，不会误转成 fork。
- fork 和 resume 的语义边界在 UI 和 engine 层都清晰可区分。
- 非 Claude provider 不受影响，仍沿用原有会话行为。
