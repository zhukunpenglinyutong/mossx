## Context

当前会话管理链路已经具备独立设置页、分页、筛选和批量治理能力，但底层 contract 仍然主要建立在 `workspace-scoped history` 之上：

- `session_management.rs` 以当前 `workspaceId` 为主查询入口，默认把“当前选中 workspace”理解成“唯一会话归属边界”。
- `local_usage.rs` 对 Codex 本地历史的扫描依赖 `cwd -> workspace path` 的 strict 匹配，适合回答“这个路径下是否真实发生过会话”，但不适合回答“当前客户端可见的历史都有哪些”。
- archive / unarchive / delete 的 mutation 路由同样以“当前视图 = 当前 owner workspace”为前提，这在聚合视图里会导致误路由风险。

真实排查已经证明问题本质：

- 类似 `mouna` 这类项目页显示 `0`，在 strict path match 语义下是正确结果，不是数据扫描 bug。
- 但 `~/.codex/sessions` 与 `~/.codex/archived_sessions` 中同时存在大量 CLI / VSCode 历史，说明产品上缺少“全局历史/归档中心”。
- 同时还有一类历史并不 strict 命中当前 workspace path，但在 `cwd`、git root、工作区目录结构等维度上与项目明显相关，用户也希望在项目语境下看到并治理。

这次设计的目标不是替换 strict project history，而是把会话可见性模型拆成三层并让它们共享同一治理语义：

1. `Strict Project Sessions`
2. `Inferred Related Sessions`
3. `Global Session History / Archive Center`

约束：

- 保持现有 Tauri command + file-based storage 架构，不引入数据库或后台索引服务。
- archive metadata 继续复用现有 session management metadata 文件，不迁移物理结构。
- 需要兼容 source 缺失、`cwd` 缺失、root 扫描失败等降级场景。
- 需要保证 archive / delete 不误删、不串改，优先级高于“尽量多归属”。

## Goals / Non-Goals

**Goals:**

- 为 Codex 历史建立 `global + strict project + inferred project` 的三层可见性模型。
- 提供一个与 workspace 无关的 `Global Session History / Archive Center`，让用户能查看当前客户端本机可见的 Codex 历史。
- 在项目页保留 strict path match 视图，并在此基础上增加 inferred attribution 结果。
- 为任意视图下的会话结果提供统一 `canonical session identity`，确保 dedupe、archive、unarchive、delete 一致。
- 为 inferred 结果暴露可解释元数据，包括 `reason`、`confidence` 和 `ownerWorkspaceCandidate`。
- 在部分 source/root 失败时继续返回可用结果，并显式暴露 degradation 信息。

**Non-Goals:**

- 不在本轮统一 Claude / Gemini / OpenCode 的全局历史中心。
- 不在本轮修改主聊天页、sidebar、workspace home 的默认会话展示语义。
- 不在本轮承诺 inferred attribution 的 100% 命中率；低置信或不可解释的结果允许保持 `unassigned`。
- 不在本轮引入新的 archive 存储模型或全局数据库。

## Decisions

### Decision 1: 采用三层读取模型，而不是继续把所有语义塞进一个项目列表

读取结果分为三个逻辑层：

- `strict project sessions`
  - 来自现有 strict path match
  - 表达“真实命中当前 workspace/project 边界的会话”
- `inferred related sessions`
  - 来自全局历史上的 attribution pass
  - 表达“与当前项目相关，但不是 strict 命中”
- `global session history / archive center`
  - 不以 workspace 为前提
  - 表达“当前客户端本机可见的 Codex 历史全集”

选择这个模型，而不是直接把 inferred 结果混进 strict 列表，原因是：

- 事实层与解释层需要分离，否则用户无法判断“为什么这条会话会出现在这里”。
- strict=0 不是 bug；如果直接混入 inferred，会再次把产品语义搞模糊。
- 三层模型可以共享同一 canonical identity 与 mutation contract，避免功能重复建设。

备选方案：

- 方案 A：继续只保留 strict project list
  - 可实现成本最低，但完全不能满足“全局归档可见”的诉求。
- 方案 B：只有 global center，没有 inferred project
  - 可以解决“看不见”的问题，但项目页仍缺解释层，不利于治理。

### Decision 2: 全局历史中心采用“roots union + deterministic dedupe”而不是单一路径扫描

全局历史中心扫描来源：

- 默认 Codex roots
- workspace override roots（当 session management / attribution 已知该 workspace 定义了自定义 codex home 时）
- 已归档 roots 与 active roots 同时扫描

返回前统一经过 deterministic dedupe：

- 主键优先级：`canonical session identity`
- 若同一 logical session 命中多个 roots/source，保留一个 canonical entry
- canonical entry 仍保留 `sourceCandidates` / `scanOrigins` 级别的解释信息

这样设计的原因：

- 用户的历史实际可能散落在 `~/.codex`、自定义 root、不同 source provider 下。
- 产品要求是“当前客户端本机可见历史”，而不是“当前 active source 下某一个 root 的历史”。
- roots union 会增加扫描成本，但可以通过分页、超时与缓存控制成本。

### Decision 3: attribution 采用“规则评分 + 置信度分层”，而不是黑盒自动归属

attribution pipeline：

1. 对 global entries 读取可用 metadata：
   - `cwd`
   - `gitRoot`
   - source/provider
   - workspace catalog
   - project/worktree parent-child 关系
2. 计算候选 workspace/project：
   - strict path hit
   - git root equality
   - cwd 位于 workspace parent scope
   - worktree/main 映射命中
