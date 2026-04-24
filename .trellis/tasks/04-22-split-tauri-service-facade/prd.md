# Split tauri service facade into domain submodules

## Goal
在不改变外部 import surface 和 runtime contract 的前提下，将 `src/services/tauri.ts` 中低耦合 domain 抽成独立 submodule，使 façade 文件降到 large-file hard gate 之下。

## Requirements
- 保持 `src/services/tauri.ts` 的导出名称与调用方式不变。
- 第一轮只抽低耦合 domain：`dictation`、`terminal/runtime-log`、`project-memory`、`vendors/agents`。
- 不修改 Tauri command 名、参数名、返回结构和 fallback 语义。
- 抽分后 `src/services/tauri.ts` 需要低于当前 `bridge-runtime-critical` policy 的 fail threshold。

## Acceptance Criteria
- [ ] 新增 domain submodules，并由 `src/services/tauri.ts` re-export。
- [ ] `src/services/tauri.ts` 行数降到 `2600` 以下。
- [ ] `npm run typecheck` 通过。
- [ ] `npm run check:large-files:gate` 通过，且 `src/services/tauri.ts` 不再属于 retained hard debt。

## Technical Notes
- OpenSpec change: `split-tauri-service-facade`
- 本轮不触碰高耦合的 `engine/codex/git/workspace file` 主链路。
