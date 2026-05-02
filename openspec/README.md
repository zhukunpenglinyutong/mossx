# CodeMoss OpenSpec 规范仓库

本仓库是 CodeMoss/ccgui 的 OpenSpec 工作区，负责能力规范定义、变更生命周期管理与归档治理。

## 仓库快照（2026-05-02）

- 主规范目录: `openspec/specs/`（208 个 capability）
- 归档变更: `openspec/changes/archive/`（224 个）
- 活跃变更: `openspec/changes/`（6 个）
- OpenSpec CLI 基线: `1.3.1`
- 工作流技能: `.claude/commands/open-spec/*`、`.claude/skills/*`、`.codex/skills/*`、`.agents/skills/*`

## 细粒度统计（Capability 分域）

| 领域 | 数量 |
|---|---:|
| `spec-hub-*` | 13 |
| `spec-platform-*`（legacy） | 5 |
| `codex-chat-canvas-*` | 9 |
| `workspace-*` | 11 |
| `composer-*` | 11 |
| `file-view/file-tree/filetree-*` | 7 |
| `git-*` | 9 |
| `opencode-*` | 6 |
| `conversation-*` | 15 |
| `project-memory-*` | 5 |
| `session-activity-*` | 1 |
| `memory-list-*` | 4 |
| `kanban-*` | 4 |
| `panel-lock-*` | 2 |
| integration/connector (`feishu-*`,`third-party-*`,`external-message-*`) | 3 |
| large-file governance (`large-file-*`,`bridge-cleanup-*`) | 2 |
| runtime-log (`project-runtime-log-viewer`) | 1 |
| `settings-*` | 1 |
| terminal shell (`terminal-shell-*`) | 1 |
| quality sentry (`heavy-test-*`,`large-file-*`) | 2 |
| 其他（misc） | 36 |

## 技术上下文

- 目标产品技术栈: Tauri CLI `2.9.6` + Tauri Core `2.x` + Rust + React `19.1.0` + TypeScript `5.8.3` + Vite `7.0.4`
- 代码侧版本基线: `package.json.version=0.4.12`，`src-tauri/Cargo.toml.package.version=0.3.0`
- OpenSpec 工具基线: `openspec --version = 1.3.1`
- 规范仓库职责: Spec-Driven Development（proposal/design/tasks/verification）
- 主工作流: `explore -> new/ff -> apply -> verify -> sync -> archive`

## 最新代码对齐（截至 2026-05-02）

近期完成 `3adf51af0ceff9597930e4f85435ef99f4fa96a8..HEAD` 区间补齐，并完成以下治理：

- 归档 10 个已完成 changes，主 specs 已同步至 208 个 capability。
- 新增或同步 `codex-composer-startup-selection-stability`、`terminal-shell-configuration`、`heavy-test-noise-cleanliness` 等能力。
- 严格校验基线：`openspec validate --all --strict --no-interactive` = 214 passed, 0 failed。
- OpenSpec `1.3.1` 后，`openspec/config.yaml` 的 `context:` 是优先注入的 planning context；`openspec/project.md` 保留更完整的审计历史与详细状态。

## 活跃变更状态

- `add-codex-structured-launch-profile`
- `adjust-codex-stalled-timeouts`
- `allow-branch-update-without-checkout`
- `claude-code-mode-progressive-rollout`
- `fix-windows-codex-app-server-wrapper-launch`
- `project-memory-refactor`

## 命名空间治理（已生效）

- 新增 capability 统一使用 `spec-hub-*`（若适配该域）。
- `spec-platform-*` 作为 legacy 兼容命名，冻结新增 Requirement。

## 常用命令

```bash
# 一致性检查
python3 .claude/skills/osp-openspec-sync/scripts/validate-consistency.py --project-path . --full

# 冲突检查
bash .claude/skills/osp-openspec-sync/scripts/detect-conflicts.sh .

# 增量同步分析
python3 .claude/skills/osp-openspec-sync/scripts/incremental-sync.py --project-path .

# OpenSpec 严格校验
openspec validate --all --strict --no-interactive
```

## 维护说明

- 本仓库是规范仓库，不是应用源码仓库。
- 变更前优先在 `openspec/changes/` 建立 proposal/design/tasks。
- 归档前必须完成 verify 与 delta specs 同步。
- `openspec/config.yaml` 的 `context:` 是 OpenSpec 1.3.x 注入到请求中的精简 planning context。
- `openspec/project.md` 保留详细审计历史、能力矩阵与活动变更状态；更新快照时应同步检查两者是否漂移。

---

- 更新时间: 2026-05-02T00:00:00+08:00
- 维护者: CodeMoss Team
