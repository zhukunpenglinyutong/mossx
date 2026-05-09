## Why

远程 Web 端通过 Cloudflare Tunnel 等反向代理访问时，WebSocket 连接可能短暂断开。当前 Web shim 会自动重连，但重连后只接收新的 realtime event；如果断线期间错过 `turn/completed` 或 `runtime/ended`，远程 UI 可能停留在“进行中”。

## 目标与边界

- WebSocket 断线后重连成功时，前端执行一次轻量状态补偿。
- 补偿只刷新当前 active workspace，必要时补当前 active thread。
- 保持 Tauri command、daemon RPC、runtime event payload contract 不变。

## 非目标

- 不实现事件回放。
- 不引入轮询或心跳策略。
- 不扫描所有 workspace。
- 不重构 WebSocket 协议。

## What Changes

- Web service shim MUST distinguish first socket open from reconnect open.
- Reconnect open MUST emit a browser-local reconnect signal.
- React thread state orchestration MUST consume that signal only in Web service mode.
- Reconnect compensation MUST be idempotent and scoped to the active workspace/thread.

## Impact

- Web shim: `src-tauri/src/bin/cc_gui_daemon/web_service_runtime.rs`
- Frontend events/thread hook: `src/services/events.ts`, `src/features/threads/hooks/useThreads.ts`
- Tests: targeted hook/service tests where feasible
- API/依赖：无新增依赖；无后端 command payload 变更