3. 输出 attribution result：
   - `strict-match`
   - `inferred-related`
   - `unassigned`
4. 为 inferred 结果提供：
   - `attributionReason`
   - `confidence`
   - `matchedWorkspaceId`

选择规则评分而不是直接 machine-learning/embedding 归属，原因是：

- 当前问题是 product contract 缺失，不是需要复杂算法。
- 可解释性是强要求；archive/delete 这种治理动作不能依赖黑盒判断。
- 规则评分便于回归测试和后续增量扩展。

### Decision 4: mutation 以 canonical identity 为核心，并保持 owner-aware routing

每个列表项都必须有：

- `canonicalSessionId`
- `ownerWorkspaceId`（若已知）
- `attributionStatus`

mutation 路由规则：

- strict / inferred / global 任意视图触发 archive、unarchive、delete，都以 `canonicalSessionId` 为目标。
- 若 entry 已知 owner workspace，则按 `ownerWorkspaceId` 路由到底层现有 workspace-scoped command。
- 若 entry 暂时无法确定 owner，则：
  - archive / unarchive 仅在 archive metadata 作用域可被唯一解析时允许执行，否则也必须进入保护态
  - delete 默认进入保护态，不直接执行 destructive delete，除非 identity resolution 能得到唯一 owner

这样设计的原因：

- destructive action 的第一原则是准确性，而不是“尽量猜对”。
- 现有 workspace-scoped command 已稳定，优先复用。
- 对于 owner 未知的 global 历史，需要显式的保护策略，而不是隐式降级成误删或误归档风险。

### Decision 5: Phase 1 先交付 global center + strict explainability，Phase 2 再打开 inferred project surface

分阶段策略：

- Phase 1
  - 全局历史/归档中心
  - strict 视图空态引导
  - canonical identity + cross-view mutation consistency
- Phase 2
  - inferred attribution engine
  - 项目页 related sessions surface
  - attribution filter / badge / explainability
- Phase 3
  - mixed-root caching
  - degradation hardening
  - 大规模历史性能优化

原因：

- 用户第一优先诉求是“先能看到历史并能治理”。
- inferred attribution 的规则设计和验证复杂度更高，适合在 global visibility 打通后单独落。
- 分阶段可以降低风险，并保证每一阶段都有独立可验证价值。

阶段约束：

- `Phase 1` 必须能够在不依赖 inferred attribution 的前提下独立交付。
- `Phase 1` 的验证范围至少包括：global center 可见性、stable paging、canonical dedupe、archive/unarchive、owner-unknown protection、partial-source degradation。
- `Phase 2` 才引入 attribution engine、related surface 与 inferred governance parity。

## Risks / Trade-offs

- [Risk] roots union 会放大扫描成本与磁盘 IO
  → Mitigation：仅在历史治理入口启用；分页读取；保留 deterministic cursor；必要时增加最近一次 scan cache。

- [Risk] inferred attribution 误判会损害用户对项目视图的信任
  → Mitigation：inferred 与 strict 隔离展示；输出理由和置信度；低置信结果保持 `unassigned`。

- [Risk] global center 中存在 metadata 缺失条目，导致无法执行精确 delete
  → Mitigation：archive 与查看允许继续；delete 需要唯一 owner resolution，否则进入保护态并给出原因。

- [Risk] 同一条会话跨视图出现时状态不同步
  → Mitigation：统一 canonical identity；mutation 后集中刷新 canonical entry cache；跨视图共享状态更新逻辑。

- [Risk] 一部分 source/root 失败会造成结果不完整
  → Mitigation：显式返回 `partialSource` / degradation marker；UI 提示“结果部分可用”而不是静默空列表。

- [Risk] Phase 1 与 Phase 2 分期交付会让第一期项目页仍存在“只能看到 strict”的局限
  → Mitigation：在 strict 空态明确引导去 global center；避免用户误解为“完全没有历史”。

## Migration Plan

1. 补 spec deltas
   - 为 `workspace-session-management` 与 `codex-cross-source-history-unification` 增加 global/inferred 相关要求
   - 新增 `global-session-history-archive-center`
   - 新增 `session-history-project-attribution`
2. 落 backend read model
   - 构建 global Codex session scan API
   - 输出 canonical identity、source candidates、archive metadata、owner metadata
3. 落 frontend global center
   - 新增入口、分页、筛选、治理操作
   - 补 strict 空态引导
4. 落 attribution engine 与 project related surface
   - 规则打分
   - badge / filter / explainability
5. 完成 consistency 与 degradation 回归
   - partial-source
   - metadata-missing
   - dedupe stability
   - delete protection

回滚策略：

- 若 global center 本身出现严重性能问题，可临时隐藏入口并回退到现有 strict project management。
- 若 attribution 结果误判较多，可保留 global center，同时关闭 inferred related surface。
- 由于不迁移底层存储格式，回滚主要是 feature-level rollback，不需要数据迁移。

## Open Questions

- global center Phase 1 默认作为 `Session Management` 内的新子页或等价二级 surface 落地；是否在后续演进为独立设置入口，留待后续产品决策。
- 对 owner 未知但 identity 唯一的 archived entry，是否允许 delete？当前设计倾向“默认保护，除非 owner resolution 唯一且可验证”。
- Phase 1 是否需要先只支持 Codex，UI 上明确标注“global history currently supports Codex only”？本设计建议明确标注，避免用户误以为包含所有引擎。
