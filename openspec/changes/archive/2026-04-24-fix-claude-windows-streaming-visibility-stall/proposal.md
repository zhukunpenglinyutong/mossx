## Why

`Claude Code` 引擎在 Windows 桌面端的实时对话流式输出仍存在 engine-level 可见性故障：首个 assistant delta 能进入 UI 并显示前几个字，但 live text 随后停止推进，界面持续 `loading/processing`，直到 turn 完成后才整体补齐正文。用户已确认该现象与模型无关，macOS 路径一直正常，因此本问题不应继续按 provider/model 特例治理。

当前仓库已有两类历史修复，但都没有覆盖这个故障边界：

- `41aba520 fix(claude): 缓解 Windows 下 Claude 流式输出逐字变慢` 只解决 Windows 下 Claude delta 过碎导致的“逐字慢蹦”，不解决“首包后可见输出停住”。
- `fix-qwen-desktop-streaming-latency` 将强 mitigation 绑定到 `Qwen-compatible provider + Windows`，把 #399 的现场环境误收窄成 provider 指纹；这会让原生 `Claude Code + Windows` 即使出现相同 visible stall，也继续留在 baseline path。

本 change 要把问题重新定义为：**Claude Code realtime stream 从 runtime event 到 frontend visible render 的 Windows 平台退化**。模型/provider 只能作为诊断维度，不再作为修复入口。

## 目标与边界

### 目标

- 只聚焦 `Claude Code` 引擎，不碰 `Codex / Gemini / OpenCode`。
- 修复 `Claude Code + Windows` 实时对话中“前几个字后卡住，完成后一次性整体输出”的 progressive reveal 失效。
- 覆盖 `live assistant` 先出现一小段 prefix/stub，随后长时间不再推进、直到 completed 才整片落下的同类退化；该 stub MUST NOT 被视为“已有 meaningful live progress”。
- 将 diagnostics 从 provider/model 归因改为 engine-level stream pipeline 归因，明确区分：
  - runtime 未收到首包
  - runtime / thread 已收到 delta，但 frontend visible render 未持续推进
  - delta 过碎或 batching/throttle 组合导致 UI 可见性被放大退化
- 让强 mitigation 入口由 `Claude Code + Windows + evidence` 触发，而不是由 `provider/model fingerprint` 触发。
- 保持 conversation lifecycle、event ordering、terminal outcome、stop/retry/processing 状态语义不变。

### 边界

- 本 change 不重写 Claude provider 配置、不调整模型列表、不修改 vendor preset。
- 本 change 不做全局性能大重构，只治理 Claude Code realtime stream 的 Windows 可见性故障。
- 本 change 不改变 Tauri command payload contract，不引入新的持久化 schema。
- 本 change 不删除既有 Qwen provider diagnostics；它仍可作为诊断维度保留，但不能再决定原生 Claude 是否被保护。

## 非目标

- 不把问题归因为某个模型或第三方 provider。
- 不通过关闭 streaming、隐藏 live 输出或只显示 spinner 来“规避”问题。
- 不扩大到其他引擎的 stream/render 策略。
- 不顺手处理 blanking、sticky header、history replay、runtime reconnect、tool card UI 等无关幕布问题。
- 不新增用户可配置的性能调参面板。

## What Changes

- 新增 `Claude Code` 专属的 realtime stream visibility capability，要求 Windows desktop surface 在收到 assistant delta 后必须持续可见推进正文。
- 修改 stream latency diagnostics：记录并分类 `visible-output-stall-after-first-delta`，且该分类不得依赖 provider/model 指纹。
- 修改 provider-scoped mitigation 语义：provider profile 只能作为更细分的附加档位，不能阻止 engine/platform 级 mitigation 生效。
- 修改 Claude render-surface stability：render-safe 不仅要避免 blank/flash，还必须保护 live assistant text 的 progressive visibility。
- 要求验证矩阵单独覆盖 `Windows native Claude Code`，不能再用 Qwen-compatible provider 或其他模型路径替代。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 继续按模型/provider 指纹做定向 mitigation | 改动小，延续旧提案 | 已被用户证伪；会继续漏掉原生 Claude Code Windows 路径 | 不采用 |
| B | 只继续调大 backend Windows text delta coalescing window | 只碰 Claude backend，blast radius 小 | 只能处理 delta 过碎；不能证明 frontend visible render 持续推进 | 不采用 |
| C | 全局提高 Markdown throttle / realtime batching 强度 | 快速降低主线程压力 | 会误伤非 Claude 和 macOS 正常路径，并可能让 live 输出更迟钝 | 不采用 |
| D | 建立 `Claude Code + Windows + evidence` 的 engine-level visibility mitigation，并保留 provider/model 仅作诊断维度 | 边界准确；与用户结论一致；可观测、可回退；不误伤其他引擎 | 需要补齐 diagnostics、spec、targeted tests 与 Windows 手测 | **采用** |

