## 1. Thread Alias Persistence

- [x] 1.1 在 `threadStorage` 中新增 stale-thread alias 的 load/save/sanitize/canonicalize helper
- [x] 1.2 对 alias chain 做压平，保证重启后直接解析到最新 canonical `threadId`
- [x] 1.3 为持久化 alias map 增加损坏值与链式映射测试

## 2. Lifecycle Rebind Integration

- [x] 2.1 在 `useThreadStorage` 暴露 canonical resolve / remember alias 能力
- [x] 2.2 在 `useThreads` 的 active-thread restore、setActiveThreadId、refreshThread 等入口统一 canonicalize
- [x] 2.3 在 workspace active-thread map 上增加自修正，避免 restore 后继续保留 stale binding

## 3. Recover-Only UI Action

- [x] 3.1 调整 `RuntimeReconnectCard`，允许 stale-thread card 单独展示 recover-only 动作
- [x] 3.2 保持 resend 路径为可选增强，而不是唯一恢复入口
- [x] 3.3 补充 UI regression coverage

## 4. Verification

- [x] 4.1 运行 `pnpm vitest run src/features/messages/components/Messages.runtime-reconnect.test.tsx src/features/threads/utils/threadStorage.test.ts src/features/threads/hooks/useThreadMessaging.test.tsx src/features/threads/hooks/useThreadActions.test.tsx`
- [x] 4.2 运行 `pnpm typecheck`
- [x] 4.3 运行 `pnpm lint`

## 5. Explicit Recovery Guard

- [x] 5.1 将 `ensure_codex_session` 的用户触发链路切换为 fresh explicit recovery cycle
- [x] 5.2 避免手动 `ensure-runtime-ready` 继续继承 automatic stale-probe quarantine
- [x] 5.3 运行 `cargo test --manifest-path src-tauri/Cargo.toml session_runtime`
- [x] 5.4 运行 `cargo test --manifest-path src-tauri/Cargo.toml recovery_guard_`
