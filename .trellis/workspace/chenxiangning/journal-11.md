# Journal - chenxiangning (Part 11)

> Continuation from `journal-10.md` (archived at ~2000 lines)
> Started: 2026-05-06

---



## Session 346: 清理 app-shell 大文件与测试门禁

**Date**: 2026-05-06
**Task**: 清理 app-shell 大文件与测试门禁
**Branch**: `feature/v.0.4.14-2`

### Summary

(Add summary)

### Main Changes

任务目标:
- 继续清理 large-file / heavy-test-noise 历史告警，完成 app-shell 剩余大文件治理。
- 收敛 useAppShellWorkspaceFlowsSection 抽取后的 startup 回归，恢复 app-shell 上下文 surface。

主要改动:
- 新增 src/app-shell-parts/useAppShellWorkspaceFlowsSection.ts，下沉 workspace/worktree/clone/terminal/navigation orchestration。
- 缩减 src/app-shell.tsx，补齐 ensureLaunchTerminal 与 openRenameWorktreePrompt 的返回面与解构，消除抽取后的 ReferenceError。
- 保持现有行为 contract，不改 runtime/tauri bridge，仅做 orchestration 拆分。

涉及模块:
- src/app-shell.tsx
- src/app-shell-parts/useAppShellWorkspaceFlowsSection.ts
- large-file governance / heavy-test-noise CI 门禁

验证结果:
- npx vitest run src/app-shell.startup.test.tsx
- npm run typecheck
- npm run lint
- npm run check:large-files
- npm run check:large-files:near-threshold --silent
- npm run check:heavy-test-noise
  - 438 test files passed
  - heavy-test-noise summary: environment warnings=1, act warnings=0, stdout/stderr payload lines=0

后续事项:
- large-file near-threshold 已清零，继续关注后续新增长文件是否回弹。
- heavy-test-noise 当前已全绿，后续新增测试文件继续按模块拆分，避免回到高噪音聚合测试。


### Git Commits

| Hash | Message |
|------|---------|
| `4240b633` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 347: 修复拆分后 app-shell 与 git-history 回归

**Date**: 2026-05-06
**Task**: 修复拆分后 app-shell 与 git-history 回归
**Branch**: `feature/v.0.4.14-2`

### Summary

修复工作区流转拆分后的 notification cleanup 与 terminal/runtime console 互斥问题；修复 git history Create PR 弹窗关闭卡死、defaults stale request、branch compare/worktree diff stale-response 覆盖，并补回归测试。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `24cb559a` | (see git log) |
| `c9f79392` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
