## Context

当前仓库的 instruction/doc stack 同时包含以下层：

- `AGENTS.md`：项目级 agent 入口与硬约束
- `.trellis/spec/**`：frontend/backend/guides 等实现层规范
- `openspec/project.md`：OpenSpec workspace 总览与治理状态
- `openspec/README.md`：OpenSpec 工作区入口说明
- `.claude/**`、`.codex/**`：host adapter hooks/commands/skills 配置
- `.omx/**`：某次外部 OMX runtime 留下的 session/context/research artifact

问题不是“文件多”，而是“角色混叠”：

- `AGENTS.md` 同时承担入口、治理、实现细则、验证命令四种角色，导致正文过胖。
- `openspec/README.md` 与 `openspec/project.md` 共同维护 snapshot、active changes、命令与治理说明，存在双真相。
- `.omx/**` 被提交进仓库后，把 runtime artifact 与长期规范资产混在一起，污染事实源。

本次设计的目标不是统一成一个大文档，而是把层次切开，并让每一层只维护自己那一层的真相。

## Goals / Non-Goals

**Goals:**

- 为 instruction/doc stack 建立清晰的五层模型：project entry、implementation rules、behavior specs、host adapter config、runtime artifacts。
- 让 `AGENTS.md` 回到“短入口 + 少数硬约束”职责。
- 让 `openspec/project.md` 成为 OpenSpec workspace 的唯一治理总览。
- 让 `openspec/README.md` 只做导航，不再复制治理正文。
- 明确 `.omx/**` 属于 runtime artifact，并通过 `.gitignore` 阻止重新入库。

**Non-Goals:**

- 不改变 OpenSpec/Trellis/Codex/Claude 的工具能力与执行顺序。
- 不迁移或重写 `openspec/changes/archive/**` 历史。
- 不在本次变更中引入新的治理平台、数据库或自动化服务。
- 不对 product runtime、frontend/backend 行为做任何需求级调整。

## Decisions

### Decision 1: 用“五层模型”取代“按目录凭感觉理解”

采用以下固定层次：

1. **Project entry**
   - 载体：`AGENTS.md`
   - 职责：规则优先级、最小 session-start 路径、全局 gate、各层指针
2. **Implementation rules**
   - 载体：`.trellis/spec/**`
   - 职责：frontend/backend/guides 具体实现规范
3. **Behavior specs**
   - 载体：`openspec/**`
   - 职责：proposal/design/tasks/main specs/workspace governance
4. **Host adapter config**
   - 载体：`.claude/**`、`.codex/**`
   - 职责：不同 agent host 的 hook/command/config glue
5. **Runtime artifacts**
   - 载体：`.omx/**`、以及其他本地 state
   - 职责：运行期副产物，不是长期仓库资产

**Why this over “keep current layout but document it better”?**

- 只补说明无法解决重复维护问题；必须同时规定“哪层可以写什么，哪层不应该再写什么”。

### Decision 2: `AGENTS.md` 只保留入口和少数全局硬规则

`AGENTS.md` 保留：

- managed Trellis block
- 优先级与五层模型
- 最小 session-start 读取顺序
- OpenSpec + Trellis 协作约定
- commit/session/shell 等跨层硬 gate

`AGENTS.md` 移除或压缩为引用：

- frontend/backend 详细清单
- OpenSpec workspace snapshot 大段正文
- 重复的命令矩阵与重复治理描述

**Why this over “AGENTS 继续做总手册”？**

- 当前 `AGENTS.md` 已接近“仓库宪法 + 实现手册 + 流程说明”的混合体，阅读成本过高且极易漂移。

### Decision 3: `openspec/project.md` 做唯一治理总览，`openspec/README.md` 做短导航

`openspec/project.md` 继续承载：

- capability metrics
- active changes
- workflow governance
- audit/update history

`openspec/README.md` 收敛为：

