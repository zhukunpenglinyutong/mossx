# Journal - chenxiangning (Part 13)

> Continuation from `journal-12.md` (archived at ~2000 lines)
> Started: 2026-05-13

---



## Session 436: 压缩 composer 消息队列高度

**Date**: 2026-05-13
**Task**: 压缩 composer 消息队列高度
**Branch**: `feature/v0.4.17`

### Summary

压缩消息队列视觉高度并修正垂直居中对齐。

### Main Changes

## 本次完成
- 单独提交 `fc713308 fix(composer): 压缩消息队列高度并居中对齐`。
- 调整 `src/features/composer/components/ChatInputBox/styles/banners.css` 中 `.message-queue*` 样式。
- 降低队列外层 gap/padding/max-height，压缩单条 item 的 padding/min-height。
- 将 item、content、status、actions 调整为垂直居中，避免截图中的上下对齐偏差。
- 压缩序号圆点与操作按钮尺寸，降低消息队列在 composer 上方的视觉占高。

## 验证
- `git diff --check -- src/features/composer/components/ChatInputBox/styles/banners.css` 通过。
- 用户已确认视觉效果通过。

## 范围控制
- 本次 commit 只包含消息队列 CSS 局部样式。
- 未纳入 installer/settings 相关未提交改动。


### Git Commits

| Hash | Message |
|------|---------|
| `fc713308` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 437: 记录 CLI installer 实时日志收口

**Date**: 2026-05-13
**Task**: 记录 CLI installer 实时日志收口
**Branch**: `feature/v0.4.17`

### Summary

完成 Codex/Claude Code 一键安装实时日志、remote 事件透传、边界修复与验证门禁收口。

### Main Changes

本次会话完成 OpenSpec change add-cli-one-click-installer 的实现收口，并提交 0b0a57b1。

主要改动：
- 新增受控 CLI installer backend，限定 Codex / Claude Code 的 npm global @latest 安装与更新策略。
- 安装执行从一次性 output 改为 spawn + stdout/stderr 逐行读取，发出 run-scoped cli-installer-event。
- local 与 remote daemon 均支持 installer plan/run；remote daemon 通过现有 notification 通道透传 installer progress。
- Settings CLI 验证面板增加 install/update 入口、确认计划、实时日志、耗时、最终结果和 post-install doctor 展示。
- 修复边界：Unicode 日志截断不 panic、空 runId fallback、spawn/read/timeout 错误显式上报、doctor 失败不吞安装结果、plan 请求取消/竞态保护。
- 补充 zh/en i18n、TS/Rust 类型、OpenSpec delta 和 focused tests。

验证：
- cargo test --manifest-path src-tauri/Cargo.toml cli_installer
- npx vitest run src/features/settings/components/settings-view/sections/CodexSection.test.tsx src/services/tauri.test.ts src/services/events.test.ts
- npm run typecheck
- npm run check:runtime-contracts
- node --test scripts/check-large-files.test.mjs
- npm run check:large-files:near-threshold
- npm run check:large-files:gate
- node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs
- npm run check:heavy-test-noise
- openspec validate --all --strict --no-interactive
- git diff --check

注意：manual smoke 仍需覆盖 macOS local、Windows native、remote daemon、WSL boundary。


### Git Commits

| Hash | Message |
|------|---------|
| `0b0a57b1` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 438: 缩小 composer 输入区提交按钮尺寸

**Date**: 2026-05-13
**Task**: 缩小 composer 输入区提交按钮尺寸
**Branch**: `feature/v0.4.17`

### Summary

缩小输入区右侧提交/停止圆形按钮本体尺寸，保持 icon 与发光效果不变。

### Main Changes

## 本次完成
- 单独提交 `391c7524 fix(composer): 缩小输入区提交按钮尺寸`。
- 调整 `src/features/composer/components/ChatInputBox/styles/buttons.css` 中 `.submit-button` 的按钮本体尺寸。
- 将右侧提交/停止圆形按钮从 `32px × 32px` 缩小到 `28px × 28px`。
- 保持 icon 字号、工作态背景图、halo 与发光粒子不变。

