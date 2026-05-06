# Backend 开发规范（mossx / src-tauri）

本目录适用于 `src-tauri/src/**` 的 Rust backend 开发。

## 技术基线（Project Facts）

- Runtime：Tauri 2.x + Tokio
- 并发状态：`tokio::sync::Mutex`（见 `state.rs`）
- command 注册：`command_registry.rs`
- 文件持久化：`storage.rs`（atomic write + lock file）
- 高风险模块：`engine/*`, `codex/*`, `workspaces/*`, `git/*`, `local_usage.rs`

## 规范目录

| 文档 | 用途 |
|---|---|
| [Directory Structure](./directory-structure.md) | Rust 模块落位与拆分规则 |
| [Error Handling](./error-handling.md) | `Result` 与错误传播策略 |
| [Logging Guidelines](./logging-guidelines.md) | 日志可观测性与敏感信息约束 |
| [Database Guidelines](./database-guidelines.md) | 文件存储/锁/原子写规范 |
| [Computer Use Bridge](./computer-use-bridge.md) | Computer Use status-only bridge 的 command / platform / status contract |
| [Quality Guidelines](./quality-guidelines.md) | review 门禁与验证命令 |

## Pre-Development Checklist

- 若任务同时涉及项目规则入口或文档治理边界，先读 `../guides/project-instruction-layering-guide.md`。
- 新增 `#[tauri::command]` 前先核对是否已有近似 command。
- 涉及文件写入时，先阅读 `storage.rs` 的 lock + atomic write 模式。
- 涉及共享状态时，先确认 `AppState` 中锁粒度是否可复用。
- 涉及 payload 结构变更时，同步检查 frontend `src/services/tauri.ts` mapping。
