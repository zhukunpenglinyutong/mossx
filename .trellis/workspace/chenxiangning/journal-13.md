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


## Session 459: 修复项目记忆引用召回完整性

**Date**: 2026-05-14
**Task**: 修复项目记忆引用召回完整性
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

本次完成 Project Memory Reference 召回完整性修复。

主要内容：
- 新增 OpenSpec corrective change `repair-project-memory-reference-retrieval-integrity`，明确此前 semantic/vector production 接入不成立，当前 P0 修复为 lexical fallback 召回完整性。
- 修复 `scoutProjectMemory` fallback：无真实 semantic provider 时使用 `query: null` 拉取 bounded multi-page workspace candidates，最多扫描 1000 条，再本地 rank。
- 修复身份回忆：`我是谁` / `我叫什么` 等 recall intent 支持 `我是陈湘宁` 类型记忆召回，并在 identity recall 场景 relevance-first，避免弱相关 high importance 记录压过身份记忆。
- 收窄身份证据：不把 `assistantResponse` 中的助手自我介绍（例如 `我是 Codex`）当作用户身份。
- 增加 production-shaped send path、fallback page-2 recall、assistant self-introduction negative case 等 regression tests。

验证：
- `npx vitest run src/features/project-memory/utils/memoryContextInjection.test.ts`
- `npx vitest run src/features/project-memory/utils/memoryScout.test.ts`
- `npx vitest run src/features/threads/hooks/useThreadMessaging.context-injection.test.tsx`
- `openspec validate repair-project-memory-reference-retrieval-integrity --strict --no-interactive`
- `npm run typecheck`
- `npm run lint`
- `git diff --check`

注意：
- 本次没有实现真实 vector retrieval，也没有引入 embedding provider/model/vector DB。
- 真实本地 embedding provider 仍保留为独立后续 proposal。


### Git Commits

