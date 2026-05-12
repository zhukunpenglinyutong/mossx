## Context

issue #547 的关键观察是：

- GUI 创建的 Claude 会话 transcript 通常带有 `entrypoint: "sdk-cli"`。
- TUI 原生创建的 Claude 会话通常带有 `entrypoint: "cli"`。
- GUI 会话可以通过 `claude --resume <session_id>` 恢复。
- TUI 内无参数 `/resume` picker 看不到 GUI 会话。

当前代码与该观察一致：

- `src-tauri/src/engine/claude.rs` 使用 `claude -p` print mode，并通过 `--output-format stream-json` 与 CLI 通信。
- 新 Claude 会话会生成稳定 UUID，并通过 `--session-id` 传入 CLI。
- 继续 Claude 会话时使用 `--resume <session_id>`。
- 前端 finalized Claude thread id 形如 `claude:<session_id>`。
- `useSidebarMenus` 当前只提供 `Copy ID`，没有复制恢复命令或打开 Claude TUI 的显式入口。

因此，本变更应补齐产品 affordance，而不是试图让 GUI transcript 冒充 TUI transcript。

## Goals / Non-Goals

**Goals:**

- 让用户从 GUI Claude 会话可靠跳转到 Claude TUI。
- 让 session id 和 resume command 可见、可复制、可测试。
- 使用最小跨层改动复用已有 terminal 能力。
- 保留上游 Claude transcript 的真实 metadata。

**Non-Goals:**

- 不修改 Claude CLI 输出格式或启动模式。
- 不修复 Claude TUI `/resume` picker 上游策略。
- 不写 JSONL migration。
- 不为所有 engines 设计统一外部终端启动器。

## Decisions

### Decision 1: Do not mutate transcript metadata

GUI transcript 的 `entrypoint: "sdk-cli"` 是由 Claude CLI print mode 产生的事实。即使它可能影响 TUI picker，也不应由 mossx 修改为 `cli`。

Alternatives considered:

- Patch JSONL `entrypoint` after each turn. Rejected because it corrupts source-of-truth history and may break future Claude Code assumptions.
- Add a user-facing "make visible in picker" migration. Rejected for the same reason.

Rationale: 工程系统不能通过改写上游事实源来获得短期 UI 一致性。

### Decision 2: Build commands from canonical Claude session id

The canonical id source is finalized `claude:<session_id>` thread identity. The command builder MUST strip only the `claude:` prefix and reject pending or malformed identities.

Rules:

- `claude:<session_id>` -> session id is `<session_id>`.
- `claude-pending-*` -> no resume command.
- non-Claude thread -> no Claude resume command.
- subagent virtual ids are not top-level Claude TUI resume targets in this MVP and should be suppressed until verified resumable.

Rationale: 只对已完成 session binding 的 conversation 暴露恢复入口，避免把 pending/local UI identity 当成 Claude native id。

### Decision 3: Copy command is P0, open terminal is P1/P0 depending on existing callback fit

Copying the command requires no backend changes and solves the confirmed user path. Opening a terminal is higher UX value but must respect current component boundaries.

Preferred MVP:

1. Add `Copy Claude resume command` to Claude finalized thread menu.
2. Add helper for platform-aware command construction.
3. Add explanatory UI copy.
4. If AppShell can pass terminal callbacks cleanly, add `Open in Claude TUI` in the same change; otherwise keep it out of MVP and rely on copy command.

Rationale: Copy command is the zero-risk core fix; terminal opening should not force a broad architecture shortcut.

### Decision 4: Prefer built-in terminal before external OS terminal

The app already has an internal terminal runtime. Opening `claude --resume <session_id>` inside that terminal avoids platform-specific external Terminal launch differences.

Alternatives considered:

- macOS `osascript` Terminal launch. Rejected for MVP because Windows/Linux parity and shell quoting require a separate contract.
- Tauri shell open. Rejected because it does not directly express "open terminal and run command" cross-platform.

Rationale: Reuse the existing terminal panel as glue code. Do not create a second terminal-launch subsystem prematurely.

## Command Construction

The command builder should be small and explicit:

```ts
type ClaudeResumeCommandInput = {
  workspacePath: string;
  sessionId: string;
  platform: "windows" | "posix";
};
```

Expected output:

- POSIX: `cd '<workspacePath>' && claude --resume '<sessionId>'`
- Windows: `cd /d "<workspacePath>" && claude --resume "<sessionId>"`

The exact helper may live near sidebar menu helpers or a shared workspace command utility. It MUST quote workspace paths and session ids; do not reuse the existing simple `cd "${relativeWorktreePath}"` pattern for this command without hardening quote handling.

## UI Placement

The lowest-risk first placement is thread context menu:

- `Copy ID`
- `Copy Claude resume command`
- `Open in Claude TUI` only if terminal callback is available without architectural shortcuts

Optional later placement:

- A detail panel/session metadata row showing session id and command.
- A toast after copy explaining `/resume <session_id>` fallback.

## Data Flow

```text
User right-clicks Claude finalized thread
  -> useSidebarMenus detects threadId starts with "claude:"
  -> derive native sessionId by stripping prefix
  -> build resume command from active workspace.path + sessionId
  -> Copy action writes command to clipboard
  -> Optional Open action opens/reuses terminal in workspace and writes claude --resume command
```

## Risks / Trade-offs

- [Risk] Workspace path quoting differs by platform. Mitigation: centralize command construction and unit-test spaces, quotes, Windows drive paths, and POSIX apostrophes.
- [Risk] Sidebar hook does not currently own terminal actions. Mitigation: pass a narrow callback from AppShell rather than importing terminal controller into the hook.
- [Risk] Users expect `/resume` picker itself to work. Mitigation: UI copy must say explicit resume is the reliable path.
- [Risk] Subagent session ids may look like Claude sessions but are not equivalent TUI resume targets. Mitigation: MVP suppresses unsupported virtual ids until verified.

## Rollback

- Remove the new menu items and i18n keys.
- Keep `Copy ID` unchanged.
- No data migration or transcript mutation is involved, so rollback is UI-only.
