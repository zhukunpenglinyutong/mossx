## 1. Artifact Contract

- [x] 1.1 [P0][Depends: none][Input: 当前 `ConversationItem` / thread normalization / Codex tool event 结构][Output: generated-image artifact 的类型定义与 turn-anchor identity 规则][Verify: 类型层能表达 `制作中/已完成/降级`，且同一 user turn 多实例可区分] 为 `Codex` 图片生成结果定义 first-class generated-image artifact contract。
- [x] 1.2 [P0][Depends: 1.1][Input: 当前 `Codex` tool/result 映射路径与图片结果落地事实][Output: 从图片生成事件到 generated-image artifact 的 normalization 规则][Verify: 目标层不再只能依赖 assistant 文本或裸路径判断图片结果] 在 thread/item normalization 中建立图片生成事实到 artifact 的映射。

## 2. Realtime Canvas Rendering

- [x] 2.1 [P0][Depends: 1.1-1.2][Input: `Messages` / `MessagesTimeline` / `MessagesRows` 的现有消息渲染入口][Output: 与 user question 对位的 inline generated-image card 渲染][Verify: 触发图片生成后，幕布在对应 user bubble 邻近位置出现 `制作中` 卡片] 在消息幕布接入 generated-image artifact 的实时渲染。
- [x] 2.2 [P0][Depends: 2.1][Input: generated-image artifact 生命周期与现有 `LocalImage` 能力][Output: 同一 artifact 的 `制作中 -> 已完成 -> 预览降级` 状态迁移展示][Verify: 完成后显示图片预览，预览失败时仍保留完成态与降级信息] 复用现有本地图片读取能力实现状态迁移与预览。
- [x] 2.3 [P1][Depends: 2.1-2.2][Input: 当前 canvas scroll/sticky/live window 行为][Output: generated-image artifact 不破坏 user bubble 阅读顺序与幕布稳定性][Verify: 现有 user bubble / sticky / lightbox 基础行为不回归] 收敛 generated-image card 对现有消息布局的影响。

## 3. History Replay

- [x] 3.1 [P0][Depends: 1.2][Input: `Codex` 历史恢复与本地 replay 路径][Output: generated-image artifact 的历史重建逻辑][Verify: 重开包含图片生成结果的线程后，图片卡仍挂在原 user question 附近] 为 history replay 增加 generated-image artifact 恢复能力。
- [x] 3.2 [P0][Depends: 3.1][Input: 历史回放时的本地图片可读/不可读分支][Output: preview readable 与 degraded readable 的双分支恢复语义][Verify: 图片可读时显示预览，不可读时保留完成态与降级信息] 锁定历史回放阶段的预览降级 contract。

## 4. Validation

- [x] 4.1 [P0][Depends: 2.1-3.2][Input: message rich-content、Codex history replay、timeline continuity 测试基线][Output: 覆盖 realtime lifecycle、history replay、preview degradation 的回归测试][Verify: Vitest 覆盖 `制作中 -> 已完成 -> 降级` 与 reopen replay 场景] 为 generated-image artifact 增补 targeted tests。
- [x] 4.2 [P0][Depends: 4.1][Input: 本 change artifacts 与测试结果][Output: 可进入 apply 的 OpenSpec change][Verify: `openspec validate fix-codex-generated-image-turn-linkage --strict` 通过，并记录相关前端验证命令] 完成 OpenSpec 校验与最小实现门禁记录。
