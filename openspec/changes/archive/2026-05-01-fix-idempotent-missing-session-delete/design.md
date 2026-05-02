## Context

当前删除链路有两套语义：

1. 主侧边栏单条删除通过 `removeThread` 调用各引擎删除接口；只有 `Claude + SESSION_NOT_FOUND` 被特判为本地移除，其它引擎仍然返回失败并触发 `alert(...)`。
2. 设置页/批量删除通过 `delete_workspace_sessions` 返回结构化结果；当后端报告 session 缺失时，前端会把该项保留为失败，用户刷新后仍可能继续看到这个 stale entry。

这导致“同样是已不存在的会话”，不同入口给出不同结果，且用户仍要面对无意义的报错提示。

## Goals / Non-Goals

**Goals:**

- 让 `session not found` / `thread not found` 在删除上下文中统一收敛为 settled success。
- 保证主侧边栏与设置页/批量管理在 reload 前后都看到一致结果。
- 保留真实删除异常的错误反馈与分类。

**Non-Goals:**

- 不新增 tombstone 或软删除状态。
- 不改动会话恢复、rebind、reconnect 的错误处理语义。

## Decisions

### Decision 1: 单条删除在前端统一做“缺失即清理”收敛

- 方案 A：分别修改每个单条删除 backend command，让它们都返回 success。
- 方案 B：在 `useThreads.removeThread` 统一把 `SESSION_NOT_FOUND` 归为 settled delete，并完成本地清理。

采用 **B**。

原因：

- 单条删除已经通过前端统一的 `mapDeleteErrorCode(...)` 进入收敛点，修改面更小。
- `Claude` 现有行为已经证明这个语义可接受，只需要扩展到 `Codex/OpenCode/Gemini`。
- 不必为每个 engine 单独扩展 command contract。

### Decision 2: 批量/设置页删除在 backend batch core 直接把“缺失目标”记为成功

- 方案 A：前端 hook 收到 batch failure 后再把 `not found` 映射为成功。
- 方案 B：`delete_workspace_sessions_core` 在 batch result 层就把缺失目标当作成功，并同步清理 metadata。

采用 **B**。

原因：

- 这样设置页、catalog reload、后续任何消费 `delete_workspace_sessions` 的地方都共享同一契约。
- 可以在 backend 同步移除 `archived_at_by_session_id` 等 metadata，避免 UI 只是“眼前消失”，刷新后又回来。

### Decision 3: 真实失败仍然保持可见

- 只对缺失类错误做 settled success。
- `permission denied`、`IO error`、ambiguous candidate、workspace not connected 继续保留失败摘要与提示。

## Risks / Trade-offs

- [Risk] 缺失错误字符串来源多样，若识别不全，仍可能漏掉某些 stale entry。
  → Mitigation：复用现有 `mapDeleteErrorCode(...)` 入口，并补充针对 `Codex/OpenCode` 的测试覆盖。

- [Risk] 过度吞错可能把真实数据问题伪装成成功。
  → Mitigation：仅吞 `SESSION_NOT_FOUND` / `thread not found` / `session file not found` 这类明确缺失语义，保留其它错误原样失败。

- [Risk] 批量后端结果与单条删除结果语义不完全一致。
  → Mitigation：通过 OpenSpec 修改同一 capability contract，并在前后端分别补 regression tests。

## Migration Plan

1. 新增 OpenSpec delta，明确“缺失目标 = settled delete”契约。
2. 修改前端单条删除收敛逻辑，去掉无意义 alert。
3. 修改 backend batch delete core，将缺失目标写成成功结果并清理 metadata。
4. 补 thread/settings 删除回归测试并验证。

回滚方案：

- 若发现误吞真实错误，只需回退 `SESSION_NOT_FOUND` 特判逻辑，不影响普通删除主路径。

## Open Questions

- 暂无。当前语义已经足够聚焦，且与用户意图一致。
