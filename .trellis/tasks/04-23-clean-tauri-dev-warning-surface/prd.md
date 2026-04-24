# Clean tauri dev warning surface

## Goal
把 `npm run tauri dev` 启动时仍然可见的 warning 做 ownership 拆分和分批治理：减少仓库内部重复 npm warning，清理 repo-owned Rust `dead_code/unused` warning，并明确哪些 warning 只能由本机环境修复。

## Requirements
- OpenSpec change `clean-tauri-dev-warning-surface` 必须包含完整 proposal / design / specs / tasks。
- 必须先建立 warning ownership baseline，再开始具体清理。
- `beforeDevCommand` 如有调整，必须保持现有 `ensure-dev-port + vite + devUrl` 启动语义不变。
- Rust warning 清理必须优先 remove / reconnect / split-by-platform；只有 intentional compatibility shim 才允许窄口 `allow(dead_code)`.
- 验收必须至少包含 `npm run tauri dev` 启动日志复查和 `cargo test --manifest-path src-tauri/Cargo.toml`。

## Acceptance Criteria
- [ ] 已形成 `repo-owned` / `environment-owned` warning baseline。
- [ ] 仓库内部重复的 npm unknown-config warning 被消除或显著减少。
- [ ] `src-tauri` 当前 dev startup 可见的 Rust warning 有明确批次化治理方案和验证路径。
- [ ] 不引入新的 dev startup 回归。

## Technical Notes
- 顶层 `npm run tauri dev` 因用户本机 `.npmrc` / env 打出来的 warning，不保证可由仓库代码完全消除。
- `startup_guard` warning 需要重点区分“平台边界导致的可见性问题”和“真实未用代码”。
- `backend/app_server` 与 `engine/*` warning 更偏向 orphaned scaffolding / disconnected adapter，需要先做引用审计再决定删改。 
