# State Management（状态管理规范）

## 当前模型（Project Model）

本项目采用 mixed strategy：

- `useState/useReducer` 管 local UI state
- feature hooks 管 orchestration state
- `clientStorage` 管 persistent UI preference 与 restart-required identity continuity state
- `tauri service` 管 runtime/backend state 获取与提交

项目没有强制单一 global state framework（例如全局 Redux/Zustand）。

## Scenario: UI state / persistent state / runtime state 划分

### 1. Scope / Trigger

- Trigger：新增 state、把 state 提升为 shared、写入 `clientStorage`、或把 runtime payload 接进 UI。
- 目标：保证 single source of truth，避免同一状态在 component、hook、storage、backend 多处漂移。

### 2. Signatures

- local state：`useState/useReducer`
- persistent state：`getClientStoreSync(...)` / `writeClientStoreValue(...)` / `writeClientStoreData(...)`
- runtime state：通过 `src/services/tauri.ts` 获取，再经过 mapping/sanitize 进入 hook 或 component

### 3. Contracts

- persistent key 必须 domain-specific，例如 `gitHistory.panelWidth` 这一类语义 key；禁止 `width`, `state`, `data` 这类泛 key。
- 从 client store 读取的值必须先做 type check + sanitize（`clamp`, `fallback`, `default`）再用于 layout 或交互。
- 只要某份前端状态需要跨重启保持 identity continuity（例如 stale -> canonical thread alias），就 MUST 持久化；纯内存 `ref` 只能做 cache，不能做唯一事实源。
- runtime state 不是 UI state 的永久 source-of-truth；不要把 backend 原始结构直接缓存成 UI state。

### 4. Validation & Error Matrix

| 类型 | 推荐存放位置 | 校验要求 | 常见错误 |
|---|---|---|---|
| transient UI | component/hook local state | 无需持久化 | 误写入 client store |
| user preference | `clientStorage` | 读取后 sanitize | key 过泛、缺默认值 |
| backend/runtime | service + hook state | mapping 后进入 UI | raw payload 直接进 render |
| derived state | `useMemo`/pure helper | 从 source-of-truth 计算 | 重复存一份副本 |

### 5. Good / Base / Bad Cases

- Good：布局宽度保存在 `clientStorage`，读取后 `clamp(240, 720)`。
- Base：一次性 modal 开关状态保留在 local state。
- Bad：同一个 selected item 同时在 component、hook、store 各维护一份。

### 6. Tests Required

- persistent state：默认值、损坏值、越界值、旧值迁移。
- identity continuity state：链式映射压平、损坏值过滤、重启后 canonical 解析。
- runtime state：missing field / optional field / fallback path。
- shared state：多入口更新后 contract 是否一致。

### 7. Wrong vs Correct

#### Wrong

```ts
const width = getClientStoreSync<number>("layout", "width") ?? 9999;
setPanelWidth(width);
```

#### Correct

```ts
const storedWidth = getClientStoreSync<number>("layout", "gitHistory.panelWidth");
const safeWidth =
  typeof storedWidth === "number" ? Math.min(720, Math.max(240, storedWidth)) : 320;
setPanelWidth(safeWidth);
```

## Scenario: Composer Input Responsiveness Under Streaming Load

### 1. Scope / Trigger

- Trigger：修改 `Composer`、`ChatInputBoxAdapter`、`useLayoutNodes`、stream activity / status panel / context usage 等会影响输入区域 render cadence 的状态路径。
- 目标：在 conversation streaming 期间保持 composer 输入可操作，避免 live curtain 高频状态把输入子树一起拖慢。

### 2. Signatures

- `Composer` MAY 使用 `useDeferredValue(...)` 隔离来自 `items`、`threadStatusById`、`ThreadTokenUsage`、`RateLimitSnapshot` 的高频 live state。
- `ChatInputBoxAdapter` SHOULD 使用带 comparator 的 `memo(...)`，对 structurally-equal 的 stream-facing props 进行 no-op。
- typing activity guard MAY 通过短暂 idle window（例如数百毫秒）把 `streamActivityPhase`、context usage、status data 降级为 deferred props。

### 3. Contracts

