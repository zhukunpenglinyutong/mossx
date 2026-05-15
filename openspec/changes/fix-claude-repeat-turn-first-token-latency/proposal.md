## Why

Claude Code realtime output now has two different slow paths that must not be mixed:

- The already-fixed Windows streaming stall where deltas had reached the app but were delayed by backend runtime sync or frontend visible rendering.
- The current repeat-turn symptom where the UI can stay on "generating response" for tens of seconds before the first visible assistant text appears.

The second path looks like first-token / first-valid-event latency rather than renderer smoothness. Without a contract that separates process startup, stdin close, first stdout line, first valid stream-json event, and first text delta, future fixes risk tuning Markdown throttle or coalescing windows in the wrong layer.

## 目标与边界

### 目标

- Diagnose and reduce repeat-turn Claude Code latency before the first assistant text delta becomes visible.
- Preserve the previous successful Windows streaming fixes:
  - realtime delta is emitted before runtime sync / diagnostics;
  - per-delta runtime work stays off the hot path;
  - frontend visible-stall recovery remains engine/platform evidence-driven.
- Add bounded, privacy-safe timing evidence for the Claude request startup path:
  - process spawn;
  - stdin write/close;
  - first stdout line;
  - first valid stream-json event;
  - first assistant text delta.
- Classify first-token delay separately from backend-forwarder stall and visible-output stall.
- Keep the diagnostics and any mitigation cross-platform for desktop Claude Code unless evidence proves a platform-specific path.

### 边界

- This change focuses on Claude Code print-mode `stream-json` turns started by the GUI.
- It may adjust Claude runtime request startup and diagnostics if timing evidence shows avoidable local delay.
- It may add operator/debug diagnostics, but MUST NOT record prompt text, assistant text, tool arguments, environment secrets, or raw stdout payloads.
- It does not change the stable user-facing conversation payload contract unless done through existing diagnostics/timing metadata surfaces.

## 非目标

- Do not re-solve the archived Windows visible-stream stall by globally changing frontend Markdown throttle.
- Do not change Claude model/provider selection or vendor presets.
- Do not disable streaming or fall back to final-only output.
- Do not add a user-facing tuning panel.
- Do not broaden the fix to Codex, Gemini, or OpenCode unless shared diagnostics need correlation fields.
- Do not treat long model thinking/tool execution as a bug when the stream explicitly reports non-text activity.

## What Changes

- Add a Claude repeat-turn first-token latency contract that distinguishes:
  - local request startup delay;
  - CLI/provider first stdout delay;
  - stream-json parse/control-line delay;
  - valid event without assistant text because Claude is thinking or using tools;
  - already-fixed backend/frontend streaming stalls.
- Extend stream latency diagnostics with a first-token category that is separate from `backend-forwarder-stall` and `visible-output-stall-after-first-delta`.
- Add bounded startup timing evidence to the Claude stream path and expose it through existing debug-only diagnostics metadata.
- Use the timing evidence to decide whether implementation should optimize local request startup or only report upstream/model-side first-token delay.
- Preserve final text parity, event ordering, stop controls, and Windows/macOS compatibility.

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 直接调小/调大 frontend Markdown throttle 或 Rust text coalescing window | 改动小，容易观察体感变化 | 不能解决首个 text delta 之前的慢；可能让已正常的流式输出更不丝滑 | 不采用 |
| B | 只依赖人工视频和现有 console 日志判断慢点 | 零实现成本 | 无法区分 spawn/stdin/stdout/valid-event/text-delta；下一次回归仍会凭感觉修 | 不采用 |
| C | 增加分段 startup timing，再按证据修本地可控路径 | 根因边界清晰；保留旧修复；可证明慢在 GUI、CLI/provider、parser 还是 thinking/tool 阶段 | 需要补 Rust/Vitest 回归测试与 debug-only 诊断 | 采用 |
| D | 对 repeat-turn 预热或常驻 Claude child 进程 | 理论上可降低 cold/repeat startup | 语义和安全边界大，容易影响 session continuity、环境隔离和 stop/retry | 暂不采用，除非 timing 证明 spawn 是主瓶颈 |

## Capabilities

### New Capabilities

- `claude-code-first-token-latency`: Defines the Claude Code repeat-turn first-token latency contract, startup timing evidence, classification, and remediation boundaries.

### Modified Capabilities

- `conversation-stream-latency-diagnostics`: Add first-token/startup latency classification and correlation rules that remain distinct from backend forwarding stalls and frontend visible-output stalls.
- `claude-code-stream-forwarding-latency`: Clarify that the existing low-latency forwarding contract starts after engine event ingress and must not be used to misclassify pre-delta first-token delay.
- `claude-code-realtime-stream-visibility`: Clarify that visible-stream mitigation activates only after assistant text delta ingress; no-first-delta repeat-turn waits belong to first-token diagnostics.

## 验收标准

- A repeat-turn Claude Code conversation with no assistant text for a bounded period MUST emit or retain timing evidence that distinguishes:
  - no stdout yet;
  - stdout exists but no valid stream-json event;
  - valid non-text events exist but no assistant text delta;
  - assistant text delta emitted but not visible.
- Timing evidence MUST be bounded, debug-safe, and MUST NOT contain prompt/response content.
- Existing Windows streaming fixes MUST remain intact: realtime deltas are still emitted before runtime sync, and frontend visible-stall mitigation is still provider/model independent.
- macOS and Windows path handling MUST remain compatible; no shell-specific assumptions may be added to the hot path.
- Focused Rust and Vitest tests MUST cover classification boundaries and timing redaction.
- Validation MUST include OpenSpec strict validation plus targeted tests for Claude forwarder / stream diagnostics.

## Impact

- Affected backend:
  - `src-tauri/src/engine/claude.rs`
  - `src-tauri/src/engine/claude_forwarder.rs`
  - `src-tauri/src/engine/commands.rs`
  - related Rust tests
- Affected frontend:
  - `src/features/app/hooks/useAppServerEvents.ts`
  - `src/features/threads/utils/streamLatencyDiagnostics.ts`
  - related Vitest suites
- Affected specs:
  - new `claude-code-first-token-latency`
  - modified `conversation-stream-latency-diagnostics`
  - modified `claude-code-stream-forwarding-latency`
  - modified `claude-code-realtime-stream-visibility`
- No new third-party dependencies are expected.
