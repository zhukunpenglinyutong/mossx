## 1. Spec

- [x] 明确 Claude AskUserQuestion backend timeout 与 frontend pending queue 的 race
- [x] 定义 stale timeout response 与普通 submit failure 的边界

## 2. Implementation

- [x] 在 `useThreadUserInput` 中增加 stale settlement error classifier
- [x] stale cancel/timeout response 清理 processing 与 pending request
- [x] 普通 submit failure 保持 request 可见

## 3. Tests

- [x] 新增 regression test：backend 已 timeout 后 cancel response 结算前端队列
- [x] 运行 focused Vitest / ESLint / typecheck / diff check
- [x] 记录 OpenSpec CLI 不在 PATH，无法运行 `openspec validate fix-ask-user-question-timeout-settlement --strict`
