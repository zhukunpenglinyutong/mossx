# 实现 Claude reasoning effort 支持

## OpenSpec Link

- Change: `add-claude-reasoning-effort-support`
- Capability: `claude-reasoning-effort-support`

## Goal

实现 Claude Code reasoning effort 的 provider-scoped UI、send params 透传、Tauri IPC mapping、Rust Claude engine `--effort <value>` allowlist 拼接与回归测试。

## Scope

- 前端：Claude provider 下展示 `思考强度` selector，空值表达为 `Claude 默认`；Gemini/OpenCode 等无 reasoning provider 不展示；Codex 既有 reasoning selector 保持原行为。
- Service：保留 `effort` 从 frontend payload 到 backend command params 的跨层字段。
- Backend：Claude engine 只对 `low`、`medium`、`high`、`xhigh`、`max` 追加 `--effort <value>`。
- Tests：覆盖 UI gating、payload mapping、Rust command building、非法/缺失值不追加。

## Out Of Scope

- 不改变 Claude model discovery、custom model、model refresh 或 runtime model resolution 行为。
- 不改变 Codex 既有 reasoning effort 语义，不为 Gemini、OpenCode 添加 Claude-specific reasoning effort。
- 不新增全局默认 effort 持久化。

## Implementation Notes

- Claude reasoning options 固定为 `low | medium | high | xhigh | max`，不复用 model catalog 字段作为运行时 effort 来源。
- Claude 未选择 effort 时保持 `null`，UI 显示 `Claude 默认`，发送链路不注入默认值。
- Rust Claude engine 在 `build_command` 边界执行 allowlist 校验，非法、空白或缺失值不追加 `--effort`。
- Codex selector 保持原行为；本变更只新增 Claude 可用值与 Claude CLI 参数拼接。

## Verification

- `npx vitest run src/app-shell-parts/modelSelection.test.ts src/features/composer/components/ChatInputBox/ButtonArea.test.tsx src/services/tauri.test.ts --maxWorkers 1 --minWorkers 1`：126 tests passed。
- `npm run typecheck`：passed。
- `cargo test --manifest-path src-tauri/Cargo.toml build_command_`：28 focused tests passed across lib/bin targets。
- `openspec validate --all --strict --no-interactive`：245 items passed。
- `npm run check:runtime-contracts`：passed。
- `git diff --check`：passed。
