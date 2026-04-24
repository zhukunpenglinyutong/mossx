## 1. Broker Contract

- [x] 1.1 Add OpenSpec proposal/design/specs/tasks for Codex CLI Computer Use broker.
- [x] 1.2 Update Trellis backend/frontend specs with broker boundary and validation matrix.

## 2. Backend Broker

- [x] 2.1 Add broker request/result types and failure kinds.
- [x] 2.2 Add broker readiness gate using existing Computer Use bridge status and CLI cache contract evidence.
- [x] 2.3 Add single-flight guard and kill switch.
- [x] 2.4 Reuse Codex app-server hidden thread execution to send deterministic Computer Use task prompt.
- [x] 2.5 Register Tauri command and service mapping.

## 3. Frontend Surface

- [x] 3.1 Add Computer Use broker hook and Tauri service wrapper.
- [x] 3.2 Add broker input/result panel to Computer Use status card.
- [x] 3.3 Add i18n copy for broker ready, blocked, running, completed and failed states.

## 4. Tests

- [x] 4.1 Add Rust tests for broker gating, invalid instruction, unsupported platform and already-running behavior.
- [x] 4.2 Add frontend tests for broker hook and status card rendering.
- [x] 4.3 Add service mapping tests.

## 5. Validation

- [x] 5.1 Run targeted Rust tests.
- [x] 5.2 Run targeted frontend tests.
- [x] 5.3 Run `npm run typecheck`.
- [x] 5.4 Run `openspec validate add-codex-cli-computer-use-broker --type change --strict --no-interactive`.
- [x] 5.5 Run `git diff --check`.
