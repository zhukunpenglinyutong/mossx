## 1. Contract And Discovery Backend

- [x] 1.1 Confirm Claude Code model catalog source; input: installed/current Claude CLI command behavior and local settings/env; output: settings/env + custom-only source contract; validation: documented no stable CLI model-list command before parser removal.
- [x] 1.2 Define Claude model entry contract with explicit `id`, runtime `model`, display metadata, and non-optional source metadata; input: existing `EngineModelInfo` / `ModelOption`; output: backward-compatible types with `unknown` source fallback; validation: TypeScript typecheck and Rust serialization tests.
- [x] 1.3 Implement settings/env-only Claude model catalog; input: Claude settings/env overrides; output: configured model entries only; validation: Rust tests prove help examples and builtin fallback are not synthesized.
- [x] 1.4 Add refresh fail-safe behavior; input: refresh success/failure result; output: successful refresh replaces stale catalog, failure retains previous catalog; validation: focused frontend tests for source switch and empty catalog.
- [x] 1.5 Preserve settings/env override extraction; input: `~/.claude/settings.json` and related env values; output: override model entries merged into discovery result; validation: Rust tests for settings and env precedence.
- [x] 1.6 Add compatibility normalization for legacy model payloads; input: entries missing `model` and/or `source`; output: safe `unknown` source fallback and explicit runtime-resolution requirement; validation: TypeScript normalization tests and Rust serde compatibility tests.

## 2. Frontend Catalog Merge And Refresh

- [x] 2.1 Update frontend engine model normalization to preserve runtime `model` and source metadata; input: `EngineModelInfo[]`; output: `ModelOption[]` with no id/model collapse; validation: focused `useEngineController` tests.
- [x] 2.2 Merge settings overrides and custom Claude models deterministically while preserving custom source attribution; input: backend settings catalog plus local custom models; output: de-duplicated selector catalog; validation: tests for duplicate runtime model, custom-only model, source attribution, and no fallback merge.
- [x] 2.3 Update Claude `刷新配置` action to rerun discovery and keep selector state fail-safe; input: refresh click; output: refreshed or retained catalog with diagnosable error; validation: component/hook tests for success and failure.
- [x] 2.4 Keep `ModelSelect` presentational; input: parent-provided models; output: labels from props/i18n only; validation: existing selector tests plus stale mapping regression.
- [x] 2.5 Add non-Claude provider regression coverage; input: Codex/Gemini/OpenCode catalog refresh paths; output: no precedence or selection behavior drift from Claude-only source handling; validation: focused existing tests or documented no-op evidence.

## 3. Send-Time Resolution And Legacy Migration

- [x] 3.1 Implement Claude send-time model resolution; input: selected UI id and merged catalog; output: runtime model for `engine_send_message`; validation: `useThreadMessaging` tests for id/model divergence.
- [x] 3.2 Add legacy Claude selection migration before send; input: persisted legacy ids such as old built-in model ids; output: equivalent discovered/custom/default option; validation: tests for migrated, unmigratable, and custom-preserved cases.
- [x] 3.3 Keep backend passthrough validation shape-based, not official-list based; input: runtime model string; output: accepted or rejected by safety shape only; validation: Rust tests for aliases, custom provider-scoped ids, invalid whitespace/control values.
- [x] 3.4 Add debug diagnostics for model resolution; input: send and refresh flows; output: source, selected id, runtime model, fallback/error metadata; validation: focused tests or snapshot assertions for debug payloads.
- [x] 3.5 Prove fallback/help entries are not synthesized; input: empty settings/env and empty custom catalog; output: no hardcoded Claude fallback entries; validation: focused frontend/Rust no-fallback tests.

## 4. Daemon And Cross-Layer Parity

- [x] 4.1 Audit daemon-side Claude model discovery/send mirror; input: daemon engine bridge and command state; output: parity plan or shared helper usage; validation: symbol search plus Rust tests where daemon has separate logic.
- [x] 4.2 Align frontend service mapping with backend contract; input: `get_engine_models` and `engine_send_message` payloads; output: no dropped `model`/source fields; validation: `src/services/tauri.test.ts`.
- [x] 4.3 Ensure remote/backend fallback behavior remains compatible; input: remote mode model payloads; output: no behavior regression for non-local runtime; validation: targeted service tests or documented no-op if remote mode bypasses discovery.
- [x] 4.4 Add CI gate mapping checklist; input: changed cross-layer files and tests; output: documented command matrix for OpenSpec, frontend, service mapping, typecheck, and Rust focused tests; validation: verification tasks cannot be marked complete until the checklist has passing evidence.

## 5. Verification