## 验证
- `git diff --check -- src/features/composer/components/ChatInputBox/styles/buttons.css` 通过。
- 用户确认需求为缩小圆圈按钮本体，不是缩小 icon。

## 范围控制
- 本次 commit 只包含 composer button CSS 局部样式。
- 不改变发送/停止交互逻辑。


### Git Commits

| Hash | Message |
|------|---------|
| `391c7524` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 439: 优化 Git 顶部操作栏悬停隐藏

**Date**: 2026-05-13
**Task**: 优化 Git 顶部操作栏悬停隐藏
**Branch**: `feature/v0.4.17`

### Summary

隐藏 GitDiffPanel 顶部 Git 操作按钮，hover/focus 展开时恢复顶部空间避免与路径行重叠；保留 Git History 工具栏上一轮 hover 隐藏改造。验证 npm run typecheck 与 npm run check:large-files 通过。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `c3aff3e7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 440: 稳定 Web 服务启动按钮测试

**Date**: 2026-05-13
**Task**: 稳定 Web 服务启动按钮测试
**Branch**: `feature/v0.4.17`

### Summary

(Add summary)

### Main Changes

修复 WebServiceSettings 启动相关测试的时序 flake。

改动：
- 在 3 个点击 settings.webServiceStart 的测试中，点击前等待 Start button disabled=false。
- 避免组件 mount 后 refreshStatus/refreshDaemonStatus 初始化期间，测试过早点击 disabled button 导致 startWebServerMock 调用次数为 0。

验证：
- pnpm vitest run src/features/settings/components/settings-view/sections/WebServiceSettings.test.tsx --reporter verbose
- pnpm vitest run src/features/settings/components/settings-view/sections/WebServiceSettings.test.tsx src/features/settings/components/settings-view/sections/runtimePoolSection.utils.test.ts src/features/settings/components/settings-view/sections/RuntimePoolSection.test.tsx src/features/settings/components/settings-view/sections/SessionManagementSection.test.tsx --reporter verbose

结果：目标测试 10 passed；原始 4 文件组合 39 passed。


### Git Commits

| Hash | Message |
|------|---------|
| `040c6062` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 441: 修复 realtime 终态 turn 迟到事件门禁

**Date**: 2026-05-13
**Task**: 修复 realtime 终态 turn 迟到事件门禁
**Branch**: `feature/v0.4.17`

### Summary

(Add summary)

### Main Changes

| 项目 | 内容 |
| --- | --- |
| Commit | `b75d2496 fix(realtime): 阻止终态 turn 迟到事件污染线程` |
| 目标 | 防止 completed/error/stalled 后同一 turn 的 late realtime delta、normalized event、raw item snapshot 再次写入 store 或重开 processing。 |
| 实现 | 在 `useThreadItemEvents` 增加 per-thread terminal turn fence；在 `useThreadEventHandlers` 接入 turn started/completed/error/stalled 生命周期与 conservative fallback settlement；在 `useAppServerEvents` 补齐 legacy / fallback 路径 `turnId` 透传。 |
| 规范 | 新增 `openspec/changes/fix-realtime-late-event-terminal-fence` proposal/design/tasks 与相关 capability delta specs。 |
| 测试 | 补充 app-server event routing、thread item events、thread event handlers、useThreads integration regression，覆盖 late batch、queued transition、handler fence 顺序和 fallback `turnId` 传播。 |
| 验证 | `npm run typecheck`；focused Vitest 4 个 suite；large-file governance gate/near-threshold；heavy-test-noise gate；parser node tests；`git diff --check`。 |


### Git Commits

| Hash | Message |
|------|---------|
| `b75d2496` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 442: 更新 v0.4.17 变更记录

**Date**: 2026-05-13
**Task**: 更新 v0.4.17 变更记录
**Branch**: `feature/v0.4.17`

### Summary

补充 CHANGELOG.md 中 v0.4.17 的终态 turn 迟到事件隔离、Codex 计划模式状态显示和 Web Service 启动按钮测试稳定性说明。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `31b63e99` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 443: 归档 Phase 1 已完成 OpenSpec 变更

**Date**: 2026-05-13
**Task**: 归档 Phase 1 已完成 OpenSpec 变更
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

| 项目 | 内容 |
|------|------|
| 目标 | Phase 1 release hardening 收尾：同步主 specs 并归档已完成 OpenSpec changes。 |
| 归档 | `fix-realtime-late-event-terminal-fence`、`fix-realtime-turn-completion-settlement-race`、`fix-tauri-native-menu-deadlock`、`fix-claude-session-engine-resolution` 移入 `openspec/changes/archive/2026-05-13-*`。 |
| Spec 同步 | `conversation-lifecycle-contract` 增加 realtime terminal settlement/fence 与 Claude restore engine resolution；`conversation-realtime-client-performance` 增加 terminal settlement diagnostics 与 scheduling fence；新增 `client-native-menu-deadlock-prevention` 主 spec。 |
| 状态判断 | 保留仍需真机/平台手测的 active changes：CLI installer、Linux AppImage、runtime scheduling、Claude continuation、Windows wrapper、Claude rollout。 |

**验证**:
- `npm run lint && npm run typecheck && npm run test` 通过，463 test files。
- `npm run doctor:strict` 通过。
- `npm run check:large-files` 通过，found=0。
- `npm run check:native-menu-usage` 通过。
- `npm run check:heavy-test-noise` 通过，466 test files，act warnings=0，stdout/stderr payload=0；仅 npm `electron_mirror` environment-owned warning。
- `openspec validate --all --strict --no-interactive` 通过，257 passed / 0 failed。

**后续**:
- Phase 1 剩余为外部证据：CLI installer macOS/Windows/remote/WSL、Linux AppImage artifact + Arch Wayland、Claude continuation/fork/delete/Copy ID/resume command、Windows Codex wrapper affected/healthy Win11、runtime scheduling 双并发性能、Claude rollout 手测矩阵。


### Git Commits

| Hash | Message |
|------|---------|
| `0ad9a56a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 444: Phase 1 发布证据收口

