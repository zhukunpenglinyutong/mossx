## 1. Approval Scope Core

- [x] 1.1 [P0][Depends: none][Input: 现有 `ApprovalRequest` payload shape、`getApprovalThreadId` helper][Output: 可复用的 inline approval scoping helper][Verify: helper 能区分 matching thread、other thread、missing threadId fallback] 提取 approval inline surface 的 thread-scope 过滤逻辑。
- [x] 1.2 [P0][Depends: 1.1][Input: `Messages.tsx` 当前 `visibleApprovals` 仅按 workspace 过滤的实现][Output: inline approval surface 改为 `workspace + thread` 收口，并保留 missing-thread fallback][Verify: 切到无关会话时不再看到别的 thread 的 approval；无 `threadId` 的 legacy approval 仍可显示] 在消息区接入 thread-scoped approval filtering。
- [x] 1.3 [P0][Depends: none][Input: 现有 `handleApprovalDecision`、approval queue remove path][Output: approval 卡支持本地 `dismiss` 动作并从前端待审批队列移除][Verify: 点击关闭按钮后卡片消失，且不会触发 backend accept/decline 请求] 增加 approval 卡的本地关闭/销毁出口。

## 2. Regression Tests

- [x] 2.1 [P0][Depends: 1.2][Input: `Messages.rich-content.test.tsx` 现有 approval 渲染用例][Output: 覆盖“同 workspace 多 thread approvals 只显示当前 thread”和“missing threadId fallback”回归测试][Verify: Vitest 断言无关 thread approval 不再渲染、当前 thread approval 仍可批量确认] 为消息区 approval 可见性补回归测试。
- [x] 2.2 [P0][Depends: 1.3][Input: `ApprovalToasts.test.tsx`、`useThreadApprovals.test.ts`][Output: 覆盖 close/dismiss 不走 backend 决策、但会移除卡片的回归测试][Verify: 点击关闭按钮后仅触发本地移除，`respondToServerRequest` 不被调用] 为 approval dismiss escape hatch 补回归测试。

## 3. Validation

- [x] 3.1 [P0][Depends: 2.1-2.2][Input: 前端改动与 OpenSpec artifacts][Output: 通过的 OpenSpec 与前端最小验证结果][Verify: `openspec validate fix-approval-ui-thread-scoping --strict`、targeted `vitest`、`npm run typecheck`] 完成规范与实现门禁校验。
