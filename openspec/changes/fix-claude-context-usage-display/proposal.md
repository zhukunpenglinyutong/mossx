## Why

Claude Code 当前上下文展示存在两个用户可见问题：

- 历史会话读取固定使用 `~/.claude/projects`，没有跟随 `CLAUDE_HOME` 或配置中的 Claude home，导致自定义 Claude home 时 GUI 读取路径与 CLI 实际写入路径分叉。
- Composer 中 Claude 上下文只显示 legacy `上下文: 0%` 这类弱提示；当 runtime 尚未收到 telemetry 时会把“未知”呈现成 `0%`，容易误导用户判断当前上下文是否安全。

Claude Code CLI 已在 stream/statusline 事件中暴露 `context_window` 动态数据，包括 `context_window_size`、`current_usage`、`used_percentage`、`remaining_percentage` 等字段。系统应优先使用这些运行时事实，而不是长期依赖 `200000` fallback 与历史 JSONL 的最后 usage snapshot。

## What Changes

- Claude history/session 路径解析改为配置优先：
  - 优先使用当前 Claude engine config / settings 中的 Claude home。
  - 其次使用 `CLAUDE_HOME` 环境变量。
  - 最后才回退 `dirs::home_dir()/.claude`。
- Claude runtime usage pipeline 优先采用 CLI `context_window` 动态字段：
  - 使用 `context_window.current_usage` 作为当前背景信息窗口已用 token snapshot。
  - 使用 `context_window.context_window_size` 作为窗口容量。
  - 同步透传 `used_percentage` / `remaining_percentage`，避免前端重复猜测。
- Claude Composer 上下文展示重做为接近 Codex 的 detail tooltip：
  - 主入口仍在输入框 footer 的上下文 indicator 位置。
  - hover/detail 面板展示总消耗、背景信息窗口、已用/剩余百分比、已用 token / 窗口容量、数据新鲜度。
  - 当 telemetry 尚未到达时显示“等待用量刷新”或“暂无上下文 telemetry”，不得显示误导性的 `0%`。
- 保留 legacy fallback：
  - 若动态字段缺失，仍可使用历史 usage snapshot 和 `200000` fallback。
  - fallback 状态必须标记为估算/待刷新，不得伪装成实时数据。

## Scope

In scope:

- Claude Code engine runtime usage extraction.
- Claude history/session path resolution.
- Composer Claude context indicator and tooltip/detail display.
- Unit tests and minimal UI regression tests for the new behavior.

Out of scope:

- 不改变 Codex dual-view 的 Codex-only visibility boundary。
- 不为 Claude 实现 Codex-style proactive auto-compaction threshold。
- 不修改 Claude CLI 自身行为。
- 不重做全局 usage analytics / billing 统计。

## User Experience

用户在 Claude Code 会话中看到的 context indicator 应表达三种不同事实：

- 实时：已收到当前 Claude CLI `context_window` snapshot，展示真实窗口用量。
- 待刷新：刚恢复历史或刚完成 compact，尚未收到新的 runtime snapshot。
- 估算：只有历史 usage / fallback window 可用，展示为估算而不是实时。

Claude 的 detail tooltip 应与 Codex 的信息密度接近，但文案保持 Claude 语义：不出现 Codex-only 的“自动压缩阈值”控制，避免暗示 Claude 支持相同 proactive compaction 行为。
