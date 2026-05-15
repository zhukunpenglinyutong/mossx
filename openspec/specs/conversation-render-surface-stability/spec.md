# conversation-render-surface-stability Specification

## Purpose

Defines the conversation-render-surface-stability behavior contract, covering Claude Live Conversation Rendering MUST Degrade Safely On Desktop Surfaces.

## Requirements
### Requirement: Claude Live Conversation Rendering MUST Degrade Safely On Desktop Surfaces

当 Claude 会话处于 live processing 且消息幕布进入高频 realtime 更新时，系统 MUST 启用 render-safe degradation，避免消息区出现闪白、整块空白或需要切换线程才能恢复的状态。

#### Scenario: transcript-heavy Claude history restore keeps a readable surface

- **WHEN** 当前会话引擎为 `claude`
- **AND** 当前幕布承载的是 history restore / reopen 后的非 realtime conversation
- **AND** 该会话以 `reasoning` / `tool` transcript 为主而普通 assistant 正文极少
- **THEN** render surface MUST 保留至少一个可读 transcript surface
- **AND** 系统 MUST NOT 将该会话直接渲染为空白或 empty-thread placeholder

### Requirement: Claude Render Safety MUST Preserve Progressive Assistant Text Visibility

Claude render-safe behavior MUST protect live assistant text visibility in addition to preventing blank or flashing conversation surfaces.

#### Scenario: render-safe mode keeps live assistant text progressing
- **WHEN** current conversation engine is `claude`
- **AND** the conversation is processing
- **AND** assistant text deltas continue to arrive
- **THEN** render-safe mode MUST keep the live assistant message visibly progressing
- **AND** the message surface MUST NOT degrade to a spinner-only or first-few-characters-only state until completion

#### Scenario: render-safe degradation does not suppress meaningful live text
- **WHEN** Claude render-safe mode disables high-risk visual effects, animations, or render optimizations
- **THEN** those degradations MUST prioritize preserving readable live assistant text
- **AND** the system MUST NOT solve blanking by hiding or deferring all intermediate assistant content until the terminal event

#### Scenario: a shorter degraded stub does not overwrite the last readable live assistant surface
- **WHEN** `Claude` render-safe mode is active during processing
- **AND** the current turn had already rendered a more readable assistant body
- **AND** the current live surface regresses to a shorter prefix-only stub under visible stall evidence
- **THEN** render-safe recovery MUST keep the last more-readable same-turn surface available
- **AND** the shorter stub MUST NOT overwrite the preserved readable surface as the only visible body

### Requirement: Render Safety MUST Follow Normalized Conversation Processing State

渲染安全策略 MUST 以归一化 `conversationState` 为准，不得依赖可能滞后的 legacy props，避免 render-safe mode 漏触发。

#### Scenario: normalized state overrides stale legacy thinking flag

- **WHEN** `conversationState.meta.isThinking` 为 `true`
- **AND** legacy `isThinking` prop 仍为 `false` 或尚未同步
- **THEN** 消息幕布 MUST 仍按 processing conversation 处理
- **AND** render-safe mode MUST 依据 normalized state 正常启用

#### Scenario: normalized state shutdown exits render-safe mode

- **WHEN** `conversationState.meta.isThinking` 变为 `false`
- **THEN** 消息幕布 MUST 退出 realtime-specific render-safe mode
- **AND** 历史浏览与普通 completed conversation 渲染 MUST 恢复到非 processing 行为

### Requirement: Render Safety MUST Remain Claude-Scoped Unless Another Engine Opts In

本能力 MUST 以 Claude live conversation 为主治理对象，不得误伤 Codex、Gemini、OpenCode 的现有视觉与交互契约。

#### Scenario: codex path does not inherit claude-only degradation

- **WHEN** 当前会话引擎为 `codex`
- **AND** 未显式声明复用 Claude render-safe contract
- **THEN** 系统 MUST NOT 自动套用 Claude 专属 render-safe mode
- **AND** Codex 既有 stream、timeline 与 working indicator 行为 MUST 保持不变

#### Scenario: desktop platform handling is not hard-coded to windows only

- **WHEN** 当前会话引擎为 `claude`
- **AND** 应用运行在任一 desktop WebView surface，例如 Windows 或 macOS
- **THEN** render-safe strategy MUST 通过统一的 desktop surface contract 判定是否启用
- **AND** 系统 MUST NOT 将安全降级能力写死为 Windows-only 样式分支

### Requirement: Live Conversation Rendering MUST Derive From A Bounded Tail Working Set

When history is collapsed for an active live conversation, message rendering MUST perform expensive presentation derivation on a bounded tail working set instead of the complete thread history.

#### Scenario: live collapsed history uses bounded working set
- **WHEN** a live conversation is processing
- **AND** `showAllHistoryItems` is disabled
- **AND** the conversation contains more items than the visible history window
- **THEN** filtering, reasoning dedupe/collapse, and timeline collapse MUST operate on a bounded tail working set
- **AND** the final rendered result MUST preserve the same visible latest conversation content

