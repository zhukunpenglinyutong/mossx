## Context

当前 heavy test noise 规范只存在于 behavior spec 与人工回归实践中，还没有 CI 级 sentry。现有 `.github/workflows/ci.yml` 只支持 `workflow_dispatch`，并且 `test-windows` 只是运行 heavy tests，不会再对日志做噪音判定。因此即使 repo-owned noise 回来了，只要 tests 仍然 pass，CI 仍是绿的。

## Goals / Non-Goals

**Goals:**

- 增加一条真正可执行的 heavy test noise CI gate。
- 在 CI 中复用 batched Vitest heavy suite，而不是引入一套新的测试入口。
- 对 environment-owned warning 保持显式 allowlist，防止误伤。

**Non-Goals:**

- 不重构整个 CI 触发策略。
- 不要求所有测试输出绝对为零日志，只要求 repo-owned heavy noise 为零。

## Decisions

### Decision 1: 使用独立 workflow，而不是直接改手动 `ci.yml`

- Option A: 直接把 `ci.yml` 改成 pull_request/push 自动执行
  - Pros: 统一
  - Cons: 影响面太大，会连带所有现有 job 一起变更
- Option B: 新增一个独立 `heavy-test-noise-sentry.yml`
  - Pros: 变更范围小、可单独设 required check、语义清晰
  - Cons: 会新增一条独立 workflow

**Decision:** 采用 Option B。大文件治理已经是独立 sentry，这里沿用同样模式最稳。

### Decision 2: 使用 Node gate 脚本，而不是 shell grep

- Option A: workflow 里用 shell redirect + grep / rg 判断
  - Pros: 快
  - Cons: Windows / shell quoting / multiline block 很脆弱
- Option B: 用 Node 脚本统一运行 heavy tests、采集日志、解析 violation
  - Pros: 跨平台稳定、便于测试、规则清晰
  - Cons: 需要维护一份 parser

**Decision:** 采用 Option B。测试噪音门禁本身就是一个 parser problem，必须可测试。

### Decision 3: 允许 environment-owned warning，但不允许 repo-owned residual noise

- Option A: 任何 warning/log 都 fail
  - Pros: 最严格
  - Cons: 会把 `electron_mirror` 这类 runner / local config 噪音误判成代码回归
- Option B: 明确 allowlist environment-owned warning，其余 repo-owned noise 全拦
  - Pros: 信号干净，职责边界清晰
  - Cons: 需要维护 allowlist

**Decision:** 采用 Option B。allowlist 只允许极少数环境 warning，避免门禁重新变脆。

## Risks / Trade-offs

- [Risk] Vitest 输出格式变化导致 parser 漂移  
  → Mitigation: 为 parser 增加脚本级测试，并尽量用上下文 marker + payload 分类而不是 brittle grep。

- [Risk] 独立 workflow 会增加 PR 时长  
  → Mitigation: 只做一条 focused sentry，不同时改动整个 `ci.yml`。

- [Risk] allowlist 扩张失控  
  → Mitigation: 将 allowlist 固定为 environment-owned warning；repo-owned residual noise 仍然一律 fail。

## Migration Plan

1. 新增 heavy test noise gate 脚本与 parser tests。
2. 增加 npm script 作为本地/CI 统一入口。
3. 新增独立 workflow 并接入 PR / push / workflow_dispatch。
4. 用本地 `npm run check:heavy-test-noise` 验证当前仓库是 clean baseline。

Rollback:

- 删除新增 workflow、npm script、noise gate 脚本与 parser tests。
- 保留产品代码和现有测试清理结果不动。

## Open Questions

- 未来如果 `ci.yml` 改成自动触发，是否要把这条 sentry 内联回主 CI；本轮不做。

