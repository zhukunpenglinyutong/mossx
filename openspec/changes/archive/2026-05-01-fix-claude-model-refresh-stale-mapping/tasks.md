## 1. Spec

- [x] 明确 stale localStorage mapping 会覆盖 refreshed parent label 的问题边界
- [x] 定义 selector label source-of-truth contract

## 2. Implementation

- [x] 移除 `ModelSelect` 内部对 `CLAUDE_MODEL_MAPPING` 的读取和 memo cache
- [x] 保留 default model i18n fallback 与 custom label 展示逻辑

## 3. Tests

- [x] 新增 regression test：stale localStorage mapping 不覆盖 parent-provided refreshed label
- [x] 运行 focused Vitest / ESLint / typecheck / diff check
- [x] 记录 OpenSpec CLI 不在 PATH，无法运行 `openspec validate fix-claude-model-refresh-stale-mapping --strict`
