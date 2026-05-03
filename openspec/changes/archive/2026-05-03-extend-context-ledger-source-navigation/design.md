## Context

现有 `Context Ledger` 已有两类能力：

- 当前态治理：keep / exclude
- 最近变化解释：comparison summary

但“看到来源 -> 回到来源”的链路还没接上。

## Decisions

### 1. 来源导航只做三类高确定性 block

本次只支持：

- `manual_memory`
- `note_card`
- `file_reference`

原因：

- 这三类已有稳定的 UI surface 与 sourceRef
- `helper_selection` 的 `sourcePath` 可能落在 workspace 外、全局目录或缓存目录，本轮不适合硬接

### 2. `ContextLedgerPanel` 只负责发出 source navigation intent

- panel 不直接操作 AppShell
- panel 只把 block 映射成 source navigation target
- `Composer` 负责把 target 路由到 memory/note/file 三类 handler

原因：

- 保持 panel 纯粹
- 避免 feature panel 直接依赖 layout / app shell

### 3. AppShell 负责 panel open + focus state

- memory / notes 需要“打开右侧面板 + 选中具体记录”
- 这类状态应留在 AppShell，而不是压进 Context Ledger feature

### 4. focus 使用 `id + requestKey`，保证重复点击同一来源仍会触发

- 仅传 `id` 无法保证再次点击同一项时重放定位逻辑
- 增加 requestKey 作为一次性 focus signal

## Validation

- panel test：来源动作文案与 target callback
- composer test：manual memory / note / file 三类 target 路由正确
- memory panel test：focus signal 会重置筛选并请求选中对应项
- notes panel test：focus signal 会展开编辑区并定位 note
