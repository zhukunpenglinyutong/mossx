## Why

当前仓库的大文件治理只理解“全局 `>3000` 行”这一条硬规则，无法区分高风险域与普通域，也无法区分“历史债务”与“本次 PR 新增回归”。  
现在仓库 `>3000` 为 `0`，但 `>2500` 已经达到 `30` 个文件；如果直接全局收紧阈值，CI 会立即失去可用性，因此需要升级为按领域分级、按基线控增量的治理模型。

## 目标与边界

- 目标：
  - 引入按路径域匹配的 large-file policy，定义 `warn/fail/priority`。
  - 引入 machine-readable baseline，允许现有历史债务持平或下降，但禁止继续增长。
  - 保持本地命令、CI workflow、治理文档与 OpenSpec contract 一致。
- 边界：
  - 本轮只升级治理引擎与规范，不直接拆分业务代码。
  - 现有 `>3000` JIT remediation 原则继续保留，只是扩展为 domain-aware。

## Non-Goals

- 不做一次性批量拆分 `2500-3000` 的所有近阈值文件。
- 不改动产品功能、外部命令协议或持久化数据格式。
- 不回写历史归档 proposal/design/tasks 中对旧门禁的引用。

## What Changes

- 新增可版本化的大文件治理 policy 配置，按仓库路径域定义不同 `warn/fail` 阈值和 priority。
- 将扫描脚本升级为 policy-aware + baseline-aware 模式：
  - `warn` 视图输出按 policy 命中的 watchlist。
  - `fail` 视图只拦截“新超限”或“历史债务继续增长”的文件。
- 新增 machine-readable baseline 产物，并保留人类可读的 markdown baseline/watchlist。
- 更新 npm scripts、CI workflow、playbook 和 OpenSpec delta spec，使治理规则一致。
- 保留 legacy `--threshold` 使用方式，避免历史调用立即失效。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `large-file-modularization-governance`: 从“全局 `>3000` hard gate + `2500-3000` watchlist”升级为“domain-aware policy thresholds + baseline-aware debt growth gate”。

## Acceptance Criteria

- 当前仓库可以生成并提交 policy-aware baseline 与 watchlist。
- hard gate 能放行“已知历史债务持平/下降”的现状，但会阻止新文件超限或旧债务继续增长。
- near-threshold watch 继续非阻断，但输出必须明确 policy、threshold 和 priority。
- CI 与本地命令对同一规则集求值，不允许出现“本地通过/CI 不通过”的语义漂移。

## Impact

- Affected code:
  - `scripts/check-large-files.mjs`
  - `package.json`
  - `.github/workflows/large-file-governance.yml`
  - `docs/architecture/large-file-governance-playbook.md`
  - `docs/architecture/large-file-baseline.md`
  - `docs/architecture/large-file-near-threshold-watchlist.md`
- New versioned artifacts:
  - large-file governance policy config
  - machine-readable baseline JSON
- Spec impact:
  - `openspec/specs/large-file-modularization-governance/spec.md`
