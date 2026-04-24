## 1. Evidence And Artifacts

- [x] 1.1 Capture local evidence for Codex CLI plugin cache path, descriptor, helper parent process and OpenAI-signed native codex binary.
- [x] 1.2 Create proposal/design/specs/tasks for CLI Computer Use plugin bridge.

## 2. Backend Detection

- [x] 2.1 Prefer CLI plugin cache descriptor/helper path from `~/.codex/plugins/cache/openai-bundled/computer-use/<version>`.
- [x] 2.2 Keep Codex.app bundled descriptor as fallback only.
- [x] 2.3 Add helpers to classify CLI cache paths and descriptor launch contracts.

## 3. Activation And Diagnostics

- [x] 3.1 Change activation probe so CLI cache helper uses static Codex CLI plugin contract verification instead of direct exec.
- [x] 3.2 Change official parent handoff discovery so CLI cache `.mcp.json` becomes `mcp_descriptor` candidate evidence.
- [x] 3.3 Change host-contract classification so CLI cache helper is not reported as Codex.app parent dead end.

## 4. Specs And Tests

- [x] 4.1 Add Rust tests for CLI cache descriptor priority, static activation verification and handoff classification.
- [x] 4.2 Update `.trellis/spec/backend/computer-use-bridge.md`.

## 5. Validation

- [x] 5.1 Run `cargo test --manifest-path src-tauri/Cargo.toml computer_use -- --nocapture`.
- [x] 5.2 Run `openspec validate integrate-codex-cli-computer-use-plugin-bridge --type change --strict --no-interactive`.
- [x] 5.3 Run `git diff --check`.