- [x] 5.1 Run OpenSpec validation; input: completed artifacts; output: strict pass; validation: `openspec validate dynamic-claude-model-discovery --strict --no-interactive`.
- [x] 5.2 Run frontend focused tests; input: changed model selector, engine controller, and messaging files; output: passing Vitest suites; validation: targeted `npm run test -- <files>` or equivalent project command.
- [x] 5.3 Run frontend typecheck; input: updated TS contracts; output: no type errors; validation: `npm run typecheck`.
- [x] 5.4 Run backend focused tests; input: updated Rust discovery and send validation; output: passing Rust tests; validation: targeted `cargo test --manifest-path src-tauri/Cargo.toml <filter>`.
- [x] 5.5 Run final strict gate if implementation spans frontend and backend; input: complete change; output: no contract drift; validation: `openspec validate --all --strict --no-interactive` plus required project gates.
- [x] 5.6 Record compatibility boundary evidence; input: remote/web-service/daemon audit plus non-Claude provider regression result; output: concise verification note in implementation summary or verification artifact; validation: no unsupported metadata path is left undocumented.

## Verification Notes

- Claude source contract: current local Claude Code `2.1.126` exposes no stable structured model-list command; `claude model --help` enters the interactive path instead of returning a model catalog. Implementation now treats `~/.claude/settings.json` / env model overrides plus user custom models as the only Claude selector sources. It does not parse `claude --help` examples and does not synthesize builtin fallback aliases.
- Compatibility boundary: Rust `ModelInfo` and daemon mirror now serialize `model` and `source`; frontend normalization maps missing legacy `source` to `unknown` and missing `model` to explicit compatibility runtime resolution.
- Remote/web-service boundary: service mapping preserves backend fields and compatibility payloads can omit metadata because frontend normalizes to `unknown`.
- Non-Claude boundary: Codex/Gemini/OpenCode selection behavior remains on existing paths; shared type additions were satisfied with `unknown`/`custom` source defaults and focused non-Claude model selection tests.
- Passing gates so far: `openspec validate dynamic-claude-model-discovery --strict --no-interactive`; `npm run typecheck`; `npm exec vitest run src/features/engine/hooks/useEngineController.test.tsx src/features/threads/hooks/useThreadMessaging.test.tsx src/services/tauri.test.ts src/app-shell-parts/modelSelection.test.ts`; `cargo test --manifest-path src-tauri/Cargo.toml claude_ -- --nocapture`.
- Regression finding: `Cxn[1m]` is a user custom model, not a built-in Claude alias or mapping artifact. Removed hardcoded Claude fallback/static catalog entries so unsupported or unconfigured variants do not masquerade as local capability, and added custom-model send coverage proving `engine_send_message.model` receives `Cxn[1m]` with `source=custom`.
- Send-time evidence: Claude backend responses now include `modelResolution.requestedModel`, `runtimeModel`, `willPassToCli`, and `fallbackReason` so debug logs can distinguish frontend selection from backend CLI argv intent. Added command-builder regression proving custom bracket models such as `Cxn[1m]` become `--model Cxn[1m]` instead of being reset to fallback.
- Model selector regression: fixed frontend Claude list rendering so backend settings/env entries are not remapped again by stale local `claudeModelMapping`, and de-duplication now considers runtime model identity when present. Current local Claude CLI still exposes no stable scriptable equivalent of the interactive `/model` picker; `claude model --help` / `claude models --help` fall back to top-level help, so help output is intentionally not used as selector catalog.
- Settings/env catalog regression: fixed backend Claude settings handling so `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_*_MODEL`, and `ANTHROPIC_REASONING_MODEL` become independent `settings-override` entries whose display name equals the runtime model value. They no longer overwrite fallback `Sonnet` / `Opus` / `Haiku` labels, so models like `MiniMax-M4[1m]` do not render as `Opus`.
- Source-switch refresh regression: manual `刷新配置` with `forceRefresh` now treats the backend response as the replacement catalog, not an append merge. A successful empty/new response clears stale models from the previous provider source; only request failure preserves the prior catalog.
- Default-preservation regression: when a user custom Claude model shadows the backend default runtime model, merge de-duplication now preserves the default flag on the surviving runtime entry instead of dropping `isDefault`.
- Frontend hardcode audit: the Claude selector has no MiniMax/Kimi/GLM/DeepSeek static catalog path. Remaining frontend model literals are limited to provider preset env templates and legacy-id migration sentinels. Dynamic backend Claude catalogs are no longer rewritten by stale `localStorage` `claude-model-mapping`, preventing old values such as `MiniMax-M2.7` from replacing refreshed models such as `deepseek-v4-pro` or `kimi-for-coding`.
- No-fallback Claude catalog decision: Claude Code model selector entries now come only from Claude settings/env overrides plus user custom models. Backend no longer parses `claude --help` examples as models, and frontend no longer synthesizes `sonnet` / `opus` / `haiku` or selected-value fallback entries for Claude when the configured/custom catalog is empty.
- Non-Claude regression guard: `ButtonArea` now treats a parent-provided Codex hydrated catalog as authoritative and only falls back to local Codex merge when parent models are empty, preventing duplicate Codex options during the Claude discovery rollout.
- Final strict gate: `openspec validate --all --strict --no-interactive` passed with 239 passed, 0 failed.
