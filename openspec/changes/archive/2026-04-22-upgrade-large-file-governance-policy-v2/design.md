## Context

当前大文件治理脚本只有全局阈值概念：`2500` 作为 near-threshold watch，`3000` 作为 hard gate。  
这个模型在“先把 `>3000` 清零”的阶段有效，但在当前状态下已经不够：

- 高风险桥接/运行时文件已经逼近 3000 行，但直到跨线前都不会被硬约束。
- 当前仓库 `>2500` 已有 `30` 个文件，若直接全局降低 hard gate，CI 会立刻对历史债务全部报错。
- 现有 markdown baseline 适合人工阅读，不适合作为 gate 判断“本次 PR 是否新增/放大债务”的机器输入。

这次改动是跨脚本、CI、文档和规范的治理升级，不涉及产品功能，但会改变仓库质量门禁的判定方式。

Stakeholders:
- 前端/后端维护者
- CI 与 release owner
- 正在处理 `threads/messages/composer/git-history/settings` 等高复杂度模块的协作者

## Goals / Non-Goals

**Goals:**
- 引入按路径域解析的 large-file policy，显式定义 `warn/fail/priority`。
- 引入 machine-readable baseline，用于区分“历史债务”和“本次改动导致的新增/增长债务”。
- 让本地命令、CI workflow、playbook 和 spec 使用同一规则集。
- 保留 legacy threshold-only CLI 作为兼容 fallback。

**Non-Goals:**
- 不在本轮直接拆分 `src/services/tauri.ts`、`src/app-shell.tsx`、`useThreadMessaging.ts` 等业务大文件。
- 不把 archived change 文档批量迁移到新描述。
- 不引入新的外部依赖或新的产品 capability。

## Decisions

### Decision 1: 用 ordered policy groups 代替单一全局阈值

- Decision: 新增一个 versioned policy 配置文件，按 repo-relative path 匹配到唯一 policy group，每个 group 定义 `warnThreshold`、`failThreshold`、`priority`。
- Rationale: 让 bridge/runtime critical、feature hotpath、styles、tests、i18n 走不同治理强度，而不是继续一刀切。
- Alternative considered:
  - 直接把全局 hard gate 从 `3000` 降到 `2600`：会让当前仓库大量历史债务直接把 CI 打红，治理不可落地。

### Decision 2: 用 machine-readable baseline 记录“历史债务 ledger”

- Decision: 在现有 markdown 报告之外，新增 JSON baseline，记录每个超出 fail threshold 的文件、命中的 policy、阈值和行数。
- Rationale: hard gate 需要判断“新超限/继续增长/保持不变/下降”，markdown 不适合做机器判定。
- Alternative considered:
  - 只靠当前扫描结果判断：无法区分历史债务与本次回归。

### Decision 3: hard gate 只拦截“新增或增长的超限债务”

- Decision: `fail` 模式在 policy-aware 模式下遵循以下规则：
  - 新文件超过 fail threshold：fail
  - 旧文件超过 fail threshold 且高于 baseline：fail
  - 旧文件超过 fail threshold 但持平或下降：pass with report
- Rationale: 这样既能阻止复杂度回归，又不会因为历史债务导致全仓无法前进。
- Alternative considered:
  - 所有超过 domain fail threshold 的文件一律 fail：与当前仓库实际状态不兼容。

### Decision 4: watchlist 和 hard-debt baseline 分开维护

- Decision: `warn` 视图输出 watchlist，覆盖所有超过 warn threshold 的文件；`fail` 视图与 baseline 只关注超过 fail threshold 的 hard debt。
- Rationale: 让“风险可见性”和“阻断性治理”职责分离，避免报告与 gate 混在一起。
- Alternative considered:
  - 统一一个 baseline 覆盖所有 warn/fail 记录：输出噪音太大，且 gate 判定语义不清晰。

### Decision 5: 保留 legacy threshold-only CLI，新增 policy/baseline 参数

- Decision: `scripts/check-large-files.mjs` 保留 `--threshold` 行为，同时支持 `--policy-file`、`--baseline-file`、`--baseline-output`、`--scope warn|fail` 等新参数。
- Rationale: 仓库中已有大量历史文档和临时命令引用旧参数，直接砍掉兼容层会引入无关摩擦。
- Alternative considered:
  - 一次性移除 `--threshold`：技术上更干净，但迁移成本不必要。

## Risks / Trade-offs

- [Risk] policy 规则顺序错误导致文件命中错误分组  
  → Mitigation: 使用 deterministic first-match 规则，并在输出中显示 `policyId`。

- [Risk] baseline 生成错误会造成 hard gate 误放或误杀  
  → Mitigation: baseline 中写入 policy version、generatedAt、threshold 快照，并在验证阶段执行实际仓库扫描对比。

- [Risk] 新 gate 逻辑过于复杂，协作者难以理解  
  → Mitigation: playbook 明确区分 watchlist、hard debt、baseline delta，并在日志中输出 remediation guidance。

- [Trade-off] baseline-aware gate 会接受“存量超限但未继续增长”的文件  
  → Mitigation: 通过 watchlist 持续暴露风险，并在后续 follow-up change 中逐个拆分热点文件。

## Migration Plan

1. 新建 OpenSpec change 与 Trellis task，明确治理边界和验收标准。
2. 新增 policy config 与 baseline JSON 支持，升级 `check-large-files` 脚本。
3. 重新生成当前仓库的 hard-debt baseline 和 warn watchlist。
4. 更新 `package.json`、CI workflow 与 playbook，切换到新规则。
5. 跑 large-file 相关命令验证输出与当前仓库状态一致。

Rollback strategy:
- 若新 gate 误判，可先回退脚本、policy config、workflow 和 baseline 文件，不回退无关业务代码。
- 若只是某个 policy 阈值不合理，可保留脚本结构，仅调整 policy config 与 baseline。

## Open Questions

- 后续是否要把 `src/utils/threadItems.ts` 等“非 feature 目录但高复杂度”文件提升到独立 hotpath policy？
- 是否需要把 policy-aware 大文件治理结果同步到额外的架构 dashboard，而不止 markdown/json 报告？
