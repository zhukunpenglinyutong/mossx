## 1. Regression Coverage

- [x] 1.1 Add reducer regression for Codex equivalent completion with different item ids; input is duplicate assistant content, output is one assistant message, verify with Vitest.
- [x] 1.2 Add reducer regression for snapshot-before-delta and delta-before-completion order variance; input is reordered Codex events, output is one assistant message, verify with Vitest.
- [x] 1.3 Add non-regression coverage for tool-separated non-equivalent assistant segments; input includes tool boundary, output preserves separate messages, verify with Vitest.
- [x] 1.4 Add regression coverage for single-message trailing repeated snapshot blocks; input is `prefix + block + repeated block`, output is one readable block, verify with Vitest.
- [x] 1.5 Add regression coverage for Codex streaming delta repeats after an inline sentence boundary; input is `A + "。 " + A'`, output is one readable block, verify with Vitest.
- [x] 1.6 Add regression coverage for Codex streaming delta repeats where the first prefix is truncated; input is `Use... + Computer Use...`, output is one readable block, verify with Vitest.
- [x] 1.7 Add regression coverage for Codex assistant snapshots arriving through `upsertItem` with different ids; input is two structurally near-equivalent snapshots, output is one assistant item, verify with Vitest.
- [x] 1.8 Add regression coverage for Codex `upsertItem` aliases that start with the previous bridge sentence; input is `bridge + A'`, output is one assistant item, verify with Vitest.
- [x] 1.9 Add integration coverage for Codex turn completion scheduling one delayed history-detail reconciliation; input is completed realtime output followed by `turn/completed`, output is one `resumeThread`/history refresh call, verify with Vitest.

## 2. Core State Convergence

- [x] 2.1 Implement a focused assistant semantic merge target resolver in the thread reducer layer; depends on 1.1, priority high, verify by targeted reducer tests.
- [x] 2.2 Apply the resolver to `completeAgentMessage` so synthetic fallback ids merge into existing equivalent assistant items; depends on 2.1, priority high, verify by targeted reducer tests.
- [x] 2.3 Ensure existing same-id streaming and completed paragraph dedupe behavior remains unchanged; depends on 2.2, priority medium, verify existing duplicate tests.
- [x] 2.4 Collapse trailing near-duplicate paragraph/list groups before snapshot replacement so same-item Codex snapshots cannot keep `A + A'` inside one bubble; depends on 1.4, priority high, verify targeted text merge and reducer tests.
- [x] 2.5 Split inline sentence boundaries during duplicate-block comparison so ordinary streaming append paths can collapse `closing sentence + repeated block`; depends on 1.5, priority high, verify targeted text merge and reducer tests.
- [x] 2.6 Allow bounded short-prefix containment when comparing duplicate blocks so truncated `Use...` and full `Computer Use...` prefixes can converge without merging tiny unrelated fragments; depends on 1.6, priority high, verify targeted text merge and reducer tests.
- [x] 2.7 Apply Codex assistant equivalence resolution to `upsertItem` snapshot ingestion so normalized and legacy snapshot paths cannot append duplicate assistant bubbles with alias ids; depends on 1.7, priority high, verify targeted reducer tests.
- [x] 2.8 Add merge-result convergence detection for bridge-prefixed aliases; depends on 1.8, priority high, verify targeted reducer tests.
- [x] 2.9 Add Codex-only delayed terminal history reconciliation using existing `refreshThread` / history resume path; depends on 1.9, priority high, verify hook integration tests.

## 3. Event Routing Guard

- [x] 3.1 Review `turn/completed` fallback routing and add a minimal guard only if reducer-level convergence does not cover the observed duplicate path; depends on 2.2, priority medium, verify with event routing or reducer tests.
- [x] 3.2 Keep normalized and legacy realtime adapter paths compatible; depends on 3.1, priority medium, verify existing app-server event tests if changed.

## 4. Validation And Artifact Closure

- [x] 4.1 Run targeted Vitest tests for changed reducer/event modules.
- [x] 4.2 Run TypeScript or broader relevant gate if helper signatures or shared event routing changed.
- [x] 4.3 Update this task list checkboxes to reflect completed implementation and verification.
