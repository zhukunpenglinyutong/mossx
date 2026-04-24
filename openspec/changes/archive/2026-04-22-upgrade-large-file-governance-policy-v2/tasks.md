## 1. Governance Artifacts

- [x] 1.1 补齐本次治理升级的 proposal/design/spec/tasks artifacts `[P0][依赖: 无][输入: 现有 large-file 治理脚本、playbook、spec 与当前仓库扫描结果][输出: 可用于 apply 的 OpenSpec artifacts][验证: openspec status --change upgrade-large-file-governance-policy-v2 显示 tasks ready/done]`
- [x] 1.2 补齐 Trellis PRD 并绑定当前任务上下文 `[P1][依赖: 1.1][输入: 已确认的治理方案与 change id][输出: .trellis/tasks/04-22-large-file-governance-policy-v2/prd.md][验证: PRD 包含 goal/requirements/acceptance criteria/technical notes]`

## 2. Scanner And Policy Engine

- [x] 2.1 为大文件扫描新增 versioned policy 配置 `[P0][依赖: 1.1][输入: 领域分组方案与阈值策略][输出: 可被脚本读取的 policy config][验证: 扫描输出可显示 matched policy id / threshold / priority]`
- [x] 2.2 升级 `scripts/check-large-files.mjs` 支持 policy-aware + baseline-aware 扫描，同时保留 legacy threshold fallback `[P0][依赖: 2.1][输入: 现有脚本实现与目标治理语义][输出: 新 CLI 参数与正确的 gate 判定逻辑][验证: 当前仓库可分别输出 watchlist、retained hard debt、blocking regression]`
- [x] 2.3 生成并提交 machine-readable hard-debt baseline 与 human-readable watchlist/baseline 报告 `[P0][依赖: 2.2][输入: 当前仓库扫描结果][输出: baseline JSON + markdown reports][验证: 产物包含 path/lines/policy/threshold/baseline delta 等关键信息]`

## 3. Workflow And Documentation

- [x] 3.1 更新 `package.json` 与 `.github/workflows/large-file-governance.yml` 以切换到新治理模型 `[P0][依赖: 2.2][输入: 新脚本参数与 baseline 文件路径][输出: 本地命令与 CI workflow 使用同一 policy/baseline][验证: workflow 对应命令与 package scripts 一致]`
- [x] 3.2 更新 large-file governance playbook 与 delta spec，说明 domain-aware + baseline-aware 规则 `[P0][依赖: 2.3,3.1][输入: 新治理模型与验证命令][输出: docs/architecture/large-file-governance-playbook.md 与本 change 的 delta spec 一致][验证: 文档明确 watchlist / hard debt / baseline delta 的区别]`

## 4. Validation

- [x] 4.1 执行 `npm run check:large-files`、`npm run check:large-files:near-threshold`、`npm run check:large-files:gate` 留痕 `[P0][依赖: 3.2][输入: 更新后的脚本、policy 与 baseline][输出: 与当前仓库状态一致的扫描结果][验证: gate 不因现有历史债务误失败，watchlist 输出 policy-aware 信息]`
- [ ] 4.2 如发现误判，先调 policy/baseline，不扩大到业务代码拆分 `[P1][依赖: 4.1][输入: 验证输出中的异常命中][输出: 收敛后的治理规则][验证: 误判消失且规则解释自洽]`