**Date**: 2026-05-14
**Task**: Phase 1 发布证据收口
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

## Summary

- 补齐 Phase 1.2 release evidence：macOS CLI installer smoke、Claude native continuation smoke、runtime scheduling surrogate evidence。
- 归档 `fix-claude-native-session-continuation-race`，并同步 `claude-fork-session-support`、`claude-thread-session-continuity`、`claude-tui-resume-affordance` 主 specs。
- 刷新 realtime CPU baseline/acceptance/raw reports，并更新 OpenSpec workspace inventory。

## Verification

- `openspec validate --all --strict --no-interactive` -> 256 passed, 0 failed
- `npm run typecheck` -> passed
- focused Vitest for Claude/menu/runtime boundaries -> 123 tests passed
- `npm run perf:realtime:report` -> acceptance PASS
- `npm run check:heavy-test-noise` -> 466 test files, act warnings 0, stdout/stderr payload lines 0

## Notes

- `add-cli-one-click-installer` remains open for Windows native, isolated remote daemon, and WSL boundary evidence.
- `optimize-runtime-session-background-scheduling` remains open for real interactive UI switch profile evidence.
- Existing uncommitted `openspec/changes/project-memory-refactor/**` edits were not part of this session and were left untouched.


### Git Commits

| Hash | Message |
|------|---------|
| `e5fea4c2` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 445: Phase 1 OpenSpec 收口归档

**Date**: 2026-05-14
**Task**: Phase 1 OpenSpec 收口归档
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

## 本次完成

- 归档 Phase 1 收口集合：`add-cli-one-click-installer`、`optimize-runtime-session-background-scheduling`、`fix-linux-appimage-wayland-library-pruning`、`fix-windows-codex-app-server-wrapper-launch`、`claude-code-mode-progressive-rollout`。
- 新增 `openspec/docs/phase1-release-closure-2026-05-14.md`，明确 macOS 本机已验证证据、外部平台/manual evidence 的 release qualifier，以及 owner-approved archive waiver 边界。
- 同步主 specs：新增 `cli-one-click-installer`、`claude-code-access-modes`，更新 remote backend installer parity、realtime scheduling、Linux AppImage pruning、Claude lifecycle 等 specs。
- 刷新 `openspec/project.md` inventory：active=2、archive=288、specs=252。

## 验证