| Hash | Message |
|------|---------|
| `022a7fe7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 460: 优化项目记忆工作台弹窗

**Date**: 2026-05-15
**Task**: 优化项目记忆工作台弹窗
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

## 本次收口

- 优化项目记忆工作台弹窗尺寸：更接近全屏，适配大屏和小屏。
- 移除右侧详情里对话轮次预览的重复展示，只保留横向用户输入 / AI 回复预览。
- 在弹窗顶部加入工作区下拉选择，复用现有 workspace selection 回调切换项目。
- 补充 ProjectMemoryPanel 单测覆盖工作区切换和重复预览移除。

## 验证

- `npx vitest run src/features/project-memory/components/ProjectMemoryPanel.test.tsx` 通过，17 tests。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `git diff --check` 通过。
- `npm run check:large-files` 仍报告既有 `src/features/threads/hooks/useThreadActions.test.tsx` 超 3000 行阈值，非本次改动范围。


### Git Commits

| Hash | Message |
|------|---------|
| `a0a80561` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 461: 隐藏长期记忆入口

**Date**: 2026-05-15
**Task**: 隐藏长期记忆入口
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

| 项目 | 内容 |
|------|------|
| 目标 | 隐藏旧的“长期记忆”入口，避免 Settings 菜单和侧边栏 rail 暴露该旧入口。 |
| 实现 | 移除 `Sidebar` Settings dropdown 中的 `sidebar.longTermMemory` 菜单项；移除 `SidebarMarketLinks` 中 `data-market-item="memory"` rail 入口；清理对应未使用 prop/import。 |
| 保护 | 保留“项目记忆”主入口：Settings dropdown 仍调用 `onOpenProjectMemory()`，rail 仍保留 `data-market-item="project-memory"`，`ProjectMemoryPanel` 渲染链路未改。 |
| 验证 | `npx vitest run src/features/app/components/Sidebar.test.tsx` 通过；`npx tsc --noEmit` 通过；`npm run lint` 通过。 |

**Updated Files**:
- `src/features/app/components/Sidebar.tsx`
- `src/features/app/components/SidebarMarketLinks.tsx`
- `src/features/layout/hooks/useLayoutNodes.tsx`
- `src/features/app/components/Sidebar.test.tsx`


### Git Commits

| Hash | Message |
|------|---------|
| `47b77924` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 462: 修复 Claude pending 会话收敛

**Date**: 2026-05-15
**Task**: 修复 Claude pending 会话收敛
**Branch**: `feature/v0.4.18`

### Summary

修复 issue #529 形态下 Claude pending 线程与真实 session 未及时收敛导致的第二轮空白/阻塞问题。实现 transcript-validated fallback rebind，补充前端和 Rust 回归测试；拆分大测试文件与 Claude history fixture，确保 large-file governance 和 heavy-test-noise sentry 均通过。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `005527b1` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 463: 记录 Codex 静默存活验证完成

**Date**: 2026-05-15
**Task**: 记录 Codex 静默存活验证完成
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

本次提交只更新 OpenSpec change `harden-codex-silent-turn-liveness` 的 tasks 状态，将 3-session manual scenario 验证项 4.3 标记为完成。

验证：
- `openspec validate harden-codex-silent-turn-liveness --strict --no-interactive` 通过。

边界：
- 未提交 `openspec/changes/repair-project-memory-reference-retrieval-integrity/tasks.md` 中的 F1 勾选，因为当前未找到对应的本地 embedding provider proposal，避免记录不实完成状态。


### Git Commits

| Hash | Message |
|------|---------|
| `7e605945` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 464: 强化 Claude stream-json 首包存活检测

**Date**: 2026-05-15
**Task**: 强化 Claude stream-json 首包存活检测
**Branch**: `feature/v0.4.18`

### Summary

修复 Claude stream-json 首包无合法事件时 GUI 可能持续等待的问题，并补充 OpenSpec 与回归测试。

### Main Changes

## 完成内容
- 针对 Claude CLI stream-json 首包存活问题新增 liveness watchdog。
- 首个合法 stream event 到达前，如果 stdout/stderr 只有无效 JSON、未知事件或长期无输出，会终止子进程并发出可诊断错误。
- 增加合法事件类型白名单，避免 `{}` 或 `provider_banner` 这类 JSON 误判为 Claude stream event。
- timeout 分支避免无限等待 stderr reader。
- 补充 OpenSpec change：`harden-claude-stream-json-liveness`。
- 补充 Rust 回归测试覆盖无输出、非 JSON、无 type JSON、未知 type JSON。

## 验证
- `git diff --check`
- `cargo test --manifest-path src-tauri/Cargo.toml send_message_ -- --nocapture`
- `openspec validate harden-claude-stream-json-liveness --strict --no-interactive`
- `npx vitest run src/features/threads/hooks/useThreadEventHandlers.test.ts`
- `node --test scripts/check-large-files.test.mjs`
- `npm run check:large-files:near-threshold`
- `npm run check:large-files:gate`
- `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`
- `npm run check:heavy-test-noise`

## 备注
- 用户后续提供视频显示 Claude 输出存在长静默与块状刷新；该现象初判不由本次首包 watchdog 直接导致。
- 下一步建议单独实现 debug-only stream latency diagnostic，拆分 `Claude stdout received -> EngineEvent emitted -> frontend rendered`。


### Git Commits

| Hash | Message |
|------|---------|
| `5aa06c13` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 465: 记录 Claude 流式首包延迟诊断

**Date**: 2026-05-15
**Task**: 记录 Claude 流式首包延迟诊断
**Branch**: `feature/v0.4.18`

### Summary

提交 Claude Code 流式首包链路 debug-only latency trace 基线，为后续多轮首包慢修复提供可观测性。

### Main Changes

任务目标：
- 在继续治理 Claude Code 多轮对话偶发首包慢之前，先提交当前已完成的流式 latency trace 基线。
- 保持后续修复与诊断增强解耦，避免同一批文件叠加导致回溯困难。

主要改动：
- 为 Claude stream path 补充 debug-only timing trace，默认关闭，不记录 prompt 或正文。
- 前端 latency diagnostics 增加 app-server-event 侧 timing 采集与边界 guard。
- 保留既有 Windows streaming 修复：delta 先 emit，runtime sync 后置。

验证结果：
- git diff --check 通过。
- npx vitest run src/features/threads/utils/streamLatencyDiagnostics.test.ts 通过：23 passed。
- cargo test --manifest-path src-tauri/Cargo.toml claude_forwarder -- --nocapture 通过：5 passed。
- cargo test --manifest-path src-tauri/Cargo.toml buffered_claude_text_delta -- --nocapture 通过。
- npm run typecheck 通过。
- npm run lint 通过。
- node --test scripts/check-large-files.test.mjs 通过。
- node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs 通过。
- npm run check:large-files:gate 通过：found=0。
- npm run check:runtime-contracts 通过。
- npm run check:heavy-test-noise 通过：474 test files completed，act/stdout/stderr payload noise = 0。

后续事项：
- 新建 OpenSpec change 专门处理 Claude Code 多轮对话偶发首包慢，先写 proposal，再进入实现。


### Git Commits

| Hash | Message |
|------|---------|
| `c552adb5` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 466: 增强 Claude 首包延迟诊断

**Date**: 2026-05-15
**Task**: 增强 Claude 首包延迟诊断
**Branch**: `feature/v0.4.18`

### Summary

提交 Claude Code repeat-turn 首包延迟诊断变更，拆分 spawn/stdin/stdout/valid-event/text-delta 阶段，并验证 Windows/macOS 流式兼容边界。

### Main Changes

本次收口内容：
- 创建并实现 OpenSpec change: fix-claude-repeat-turn-first-token-latency。
- Rust Claude engine 记录 spawn、stdin close、first stdout line、first valid stream event、first text delta 等首包阶段时间。
- Claude forwarder 将 redacted numeric timing 附加到 ccguiTiming，不透传 prompt/response/stdout 文本。
- Frontend streamLatencyDiagnostics 增加 Claude first-token phase 分类，且不把无 text delta 的首包诊断误触发为 visible-output-stall mitigation。
- 保留旧 Windows streaming visibility 修复边界：Windows text delta coalesce 仍只由 cfg!(windows) 启用，macOS 不受影响。

验证：
- openspec validate fix-claude-repeat-turn-first-token-latency --strict --no-interactive
- cargo test --manifest-path src-tauri/Cargo.toml claude_forwarder -- --nocapture
- cargo test --manifest-path src-tauri/Cargo.toml send_message_batches_windows_text_deltas_without_delaying_other_platforms -- --nocapture
- npx vitest run src/features/threads/utils/streamLatencyDiagnostics.test.ts
- npm run lint -- --quiet
- npm run typecheck
- npm run check:runtime-contracts
- npm run check:large-files:gate
- npm run check:heavy-test-noise


### Git Commits

| Hash | Message |
|------|---------|
| `e4aadd8d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 467: 增强 Prompt Enhancer Claude 失败诊断与兜底

