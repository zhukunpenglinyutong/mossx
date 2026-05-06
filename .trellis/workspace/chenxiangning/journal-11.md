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


## Session 348: 修复幕布 i18n 残留与请求输入标题

**Date**: 2026-05-06
**Task**: 修复幕布 i18n 残留与请求输入标题
**Branch**: `feature/v.0.4.14-2`

### Summary

修复 conversation curtain turn boundary、requestUserInputSubmitted 标题与工具 fallback 的 i18n 残留，并完成 OpenSpec 同步归档。

### Main Changes

| 模块 | 变更 |
|------|------|
| MessagesTimeline | 将 reasoning/final boundary 标题切换到 locale-driven key |
| RequestUserInput | 收口 realtime/history/normalize 路径中的 requestUserInputSubmitted 标题与降级输出 |
| Tool Fallback | 让 tool display fallback 在无组件级 t 上下文时仍跟随当前 locale |
| OpenSpec | 创建并归档 `fix-conversation-curtain-i18n-gaps`，同步主 specs 与 project snapshot |

**验证**:
- `npx vitest run src/features/messages/components/toolBlocks/toolConstants.test.ts src/features/threads/hooks/useThreadUserInput.test.tsx src/features/messages/components/Messages.turn-boundaries.test.tsx src/utils/threadItems.test.ts src/features/threads/loaders/claudeHistoryLoader.test.ts src/features/threads/hooks/useThreadsReducer.test.ts`
- `npm run lint`
- `npm run typecheck`
- `openspec validate --changes fix-conversation-curtain-i18n-gaps --strict --no-interactive`


### Git Commits

| Hash | Message |
|------|---------|
| `0a8cbd9e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 349: 清理幕布可见文案尾债并修复测试门禁

**Date**: 2026-05-06
**Task**: 清理幕布可见文案尾债并修复测试门禁
**Branch**: `feature/v.0.4.14-2`

### Summary

清理 generated image/agent badge/MCP route notice 的剩余可见 copy，并修复 shared-session 测试门禁。

### Main Changes

| 模块 | 变更 |
|------|------|
| MessagesRows | 清理 generated image 卡片与 agent badge 的剩余中文 fallback，统一走 locale key |
| Thread Messaging | 将 Claude MCP route notice 改为 locale-driven 文案 |
| Test Gate | 修复 `Messages.shared-session.test.tsx` 的 `react-i18next` mock 缺口，消除 CI 红灯 |
| OpenSpec | 创建并归档 `fix-conversation-curtain-visible-copy-tail`，同步主 specs 与 project snapshot |

**验证**:
- `npx vitest run src/features/messages/components/Messages.shared-session.test.tsx src/features/messages/components/Messages.rich-content.test.tsx src/features/messages/components/Messages.user-input.test.tsx src/features/threads/utils/claudeMcpRuntimeSnapshot.test.ts`
- `npm run lint`
- `npm run typecheck`
- `openspec validate --changes fix-conversation-curtain-visible-copy-tail --strict --no-interactive`


### Git Commits

| Hash | Message |
|------|---------|
| `6794fe13` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
