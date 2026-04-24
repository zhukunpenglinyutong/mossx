## 1. Diagnostics And Classification

- [x] 1.1 为 `Claude` 增加 `repeat-turn blanking` diagnostics 分类，确保它与 `visible-output-stall-after-first-delta` 分离
- [x] 1.2 补充与 blanking 相关的 bounded evidence 字段，至少能关联 `workspaceId`、`threadId`、`engine`、`platform`、turn 维度与 active mitigation profile
- [x] 1.3 为 diagnostics 增加 targeted tests，验证非 `Claude` 与无 blanking evidence 的路径不会被误分类

## 2. Render-Surface Recovery

- [x] 2.1 在 `Messages` / `MessagesTimeline` / `MessagesRows` 中补齐 `repeat-turn blanking` 的非空幕布 recovery path
- [x] 2.2 在 blanking recovery 激活时保留或恢复至少一个可读 surface，并在 completed 后回到稳定终态
- [x] 2.3 增加 renderer regression tests，验证 blanking recovery 不会隐式创建新线程或修改当前选中会话 identity

## 3. Boundary Protection

- [x] 3.1 确保 blanking mitigation 保持 `Claude` scoped，不泄漏到 `Codex / Gemini / OpenCode`
- [x] 3.2 确保该 mitigation 不与现有 `visible stall` / `long-markdown progressive reveal` 修复发生语义冲突
- [x] 3.3 确保 blanking recovery 不写入 session/sidebar lifecycle 状态

## 4. Validation

- [x] 4.1 运行 targeted frontend tests，覆盖 diagnostics 与 render recovery
- [x] 4.2 运行 `npm run typecheck`
- [x] 4.3 在受影响机器上执行 manual matrix，验证第 2 轮及之后不再出现整块空白
- [x] 4.4 进行 control-path 验证，确认非受影响 `Claude` 路径与非 `Claude` 引擎不回退
