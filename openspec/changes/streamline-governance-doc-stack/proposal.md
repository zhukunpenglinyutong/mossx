## Why

当前仓库同时维护 `AGENTS.md`、`.trellis/spec/**`、`openspec/project.md`、`openspec/README.md`、`.claude/**`、`.codex/**`，并且默认要求在 session start 时大范围读取这些文档。结果不是“规则充分”，而是“规则分层失焦”：同一治理约束在多个入口重复出现，single source of truth 不够清晰，维护成本和上下文噪音持续上升。

同时，仓库中已经出现 `.omx/**` 这类 runtime/session 产物被提交进版本库的情况。它们不是稳定规范，而是 agent orchestration 的运行时状态、研究快照与会话副产物，会污染事实源并放大 review 噪音。现在需要一次明确的治理收敛，把“什么该进仓、什么只是本地 runtime 产物”讲清楚并落到规则与忽略策略上。

## 目标与边界

### 目标

- 收敛项目级文档链路，明确 `AGENTS.md`、`.trellis/spec/**`、`openspec/**`、`.claude/**`、`.codex/**` 各自职责。
- 建立更清晰的读取入口，让 AI/human 优先读取“最少但够用”的上下文，而不是无差别扫全仓规则。
- 明确 `.omx/**` 属于 runtime artifact，不应继续进入 Git，并通过 `.gitignore` 与仓库治理规则固化这一点。
- 为后续规则维护建立 single source of truth，降低重复改文档和跨文件漂移风险。

### 边界

- 本次变更聚焦仓库治理、规范分层和 runtime artifact hygiene，不改动产品 runtime 行为。
- 本次变更允许调整规则文案、入口文档、忽略策略与文档引用关系，但不要求一次性重写全部历史 OpenSpec archive。
- 本次变更可以删除已经被误提交的 `.omx/**` 内容，但不将其迁移为新的长期仓库资产。

## 非目标

- 不重构业务功能、UI、Tauri command、存储结构或 conversation/runtime 主链路。
- 不删除 `openspec/changes/archive/**` 历史审计数据。
- 不把所有规则硬合并成单个超长文档。
- 不引入新的 agent runtime 或新的 spec workflow 工具。

## What Changes

- 将 `AGENTS.md` 收敛为项目级入口与硬约束文档，只保留规则优先级、分层说明、最小 session start 路径和少数全局 gate。
- 将 frontend/backend/cross-layer 等实现细则继续下沉到 `.trellis/spec/**`，避免在 `AGENTS.md` 重复维护同一规则。
- 将 `openspec/project.md` 定义为 OpenSpec workspace 的唯一全局治理总览；`openspec/README.md` 收缩为短入口与导航，不再重复维护大段 snapshot/governance 正文。
- 明确 `.claude/**`、`.codex/**` 只承担 host adapter / hooks / commands / skills glue 角色，不再承载主治理正文。
- 将 session-start hook 的默认注入收敛为“完整项目入口 + 精简 current state + 规则/Spec 指针”，避免继续内联大段 active task 列表与 spec index 正文。
- 删除仓库内已提交的 `.omx/**` runtime artifact，并在 `.gitignore` 中增加忽略规则，防止后续再次误入库。
- 为规则链路补充一份清晰的 ownership / update boundary，使后续改动知道“该改哪一层，不该在哪一层复制一份”。

## 方案对比

### Option A: 继续保留多入口并通过约定人工同步

- 优点：改动最小，不需要调整现有文件结构。
- 缺点：重复规则继续存在，`AGENTS.md`、`openspec/project.md`、`openspec/README.md` 仍会长期漂移；`.omx/**` 这类 runtime 产物也缺乏明确仓库边界。

### Option B: 建立分层治理与单一事实源，并清退 runtime artifact（选定）

- 优点：职责更清晰，默认读取成本更低，review 面更干净，长期维护更稳定。
- 缺点：需要一次性调整多份入口文档，并为现有协作者更新认知模型。

选择 Option B，因为当前问题不是“文档不够多”，而是“文档层次混乱且事实源重复”。只有明确分层，后续 AI/human 协作才能持续降噪。

## Capabilities

### New Capabilities

- `project-instruction-layering-governance`: 定义项目级规则文档的职责分层、入口顺序、single source of truth 和更新边界。
- `runtime-artifact-repo-hygiene`: 定义 runtime/session/research 副产物的仓库准入边界，包含 `.omx/**` 的删除与 `.gitignore` 忽略策略。

### Modified Capabilities

- `spec-hub-openspec-bootstrap-onboarding`: 调整 OpenSpec workspace 入口文档的导航要求，使 `openspec/README.md` 与 `openspec/project.md` 的职责边界更清晰。

## Impact

- Affected docs:
  - `AGENTS.md`
  - `openspec/README.md`
  - `openspec/project.md`
  - `.trellis/spec/**`（主要是 index / guide 引用层）
- Affected repo hygiene:
  - `.gitignore`
  - `.omx/**`
- Affected workflow surfaces:
  - `.claude/**`
  - `.codex/**`
  - `.trellis/scripts/common/**`
  - 任意依赖“默认全量读取项目规则”的 session-start 流程
- Dependencies / systems:
  - 无新增外部依赖
  - 需要保持 OpenSpec + Trellis workflow 与现有 hooks/skills 的兼容性

## 验收标准

- [ ] 仓库文档层次被明确划分为：项目入口、代码实现规范、行为规范、host adapter 配置、runtime artifact 五层。
- [ ] `AGENTS.md` 不再重复维护 frontend/backend/OpenSpec 细则正文，而是只保留入口与少量全局硬规则。
- [ ] `openspec/project.md` 成为 OpenSpec 全局治理总览；`openspec/README.md` 仅保留短导航与使用入口。
- [ ] `.omx/**` 从版本库移除，并被 `.gitignore` 明确忽略。
- [ ] 变更后的规则链路仍能支持当前 Trellis/OpenSpec/Codex/Claude session start 流程，不引入明显断链。
- [ ] `.claude/**` 与 `.codex/**` session-start 默认注入不再内联完整 active task 大列表与 spec index 正文，而是收敛为最小入口与按需读取指针。