- 输入中的 source-of-truth MUST 保持在 input local state / ref / composition state；来自幕布的 live status 只能作为 advisory props，不得反向驱动输入内容本身。
- 当用户正在输入或 IME composing 时，composer 子树 MUST NOT 直接消费最热的 live conversation objects；应优先消费 deferred 或 structurally-stable props。
- structurally equal 的 context/rate-limit/status payload MUST NOT 仅因对象引用变化就触发 `ChatInputBox` 子树 rerender。
- 对 live state 的 deferred / throttle 只允许牺牲附属状态的新鲜度，不得改变最终 send payload、draft text、selection、IME state 或 attachment state。
- streaming turn 完成后，输入区域看到的 deferred status MUST 自然收敛回 canonical latest state；不得永久停留在旧值。

### 4. Validation & Error Matrix

| 场景 | 必须行为 | 禁止行为 |
|---|---|---|
| Codex streaming + active typing | 输入框继续可打字，IME 组合输入不被幕布尾段卡死 | 输入框必须等幕布大段 render 完成后才恢复响应 |
| context/rate-limit 对象重建但值不变 | `ChatInputBoxAdapter` comparator 视为 no-op | 因对象引用变化反复重刷输入子树 |
| deferred live status | 允许 status/usage 略有滞后 | draft text、selection、attachments 被延后或回退 |
| turn completion | deferred props 收敛到最终 canonical state | 结束后仍显示过期 status / usage |

### 5. Good / Base / Bad Cases

- Good：`useLayoutNodes` / `Composer` 对高频 stream objects 先 defer，再把稳定 props 传给 `ChatInputBoxAdapter`；输入 local state 继续保持即时。
- Base：只对 `streamActivityPhase`、`contextUsage`、`rateLimits` 做 typing-aware defer，其它 send-critical props 仍保持即时。
- Bad：把整个 `Composer` 或 input value 都放进 deferred path，导致输入内容本身延迟。
- Bad：没有 custom comparator，streaming 时每个 status object rebuild 都把 `ChatInputBox` 整棵子树带着 rerender。

### 6. Tests Required

- adapter：覆盖 structurally-equal `contextUsage` / `dualContextUsage` / `accountRateLimits` 不触发 rerender。
- composer：覆盖 typing-active 窗口下，stream-facing props 可 defer，但 `text` / send 行为不变。
- interaction：至少有一条围绕 Codex streaming + user typing 的回归测试或手测矩阵。

### 7. Wrong vs Correct

#### Wrong

```tsx
<Composer
  items={activeItems}
  threadStatusById={threadStatusById}
  contextUsage={activeTokenUsage}
  accountRateLimits={activeRateLimits}
/>
```

#### Correct

```tsx
const deferredComposerItems = useDeferredValue(activeItems);
const deferredTokenUsage = useDeferredValue(activeTokenUsage);
const deferredComposerRateLimits = useDeferredValue(activeRateLimits);

<Composer
  items={deferredComposerItems}
  contextUsage={deferredTokenUsage}
  accountRateLimits={deferredComposerRateLimits}
/>
```

## State 分类

- UI state：面板开关、选中项、临时输入
- Persistent state：布局尺寸、显示偏好等（client store）
- Runtime state：来自 Tauri command/event 的状态
- Derived state：从已有 state 计算，不持久化

## 提升为共享状态的条件

仅在以下情况提升：

- 多 feature 共享且会长期复用
- 页面重载后必须保留
- 多窗口/多会话需要一致

否则保持 local state。

## 持久化规则（Persistence Rules）

- 统一使用 `getClientStoreSync/writeClientStoreValue`。
- key 命名必须 domain-specific，禁止泛 key。
- 读取后必须 sanitize（clamp、fallback）再使用。

## Runtime Contract 规则

- runtime payload 先 mapping 再进入 UI state。
- request/response 命名转换集中在 service 层（避免 hook 重复转换）。
- 重试逻辑必须 idempotent（避免重复副作用）。

## 常见错误

- 同一份状态在 component 与 hook 各维护一份 source-of-truth。
- 不该持久化的 transient state 被写入 client store。
- 未校验的存量数据直接驱动布局或逻辑。