**Date**: 2026-05-15
**Task**: 增强 Prompt Enhancer Claude 失败诊断与兜底
**Branch**: `feature/v0.4.18`

### Summary

(Add summary)

### Main Changes

## Summary
- Fixed Prompt Enhancer Claude failure handling so retryable Claude/runtime failures automatically fall back to Codex with an isolated read-only session.
- Improved Claude CLI non-zero exit diagnostics when stdout/stderr are empty by including input format, hook flag, and permission mode metadata.
- Preserved primary Claude diagnostics when Codex fallback fails or returns an empty rewrite.

## Updated Files
- `src-tauri/src/engine/claude.rs`
- `src-tauri/src/engine/claude/tests_stream.rs`
- `src/features/composer/components/ChatInputBox/hooks/usePromptEnhancer.ts`
- `src/features/composer/components/ChatInputBox/hooks/usePromptEnhancer.test.tsx`

## Validation
- `npx eslint src/features/composer/components/ChatInputBox/hooks/usePromptEnhancer.ts src/features/composer/components/ChatInputBox/hooks/usePromptEnhancer.test.tsx`
- `npx vitest run src/features/composer/components/ChatInputBox/hooks/usePromptEnhancer.test.tsx`
- `cargo test --manifest-path src-tauri/Cargo.toml send_message_reports_exit_metadata_when_claude_fails_without_output`
- `node --test scripts/check-large-files.test.mjs`
- `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`
- `npm run check:large-files:near-threshold`
- `npm run check:large-files:gate`
- `npm run check:heavy-test-noise`
- `npm run typecheck`
- `git diff --check`