- OpenSpec 工作区是什么
- 核心目录去哪看
- 详细治理总览在 `project.md`
- 常用命令与少量使用入口

**Why this over “README 和 project.md 双维护不同受众版本”？**

- 当前双维护已经导致信息重复；除非做自动生成，否则长期必漂移。

### Decision 4: `.claude/**`、`.codex/**` 明确是 adapter，不是治理正文

不在这些目录继续新增项目治理正文，只保留：

- hooks
- command wrappers
- host-specific config
- skills/agent registration glue

治理含义由 `AGENTS.md` 与 `.trellis/spec` / `openspec` 解释，adapter 只负责接入。

**Why this over “把 host-specific 规则写在 host 目录里”？**

- host 目录天然会分叉；治理正文一旦分散到 `.claude` 与 `.codex`，就会再次出现双真相。

### Decision 5: `.omx/**` 视为 runtime artifact，直接清退而不是重命名保留

`.omx/**` 中包含 session state、question logs、subagent tracking、外部仓库研究快照与 generated `AGENTS.md`。这些内容不属于当前仓库的长期规范资产。

处理原则：

- 从 Git 删除已提交的 `.omx/**`
- 将 `.omx/` 加入 `.gitignore`
- 不迁移其内容到 `docs/`、`openspec/` 或 `.trellis/`

**Why this over “把 .omx 留作研究资料”？**

- 这些文件是特定 runtime 的副产物，且已经包含外部仓库路径和会话状态，不具备稳定文档价值。

## Risks / Trade-offs

- **[Risk] 协作者依赖旧 `AGENTS.md` 全量说明**
  → **Mitigation:** 保留关键 gate 与指向关系，不做“纯删减不留指针”。

- **[Risk] `openspec/README.md` 过瘦导致新协作者找不到入口**
  → **Mitigation:** 保留目录导航、常用命令与指向 `project.md` 的明确说明。

- **[Risk] 某些本地工作流仍会生成 `.omx/**`**
  → **Mitigation:** `.gitignore` 明确忽略，并在治理文档里声明其 runtime artifact 身份。

- **[Risk] session-start 注入过瘦后，首轮路由缺少必要上下文**
  → **Mitigation:** 保留完整 `AGENTS.md` 注入，只收缩 `current-state` 与 rules/OpenSpec 为摘要 + 指针；关键 task readiness 仍保留结构化状态块。

- **[Risk] `.claude/**` 与 `.codex/**` 分别收缩后再次分叉**
  → **Mitigation:** 把 session-start 的最小上下文构建逻辑抽到共享 helper，由两个 host hook 共同调用。

## Migration Plan

1. 在 OpenSpec change 中定义治理目标、capability 与实施任务。
2. 清理 `.omx/**` 并更新 `.gitignore`。
3. 收敛 `AGENTS.md` 为短入口 + 全局硬约束。
4. 收敛 `openspec/README.md` 为导航入口，并保留 `openspec/project.md` 作为治理总览。
5. 将 `.claude/**` 与 `.codex/**` session-start hook 切到同一套“最小入口 + 按需展开”模型。
6. 校验 `openspec status/validate`、hook 输出长度与基础 Git diff，确保没有把运行时垃圾迁移成新的仓库资产，也没有引入新的注入断链。

### Rollback

- 若文档收敛导致协作者无法定位规则，可回滚到上一版文档，但 `.omx/**` 不应重新入库。
- `.gitignore` 对 `.omx/` 的忽略属于单向卫生改进，不建议回滚。
- 若 session-start 注入收缩导致路由信息不足，可回滚到上一版 hook，但应保留“共享 helper + 最小入口优先”的设计方向。

## Open Questions

- 是否在后续批次新增一份“项目规则地图”放到 `.trellis/spec/guides/`，作为 AGENTS 的稳定二级入口。  
  当前先不做，避免把一次收敛又变成新增一个中心化大文档。
