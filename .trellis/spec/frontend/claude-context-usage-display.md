# Claude Context Usage Display Contract

本规范固化 Claude 上下文窗体显示链路，适用于 `src/features/composer/components/Composer.tsx`、`ChatInputBox/**`、`src/features/threads/utils/threadNormalize.ts`、`src/features/threads/hooks/threadReducerCoreHelpers.ts`、`src/types.ts`。

## Scenario: Thread Token Usage To Claude View Model

### 1. Scope / Trigger

- Trigger：修改 `ThreadTokenUsage`、token usage realtime normalization、Composer context projection、或 Claude token indicator。
- 目标：Claude 的“当前背景信息窗口”与“本轮新消耗”分开展示，避免 cumulative usage、cached tokens、window usage 混为一谈。

### 2. Signatures

- Runtime state type MUST include:

```ts
type ThreadTokenUsage = {
  total: TokenUsageBreakdown;
  last: TokenUsageBreakdown;
  modelContextWindow: number | null;
  contextUsageSource?: string | null;
  contextUsageFreshness?: "live" | "restored" | "estimated" | "pending" | string | null;
  contextUsedTokens?: number | null;
  contextUsedPercent?: number | null;
  contextRemainingPercent?: number | null;
  contextCategoryUsages?: Array<{ name: string; tokens: number; percent?: number | null }> | null;
  contextToolUsages?: Array<{ name: string; server?: string | null; tokens: number }> | null;
  contextToolUsagesTruncated?: boolean | null;
};
```

- Claude view model:

```ts
type ClaudeContextUsageViewModel = {
  usedTokens: number | null;
  contextWindow: number | null;
  totalTokens: number | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  usedPercent: number | null;
  remainingPercent: number | null;
  freshness: string;
  source: string | null;
  hasUsage: boolean;
  categoryUsages?: Array<{ name: string; tokens: number; percent?: number | null }> | null;
  toolUsages?: Array<{ name: string; server?: string | null; tokens: number }> | null;
  toolUsagesTruncated?: boolean | null;
};
```

### 3. Contracts

- `ThreadTokenUsage` MUST be normalized at the boundary before entering reducer state.
- Optional numeric fields MUST accept finite numbers or numeric strings and normalize invalid values to `null`.
- `contextUsedTokens` is preferred for current window usage.
- If `contextUsedTokens` is absent, Claude window usage MAY be estimated from `last.inputTokens + last.cachedInputTokens` only when either value exists.
- `totalTokens` represents new turn/cumulative message usage for display; `cachedInputTokens` MUST be shown as excluded from new-turn usage when relevant.
- `usagePercentage` for Claude MUST be `null` when no trustworthy usage exists; it MUST NOT default to `0`.
- Equality checks for token usage MUST compare source/freshness/window/category fields so UI updates when `/context` category details arrive.

### 4. Validation & Error Matrix

| 场景 | 必须行为 | 禁止行为 |
|---|---|---|
| missing telemetry | label displays `...` / pending | render `0%` |
| `contextUsedTokens` present | use it as current window usage | recompute from total message usage |
| only message usage present | mark estimated | present as live CLI context |
| category details arrive after completion | update tooltip categories | ignore because total tokens unchanged |
| invalid numeric string | normalize to `null` | let `NaN` enter render |

### 5. Good / Base / Bad Cases

- Good：Composer builds `claudeContextUsage` only for `selectedEngine === "claude"` and passes it to `ChatInputBoxAdapter`.
- Base：non-Claude engines continue using legacy token indicator or Codex dual-view.
- Bad：`ChatInputBoxAdapter` comparator ignores `claudeContextUsage`, causing stale tooltip details.

### 6. Tests Required

- `threadNormalize`: context fields snake_case and camelCase normalize to canonical frontend fields.
- app-server event hook: Claude usage without window does not default to `200000`.
- reducer helper: token usage equality changes when category/source/freshness changes.
- Composer/ContextBar: missing telemetry shows pending, not `0%`.
- Composer/ContextBar: estimated window usage is labeled as estimated.

### 7. Wrong vs Correct

#### Wrong

