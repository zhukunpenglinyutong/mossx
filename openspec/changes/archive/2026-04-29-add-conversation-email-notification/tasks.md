## 1. Backend Email Send Contract

- [x] 1.1 P0 / deps: none / output: add `SendConversationCompletionEmailRequest` and core helper in `src-tauri/src/email/mod.rs`; validation: unit tests cover disabled, missing secret, invalid recipient, and success-path request construction.
- [x] 1.2 P0 / deps: 1.1 / output: add `send_conversation_completion_email` Tauri command using the shared email sender and default saved recipient; validation: command returns existing structured email errors and never exposes secret.
- [x] 1.3 P0 / deps: 1.2 / output: register the new command in `src-tauri/src/command_registry.rs`; validation: `rg -n "send_conversation_completion_email" src-tauri/src`.
- [x] 1.4 P1 / deps: 1.2 / output: extend backend tests for bounded timeout/error mapping reuse where practical; validation: `cargo test --manifest-path src-tauri/Cargo.toml email`.

## 2. Typed Frontend Bridge

- [x] 2.1 P0 / deps: 1.2 / output: add TypeScript request/result types for conversation completion email in `src/types.ts` or the nearest existing email type location; validation: TypeScript compile catches payload shape.
- [x] 2.2 P0 / deps: 2.1 / output: add `sendConversationCompletionEmail()` to `src/services/tauri.ts` using `invokeEmailCommand`; validation: feature code has no direct `invoke()` call.
- [x] 2.3 P1 / deps: 2.2 / output: add service-level tests or mocked call coverage if nearby patterns exist; validation: test asserts command name and structured error normalization.

## 3. One-Shot Thread Intent State

- [x] 3.1 P0 / deps: none / output: add thread-scoped one-shot email intent state near `useThreads` or the smallest adjacent hook; validation: state is keyed by `threadId` and stores target turn/status without touching AppSettings.
- [x] 3.2 P0 / deps: 3.1 / output: bind armed idle intent to the next submitted turn and active-generation intent to current `activeTurnId` when available; validation: hook/reducer tests cover idle-before-send and active-generation toggle.
- [x] 3.3 P0 / deps: 3.1 / output: clear intent on completed, error, interrupted, cancelled, stalled, or skipped send terminal paths; validation: tests prove later turns do not send unless re-armed.
- [x] 3.4 P0 / deps: 3.2 / output: add duplicate guard keyed by `threadId:turnId` before starting email send; validation: duplicate `turn/completed` events produce one send attempt.

## 4. Composer UI

- [x] 4.1 P0 / deps: 3.1 / output: extend `ChatInputBoxProps` and `ButtonAreaProps` with email intent selected/toggle/disabled props; validation: no existing call site loses required props.
- [x] 4.2 P0 / deps: 4.1 / output: render an icon-only email toggle in the composer control area, defaulting to send/stop left side unless screenshot alignment requires a narrower insertion point; validation: selected and disabled states are visually distinct.
- [x] 4.3 P1 / deps: 4.2 / output: add i18n keys for aria-label, tooltip, selected state, success, skipped, and failure feedback; validation: no user-visible hardcoded English/Chinese text in component.
- [x] 4.4 P1 / deps: 4.2 / output: add CSS for compact toolbar sizing and narrow viewport behavior; validation: `npm run check:large-files` if a large CSS file is touched.

## 5. Email Body Assembly

- [x] 5.1 P0 / deps: 3.2 / output: implement a pure utility that extracts the target turn's final user message, assistant answer, and key activity summaries from normalized `ConversationItem[]`; validation: unit tests cover message-only, fileChange, commandExecution, and missing assistant cases.
- [x] 5.2 P0 / deps: 5.1 / output: format plain-text email subject/body with workspace/thread metadata and bounded long-output truncation; validation: snapshots or string assertions cover paths and status output.
- [x] 5.3 P1 / deps: 5.1 / output: ensure skipped-send state when no valid assistant completion can be resolved; validation: no backend send call in missing-assistant test.

## 6. Completion Integration

- [x] 6.1 P0 / deps: 2.2, 3.4, 5.2 / output: invoke email send from terminal completion flow after visible conversation facts are settled; validation: completion test sends exactly once with expected payload.
- [x] 6.2 P0 / deps: 6.1 / output: failure path surfaces recoverable feedback and preserves completed assistant/tool cards; validation: mocked email rejection leaves lifecycle terminal and visible items unchanged.
- [x] 6.3 P1 / deps: 6.1 / output: record debug dimensions for workspaceId/threadId/turnId/send result without secrets; validation: `rg` confirms no secret field is logged.

## 7. Validation

- [x] 7.1 P0 / deps: 1-6 / output: run targeted frontend tests for composer, intent state, body assembly, and completion integration; validation: relevant `npm run test -- ...` or equivalent Vitest commands pass.
- [x] 7.2 P0 / deps: 1-6 / output: run backend email tests; validation: `cargo test --manifest-path src-tauri/Cargo.toml email` passes.
- [x] 7.3 P1 / deps: 1-6 / output: run static gates; validation: `npm run lint`, `npm run typecheck`, and relevant `npm run check:runtime-contracts` pass or failures are documented.
- [x] 7.4 P1 / deps: 1-6 / output: manually verify thread isolation: arm thread A, switch to B, return to A, complete once, confirm auto-clear; validation: record observed result in implementation notes.
