## Context

当前 `Codex` 幕布在图片生成场景里已经具备两块分裂的能力：

- `MessagesRows` 对 `message.images` 已经支持图片栅格与 lightbox；
- `GenericToolBlock` 对某些图片路径型 tool output 也能做局部预览。

但这两条能力线没有统一到同一个 turn contract。实际 runtime 更像是“工具执行完后吐出一段文本和本地路径”，而不是“当前 user question 产出了一张图片结果”。因此 UI 会出现三个问题：

1. 生成期间没有稳定的 `制作中` 占位，只能看到普通文本流；
2. 生成完成后容易退化成路径文本或 tool 详情，而不是问题下方的图片结果；
3. 历史恢复时缺少可重建的 artifact identity，导致回放只剩说明文字或非邻接预览。

这次改动跨越 `threads normalization -> conversation item contract -> message canvas rendering -> history replay` 多个层级，属于典型 cross-cutting change，需要先明确建模决策。

## Goals / Non-Goals

**Goals:**

- 让 `Codex` 图片生成结果成为当前 user turn 的 first-class artifact，而不是附着在零散 tool output 上的偶发预览。
- 为该 artifact 定义稳定的生命周期：`制作中 -> 已完成 -> 预览失败降级`。
- 保证 realtime 与 history replay 使用同一套 artifact 语义，避免“实时能看到、历史只剩路径”。
- 尽量复用现有 `LocalImage` 与 `read_local_image_data_url`，不新增媒体系统。

**Non-Goals:**

- 不统一其他引擎的图片生成 contract。
- 不引入新的后端图片存储协议或资产数据库。
- 不把所有 tool output 都抽象成新的 artifact 类型。
- 不实现编辑、重生成、批量结果管理等后续体验。

## Decisions

### Decision 1: 用 turn-linked generated-image artifact，而不是继续堆 tool block 特判

选择：在 conversation normalization 阶段新增一类面向幕布的 generated-image artifact 表达，并让它显式携带所属 `userMessageId / turnId` 或等价锚点信息；`MessagesTimeline` 渲染时把它视为当前 user turn 的 inline 结果卡。

不选方案：

- 继续把图片结果塞进普通 assistant 文本：无法表达状态迁移，也无法稳定和问题对位。
- 只在 `GenericToolBlock` 里给 `image_gen` 做特判：用户阅读主路径仍然会跳出问题流，历史回放也仍依赖 tool 文本拼接。

理由：

- 用户要看的不是“某个工具返回了一个路径”，而是“这条问题生成出了一张图”。
- turn-linked artifact 才能在 realtime、history、scroll 锚点、sticky 语义上保持一致。

### Decision 2: artifact identity 以触发问题锚点为主，tool/result 事实为辅

选择：generated-image artifact 的 canonical identity 由“触发它的 user turn + 该次生成事实”共同决定。建议最少包含：

- 所属 user message / turn anchor
- 生成阶段状态（pending / completed / degraded）
- 结果本地路径列表或等价输出引用
- 可选的 tool use identity，用于同一 turn 内多次生成时区分实例

不选方案：

- 只用本地文件路径做 identity：历史 replay、路径变更或多图结果时容易漂移。
- 只用 tool item id 做 identity：读取路径后仍无法稳定归属到 user turn。

理由：

- 主锚点必须是用户问题，否则图永远无法稳定“贴着问题走”。
- tool/result identity 只负责区分同一问题下的多个生成实例，不应该反客为主。

### Decision 3: 生命周期卡片在同一 artifact 内迁移，而不是创建多张独立卡

选择：当 runtime 判断图片生成开始时，为该 artifact 创建 `制作中` 状态；结果路径落地后，更新同一 artifact 为 `已完成` 并填入图片源；若预览加载失败，则更新为 `已完成但预览降级`。

不选方案：

- `制作中` 一张卡、`已完成` 再插一张新卡：会制造重复阅读节点，历史 replay 也更难去重。

理由：

- 对用户来说这是同一个结果对象的状态演进，不是两条不同消息。
- 单 artifact 迁移更适合测试、去重和历史恢复。

### Decision 4: 预览加载复用现有 LocalImage，失败时降级保留完成事实

选择：预览层继续复用 `LocalImage + read_local_image_data_url`。如果本地路径能读到 data URL，就显示实际图片；读不到时保留完成态、文件名/路径提示和可恢复信息，不允许整块结果消失。

不选方案：

- 失败就回退成普通文本回复：用户会误以为图片根本没生成。
- 直接新增后端 command 专门吐预览 payload：本轮复杂度不值当。

理由：

- 现有图片读取通路已经存在，复用成本最低。
- “预览失败”不等于“生成失败”，状态语义必须区分。

### Decision 5: 历史回放必须从结构化 artifact 事实恢复，不能依赖 assistant 文本再解析

选择：history replay 读取到的 generated-image artifact 应来自结构化 turn/item 事实或等价的持久化 metadata，而不是重新从 assistant 消息正文里猜路径、猜状态。

不选方案：

- 从 assistant 文本里正则找图片路径再重建：脆弱、不可测试、对文案格式高度敏感。

理由：

- 这次 change 的目标就是让 artifact 成为 first-class contract；如果回放还靠文本猜测，contract 仍然是假的。

## Risks / Trade-offs

- [Risk] 同一 user turn 内多次触发图片生成，artifact 归属可能重复或顺序错乱
  → Mitigation：identity 明确包含 turn anchor + generation instance 维度，并在 spec 中要求不得把后一次结果覆盖前一次实例。

- [Risk] 仅在前端临时建模而不补持久化事实，会出现 realtime 正常、history replay 失真
  → Mitigation：明确 history replay 必须消费同源结构化 artifact，而不是只消费 UI 层派生状态。

- [Risk] 预览读取失败被误判为生成失败，破坏用户信心
  → Mitigation：状态机把 `completed-but-preview-degraded` 与真实生成失败分开表达。

- [Risk] 把新 artifact 生硬插进 timeline，可能影响现有 user bubble/sticky/scroll 行为
  → Mitigation：以“挂靠在对应 user turn 尾部”的方式接入，避免改变消息主序；补充 message canvas regression tests。

## Migration Plan

1. 先在 `Codex` normalization 层增加 generated-image artifact 数据结构与状态迁移逻辑。
2. 在 `Messages` / `MessagesTimeline` 中接入 inline generated-image card 渲染，复用 `LocalImage`。
3. 为 history replay 增加同源 artifact 恢复路径，验证重开线程仍能对位。
4. 用 targeted tests 锁住 `制作中 -> 已完成 -> 降级` 与 history replay。

回滚策略：

- 如果 artifact 接线引发幕布回归，可先保留底层结构化事实，临时关闭 generated-image card 渲染入口，回退到旧展示方式。
- 不涉及数据库迁移或不可逆持久化格式变更，回滚成本主要在前端映射层。

## Open Questions

- 同一 user turn 下若一次请求返回多张图片，第一版是显示单卡多图网格，还是每张图一个子卡片更合适？
- `制作中` 阶段是否需要显示 prompt 摘要，还是只显示简洁状态即可？
- 是否需要把 generated-image artifact 同时暴露到右侧 activity panel，还是先只收敛主幕布？
