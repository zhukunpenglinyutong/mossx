## Overview

本阶段把 Computer Use 从“安装态/签名/parent contract 诊断”推进到“可由 mossx 显式请求 Codex CLI 执行”。核心原则不变：mossx 不是 helper parent，也不是 Computer Use MCP client；真正使用 desktop tools 的进程必须是官方 Codex runtime。

## Architecture

```text
User
  -> Computer Use surface
  -> Tauri command: run_computer_use_codex_broker
  -> Computer Use broker gate
     - macOS only
     - bridge enabled
     - CLI plugin cache descriptor present
     - helper bridge verified
     - permission/approval blockers absent
     - single-flight lock acquired
  -> existing Codex app-server session
  -> hidden Codex thread
  -> prompt instructs Codex to use Computer Use if needed
  -> app-server events collected
  -> broker result returned to UI
```

## Backend Contract

新增请求结构：

```rust
struct ComputerUseBrokerRequest {
    workspace_id: String,
    instruction: String,
    model: Option<String>,
    effort: Option<String>,
}
```

新增结果结构：

```rust
struct ComputerUseBrokerResult {
    outcome: ComputerUseBrokerOutcome,
    failure_kind: Option<ComputerUseBrokerFailureKind>,
    bridge_status: ComputerUseBridgeStatus,
    text: Option<String>,
    diagnostic_message: Option<String>,
    duration_ms: u64,
}
```

枚举：

- `outcome`: `completed | blocked | failed`
- `failure_kind`: `unsupported_platform | bridge_unavailable | bridge_blocked | workspace_missing | codex_runtime_unavailable | already_running | invalid_instruction | timeout | codex_error | unknown`

## Gating Rules

Broker MUST run only when:

- platform is `macos`
- Computer Use bridge feature flag is enabled
- status has official plugin detected and enabled
- helper path and descriptor point to CLI plugin cache contract
- helper bridge has been verified in current session
- no hard blocked reason remains except `permission_required` / `approval_required`
- workspace exists and can ensure Codex runtime
- instruction is non-empty after trimming

If only `permission_required` or `approval_required` remains, broker MAY run after explicit user action because the official Codex runtime is the component that can trigger the real macOS permission / approval prompt. The broker UI MUST show that those blockers may still stop the task.

## Prompt Boundary

The hidden thread prompt MUST:

- state that this is an explicit user-requested Computer Use task
- include the user instruction verbatim inside a quoted/task block
- instruct Codex to use official Computer Use tools only when needed
- require a concise final summary of actions and result
- forbid changing files unless the user instruction explicitly asks for file changes

The prompt MUST NOT expose private implementation details like helper paths unless needed for diagnostics.

## UI Behavior

Computer Use status card gains a broker panel:

- visible only on macOS bridge surface
- enabled only when broker gate passes
- disabled with precise blocked reason otherwise
- contains task textarea, run button, result/error block
- never auto-runs on status refresh

## Security And Safety

- No background automation.
- No direct helper execution.
- No automatic approval escalation.
- No mutation of official plugin cache.
- Single-flight lock protects the broker lane and may reuse existing Computer Use investigation lock or a dedicated broker lock.
- Broker result snippets should be bounded before rendering.

## Open Questions

- Whether Codex app-server sessions expose the same plugin/tool surface as interactive Codex CLI in all release channels.
- Whether a dedicated temporary Codex thread should be archived immediately after each broker run or retained for audit. MVP archives hidden thread after completion, matching `run_codex_prompt_sync`.
