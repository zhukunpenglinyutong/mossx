## 1. Lifecycle Reconcile

- [x] 1.1 在 `Claude` activation / reopen 前增加 canonical existence check 或等价 reconcile，避免 stale entry 直接进入 history load
- [x] 1.2 调整 `Claude` history load failure 路径，确保失败不会继续把该 thread 标记为 loaded success
- [x] 1.3 增加 targeted tests，覆盖 stale `Claude` entry 的 reopen / activate 行为

## 2. Sidebar Truth Parity

- [x] 2.1 禁止“旧会话打不开时静默新建不相关 Agent conversation 顶替”的行为
- [x] 2.2 为 `Claude` sidebar entry 增加 authoritative refresh / reconcile 触发点，确保显示状态最终与 native session truth 对齐
- [x] 2.3 增加 targeted tests，验证左侧栏当前选中 entry 与实际打开会话 identity 一致

## 3. Delete Reconcile

- [x] 3.1 调整 `Claude` delete path，使 `SESSION_NOT_FOUND` 或等价 not-found 错误触发 authoritative refresh / ghost cleanup
- [x] 3.2 保留可观测错误反馈，但不允许 ghost entry 在左侧栏长期残留
- [x] 3.3 增加 delete regression tests，覆盖 not-found、正常删除、可重试失败三类路径

## 4. Validation

- [x] 4.1 运行 targeted hook / delete tests
- [x] 4.2 运行 `npm run typecheck`
- [x] 4.3 进行 restart -> reopen -> delete manual matrix，验证左侧栏与真实 session state 一致
- [x] 4.4 验证非 `Claude` 引擎与正常 `Claude` 路径不回退
