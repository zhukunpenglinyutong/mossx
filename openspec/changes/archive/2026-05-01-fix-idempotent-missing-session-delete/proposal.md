## Why

有些新建后未真正开始的会话，或底层 session 文件已经消失的 stale 会话，仍可能残留在客户端列表中。用户此时点击删除会看到 `session file not found` / `thread not found` 一类报错，但列表项既没有价值，也不应该继续阻塞删除体验。

## 目标与边界

- 目标
  - 将“会话已缺失”的删除场景定义为 idempotent settled delete，而不是用户可见失败。
  - 统一主侧边栏单条删除与设置页批量删除的行为，避免一处直接移除、另一处仍报错保留。
  - 保留真实删除风险的错误反馈，例如 `permission denied`、`IO error`、ambiguous session candidate。
- 边界
  - 本变更只修正删除语义与 stale entry 清理，不改动会话创建、恢复、发送消息的主流程。
  - 不引入回收站、软删除或额外 tombstone 持久层。

## 非目标

- 不重构全部线程持久化结构或 session catalog 架构。
- 不改变普通成功删除的视觉样式或交互文案。
- 不把真实后端删除失败伪装成成功。

## What Changes

- 将 `SESSION_NOT_FOUND`、`session file not found`、`thread not found` 一类“目标已不存在”错误收敛为删除已结算语义：
  - 主侧边栏单条删除直接移除客户端对应会话，不再弹系统错误框。
  - 设置页/批量删除将该类结果视为已删除，不再保留在失败摘要中。
- 批量删除后端结果增加“已缺失目标也算 settled success”的处理，确保会话 catalog metadata 与前端列表在 reload 后继续一致。
- 保留真实失败的错误分类和可见反馈，仅对“目标已不存在”这一类缺失错误静默收敛。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `conversation-hard-delete`: 删除契约从“后端 not found 视为失败”调整为“已缺失目标视为幂等删除完成”。
- `workspace-recent-conversations-bulk-management`: 批量删除结果需要把已缺失会话视为成功移除，而不是失败残留。

## Impact

- Frontend
  - `src/features/threads/hooks/useThreads.ts`
  - `src/features/threads/hooks/useDeleteThreadPrompt.ts`
  - `src/app-shell.tsx`
  - `src/features/settings/components/settings-view/hooks/useWorkspaceSessionCatalog.ts`
  - 相关 thread/settings 删除测试
- Backend
  - `src-tauri/src/session_management.rs`
- Specs
  - 修改 `conversation-hard-delete`
  - 修改 `workspace-recent-conversations-bulk-management`
