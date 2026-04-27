## Why

当前客户端在 `Codex` 图片生成场景下，尚未把生成结果建模为当前 user turn 的 first-class conversation artifact。实际表现是：用户发出“帮我生成一张图”之后，幕布里只会继续出现普通文本或本地文件路径，缺少与该问题直接对位的图片结果块，也没有稳定的 `制作中 / 已完成` 生命周期反馈；当用户重开历史线程时，这种结果更容易退化成“只有文本说明，没有图片实体”，与用户心智里的“问题对应一张图”明显分裂。

这个缺口已经影响 `Codex` 幕布的可信度。当前 `Messages` 层本身已经支持 `message.images` 的图片栅格与 lightbox，但图片生成产物没有被正确映射成可归属、可回放的 turn artifact，导致 UI 能力和 runtime 事实之间断层持续扩大。现在需要把“图片生成结果必须贴着触发它的用户问题展示”明确成行为 contract，后续实现才不会继续裂成“tool 输出一段路径文本”和“真正想展示的图像结果”两套语义。

## 目标与边界

### 目标

- 目标 1：当用户在 `Codex` 会话中请求生成图片时，幕布必须在对应问题附近显示清晰的 inline generation card，而不是仅显示文件路径或补充说明。
- 目标 2：图片生成过程必须具备最小可感知生命周期，至少包含 `制作中` 与 `已完成` 两个状态。
- 目标 3：图片生成完成后，幕布必须直接显示图片预览，并保持与原始用户问题的视觉邻接关系。
- 目标 4：历史恢复后，系统必须继续把该图片结果挂回原 user turn，而不是退化为无归属的普通 assistant 文本。

### 边界

- 本 change 仅覆盖 `Codex` 客户端幕布中的图片生成结果归属、状态表达与历史回放。
- 优先复用现有前端消息渲染能力与 `read_local_image_data_url`，不把本轮扩展成新的图像管理子系统。
- 本轮只定义 `制作中 / 已完成 / 预览失败降级` 的基础 contract，不扩展编辑、二次变体、批量图集管理等高级交互。
- 不改变图片生成本身的合规策略、prompt 构造逻辑或底层出图模型选择。

## 非目标

- 不把同样的渲染 contract 同时推广到 `Claude`、`Gemini`、`OpenCode`。
- 不重写整个 conversation item schema 或所有 tool card 的展示体系。
- 不新增独立的媒体库、下载中心或全局图片资产页。
- 不处理用户手动上传图片作为输入附件时的既有渲染逻辑。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 继续沿用当前行为，只把生成文件路径或 tool output 文本显示在幕布中 | 改动最少 | 无法表达 `制作中/已完成`，也无法和用户问题稳定对位，历史回放继续裂 | 不采用 |
| B | 维持 tool block 模型，只在 `image_gen` 工具详情里嵌一个预览图 | 可复用部分现有 tool card 展示 | 结果仍归属于 tool，而不是归属于 user turn；用户阅读路径会继续跳出主问题流 | 不采用 |
| C | 把图片生成结果抽象为当前 user turn 的 inline generated-image artifact，在 runtime normalization、canvas rendering、history replay 三层统一建模 | 能直接满足“图和问题对上”“制作中/已完成”“历史回放一致” | 需要补充 artifact identity、状态迁移和降级规则 | **采用** |

取舍：采用 C。这个问题的本质不是“少一个图片预览组件”，而是缺少“图片生成结果属于哪个 turn、在什么阶段、如何回放”的统一 contract。只有把 generated image 作为 first-class turn artifact 建模，前端和历史恢复才不会继续各说各话。

## What Changes

- 为 `Codex` conversation runtime 定义 generated image artifact 的 turn-level identity，要求其显式归属于触发该图片生成的 user turn。
- 当图片生成开始后，在对应 user question 附近插入 inline generation card，状态显示为 `制作中`。
- 当图片生成完成并拿到本地结果路径后，将同一 artifact 更新为 `已完成`，并在幕布中直接显示图片预览，而不是只显示路径文本。
- 复用现有本地图像读取能力，把历史线程中的 generated image artifact 重建为可预览内容，保持与 realtime 渲染语义一致。
- 当图片预览加载失败时，必须保留 `已完成` 状态与最小降级信息，避免整块结果消失。

## Capabilities

### New Capabilities

- `codex-generated-image-turn-linkage`: 定义 `Codex` 图片生成结果在实时幕布、状态迁移与历史回放中的 turn 归属和可视表达。

### Modified Capabilities

- None.

## Impact

- Frontend normalization / render:
  - `src/features/messages/**`
  - `src/features/threads/**`
  - `src/app-shell-parts/**`
- Shared contract:
  - `src/types.ts`
  - `src/features/threads/contracts/**`
- Existing image loading surface:
  - `src/services/tauri.ts`
  - `src/features/messages/components/LocalImage.tsx`
- Validation:
  - message rich-content tests
  - Codex history replay / timeline continuity tests

## 验收标准

- 当用户在 `Codex` 会话中请求生成图片时，幕布必须在对应 user bubble 邻近位置显示 `制作中` 卡片。
- 图片生成完成后，同一位置必须切换为 `已完成` 卡片并显示图片预览，不得只剩本地路径文本。
- 历史线程恢复后，该图片结果必须继续挂在原始用户问题对应的阅读流中。
- 当图片读取失败时，幕布必须保留完成态与降级信息，而不是把结果完全吃掉。
