## Context

当前 `skills_list_local_for_workspace` 已经集中扫描 workspace-managed、project `.claude/.codex/.agents/.gemini` 与 global `.claude/.codex/.agents/.gemini`。Issue #394 的缺口是 Claude plugin cache 位于同一 Claude home 下，但目录形态是二级 cache：`plugins/cache/<owner>/<plugin>/skills`。

## Decisions

### Decision 1: 增加独立 source `global_claude_plugin`

不把 plugin skill 混入 `global_claude`，而是返回独立 source。

- 便于 UI 与 debug payload 区分真实来源。
- 不改变现有 `global_claude` 目录语义。
- Composer 可以继续用 source priority 控制同名候选的默认顺序。

### Decision 2: 仅扫描二级 plugin cache skills root

扫描范围固定为 `~/.claude/plugins/cache/*/*/skills`。

- 与 Claude Code plugin cache 的已知安装形态对齐。
- 避免对 cache 下任意深度做递归扫描，降低意外 IO 与安全边界风险。
- 缺失目录、不可读目录或非目录条目均跳过，不阻塞其他 skill source。

### Decision 3: 不在本 PR 处理 symlink skill

Issue #303 属于相邻但独立的问题。该 PR 只解决 plugin cache discovery，保持 `discover_skills_in` 现有 symlink 策略，避免把安全/循环链接边界混入首 PR。

## Risks / Mitigations

- Risk: plugin cache 下有多个 plugin 提供同名 skill。Mitigation: 返回 source metadata；Composer slash 候选继续用 scope/name 去重和 source priority 收敛。
- Risk: 只有 plugin skill 时 Settings tree 无法定位根目录。Mitigation: Claude engine 增加 `/.claude/plugins/cache` path marker，用于推导浏览根。

## Verification

- Rust unit test: plugin cache roots discovery。
- Rust unit test: merge priority includes `global_claude_plugin` as a global source。
- TypeScript typecheck: Settings/Composer source priority changes保持类型稳定。
