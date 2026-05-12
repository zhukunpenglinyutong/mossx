## Why

用户在 `desktop-cc-gui` 中创建的 Claude Code 会话可以通过 `claude --resume <session_id>` 直接恢复，但在 Claude TUI 内执行无参数 `/resume` 时不会出现在 picker 中。该问题已经在 issue #547 复现，根因边界更接近 Claude Code TUI 对 `entrypoint: "sdk-cli"` transcript 的 picker 可见性策略，而不是本仓库的 Claude history loader 失效。

现在需要补齐产品侧的显式恢复入口：让用户不用理解 `sdk-cli` / `cli` transcript 差异，也能可靠把 GUI 会话接回 Claude TUI。

## 目标与边界

- 为 GUI 创建的 Claude 会话提供可靠的 TUI continuation affordance。
- 在 sidebar/thread context menu 或等价会话操作面中暴露 Claude session id 与恢复命令。
- 优先使用当前已知有效路径：`claude --resume <session_id>`。
- 保持 Claude transcript 的事实来源，不伪造或批量修改 `entrypoint` metadata。
- 保持 Codex、Gemini、OpenCode 的 thread menu 行为不回退。

## What Changes

- Claude thread context menu MUST 新增 `Copy Claude resume command` 或等价操作，复制可直接执行的命令：
  - POSIX: `cd '<workspace>' && claude --resume '<session_id>'`
  - Windows: `cd /d "<workspace>" && claude --resume "<session_id>"`
- Claude thread context menu MAY 新增 `Open in Claude TUI` 操作；如果实现该操作，则 MUST 复用应用内 terminal panel，并在对应 workspace 启动 `claude --resume <session_id>`。
- Claude thread context menu MUST 保留 `Copy ID`，且复制值仍为裸 Claude session id，不带 `claude:` 前缀。
- UI 文案 MUST 说明：如果 Claude TUI 内无参数 `/resume` picker 看不到 GUI 会话，可以使用复制的 resume command，或在 TUI 中执行 `/resume <session_id>`。
- session id 提取 MUST 只对 finalized Claude thread 生效；`claude-pending-*`、subagent 虚拟节点或无法解析 session id 的条目不得暴露错误恢复命令。
- 该变更不新增外部依赖。

## 非目标

- 不修改 Claude JSONL transcript 中的 `entrypoint` 字段。
- 不把 GUI 会话伪装成 TUI 原生 `entrypoint: "cli"` 会话。
- 不实现 Claude TUI 无参数 `/resume` picker 的上游行为修复。
- 不新增跨平台外部系统终端启动器作为第一阶段必选能力。
- 不改变 Claude runtime 创建方式：仍使用本地 `claude` CLI print mode + `stream-json`。
- 不重构整个 thread context menu 或 workspace session catalog。

## 技术方案对比

### Option A: 修改 JSONL metadata，把 `sdk-cli` 改成 `cli`

- 优点：如果 TUI picker 仅按 `entrypoint` 过滤，可能让无参数 `/resume` picker 看到 GUI 会话。
- 缺点：污染 Claude Code 官方 transcript，风险不可控；未来 CLI schema 变化会破坏兼容；会掩盖真实创建路径，影响诊断。
- 结论：拒绝。这个方案看似“修得彻底”，本质是篡改上游事实源。

### Option B: 产品侧显式恢复入口

- 优点：基于已验证可用的 `claude --resume <session_id>`；改动面小；不依赖 TUI picker 内部策略；用户路径清晰。
- 缺点：无参数 `/resume` picker 仍可能看不到 GUI 会话，需要 UI 文案解释。
- 结论：采用。它尊重上游 transcript 事实，同时解决用户实际继续会话的问题。

### Option C: 外部系统 Terminal 一键打开

- 优点：最接近用户对 “Open in Claude TUI” 的直觉。
- 缺点：macOS / Windows / Linux terminal 启动差异大，shell quoting 与安全边界复杂；当前仓库已有内置 terminal panel，更适合作为第一阶段承载面。
- 结论：后续增强。第一阶段优先复用内置 terminal；外部 Terminal 可在明确需求和跨平台 contract 后追加。

## Capabilities

### New Capabilities

- `claude-tui-resume-affordance`: 定义 GUI Claude 会话向 Claude TUI 显式恢复的用户操作、命令生成、session id 边界和验证要求。

### Modified Capabilities

None.

## Impact

- Frontend:
  - `src/features/app/hooks/useSidebarMenus.ts`
  - `src/features/app/hooks/useSidebarMenus.test.tsx`
  - 可能需要向 sidebar menu 注入 `onOpenClaudeTui` / `onCopyClaudeResumeCommand` 等 callback。
- Terminal integration:
  - 优先复用已有 terminal controller / `terminal_open` / `writeTerminalSession` 链路。
  - 如现有组件边界不允许 sidebar 直接打开 terminal，应通过 AppShell callback 向下传递，不新增全局事件黑洞。
- i18n:
  - `src/i18n/locales/en.part*.ts`
  - `src/i18n/locales/zh.part*.ts`
- Tests:
  - Focused Vitest for Claude thread menu item visibility, command construction, pending thread suppression, and callback invocation.
- Dependencies:
  - No new dependency.

## 验收标准

- Claude finalized thread 右键菜单显示复制恢复命令入口，复制结果包含 workspace path 和裸 session id。
- `claude:<session_id>` 的 `Copy ID` 仍只复制 `<session_id>`。
- 非 Claude thread 不显示 Claude TUI 恢复入口。
- `claude-pending-*` 或无法解析 session id 的条目不显示或禁用恢复入口，并且不会复制错误命令。
- `Open in Claude TUI` 若在第一阶段实现，必须在正确 workspace 打开 terminal 并发送 `claude --resume <session_id>`；若未实现，复制恢复命令入口仍必须可用。
- UI copy 必须明确说明无参数 `/resume` picker 不可靠时使用显式 `/resume <session_id>`。
- `openspec validate add-claude-tui-resume-actions --type change --strict --no-interactive` 通过。

## 实施回写

- 已新增 `claudeResumeCommand` helper，集中处理 finalized Claude thread id 解析、POSIX/Windows 复制命令构造，以及应用内 terminal 可安全写入的 `claude --resume <session_id>` 命令。
- 已在 Claude finalized thread context menu 中加入 `Copy Claude resume command` 与 `Open in Claude TUI`；`Copy ID` 保持复制裸 session id。
- 已通过 AppShell callback 复用现有 terminal infrastructure，没有新增外部系统 terminal launcher，也没有修改 Claude transcript metadata。
- 已抑制 `claude-pending-*`、非 Claude thread、无法解析 native session id 的条目，避免复制或执行无效 resume command。
- 已补齐 English / Chinese i18n 文案，并在 toast/help copy 中说明 `claude --resume <session_id>` 显式恢复路径。
- 已完成自动化验证：OpenSpec strict validate、focused Vitest、full Vitest、typecheck、lint、`git diff --check`。
- 已完成手工验证：GUI-created Claude session 可以通过 `Open in Claude TUI` 在应用内 terminal 恢复同一会话。