- `openspec validate --all --strict --no-interactive`：253 passed, 0 failed。
- `git diff --check`：通过。

## 注意

- Windows、WSL、remote daemon、Linux AppImage、Arch Wayland、live two-session UI profile 没有被伪造成通过；它们被记录为 release qualifier，后续发布宣称对应平台能力前仍需真实验证。
- 未纳入本次提交的工作区变更属于 `project-memory-refactor` 与相关源码改动，本次记录保持隔离。


### Git Commits

| Hash | Message |
|------|---------|
| `9b985edc` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 446: OpenSpec Spec Hygiene 收口

**Date**: 2026-05-14
**Task**: OpenSpec Spec Hygiene 收口
**Branch**: `feature/v0.4.18`

### Summary

清理主 OpenSpec specs 的 archive Purpose 占位，移除空 capability 目录，归档 hygiene change，并通过 strict validation。

### Main Changes

本轮处理 OpenSpec Spec Hygiene：

- 创建并归档 `clean-openspec-main-spec-hygiene`。
- 替换 154 个主 `openspec/specs/*/spec.md` 中 archive 生成的 Purpose TBD 占位。
- 删除空的 `openspec/specs/claude-session-engine-resolution/` capability 目录。
- 在 `project-instruction-layering-governance` 中新增主 spec hygiene 要求：归档/同步后的主 specs 必须有有意义的 Purpose，且 capability inventory 不应包含空目录。
- 刷新 `openspec/project.md`：active=2，archive=289，main specs=251。

验证：

- `openspec validate --all --strict --no-interactive` -> 253 passed, 0 failed。
- `rg -n "TBD - created by archiving change|Purpose:\\s*TBD" openspec/specs` -> 无匹配。
- `find openspec/specs -mindepth 1 -maxdepth 1 -type d -empty -print | sort` -> 无输出。
- `git diff --cached --check` -> 通过。

注意：工作树仍保留他人/Phase 2 的 `project-memory-refactor` 与客户端相关未提交改动，本轮未暂存也未提交。


### Git Commits