## Capabilities

### New Capabilities

- `claude-code-realtime-stream-visibility`: 定义 `Claude Code` 实时对话从 runtime delta 到 frontend visible text 的可见性契约，重点覆盖 Windows 桌面端首包后 live text 停止推进的问题。

### Modified Capabilities

- `conversation-stream-latency-diagnostics`: 新增 engine-level visible-output-stall 分类，要求 diagnostics 不再把 Claude Windows 流式故障绑定到 provider/model 指纹。
- `conversation-provider-stream-mitigation`: 调整 provider-scoped mitigation 的边界，明确 provider profile 不得作为 engine/platform 级 Claude mitigation 的唯一入口或拦截条件。
- `conversation-render-surface-stability`: 扩展 Claude render-safe contract，要求 live processing 期间不仅不 blank，还必须保持 assistant text progressive visibility。

## 验收标准

- `Windows + native Claude Code` 在实时对话中收到首个 assistant delta 后，assistant text MUST 持续可见推进，不能长期停在前几个字后只剩 loading，直到 completed 才整体输出。
- 若同一 turn 的 live assistant surface 曾显示过更长的可读正文，但随后退化成更短的 prefix/stub，系统 MUST 保留或恢复该 turn 最近一次更可读的 live surface，而不能把退化后的 stub 当作唯一可见正文。
- 同一故障场景下 diagnostics MUST 能记录并归类为 `visible-output-stall-after-first-delta` 或等价分类，且该分类 MUST NOT 依赖 model/provider。
- mitigation 激活条件 MUST 以 `engine=claude`、`platform=windows`、`firstDeltaAt`、`visible render lag / progressive reveal gap` 等 evidence 为准。
- 既有 `Qwen-compatible provider + Windows` diagnostics 可以保留，但不能作为原生 `Claude Code` Windows 修复是否生效的必要条件。
- `macOS Claude` 与非 `Claude` 引擎 MUST 保持现有基线行为。
- mitigation 激活后，event ordering、message text、terminal lifecycle、stop button、waiting/ingress/processing state MUST 保持语义一致，不得丢字、乱序或伪完成。
- 验证必须包含 `Windows native Claude Code` 手测；不得只用不同模型、Qwen-compatible provider 或 macOS 结果替代。

## Impact

- Affected frontend:
  - `src/features/threads/utils/streamLatencyDiagnostics.ts`
  - `src/features/threads/hooks/useThreadEventHandlers.ts`
  - `src/features/threads/hooks/useThreadItemEvents.ts`
  - `src/features/messages/components/Messages.tsx`
  - `src/features/messages/components/MessagesTimeline.tsx`
  - `src/features/messages/components/MessagesRows.tsx`
  - `src/features/messages/components/Markdown.tsx`
- Affected backend / engine:
  - `src-tauri/src/engine/claude.rs` only if runtime-side coalescing / flush evidence needs adjustment after frontend diagnostics confirm it.
- Affected specs:
  - new `claude-code-realtime-stream-visibility`
  - modified `conversation-stream-latency-diagnostics`
  - modified `conversation-provider-stream-mitigation`
  - modified `conversation-render-surface-stability`
- Affected validation:
  - targeted Vitest for diagnostics and mitigation activation
  - targeted tests for live assistant text progressive visibility
  - Windows native Claude Code manual matrix