```tsx
const usagePercentage = contextUsage
  ? Math.round((contextUsage.total.totalTokens / (contextUsage.modelContextWindow ?? 200000)) * 100)
  : 0;
```

#### Correct

```tsx
const usedTokens = contextUsage.contextUsedTokens ?? null;
const contextWindow = contextUsage.modelContextWindow ?? null;
const usedPercent = contextUsage.contextUsedPercent
  ?? (usedTokens !== null && contextWindow !== null
    ? (usedTokens / contextWindow) * 100
    : null);
```

## Scenario: Claude Context Tooltip Layout

### 1. Scope / Trigger

- Trigger：修改 `TokenIndicator`、`ContextBar`、Claude context i18n、或 `ChatInputBox` selector styles。
- 目标：让 Claude tooltip 接近 Codex 的信息密度，但不暴露 Codex-only auto-compaction 控件，也不把 MCP tool 明细塞进紧凑窗体。

### 2. Signatures

- `TokenIndicatorProps.percentage` MUST be `number | null`.
- `TokenIndicatorProps.claudeContextUsage` enables Claude-specific tooltip branch.
- Key CSS selectors:
  - `.token-tooltip--claude`
  - `.claude-context-tooltip`
  - `.claude-context-category-grid`
  - `.claude-context-category-row`
  - `.claude-context-category-item`

### 3. Contracts

- Tooltip MUST show:
  - title: Claude background info window
  - new turn usage
  - input/output breakdown
  - cached note when cached tokens exist
  - used/remaining percentage when available
  - window used tokens/capacity or pending/estimated label
  - category details when parsed from `/context`
  - source/freshness status
- Tooltip MUST NOT show Codex auto-compaction threshold controls for Claude.
- Compact Claude tooltip MUST NOT show MCP tool rows; MCP parsing may remain in state for future diagnostics.
- Category details SHOULD render in two explicit rows on desktop/tablet widths; narrow viewports MAY fall back to one-column rows to prevent horizontal overflow.
- Tooltip width MUST be viewport bounded and content-aware; do not force category pills into three rows on normal desktop widths.
- Text formatting MUST preserve decimal category percentages such as `0.8%`.

### 4. Validation & Error Matrix

| 场景 | 必须行为 | 禁止行为 |
|---|---|---|
| category count 6-8 on desktop | split into 2 visual rows | auto-wrap into 3 rows |
| viewport under compact breakpoint | avoid horizontal overflow | keep desktop width and clip |
| `toolUsages` present | do not render MCP rows | show noisy zero-token MCP list |
| `freshness=estimated` | show estimated/pending status | imply live Claude telemetry |
| `percentage=null` | show `...` and pending ring | compute stroke from `NaN` |

### 5. Good / Base / Bad Cases

- Good：React splits `categoryUsages` with `Math.ceil(length / 2)` and renders two `.claude-context-category-row` containers.
- Base：when no category details exist, tooltip still shows core usage fields.
- Bad：joining category strings with ` · ` makes long lines unreadable and viewport-dependent.

### 6. Tests Required

- `ContextBar.test.tsx`: Claude tooltip renders total/window/freshness/category fields.
- `ContextBar.test.tsx`: MCP title/tool row is absent even when `toolUsages` is provided.
- CSS contract check or DOM assertion: `.claude-context-category-grid` exists.
- `Composer.context-dual-view.test.tsx`: Claude-specific props do not regress Codex dual-view behavior.

### 7. Wrong vs Correct

#### Wrong

```tsx
<span>{categoryUsages.map((usage) => `${usage.name}: ${usage.tokens}`).join(" · ")}</span>
```

#### Correct

```tsx
const splitIndex = Math.ceil(categoryUsages.length / 2);
const rows = [
  categoryUsages.slice(0, splitIndex),
  categoryUsages.slice(splitIndex),
].filter((row) => row.length > 0);

<div className="claude-context-category-grid">
  {rows.map((row) => (
    <div className="claude-context-category-row">
      {row.map((usage) => (
        <span className="claude-context-category-item">{usage.name}</span>
      ))}
    </div>
  ))}
</div>
```
