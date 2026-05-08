## 1. Contract And Discovery Backend

- [ ] 1.1 Confirm Claude Code CLI model discovery source; input: installed/current Claude CLI docs and local command outputs; output: chosen command contract or help/config parsing fixture plan; validation: documented fixtures before parser implementation.
- [ ] 1.2 Define Claude model entry contract with explicit `id`, runtime `model`, display metadata, and non-optional source metadata; input: existing `EngineModelInfo` / `ModelOption`; output: backward-compatible types with `unknown` source fallback; validation: TypeScript typecheck and Rust serialization tests.
- [ ] 1.3 Implement CLI-first Claude model discovery; input: resolved Claude CLI binary and PATH env; output: parseable discovered model entries; validation: Rust unit tests with CLI output fixtures.
- [ ] 1.4 Add cache/fallback-safe discovery behavior; input: discovery success/failure result; output: retained previous catalog or marked fallback catalog; validation: Rust tests for failure, empty output, and timeout cases.
- [ ] 1.5 Preserve settings/env override extraction; input: `~/.claude/settings.json` and related env values; output: override model entries merged into discovery result; validation: Rust tests for settings and env precedence.

## 2. Frontend Catalog Merge And Refresh

- [ ] 2.1 Update frontend engine model normalization to preserve runtime `model` and source metadata; input: `EngineModelInfo[]`; output: `ModelOption[]` with no id/model collapse; validation: focused `useEngineController` tests.
- [ ] 2.2 Merge CLI-discovered entries, settings overrides, and custom Claude models deterministically while preserving custom source attribution; input: backend catalog plus local custom models; output: de-duplicated selector catalog; validation: tests for duplicate runtime model, custom-only model, source attribution, and fallback merge.
- [ ] 2.3 Update Claude `刷新配置` action to rerun discovery and keep selector state fail-safe; input: refresh click; output: refreshed or retained catalog with diagnosable error; validation: component/hook tests for success and failure.
- [ ] 2.4 Keep `ModelSelect` presentational; input: parent-provided models; output: labels from props/i18n only; validation: existing selector tests plus stale mapping regression.

## 3. Send-Time Resolution And Legacy Migration

- [ ] 3.1 Implement Claude send-time model resolution; input: selected UI id and merged catalog; output: runtime model for `engine_send_message`; validation: `useThreadMessaging` tests for id/model divergence.
- [ ] 3.2 Add legacy Claude selection migration before send; input: persisted legacy ids such as old built-in model ids; output: equivalent discovered/custom/default option; validation: tests for migrated, unmigratable, and custom-preserved cases.
- [ ] 3.3 Keep backend passthrough validation shape-based, not official-list based; input: runtime model string; output: accepted or rejected by safety shape only; validation: Rust tests for aliases, custom provider-scoped ids, invalid whitespace/control values.
- [ ] 3.4 Add debug diagnostics for model resolution; input: send and refresh flows; output: source, selected id, runtime model, fallback/error metadata; validation: focused tests or snapshot assertions for debug payloads.

## 4. Daemon And Cross-Layer Parity

- [ ] 4.1 Audit daemon-side Claude model discovery/send mirror; input: daemon engine bridge and command state; output: parity plan or shared helper usage; validation: symbol search plus Rust tests where daemon has separate logic.
- [ ] 4.2 Align frontend service mapping with backend contract; input: `get_engine_models` and `engine_send_message` payloads; output: no dropped `model`/source fields; validation: `src/services/tauri.test.ts`.
- [ ] 4.3 Ensure remote/backend fallback behavior remains compatible; input: remote mode model payloads; output: no behavior regression for non-local runtime; validation: targeted service tests or documented no-op if remote mode bypasses discovery.

## 5. Verification

- [ ] 5.1 Run OpenSpec validation; input: completed artifacts; output: strict pass; validation: `openspec validate dynamic-claude-model-discovery --strict --no-interactive`.
- [ ] 5.2 Run frontend focused tests; input: changed model selector, engine controller, and messaging files; output: passing Vitest suites; validation: targeted `npm run test -- <files>` or equivalent project command.
- [ ] 5.3 Run frontend typecheck; input: updated TS contracts; output: no type errors; validation: `npm run typecheck`.
- [ ] 5.4 Run backend focused tests; input: updated Rust discovery and send validation; output: passing Rust tests; validation: targeted `cargo test --manifest-path src-tauri/Cargo.toml <filter>`.
- [ ] 5.5 Run final strict gate if implementation spans frontend and backend; input: complete change; output: no contract drift; validation: `openspec validate --all --strict --no-interactive` plus required project gates.
