# P0 修复方案：对话终止按钮无法停止 AI 回复

## 问题描述

点击终止按钮后，AI 仍然不断回复修改代码。即使关闭应用仍在后台修改代码，无法终止对话。
两个引擎（Claude / Codex）都存在此问题。

## 根因分析

### 问题 1：Claude 引擎 - 中断后仍发送 TurnCompleted（核心 BUG）

**文件**: `src-tauri/src/engine/claude.rs:421-437`

当用户中断一个已产生部分输出的 turn 时：
1. `interrupt()` 杀死进程并清空 `active_processes` HashMap
2. `send_message()` 的读取循环退出后，尝试 `active.remove(turn_id)` 返回 `None`
3. 进入 `else` 分支（第 421 行），仅在 `response_text.is_empty()` 时发送 TurnError
4. **如果已有部分输出（response_text 非空），直接跳过错误处理，继续发送 TurnCompleted**

结果：被中断的 turn 被错误地报告为成功完成。

### 问题 2：Claude 引擎 - interrupt() 缺少中断标记

**文件**: `src-tauri/src/engine/claude.rs:453-464`

`interrupt()` 方法杀死进程后清空 HashMap，但没有设置任何标记告诉 `send_message()` "这是用户主动中断"。`send_message()` 只能通过 `active.remove()` 返回 `None` 来推断，逻辑不可靠。

### 问题 3：应用退出时不清理子进程

**文件**: `src-tauri/src/lib.rs:229-285`

应用退出事件处理中没有清理活跃的 Claude CLI 进程，导致关闭应用后 Claude CLI 仍在后台运行并修改代码。

### 问题 4：Codex 引擎 - engine_interrupt 空操作

**文件**: `src-tauri/src/engine/commands.rs:320`

`engine_interrupt` 命令中 Codex 分支直接返回 `Ok(())`，什么都不做。虽然前端对 Codex 调用的是 `interruptTurnService` 而非 `engineInterruptService`，但如果 RPC 请求未被正确处理，Codex 进程也不会停止。

---

## 修复方案

### 阶段 1：Claude 引擎 - 添加中断标记（核心修复）

**文件**: `src-tauri/src/engine/claude.rs`

1. 在 `ClaudeSession` 结构体添加 `interrupted` 原子标记：
```rust
interrupted: AtomicBool,
```

2. 修改 `interrupt()` 方法，设置中断标记：
```rust
pub async fn interrupt(&self) -> Result<(), String> {
    self.interrupted.store(true, Ordering::SeqCst);
    let mut active = self.active_processes.lock().await;
    for child in active.values_mut() {
        child.kill().await
            .map_err(|e| format!("Failed to kill process: {}", e))?;
    }
    active.clear();
    Ok(())
}
```

3. 修改 `send_message()` 中的错误检查逻辑（第 421-437 行）：
```rust
} else {
    // 进程句柄被 interrupt() 移除
    // 无论是否有部分输出，都应该视为中断
    let was_interrupted = self.interrupted.swap(false, Ordering::SeqCst);
    if was_interrupted {
        log::info!("Turn {} was interrupted by user", turn_id);
        self.emit_turn_event(
            turn_id,
            EngineEvent::TurnError {
                workspace_id: self.workspace_id.clone(),
                error: "Session stopped.".to_string(),
                code: None,
            },
        );
        return Err("Session stopped.".to_string());
    }
    // 非用户中断的异常情况
    if response_text.is_empty() {
        let error_msg = "Claude process terminated unexpectedly".to_string();
        log::error!("{}", error_msg);
        self.emit_turn_event(
            turn_id,
            EngineEvent::TurnError {
                workspace_id: self.workspace_id.clone(),
                error: error_msg.clone(),
                code: None,
            },
        );
        return Err(error_msg);
    }
}
```

### 阶段 2：应用退出时清理所有进程

**文件**: `src-tauri/src/lib.rs`

在应用退出事件中清理所有活跃的 Claude 会话进程：

```rust
RunEvent::ExitRequested { .. } => {
    let state = app_handle.state::<AppState>();
    let manager = &state.engine_manager;
    // 在单独的 runtime 中清理，避免阻塞
    tauri::async_runtime::block_on(async {
        manager.claude_manager.interrupt_all().await;
    });
}
```

**文件**: `src-tauri/src/engine/claude.rs`（ClaudeSessionManager）

添加 `interrupt_all()` 方法：
```rust
pub async fn interrupt_all(&self) {
    let sessions = self.sessions.lock().await;
    for session in sessions.values() {
        let _ = session.interrupt().await;
    }
}
```

### 阶段 3：Codex 引擎 - 确保 RPC 中断可靠

**文件**: `src-tauri/src/engine/commands.rs:303-324`

为 Codex 引擎的 `engine_interrupt` 添加实际处理（作为 fallback）：

```rust
EngineType::Codex => {
    // Codex: 通过守护进程 RPC 请求中断
    // 这是 fallback 路径，主路径在前端通过 interruptTurnService
    log::info!("engine_interrupt called for Codex workspace: {}", workspace_id);
    Ok(())
}
```

**文件**: `src-tauri/src/shared/codex_core.rs`

确认 `turn_interrupt_core` 的 RPC 消息是否正确发送。如果 Codex CLI 不响应 RPC，需要增加超时和进程级 kill 作为 fallback。

### 阶段 4：前端 - 中断后立即清理 UI 状态

**文件**: `src/features/threads/hooks/useThreadMessaging.ts:573-647`

当前 `interruptTurn` 函数已经在前端做了状态清理（markProcessing false, 添加 "Session stopped." 消息）。
但需要确保**两个引擎路径都被正确执行**。

当前逻辑：
- Claude: 调用 `engineInterruptService` ✓
- Codex: 调用 `interruptTurnService` ✓

建议增加：对两个引擎都同时调用两个方法作为双保险：
```typescript
try {
  if (isClaudeThread || activeEngine === "claude") {
    await engineInterruptService(activeWorkspace.id);
  } else {
    await interruptTurnService(activeWorkspace.id, activeThreadId, turnId);
  }
} catch (error) {
  // 即使中断调用失败，前端状态已经清理
  console.error("Interrupt failed:", error);
}
```

---

## 修改文件清单

| 文件 | 修改内容 | 优先级 |
|------|---------|--------|
| `src-tauri/src/engine/claude.rs` | 添加 `interrupted` 标记、修改中断后的错误处理、添加 `interrupt_all` | P0 |
| `src-tauri/src/lib.rs` | 添加 `ExitRequested` 事件处理，清理进程 | P0 |
| `src-tauri/src/engine/commands.rs` | Codex `engine_interrupt` 添加日志 | P1 |
| `src/features/threads/hooks/useThreadMessaging.ts` | 中断逻辑增强（可选） | P2 |

## 风险评估

- **低风险**: 修改都是增量的，不改变正常对话流程
- **中风险**: `ExitRequested` 处理中的 `block_on` 可能在某些平台有超时问题
- **缓解**: 中断操作有 kill() 调用，通常很快完成

## 预估复杂度：中等