| Hash | Message |
|------|---------|
| `b2d8880f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 447: Project Memory 完整对话轮次重构

**Date**: 2026-05-14
**Task**: Project Memory 完整对话轮次重构
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

## 本次完成

- 重写 `project-memory-refactor` OpenSpec proposal/design/spec/tasks，以当前实现为事实基线，OpenSpec 状态达到 `48/48 all_done`。
- 将 Project Memory 主模型从片段摘要升级为完整 Conversation Turn Memory，canonical 保存 `userInput` 与 `assistantResponse`，`summary/detail/cleanText` 只作为 projection/compat 字段。
- 打通 Claude Code / Codex / Gemini 的 engine-agnostic turn capture contract，强保障 Codex 与 Claude Code，Gemini 走共享 smoke path。
- 修复 Codex 同一 turn 多段 `assistant completed` 只保存第一段的问题：pending key 升级为 `workspaceId + threadId + turnId`，同 turn 后续 completed 会聚合并 upsert 到同一条 memory。
- Project Memory UI 支持 Conversation Turn / Manual Note / Legacy 分型展示，turn 详情只读显示完整用户输入和 AI 回复，并支持复制整轮内容。
- Rust 后端从 `project_memory.rs` 单文件拆分为 `model/store/commands/projection/search/settings/classification/compat/tests` 模块，补齐 temp file + rename、Windows/macOS/Linux 兼容写入、日期分片、坏 JSON 隔离与 blocking I/O 边界。

## 验证

- `cargo test --manifest-path src-tauri/Cargo.toml project_memory`
- `pnpm vitest run src/features/threads/hooks/useThreads.memory-race.integration.test.tsx`
- `pnpm vitest run src/features/project-memory src/features/composer src/features/context-ledger`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `openspec validate project-memory-refactor --strict --no-interactive`
- `npm run check:large-files:near-threshold && npm run check:large-files:gate`
- `git diff --check`

## 人工测试

- 用户人工验证 Claude Code Project Memory 与真实对话一致。
- 用户人工验证 Codex Project Memory 修复后与真实对话一致。


### Git Commits

| Hash | Message |
|------|---------|
| `2116aabf` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 448: 完成 Project Memory Phase 3 易用性与可靠性

**Date**: 2026-05-14
**Task**: 完成 Project Memory Phase 3 易用性与可靠性
**Branch**: `feature/v0.4.18`

### Summary

完成 Project Memory Phase 3：workbench、@@ compact picker、Memory Reference、Scout Brief、健康诊断、关联资源展示与 Codex history 回放。

### Main Changes

## 完成内容

- 完成 `project-memory-phase3-usability-reliability` OpenSpec change 的全部任务并提交代码。
- Project Memory 面板升级为 workbench：compact list、详情区、quick tags 折叠、来源定位、review/health/diagnostics 入口。
- Composer 增加 `@@` manual memory compact picker 和 one-shot Memory Reference toggle。
- 新增 Memory Scout / Memory Brief 只读检索链路，失败/超时不阻断发送。
- 新增 Project Memory health/review state/diagnostics/reconcile 后端与前端治理入口。
- 修复 Claude/Codex/Gemini 关联资源展示一致性，Codex remote/local history 保留注入块用于独立资源卡片展示，用户气泡只显示真实输入。

## 验证

- `openspec validate project-memory-phase3-usability-reliability --strict --no-interactive`
- `git diff --check`
- `npm run typecheck`
- `pnpm vitest run src/features/project-memory src/features/composer src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`
- `cargo test --manifest-path src-tauri/Cargo.toml project_memory`
- `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs && npm run check:heavy-test-noise`
- `node --test scripts/check-large-files.test.mjs && npm run check:large-files:near-threshold && npm run check:large-files:gate`

## 后续

- 下一阶段继续 `project-memory-retrieval-pack-cleaner`，将当前 Memory Brief 升级为 detailed retrieval pack + restricted cleaner。


### Git Commits

| Hash | Message |
|------|---------|
| `e02fa414` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 449: 文件树大项目渐进式加载

**Date**: 2026-05-14
**Task**: 文件树大项目渐进式加载
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

| 项目 | 内容 |
|------|------|
| OpenSpec | 完成 `improve-progressive-file-tree-loading` proposal/design/specs/tasks 并通过 strict validation |
| Backend | 为 workspace file listing 和 directory-child listing 增加 `scan_state`、`limit_hit`、`directory_entries`、`child_state`、`has_more` metadata，覆盖 daemon 与普通 Tauri 路径 |
| Frontend | `useWorkspaceFiles` 归一化 progressive metadata，`FileTreePanel` 支持 ordinary unknown/partial directory 按需展开，并缓存 confirmed empty 目录 |
| Validation | 通过 `npm run typecheck`、`cargo check --manifest-path src-tauri/Cargo.toml`、`cargo test --manifest-path src-tauri/Cargo.toml workspaces::files::tests::`、focused Vitest 新增行为测试、`openspec validate improve-progressive-file-tree-loading --strict --no-interactive` |
| Follow-up | 记录 `has_more=true` 的 cursor pagination 后续方向，phase 1 不增加 Load More UI |

**Commit**: `47c24223 feat(file-tree): 支持大项目渐进式加载`


### Git Commits

| Hash | Message |
|------|---------|
| `47c24223` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 450: 完成 Project Memory 检索包清洗注入

**Date**: 2026-05-14
**Task**: 完成 Project Memory 检索包清洗注入
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

| 项目 | 内容 |
|------|------|
| OpenSpec change | `project-memory-retrieval-pack-cleaner` |
| 核心实现 | 将手动 `@@` 与 Memory Reference 注入升级为 detailed retrieval pack，包含稳定 `[Mx]` 索引、详细 source record、cleaner 结果与预算裁剪。 |
| 消费链路 | 更新 send path、message parser、history loader、composer preview，使 Claude/Codex/Gemini 共用 pack builder，并保持用户可见输入不被 pack 污染。 |
| UI/历史 | 用户气泡剥离 `<project-memory-pack>`，关联资源独立展示并保持历史回放一致。 |
| 可靠性修复 | 修复 rewind confirmation 测试 mock 隔离问题；修复 pack 连续解析、manual + scout index collision、cleaner citation drift。 |
| 验证 | OpenSpec strict、lint、typecheck、heavy-test-noise、large-file governance、targeted Vitest、review scan 均通过。 |

**主要文件**:
- `openspec/changes/project-memory-retrieval-pack-cleaner/**`
- `src/features/project-memory/utils/projectMemoryRetrievalPack.ts`
- `src/features/project-memory/utils/projectMemoryCleaner.ts`
- `src/features/threads/hooks/useThreadMessaging.ts`
- `src/features/messages/components/messagesMemoryContext.ts`
- `src/features/threads/loaders/historyLoaders.test.ts`
- `src/features/composer/components/Composer.rewind-confirm.test.tsx`


### Git Commits

| Hash | Message |
|------|---------|
| `00f3a246` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 451: 加固 Codex 静默会话存活判定

**Date**: 2026-05-14
**Task**: 加固 Codex 静默会话存活判定
**Branch**: `feature/v0.4.18`

### Summary

保留 Codex 600 秒 watchdog，但将前端无进展从 hard stalled/quarantine 降级为 suspected-silent；增加 UI 可见提示、matching progress 自动恢复、status event turn 相关性校验，并补充 OpenSpec 提案与 focused tests。

### Main Changes

## 完成本次工作

- 创建并实现 OpenSpec change: `harden-codex-silent-turn-liveness`。
- 回写 proposal/design/spec/tasks，明确 600 秒 watchdog 保留但只负责 UI 降级与诊断，不负责宣判 turn 死亡。
- Codex frontend no-progress timeout 改为 `suspected-silent`，不再 hard settle / quarantine。
- suspected state 落入 `threadStatusById`，Messages 显示低干扰提示，Stop 仍保持可用。
- heartbeat、token usage、item/normalized progress 可清理 suspected state 并恢复监听。
- 收紧 `thread/status/changed` / `runtime/status/changed`，必须携带并匹配当前 `turnId` 才能刷新 no-progress window。
- backend authoritative `turn/stalled`、`turn/error`、`runtime/ended`、user stop 仍保留 terminal settlement/quarantine 语义。

## 验证

- `npx vitest run src/features/threads/hooks/useThreadEventHandlers.test.ts` 通过，40 tests。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `openspec validate harden-codex-silent-turn-liveness --strict --no-interactive` 通过。

## 注意

- 工作区仍有其他未归属改动，未纳入本次 commit。
- `src/features/messages/components/MessagesRows.tsx` 中为当前 dirty worktree 修复过一个 typecheck 暴露的 `count` 类型辅助改动，但未纳入本次 Codex liveness commit，避免夹带 memory context 相关未归属变更。


### Git Commits

| Hash | Message |
|------|---------|
| `b8380037` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 452: 统一记忆引用展示与详情

**Date**: 2026-05-14
**Task**: 统一记忆引用展示与详情
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

| Area | Summary |
|---|---|
| Project Memory | 修复 Memory Reference querying/final 状态使用同一张摘要卡，避免一次引用出现两张卡。 |
| Message UI | 统一 live/history 中 project-memory-pack 的独立资源卡展示，使用 UI-only #1/#2 编号，避免多个包重复显示 [M1]。 |
| Sent Details | 新增真实发送详情弹窗，使用 document-level portal 避免被消息滚动容器裁剪；默认 Markdown 渲染 Cleaned Context，raw payload 折叠保留。 |
| Parser Reuse | 将 sent-details 依赖的 cleanedContext/rawPayload 来源统一到 projectMemoryRetrievalPack parser，避免 MessagesRows 重复解析 retrieval pack。 |
| i18n/tests | 补充中英文文案与 regression tests，覆盖单卡更新、编号去歧义、Markdown 渲染、raw payload 审计入口。 |

Validation:
- npm run lint
- npm run typecheck
- pnpm vitest run src/features/messages/components/Messages.test.tsx src/features/messages/components/messagesUserPresentation.test.ts src/features/project-memory/utils/projectMemoryRetrievalPack.test.ts src/i18n/locales/chatLocaleMerge.test.ts
- git diff --check
- npm run check:large-files
- openspec validate fix-memory-reference-single-status-card --strict --no-interactive


### Git Commits

| Hash | Message |
|------|---------|
| `d40a974e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 453: 归档记忆引用展示 OpenSpec

**Date**: 2026-05-14
**Task**: 归档记忆引用展示 OpenSpec
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

| Area | Summary |
|---|---|
| OpenSpec | 将 `fix-memory-reference-single-status-card` delta 同步到主 spec `openspec/specs/project-memory-consumption/spec.md`。 |
| Archive | 将 change 归档到 `openspec/changes/archive/2026-05-14-fix-memory-reference-single-status-card/`。 |
| Validation | `openspec validate --specs --strict --no-interactive` 和 `openspec validate --changes --strict --no-interactive` 均通过。 |

Notes:
- Archived change corresponds to code commit `d40a974e`.
- Specs now record Memory Reference single-card lifecycle, normalized resource card display, sent-details dialog, Markdown rendering, and semantic retrieval as follow-up only.


### Git Commits

| Hash | Message |
|------|---------|
| `d5399825` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 454: 提案本地记忆语义召回

**Date**: 2026-05-14
**Task**: 提案本地记忆语义召回
**Branch**: `feature/v0.4.18`

### Summary

创建 OpenSpec change project-memory-local-semantic-retrieval，明确本地 semantic retrieval 的 provider SPI、exact scan、fallback、payload guard、CI 噪声与大文件治理约束。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `cf9d7bfb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 455: Project Memory 本地语义召回骨架

**Date**: 2026-05-14
**Task**: Project Memory 本地语义召回骨架
**Branch**: `feature/v0.4.18`

### Summary

实现 Project Memory 本地语义召回 SPI、deterministic embedding document、exact cosine scan、hybrid rerank 与 Memory Reference lexical fallback；修复 FileTreePanel directoryMetadata 默认新数组导致 heavy-test-noise batch 41 render loop 卡死，并补充前端规范约束。验证通过 typecheck、focused vitest、heavy-test-noise、large-file gates、OpenSpec strict。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `506716bc` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 456: 收口项目记忆 OpenSpec 变更

**Date**: 2026-05-14
**Task**: 收口项目记忆 OpenSpec 变更
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

归档并同步项目记忆相关 OpenSpec 变更：project-memory-refactor、project-memory-phase3-usability-reliability、project-memory-retrieval-pack-cleaner、project-memory-local-semantic-retrieval。将后续能力契约同步到主 specs，新增 project-memory-health-review、project-memory-scout-agent、project-memory-retrieval-pack-cleaner、project-memory-local-semantic-retrieval 主 spec，并保留旧 refactor change 为历史归档（skip specs，避免旧 requirement 名称漂移覆盖后续契约）。验证通过：npm run typecheck、npm run lint、openspec validate --specs --strict --no-interactive、openspec validate --changes --strict --no-interactive、git diff --check。


### Git Commits

| Hash | Message |
|------|---------|
| `44b6ebc2` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 457: 修复 Claude 会话侧栏连续性

**Date**: 2026-05-14
**Task**: 修复 Claude 会话侧栏连续性
**Branch**: `feature/v0.4.18`

### Summary

OpenSpec fix-claude-sidebar-native-session-continuity：Claude sidebar 在 first-page、native scan error/timeout、catalog partial/empty 时保留 last-good native rows；稳定标题不被 generic fallback 覆盖；父子关系和 hidden/shared 过滤保持。验证：focused Vitest、OpenSpec strict validate、npm run typecheck。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `3ce09521` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 458: 稳定会话创建与 Claude 列表窗口

**Date**: 2026-05-14
**Task**: 稳定会话创建与 Claude 列表窗口
**Branch**: `feature/v0.4.18`

### Summary

修复 Codex 新会话慢启动并发重复创建：同 workspace/folder 的 in-flight start 复用同一 backend promise，复用调用只按需激活同一 thread；修复 Claude native 会话列表硬编码 50 的窗口问题，改为按项目会话显示数量和 catalog page cap 计算 effective limit，保留 UI root 裁剪、父子会话、folder、archive/hidden 过滤语义；新增 OpenSpec change harden-session-start-and-claude-list-window 并通过 focused Vitest、OpenSpec validate、typecheck。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `4102b116` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
