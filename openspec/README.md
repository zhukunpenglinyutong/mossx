# CodeMoss OpenSpec Workspace

本目录是 `mossx` 的 behavior-spec 工作区，负责 proposal / design / tasks / specs / archive 的生命周期管理。

## 先看哪里

- 仓库级规则入口：`AGENTS.md`
- 若正在修改规则入口、文档治理边界或 ignore policy：`.trellis/spec/guides/project-instruction-layering-guide.md`
- 工作区总览与治理状态：`openspec/project.md`
- 当前进行中的变更：`openspec/changes/<change-id>/`
- 主 capability specs：`openspec/specs/`
- 归档变更：`openspec/changes/archive/`

## 目录说明

- `project.md`
  - 详细治理总览、capability metrics、active changes、update history
- `changes/`
  - 每个变更的 proposal / design / tasks / spec deltas
- `specs/`
  - 当前主线 capability 规范
- `docs/`
  - 审计、验证、同步与研究辅助文档
- `config.yaml`
  - OpenSpec 1.3.x planning context 配置

## 使用约定

- 行为变更必须先进入 `openspec/changes/<change-id>/`
- 完成实现后执行 verify，再按需要 sync / archive
- 新增 capability 优先沿用现有命名空间策略，避免引入无必要的平行前缀

## 常用命令

```bash
openspec validate --all --strict --no-interactive
openspec status --change <change-id>
python3 .claude/skills/osp-openspec-sync/scripts/validate-consistency.py --project-path . --full
```

## 维护边界

- 仓库级入口、规则优先级、全局 gate 统一维护在 `AGENTS.md`
- 规则分层与“改哪里”的边界说明维护在 `.trellis/spec/guides/project-instruction-layering-guide.md`
- `openspec/README.md` 只做导航和使用入口
- 详细治理说明、快照统计、active backlog 与审计历史统一维护在 `openspec/project.md`
