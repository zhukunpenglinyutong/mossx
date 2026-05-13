## Context

conversation surface 当前承担 provider adapter、history loader、normalization、reducer merge、tool grouping、Markdown presentation、request_user_input、approval、modeBlocked 与 live rendering 等多层责任。多次局部修复已经证明：继续在 `Messages.tsx`、`MessagesRows.tsx` 或 provider-specific loader 里追加过滤条件，会让 transcript 可信度继续下降。

本设计把 conversation pipeline 分为四层：

```text
raw provider payload
  -> adapter / loader observation
  -> normalized conversation fact
  -> assembled conversation item
  -> presentation row
```

关键约束：进入 durable transcript 或 visible row 前，必须先有 fact classification。

## Goals

- 建立可测试的 fact classification contract。
- 让 realtime、completed settlement、history hydrate 使用同一套 semantic equivalence。
- 把 user / assistant / reasoning 的 text normalization 从 scattered helper 收敛到共享 contract。
- 把 control-plane filtering 从 renderer 分支前移到 normalization / assembly layer。
- 让 request_user_input 有完整 lifecycle，不再以 stale card 阻塞当前 turn。
- 让 render layer 消费 normalized facts，减少 provider-specific 判断。

## Non-Goals

- 不改 runtime session lifecycle。
- 不改 Claude / Codex 权限模型。
- 不改 storage schema。
- 不重写 Markdown renderer。
- 不一次性删除 legacy payload fallback。
- 不承诺本 change 内完成所有相关大文件拆分。

## Architecture

### 1. Fact Classification Boundary

建议新增或扩展共享分类入口，输入 adapter / loader observation，输出 normalized fact：

```text
classifyConversationObservation(observation, context) -> ConversationFact
```

fact 必须携带：

- `factKind`: `dialogue` / `reasoning` / `tool` / `control-event` / `hidden-control-plane` / `presentation-state`
- `engine`
- `threadId`
- `turnId?`
- `source`: realtime / completed / history / reconcile / local
- `semanticKey?`
- `visibility`: visible / hidden / compact / presentation-only
- `confidence`: exact / normalized / legacy-safe

未知 payload 不得直接丢弃；应进入 legacy-safe visible 或 diagnostic path。

### 2. Text Normalization

Text normalization 应保持 pure function，便于 fixture tests：

```text
normalizeUserVisibleText(rawText, context) -> NormalizedText
normalizeAssistantVisibleText(rawText, context) -> NormalizedText
normalizeReasoningText(rawText, context) -> NormalizedText
```

user normalization 负责剥离：

- project memory injected wrapper
- selected-agent prompt block
- shared-session sync wrapper
- note-card injected context
- mode fallback / internal instruction wrapper

assistant normalization 负责剥离：

- synthetic approval resume marker
- No response requested
- permission-mode / file-history bookkeeping
- duplicated completed replay fragment

reasoning normalization 负责：

- 合并等价 summary / thinking / reasoning carrier
- 区分真实不同 reasoning step
- 保留 engine profile 所需 metadata，但不让 display title 改变 duplicate 判断

### 3. Semantic Equivalence

等价判断不得只靠 raw text：

```text
isEquivalentFact(left, right, context) -> boolean
```

建议优先级：

1. stable provider id / local optimistic id mapping。
2. turn id + fact kind + normalized semantic key。
3. normalized text + source confidence + temporal adjacency。
4. legacy fallback：保留两条，不做危险合并。

不同 turn 的相似内容不得因文本相近被合并。

### 4. Control-Plane Filtering

control-plane 分三类：

- hidden：synthetic approval resume、queue bookkeeping、permission-mode wrapper、No response requested。
- compact visible：modeBlocked、resume failed、interrupted、model switched、runtime recovered。
- structured visible：file changes、approval request、request_user_input、ExitPlanMode。

Renderer 不应再通过字符串规则判断 raw marker 是否隐藏；它只消费 `visibility` 和 `factKind`。

### 5. request_user_input Lifecycle

request_user_input 必须成为 structured fact，并有明确状态：

```text
pending -> submitted
pending -> timeout
pending -> dismissed
pending -> cancelled
pending -> stale
```

约束：

- `submitted` / `timeout` / `dismissed` / `cancelled` / `stale` 都是 settled state。
- settled request 不得继续阻塞 Composer 或当前 turn。
- stale request 可关闭，关闭动作不得删除 transcript 中已发生的事实。
- request card 与 Composer pointer 可以同时存在，但表单主交互归 message surface。

### 6. Render Boundary

目标边界：

- `ConversationAssembler`：负责 hydrate、merge、semantic dedupe、fact ordering。
- `conversationNormalization` / `threadItemsAssistantText`：负责 pure normalization 与 comparator。
- `useThreadsReducer`：消费 assembled facts，不重新解释 raw provider payload。
- `Messages.tsx`：负责 layout、scroll、sticky、live controls、slots。
- `MessagesRows.tsx`：按 normalized item type 渲染。
- `groupToolItems` / tool blocks：负责 tool presentation，不负责 fact classification。

## Decisions

### Decision 1: 新增 capability，而不是直接修改 curtain normalization 主 spec

现有 `conversation-curtain-normalization-core` 和 `conversation-curtain-assembly-core` 已经覆盖部分 dedupe / assembler 规则，但本 change 的范围更高一层：定义 fact 分类与 transcript 事实边界。因此新增 `conversation-fact-contract`，避免把 classification、lifecycle 与 renderer boundary 全塞进既有 normalization spec。

### Decision 2: parity 单独成 capability

Realtime/history parity 是最容易回归的用户感知问题，单独建立 `conversation-realtime-history-parity` 能让后续实现以 tests 为门禁，而不是靠散落的 bugfix。

### Decision 3: 保留 legacy-safe fallback

本 change 不允许 silent data loss。未知 payload 初期宁可保留为 legacy-safe visible item 或 diagnostic control row，也不做激进隐藏。

## Rollout Plan

1. 盘点现有 visible item 类型和 provider payload 来源，产出污染样本清单。
2. 先实现 pure normalization core 与 fixture tests。
3. 接入 control-plane classification，优先覆盖 Claude/Codex synthetic marker、modeBlocked、request_user_input。
4. 扩展 realtime/history parity tests。
5. 收窄 Messages render boundary，让 render layer 消费 normalized facts。
6. 再扩展 Gemini / OpenCode 或 legacy payload coverage。

## Validation

- Focused tests 覆盖 normalization、assistant dedupe、request_user_input lifecycle、control-plane filtering。
- Parity tests 覆盖 realtime、completed、history hydrate、history reopen。
- Render tests 覆盖 stale card close、history loading、turn boundaries、tool payload type guard。
- 不在本 proposal 阶段运行代码重测试；实现阶段再执行相关 Vitest / typecheck。