### Git Commits

| Hash | Message |
|------|---------|
| `541f9058` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 468: 修复提示词增强重复结果

**Date**: 2026-05-15
**Task**: 修复提示词增强重复结果
**Branch**: `feature/v0.4.18`

### Summary

统一归一化 Prompt Enhancer 的 engine 返回文本，复用 assistant 文本去重逻辑，补充 Claude 与 Codex 重复增强结果回归测试。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2810476b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 469: 归档已验证 OpenSpec 提案

**Date**: 2026-05-15
**Task**: 归档已验证 OpenSpec 提案
**Branch**: `feature/v0.4.18`

### Summary

归档 8 个已验证 OpenSpec changes，同步主 specs，并刷新 project.md 工作区快照。

### Main Changes

## 本次工作

- 归档 8 个已验证 OpenSpec changes 到 openspec/changes/archive/2026-05-15-*。
- 将 8 个 changes 的 delta specs 同步进 openspec/specs/** 主规范。
- 手动语义合并 claude-session-sidebar-state-parity 与 workspace-session-catalog-projection 的重叠 delta，保留 sidebar continuity、title stability、display window 三类契约。
- 更新 openspec/project.md 快照：active=1、archive=302、main specs=257。

## 验证

- openspec validate --all --strict --no-interactive：258 passed, 0 failed。
- 归档完整性核对：8 个目标 change 均存在于 archive；未完成的 add-codex-structured-launch-profile 仍保持 active。
- 一致性脚本 .claude/skills/osp-openspec-sync/scripts/validate-consistency.py 当前仓库不存在，未执行。


### Git Commits

| Hash | Message |
|------|---------|
| `41cf2e8d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 470: 标记成熟流式输出重构契约

**Date**: 2026-05-15
**Task**: 标记成熟流式输出重构契约
**Branch**: `feature/v0.4.18`

### Summary

沉淀 Codex 与 Claude Code mature streaming guardrails，防止后续重构破坏 stream hot path。

### Main Changes

## 本次工作

- 将 Codex / Claude Code live streaming 标记为成熟保护契约。
- 更新 Claude Code first-token latency spec，明确 first-token/startup、backend forwarder、frontend render、terminal settlement 的 phase ownership。
- 更新 Claude Code stream forwarding latency spec，要求 TextDelta / ReasoningDelta / ToolOutputDelta 继续走 protected hot path，diagnostics、ledger、process snapshot、history reconcile 不得阻塞 delta。
- 更新 Codex conversation liveness spec，明确 suspected-silent 非终态、非文本 runtime activity 仍是 progress evidence、history reconcile 不是 live convergence 唯一路径。
- 更新 Trellis frontend Messages Streaming Render Contract，给未来重构 Messages / Timeline / Markdown / LiveMarkdown 时的 guardrail。

## 验证

- openspec validate --all --strict --no-interactive：258 passed, 0 failed。
- git diff 范围确认仅包含 4 个规范文件。


### Git Commits

| Hash | Message |
|------|---------|
| `66a400a2` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 471: 记录 AppImage Wayland 修复验证

**Date**: 2026-05-15
**Task**: 记录 AppImage Wayland 修复验证
**Branch**: `feature/v0.4.18`

### Summary

记录 desktop-cc-gui#379 的 AppImage Wayland 修复闭环

### Main Changes

- Updated archived OpenSpec proposal and implementation notes for `fix-linux-appimage-wayland-library-pruning`.
- Recorded `desktop-cc-gui#379` as affected-user validation evidence for the AppImage Wayland/Mesa/EGL crash.
- Clarified that the confirmed fix direction is packaging-level bundled `libwayland-*` pruning, while broad release claims still prefer final artifact inspection and Arch Wayland smoke.
- Validation: `git diff --check` passed for the edited OpenSpec docs.


### Git Commits

| Hash | Message |
|------|---------|
| `1263ee8e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 472: 稳定核心运行时与实时契约

**Date**: 2026-05-15
**Task**: 稳定核心运行时与实时契约
**Branch**: `feature/v0.4.18`

### Summary

完成 OpenSpec change stabilize-core-runtime-and-realtime-contracts：补齐 realtime canonical contract、runtime lifecycle 场景测试、AppShell typed boundary、CI/large-file/heavy-test-noise/cross-platform guardrails，并修复 review 发现的 runtime/thread boundary 未接入与 turn/item completion 语义混淆。

### Main Changes

## 本次完成

- 创建并完成 OpenSpec change `stabilize-core-runtime-and-realtime-contracts`，覆盖 P0 runtime/realtime/AppShell 稳定性与 P1 governance guardrails。
- 补齐 realtime event contract matrix、canonical fixtures、frontend contract tests、Rust EngineEvent mapping coverage。
- 扩展 runtime lifecycle scenario tests，覆盖 acquire/recover/quarantine/retry/replacement/runtime-ended/lease cleanup。
- 为 AppShell workspace、composer/search、runtime/thread 建立 typed boundary；review 后将 `RuntimeThreadShellBoundary` 实际接入 `app-shell.tsx`。
- 将 realtime completion 语义拆分为 `assistantItemCompleted` 与 `turnCompleted`，避免 `item/completed` 与 `turn/completed` 后续在 adapter/codegen 中混淆。
- 将 heavy-test-noise、large-file governance、Windows/macOS/Linux compatibility 约束纳入 OpenSpec 设计与验证。

## 验证

- `npm run lint`
- `npm run typecheck`
- `npm run test`：474 test files completed
- `npm run perf:realtime:boundary-guard`
- `npm run doctor:strict`
- `cargo test --manifest-path src-tauri/Cargo.toml runtime`
- `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`
- `node --test scripts/check-large-files.test.mjs`
- `npm run check:large-files:near-threshold`：仅既有 watch warnings
- `npm run check:large-files:gate`：fail violations 0
- `npm run check:heavy-test-noise`：477 test files completed，act/stdout/stderr payload lines 为 0
- `openspec validate stabilize-core-runtime-and-realtime-contracts --strict --no-interactive`

## 后续

- 人工回归重点：Codex streaming、runtime ended/reconnect、workspace/search/thread 跳转、interrupt 后恢复。
- `app-shell.tsx` 仍保留 `@ts-nocheck`，完整移除应作为后续 AppShell context split change 单独推进。


### Git Commits

| Hash | Message |
|------|---------|
| `f4d60742` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 473: 发布前 OpenSpec 文档卫生收口

**Date**: 2026-05-15
**Task**: 发布前 OpenSpec 文档卫生收口
**Branch**: `feature/v0.4.18`

### Summary

清理发布前 git diff --check 暴露的 OpenSpec 文档尾随空格与 EOF 空行，重跑 diff hygiene 与 OpenSpec strict validation 通过。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `5bb8ad5b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
