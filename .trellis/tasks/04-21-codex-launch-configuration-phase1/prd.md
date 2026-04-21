# Execute Codex Launch Configuration Phase 1

## Goal

将 OpenSpec change `add-codex-structured-launch-profile` 推进到可实施状态，并按保守版边界落地第一阶段实现：把现有 Codex `bin + args` 启动配置产品化为可编辑、可预览、可校验的 `Launch Configuration`，同时保证不影响当前正常功能。

## Linked OpenSpec Change

- `add-codex-structured-launch-profile`

## Requirements

- 只实现 `executable + arguments`，不引入 `environment`。
- 复用现有持久化字段：
  - app-global `codexBin` / `codexArgs`
  - workspace `codex_bin` / `settings.codexArgs`
- 提供 backend effective launch preview contract，并让 preview 与 `codex_doctor` 共享同一套 launch resolution。
- 设置页提供最小可用的 `Launch Configuration` 编辑能力。
- workspace 配置区显式展示 override / inherit / fallback 结果，覆盖 worktree 继承路径。
- 保存后默认下次启动生效，不得重启或打断当前已连接的 Codex runtime。
- 未修改该设置的用户，其启动行为必须与当前版本保持一致。
- 本期不得引入：
  - 新的 persisted schema migration
  - immediate apply / active runtime replacement
  - external config reload 语义变更
  - remote parity 扩展

## Acceptance Criteria

- [ ] preview 能返回 effective executable、wrapper kind、user args、injected args 与 warnings。
- [ ] preview 与 `codex_doctor` 对同一配置返回一致的 resolved launch 语义。
- [ ] 设置页可编辑 app-global executable / arguments，并在保存前展示 preview 结果。
- [ ] workspace 区域能清楚展示 override / inherit / fallback，worktree 未设置时继续继承 parent workspace。
- [ ] 保存后仅影响下次启动，不打断当前连接中的 Codex runtime。
- [ ] 不修改设置时，既有启动行为保持不变。
- [ ] 受影响测试与基础质量门禁通过：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `cargo test --manifest-path src-tauri/Cargo.toml`

## Technical Notes

- Frontend primary files:
  - `src/features/settings/components/settings-view/sections/CodexSection.tsx`
  - `src/features/settings/hooks/useAppSettings.ts`
  - `src/features/workspaces/hooks/useWorkspaces.ts`
  - `src/services/tauri.ts`
  - `src/types.ts`
- Backend primary files:
  - `src-tauri/src/backend/app_server.rs`
  - `src-tauri/src/backend/app_server_cli.rs`
  - `src-tauri/src/settings/mod.rs`
  - `src-tauri/src/types.rs`
  - `src-tauri/src/codex/args.rs`
- 实现原则：
  - frontend 不自行拼接 launch preview，统一走 Tauri contract
  - runtime 启动链路优先复用现有 resolution 逻辑，避免并行真值
  - 任何 UX 文案都要明确“保存后下次启动生效，不影响当前连接”
