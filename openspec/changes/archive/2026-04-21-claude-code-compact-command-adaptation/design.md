## Context

当前代码里，`Claude Code` 已经具备两块 compaction 基础能力：

1. runtime 在命中 `Prompt is too long` 时，会自动发送一次 `/compact` 并 retry 原请求一次；
2. Claude compact 生命周期信号已经能映射为既有 `thread/compacting` / `thread/compacted` 事件流。

但产品层仍有一个明显断层：

- `useQueuedSend` 的 slash command 解析并不认识 `/compact`；
- 用户手动输入 `/compact` 时，只会走普通文本发送路径；
- 这条路径没有“这是一个正式产品动作”的确定性语义，也没有针对 Claude 的预处理、边界守卫或文案收口。

结果是：引擎内部能力已经存在，但用户感知仍然是“没有自动压缩”“/compact 没效果”。

这次设计要处理的是产品适配层，而不是再造一套新的 compaction runtime。约束也非常明确：`Codex` 现有自动/手动 compaction 逻辑保持原样，所有变更仅进入 Claude 路径。

## Implementation Surface

本次实现应只落在以下边界：

- slash command 解析与分发
  - `src/features/threads/hooks/useQueuedSend.ts`
  - `src/features/threads/hooks/useQueuedSend.test.tsx`
