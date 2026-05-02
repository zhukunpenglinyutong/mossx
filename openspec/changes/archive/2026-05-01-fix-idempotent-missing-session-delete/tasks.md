## 1. OpenSpec 契约

- [x] 1.1 更新 `conversation-hard-delete`，把缺失目标定义为 settled delete，并明确真实失败仍需可见。[P0][input: 当前删除 contract][output: spec delta 更新][verify: spec 文本覆盖 single delete + batch delete 缺失场景]
- [x] 1.2 更新 `workspace-recent-conversations-bulk-management`，让批量删除把缺失会话视为成功移除。[P0][input: 当前 bulk delete spec][output: spec delta 更新][verify: spec 文本覆盖 mixed success/missing/error 场景]

## 2. 删除语义实现

- [x] 2.1 扩展前端单条删除收敛逻辑，让 `SESSION_NOT_FOUND` 对所有引擎都直接本地移除且不再 alert。[P0][depends: 1.1][input: `useThreads.removeThread`][output: 统一 settled delete 行为][verify: thread delete tests 覆盖 Codex/OpenCode/Claude missing-session]
- [x] 2.2 调整 backend `delete_workspace_sessions_core`，将缺失目标标记为成功并同步清理 metadata。[P0][depends: 1.2][input: session batch delete core][output: batch delete not-found settled success][verify: settings/session catalog tests 覆盖 missing-session batch deletion]

## 3. 验证与收尾

- [x] 3.1 补充前端与设置页删除回归测试，覆盖缺失目标不再残留、不再告警、真实失败仍保留错误。[P0][depends: 2.1, 2.2][input: thread/settings tests][output: 回归用例][verify: 定向 vitest 通过]
- [x] 3.2 运行定向验证并回写 tasks 状态，确保本 change 可继续 apply/verify/archive。[P1][depends: 3.1][input: 测试结果][output: 勾选后的 tasks][verify: openspec status 显示 tasks 已更新]