#### Scenario: collapsed history count includes omitted working-set prefix
- **WHEN** items before the live working set are omitted from presentation derivation
- **THEN** the collapsed history count MUST include those omitted items
- **AND** users MUST still see an accurate affordance that earlier history is hidden

#### Scenario: sticky live user message remains available
- **WHEN** the latest ordinary user message is outside the tail working set
- **THEN** the renderer MUST retain that user message as the sticky live question candidate
- **AND** the message MUST NOT be lost solely because working-set trimming was applied

#### Scenario: show all history keeps full derivation
- **WHEN** the user enables full history display
- **THEN** the renderer MUST keep using the full conversation item list for presentation derivation
- **AND** working-set trimming MUST NOT hide or reorder history

### Requirement: Three-Engine Live Rendering MUST Preserve Progressive Visible Text
Live rendering for Codex, Claude Code, and Gemini MUST preserve progressive visible assistant text while allowing bounded throttling and safe degradation.

#### Scenario: conversation turn boundaries use locale-driven labels
- **WHEN** the curtain renders reasoning or final-message turn boundaries
- **THEN** user-visible labels MUST come from i18n resources
- **AND** the labels MUST update when the active locale changes
- **AND** the renderer MUST NOT hardcode Chinese copy as the primary production UI source

#### Scenario: generated image cards use locale-driven visible copy

- **WHEN** the curtain renders generated image title, status, hint, or preview action labels
- **THEN** those user-visible labels MUST come from i18n resources
- **AND** the renderer MUST NOT keep component-local hardcoded Chinese fallback copy for those surfaces

#### Scenario: agent badge accessibility label follows locale

- **WHEN** the curtain renders a user message agent badge toggle
- **THEN** its accessible label MUST come from i18n resources
- **AND** the label MUST include the selected agent name through interpolation when available

#### Scenario: visible text growth is tracked by live assistant item
- **WHEN** any supported engine receives assistant text deltas for a live item
- **THEN** visible text diagnostics MUST be keyed by thread and item id
- **AND** the client MUST use actual rendered value growth or equivalent visible surface evidence instead of parent array render count as proof that the user saw new text

#### Scenario: completed streaming output converges locally to final Markdown
- **WHEN** a streaming assistant message completes after using throttled Markdown, staged Markdown, or plain-text live fallback
- **THEN** the local realtime render path MUST converge to final Markdown semantics
- **AND** the client MUST NOT depend on history replay or thread switching to restore headings, lists, code blocks, links, or emphasis

### Requirement: Live Render Work MUST Stay Scoped To The Active Tail When Possible
Live message rendering MUST avoid global presentation recomputation when only the active streaming tail changes.

#### Scenario: unchanged history is not reprocessed for each streaming chunk
- **WHEN** a live conversation receives high-frequency assistant, reasoning, or tool deltas
- **AND** collapsed history or live tail working-set rules allow bounded presentation
- **THEN** expensive filtering, reasoning collapse, timeline collapse, Markdown parse, and scroll work MUST remain scoped to changed live rows where possible
- **AND** unchanged history rows MUST keep stable render inputs

#### Scenario: stable timeline snapshot coexists with live row override
- **WHEN** the active streaming assistant item continues to grow or flips from non-final to final
- **AND** the renderer maintains a deferred presentation snapshot for timeline-heavy derivations
- **THEN** the live assistant row MUST still receive the latest visible text and final-state semantics immediately
- **AND** anchors, grouped timeline entries, sticky header candidates, and final-boundary derivations MAY converge on the deferred snapshot instead of recomputing on every delta
- **AND** the renderer MUST naturally converge back to the canonical latest presentation state after streaming settles

### Requirement: Conversation Curtain MUST Render Deferred Claude Images Safely

The conversation curtain MUST render deferred Claude history images as explicit user-action placeholders and MUST NOT eagerly allocate large image bytes.

#### Scenario: deferred image placeholder is visible and stable
- **WHEN** restored Claude history contains a deferred image descriptor
- **THEN** the conversation curtain MUST render a stable placeholder that communicates the image is available on demand
- **AND** rendering the placeholder MUST NOT require the base64 payload to be present in frontend state

#### Scenario: loading one deferred image does not blank the curtain
- **WHEN** the user loads a deferred Claude image
- **THEN** the curtain MUST preserve the existing transcript rows during the load
- **AND** success or failure MUST update only the targeted image placeholder surface
- **AND** the conversation MUST NOT flash blank or fall back to an empty-thread state

#### Scenario: deferred image behavior stays Claude-scoped
- **WHEN** the deferred media descriptor comes from Claude history restore
- **THEN** the curtain MAY use Claude-specific load actions and diagnostics
- **AND** Codex, Gemini, and OpenCode image/render contracts MUST remain unchanged unless they explicitly opt into the same deferred media contract

