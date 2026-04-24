# CodeMoss OpenSpec 规范仓库

本仓库是 CodeMoss/ccgui 的 OpenSpec 工作区，负责能力规范定义、变更生命周期管理与归档治理。

## 仓库快照（2026-04-23）

- 主规范目录: `openspec/specs/`（168 个 capability）
- 归档变更: `openspec/changes/archive/`（162 个）
- 活跃变更: `openspec/changes/`（3 个）
- 工作流技能: `.claude/skills/open* + osp-openspec-sync`

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
| 其他（misc） | 34 |

## 技术上下文

- 目标产品技术栈: Tauri CLI `2.9.6` + Tauri Core `2.x` + Rust + React `19.1.0` + TypeScript `5.8.3` + Vite `7.0.4`
- 代码侧版本基线: `package.json.version=0.4.8`，`src-tauri/Cargo.toml.package.version=0.3.0`
- 规范仓库职责: Spec-Driven Development（proposal/design/tasks/verification）
- 主工作流: `explore -> new/ff -> apply -> verify -> sync -> archive`

## 最新代码对齐（v0.3.8-v0.3.12）

本轮已完成 `v0.3.8..HEAD` 区间对齐，并完成以下补更：

- 区间提案已归档：`openspec/changes/archive/2026-04-11-2026-04-12-sync-v0.3.8-v0.3.12-openspec/`
- 新增 capability：
  - `git-commit-message-generation`
  - `composer-shortcut-actions-menu`
  - `conversation-user-path-reference-cards`
  - `conversation-stream-activity-presence`
- 修改 capability：
  - `workspace-sidebar-visual-harmony`（图钉悬停显隐 + 固定区取消固定语义）
- 新增区间分析文档：
  - `openspec/docs/v0.3.8-v0.3.12-change-analysis-2026-04-12.md`

## 活跃变更状态

- `add-codex-structured-launch-profile`
- `claude-code-mode-progressive-rollout`
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
```

## 维护说明

- 本仓库是规范仓库，不是应用源码仓库。
- 变更前优先在 `openspec/changes/` 建立 proposal/design/tasks。
- 归档前必须完成 verify 与 delta specs 同步。
- 建议先读取 `openspec/project.md` 获取最新上下文与活动变更。

---

- 更新时间: 2026-04-23T00:20:00+08:00
- 维护者: CodeMoss Team
