## Context

ccgui 创建 Codex 新会话的链路是 `spawn codex app-server -> initialize -> thread/start -> parse thread.id`。项目级 `.codex/hooks.json` 的 `SessionStart` hook 会参与 `thread/start`，并通过 `additionalContext` 注入新线程。用户侧证据显示：Codex CLI 与 `codex app-server --help` 正常，hook 单独执行也能输出合法 JSON，但在客户端创建会话时仍可能出现“运行时没有返回新的会话 ID”。

这说明问题不在 CLI 基础可用性，而在 app-server 创建 thread 的 runtime contract：hook 执行失败、权限阻塞、timeout、过重上下文或 app-server 返回结构异常，都可能让前端拿不到 `thread.id`。当前前端只能显示兜底错误，无法自动恢复。

## Goals / Non-Goals

Goals:

- 将项目 `SessionStart` hook 从会话创建硬依赖降级为可恢复增强能力。
- 为 `thread/start` 缺少 `thread.id` 建立 backend-side validation 和 bounded fallback。
- fallback 成功时保留用户可见 warning、runtime diagnostics 和新会话内提示。
- 保持健康路径、安装错误、登录错误和非 hook runtime failures 的行为可区分。

Non-Goals:

- 不修改用户项目的 `.codex/hooks.json`。
- 不默认关闭 Codex hooks。
- 不吞掉真实 Codex 环境错误。
- 不扩大到非 Codex engine。

## Decision 1: Fallback belongs in backend create-session path

采用 backend hook-safe fallback，而不是要求前端或用户手动禁用 hook。

理由：

- `thread/start` 的真实 response 与 runtime 状态只在 backend 最接近事实源。
- 前端只看到 `start_thread` 的成功/失败或空 thread id，无法可靠判断是 hook、runtime race 还是协议 shape 变化。
- backend 能复用 runtime lifecycle guard，保证 fallback 有界且不引入 storm loop。

替代方案是前端检测空 thread id 后调用“禁用 hook 创建会话”命令，但这会把 runtime 生命周期拆成两个入口，增加状态漂移。

## Decision 2: Primary path remains unchanged

第一次创建仍按当前 Codex app-server 启动参数、用户 `codexArgs`、`CODEX_HOME`、工作目录和 hook 配置执行。

只有 primary 失败或返回无 `thread.id` 时，才进入 fallback。健康项目不应因为兼容逻辑改变启动语义。

## Decision 3: Hook-safe runtime uses an explicit internal launch mode

实现上增加内部 launch mode：

- `normal`: 当前默认行为。
- `session_hooks_disabled`: 仅用于 fallback，启动 app-server 时设置让项目 SessionStart hook 跳过的环境信号。

优先使用现有项目 hook 已支持的 `CODEX_NON_INTERACTIVE=1` 作为跳过信号；如果后续 Codex CLI 提供官方 disable-hooks 配置，再把该 mode 的实现替换为官方机制。该信号只能用于 fallback runtime，不应污染用户的全局 Codex 环境。

## Decision 4: Validate thread/start response before returning to frontend

backend 必须解析 `thread/start` response 并确认存在 thread id。候选路径至少包括：

- `result.thread.id`
- `thread.id`
- `result.threadId`
- `result.thread_id`
- `threadId`
- `thread_id`

全部缺失时，系统判定为 `invalid_thread_start_response`，记录 response 摘要，然后触发一次 fallback。这样前端不再负责把“空 response”解释成最终失败。

## Decision 5: Fallback success must be visible in both UI and conversation context

fallback 成功不等于一切正常。系统必须同时提供：

- runtime diagnostics：记录 workspace、engine、primary failure、fallback reason、fallback mode、fallback result。
- frontend notice：提示用户项目 SessionStart hook 已跳过。
- new conversation notice：通过 `thread/start` 支持的安全字段或后续首轮提示，让 agent 明确知道项目 hook context 未注入。

如果 app-server 支持 `developerInstructions` / `baseInstructions` / equivalent config，优先在 fallback `thread/start` 中注入短提示。若不支持，则至少通过用户可见事件/diagnostics 暴露，避免静默降级。

## Failure Classification

应触发 fallback 的场景：

- `thread/start` request timeout。
- `thread/start` response 无可解析 `thread.id`。
- app-server 事件或 stderr 可归类为 hook failure / hook timeout / permission denial。
- primary app-server 因 SessionStart 相关上下文注入导致 initialize 后 thread creation 失败。

不应触发 fallback 的场景：

- Codex CLI 不存在或不支持 app-server。
- app-server initialize 失败且与 hook 无关。
- 账号未登录、unauthorized、rate limit。
- 用户 `codexArgs` 解析失败。
- fallback 已经尝试过一次。

## Data Flow

1. Frontend 调用 `start_thread(workspaceId)`。
2. Backend `ensure_codex_session` 使用 normal mode 获取或启动 runtime。
3. Backend 执行 `thread/start` 并解析 response。
4. 若 response 含 `thread.id`，直接返回。
5. 若命中 fallback 条件，runtime manager 记录 fallback acquisition。
6. Backend 停止或替换当前 Codex runtime，使用 `session_hooks_disabled` mode 启动新 runtime。
7. Backend 重试一次 `thread/start`，并注入 hook skipped notice。
8. 成功则返回 thread response，并发出可观测 warning；失败则返回 primary + fallback 错误摘要。

## Risks / Mitigations

- Risk: fallback 掩盖真实 hook 配置错误。  
  Mitigation: fallback 成功必须展示 warning，并保留 diagnostics。

- Risk: `CODEX_NON_INTERACTIVE=1` 不是官方全局 hook disable contract。  
  Mitigation: 仅作为当前项目 hook-safe 信号使用，封装在 internal launch mode，后续可替换。

- Risk: fallback 产生 runtime replacement race。  
  Mitigation: 复用现有 runtime acquire / replacement guard，不新增独立并发入口。

- Risk: response 摘要可能泄露敏感内容。  
  Mitigation: diagnostics 只记录错误类型、method、字段存在性和截断摘要，不记录完整 prompt 或 token。

## Rollback

移除 fallback 分支和 internal launch mode 即可恢复当前行为。该变更不新增持久化 schema，不修改用户项目文件，因此无需数据迁移。

## Open Questions

- Codex app-server 是否提供官方禁用 SessionStart hook 的 config / feature flag？如果有，应优先替代 `CODEX_NON_INTERACTIVE=1`。
- `thread/start` 是否稳定支持 `developerInstructions` 或等价字段？需要通过 generated schema / live probe 确认可用注入位置。
- UI notice 应作为 toast、runtime notice dock，还是两者都显示？P0 目标至少需要一个显性入口。
