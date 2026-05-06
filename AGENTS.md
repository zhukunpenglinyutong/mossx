<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

Use the `/trellis:start` command when starting a new session to:
- Initialize your developer identity
- Understand current project context
- Read relevant guidelines

Use `@/.trellis/` to learn:
- Development workflow (`workflow.md`)
- Project structure guidelines (`spec/`)
- Developer workspace (`workspace/`)

If you're using Codex, project-scoped helpers may also live in:
- `.agents/skills/` for reusable Trellis skills
- `.codex/agents/` for optional custom subagents

Keep this managed block so 'trellis update' can refresh the instructions.

<!-- TRELLIS:END -->

# 项目规则入口（mossx）

## 规则优先级

- 当前项目代码实现 > 项目内文档（`AGENTS.md` / `.trellis/spec/**` / `openspec/**`）> 全局 `~/.codex/rules/*` / 全局 `~/.codex/AGENTS.md`
- 文档主体使用中文，technical terms 保留 English

## 文档分层

本仓库将规则与状态分成五层：

1. **Project entry**：`AGENTS.md`
   - 只负责规则优先级、最小读取路径、全局 gate、分层指针
2. **Implementation rules**：`.trellis/spec/**`
   - frontend / backend / guides 的具体实现规范
3. **Behavior specs**：`openspec/**`
   - proposal / design / tasks / main specs / workspace governance
4. **Host adapter config**：`.claude/**`、`.codex/**`
   - hooks / commands / skills / host-specific glue
5. **Runtime artifacts**：`.omx/**` 及其他本地运行态目录
   - 不是长期仓库资产，不作为规范事实源

## 最小读取路径

- 开始任务先读本文件。
- 涉及实现时，再按需读：
  - `.trellis/spec/frontend/index.md`
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/guides/index.md`
  - 若任务本身在改规则入口或文档边界，再读 `.trellis/spec/guides/project-instruction-layering-guide.md`
- 涉及 behavior/change/workflow 时，再读：
  - `openspec/README.md`
  - `openspec/project.md`
  - 对应 `openspec/changes/<change-id>/**`
- 只有在调试 host hooks / commands / skills 时，才优先深入 `.claude/**` 或 `.codex/**`。

## OpenSpec + Trellis

- `openspec/**` 是 behavior / proposal / change 的 single source of truth。
- `.trellis/spec/**` 是 code-level rule 与 executable contract 的沉淀位置。
- `.trellis/tasks/**` 是执行容器；每个 Trellis task 都必须关联一个 OpenSpec change。
- 涉及行为变更、产品交互、跨层 contract 变更时：
  1. 先创建或选择 OpenSpec change
  2. 再进入 Trellis / implementation
  3. 实现后同步更新相关 spec，并执行 verify / sync / archive 流程

## 实现入口

- frontend / backend / cross-layer 详细规则不要写回 `AGENTS.md`。
- 这类细则统一维护在 `.trellis/spec/**`：
  - frontend: `component-guidelines.md`、`hook-guidelines.md`、`state-management.md`、`quality-guidelines.md`、`type-safety.md`
  - backend: `directory-structure.md`、`error-handling.md`、`logging-guidelines.md`、`database-guidelines.md`、`quality-guidelines.md`
  - cross-layer / reuse / shell / unified-exec: `.trellis/spec/guides/**`

## 全局 Gate

### Trellis Session Record

- AI 在本仓库成功执行 `git commit` 后，必须继续执行 Trellis session record，除非用户明确要求跳过。
- record 前先运行 `python3 ./.trellis/scripts/get_context.py --mode record`，不得猜测 developer id。
- 所有 Trellis 路径使用 repo-relative path，禁止写死个人绝对路径。

### Git Commit Message

- 默认必须使用中文主体的 Conventional Commits：`type(scope): 中文动宾短句`
- 若仓库脚本或 workflow 与此冲突，先修正规则或配置，再提交

### PlanFirst

- 任何代码、配置、规范落盘前，先给出 `PLAN` 或等价 OpenSpec artifact。
- 若任务已进入 OpenSpec workflow，则以 OpenSpec artifact 作为 plan 载体。

### Merge Guardrails

- 高风险文件冲突时，禁止整文件 `--ours` / `--theirs` 覆盖。
- 必须先列 capability matrix，再做 semantic merge，并验证关键 symbol / tests / contract command。

### Shell Baseline

- 遇到 `command not found`，先执行：
  - `zsh -lc 'source ~/.zshrc && <command>'`
- 仍失败再排查：
  - `zsh -lc 'source ~/.zshrc && which <command> && echo $PATH'`

## 仓库卫生

- `.omx/**`、`.trellis/.developer`、`.trellis/.current-task` 等本地 state 属于 runtime artifact 或 local-only state。
- 这类目录和文件不作为规范事实源；若误入库，应按仓库卫生规则清退并加入忽略策略。