- Claude 命令发送入口
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/features/threads/hooks/useThreadMessaging.test.tsx`
- 文案与提示
  - `src/i18n/locales/en.part1.ts`
  - `src/i18n/locales/zh.part1.ts`
  - 如需 composer 级 toast copy，再检查 `src/features/composer/components/Composer.tsx`
- 回归验证
  - `src/features/app/hooks/useAppServerEvents.test.tsx`
  - `src/features/threads/hooks/useThreadTurnEvents.test.tsx`

## Goals / Non-Goals

**Goals:**

- 让 `/compact` 在 Claude 线程中成为正式、可预期的产品级命令。
- 复用现有 Claude compact lifecycle 事件，给手动 `/compact` 提供可见反馈。
- 明确区分 Claude 与 Codex 的自动 compaction 语义，避免用户误解。
- 保持改动集中在 composer / thread messaging / i18n 层，不改 Codex runtime contract。

**Non-Goals:**

- 不改 `Codex` 的 threshold auto-compaction、manual compact RPC 或相关 UI。
- 不把 `/compact` 扩展成全引擎统一协议。
- 不新增 Tauri 侧通用 `thread_compact` for Claude 命令，除非现有 Claude 发送链路无法满足需求。
- 不引入新的重型 compaction UI。

## Decisions

### Decision 1: 将 `/compact` 定义为 Claude-only product command，而不是全局 slash command

**选择**

在 `useQueuedSend` 中新增 `compact` command token，但只在当前活跃引擎为 `claude` 时拦截并走专用路径；在其他引擎中保持现状，不改 `Codex` 语义。

**原因**

- 这能把产品适配范围严格限定在 Claude。
- `Codex` 已有独立的 manual compact 入口，重复接管 `/compact` 只会制造双入口漂移。

**备选方案**

- 全引擎统一拦截 `/compact`：看起来一致，但会强行改变 Codex 现有正确行为。
- 完全不拦截：无法解决当前 issue 的产品契约缺失。

### Decision 2: Claude 手动 `/compact` 复用既有 `sendMessageToThread` 链路，不新增独立 runtime command

**选择**

新增 `startCompact()`，内部复用 Claude 现有发送链路，把 `/compact` 作为一条受控命令发送到当前已有 Claude thread/session，并强制：

- `skipPromptExpansion`
- 不携带图片
- 不混入 prompt assembler / skill 选择器副作用

**原因**

- Claude runtime 已经能处理 `/compact` 和相关 lifecycle signal。
- 新增 Tauri command 会扩大 backend surface，但并不能实质提升 Claude 能力，只是重复包装。
- `/compact` 的业务语义是“压缩当前会话”，为它新建空线程不符合用户心智，也不能解决 issue #363。

**备选方案**

- 新增 `claude_thread_compact` command：更“官方”，但会让产品层和 runtime 层都多一条维护面。
- 继续把 `/compact` 当普通文本：无法提供确定性语义和前置边界处理。

### Decision 3: 手动 `/compact` 的成功反馈复用既有 lifecycle，失败反馈只在前置失败和终态失败时补足

**选择**

- 成功路径：依赖现有 `thread/compacting` / `thread/compacted` 事件和既有 `Context compacted.` 语义消息。
- 失败路径：
  - 无活跃 Claude thread / thread rebind 失败：立即给出本地错误提示；
  - Claude runtime 返回错误：沿用既有 thread error 收口，并补齐更明确的 Claude copy。

**原因**

- 这样不会再造第二套“compact 成功提示”。
- 事件和 UI 事实源保持唯一，避免 reducer 双写。

**备选方案**

- 手动插入专门的 “Manual compact started/succeeded” UI item：反馈更强，但会与既有 lifecycle 重叠。

### Decision 4: 把“Claude 不是 Codex 式自动压缩”写进用户可见文案，而不是靠 issue FAQ 解释

**选择**

在 Claude 相关 compaction 文案里明确：

- Claude 自动能力只在 prompt overflow 恢复链路触发；
- 平时用户可显式输入 `/compact`；
- Codex 的自动压缩阈值语义不外溢到 Claude copy。

**原因**

- 这是 issue 363 的根部之一：不是能力缺失，而是产品语义误导。
- 文案收口能长期降低同类反馈噪音。

### Decision 5: 非 Claude 输入 `/compact` 维持当前兼容行为，不额外弹“仅 Claude 支持”

**选择**

当活跃线程不是 Claude 时，本次实现不接管 `/compact`，保持它继续走现有非 Claude 路径。

**原因**

- 这能把行为变化严格收敛在 Claude。
- 如果现在对所有非 Claude 输入额外弹提示，会无意改动 Codex 与其他引擎的现有语义。

**备选方案**

- 非 Claude 一律弹提示：用户更明确，但会引入跨引擎新行为，不符合这次边界。

### Decision 6: 成功完成后只复用 `Context compacted.`，不新增专门 success card

**选择**

Claude 手动 `/compact` 成功后，继续使用现有 `thread/compacted -> Context compacted.` 语义链路，不再添加新的 success item / card / toast。

**原因**

- 现有生命周期反馈已经足够表达“压缩完成”。
- 避免消息流里出现同义重复提示，保持 reducer 事实源单一。

**备选方案**

- 新增单独 success toast/card：感知更强，但会和既有生命周期重复。

## Risks / Trade-offs

- [用户把 `/compact` 视为全引擎通用命令] -> Mitigation: 仅在 Claude 文案和 Claude command routing 中声明该能力，非 Claude 不改变既有行为。
- [前端 special-case 过多，slash command 解析继续膨胀] -> Mitigation: 复用现有 `startFast/startReview` 模式，只新增一个最小命令分支。
- [Claude lifecycle 信号未覆盖某些 CLI 变体，导致成功反馈不明显] -> Mitigation: 保持现有事件映射测试，并为手动 compact 增加回归样例。
- [当前线程与所选引擎不一致，`/compact` 被发往错误线程] -> Mitigation: `startCompact()` 必须先解析现有 Claude-compatible thread；若不存在则直接返回 actionable failure。

## Migration Plan

1. 在 `useQueuedSend` 中注册 `/compact` -> `startCompact` 的 Claude-only 解析分支。
2. 在 `useThreadMessaging` 中新增 `startCompact()`，复用 Claude 现有 thread/session send path，并要求“无现有 Claude thread 时失败，不自动创建新线程”。
3. 更新 Claude 相关 i18n copy，明确自动语义边界与失败提示。
4. 补测试：
   - slash command 解析
   - Claude-only routing
   - non-Claude no-op / no behavior change
   - lifecycle feedback continuity

回滚策略：

- 若命令适配出现问题，直接移除 `/compact` special handling，Claude 会退回当前普通文本路径；
- 不影响 Codex 和现有 backend compaction contract。

## Validation Plan

- 单测命令：
  - `npm run test -- src/features/threads/hooks/useQueuedSend.test.tsx`
  - `npm run test -- src/features/threads/hooks/useThreadMessaging.test.tsx`
  - `npm run test -- src/features/app/hooks/useAppServerEvents.test.tsx src/features/threads/hooks/useThreadTurnEvents.test.tsx`
- 质量门禁：
  - `npm run lint`
  - `npm run typecheck`
- 手工验收：
- Claude 线程输入 `/compact`，观察 `compacting -> compacted -> Context compacted.`
- Claude 无可用线程时输入 `/compact`，观察可恢复错误提示，且不会创建新线程
- Codex 线程保持现有 manual/auto compaction 行为不变
