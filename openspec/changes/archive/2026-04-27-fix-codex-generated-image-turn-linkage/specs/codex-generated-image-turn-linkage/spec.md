## ADDED Requirements

### Requirement: Codex Image Generation Result MUST Stay Linked To The Triggering User Turn

当 `Codex` 会话触发图片生成时，系统 MUST 将生成结果建模为当前 user turn 的 inline artifact，而不是把结果仅表现为普通 assistant 文本、孤立 tool card 或裸文件路径。

#### Scenario: pending generation card anchors to the triggering question

- **WHEN** 用户在 `Codex` 会话中发送触发图片生成的请求
- **AND** runtime 已进入该次图片生成流程
- **THEN** 幕布 MUST 在触发该流程的 user question 邻近位置渲染一个 generated-image artifact
- **AND** 该 artifact MUST 明确归属于当前 user turn，而不是漂浮在无关位置

#### Scenario: completed image result remains visually adjacent to the same question

- **WHEN** 同一图片生成流程进入完成态
- **THEN** 幕布中的图片结果 MUST 继续挂在原 user question 对应的阅读流内
- **AND** 系统 MUST NOT 把该结果降级成仅在后续 assistant 文本中描述的路径信息

#### Scenario: multiple generated image results in one turn do not overwrite each other

- **WHEN** 同一 user turn 内存在多次图片生成实例
- **THEN** 系统 MUST 为每个生成实例保留独立的 generated-image artifact identity
- **AND** 后一次结果 MUST NOT 覆盖前一次已完成结果

### Requirement: Codex Image Generation Artifact MUST Expose Lifecycle Visibility

图片生成 artifact MUST 至少具备 `制作中` 与 `已完成` 两个用户可见生命周期状态，并在同一 artifact 上完成状态迁移。

#### Scenario: generation start shows making state

- **WHEN** 图片生成刚开始且结果尚未落地
- **THEN** generated-image artifact MUST 显示 `制作中` 或等价明确的进行中状态
- **AND** 用户 MUST 不需要等待最终完成后才能知道系统正在生成图片

#### Scenario: generation completion upgrades the same artifact to completed preview

- **WHEN** 图片生成完成并且系统已经拿到可读取的本地结果引用
- **THEN** 同一 generated-image artifact MUST 从 `制作中` 迁移到 `已完成`
- **AND** artifact MUST 直接显示图片预览，而不是只显示本地文件路径文本

#### Scenario: lifecycle transition does not create duplicate completion cards

- **WHEN** 某个 generated-image artifact 从 `制作中` 进入 `已完成`
- **THEN** 系统 MUST 更新同一个 artifact 实例
- **AND** 系统 MUST NOT 再额外插入一张与之语义重复的新图片结果卡片

### Requirement: Codex Generated Image Preview MUST Degrade Gracefully

当图片结果已经生成但预览读取失败时，系统 MUST 区分“生成完成”和“预览失败”，不得把该结果整体吃掉。

#### Scenario: preview read failure keeps completed result visible

- **WHEN** 图片生成已完成
- **AND** 前端无法把本地路径解析为可展示的图片预览
- **THEN** generated-image artifact MUST 继续保留 `已完成` 或等价完成态
- **AND** 幕布 MUST 显示最小降级信息，例如文件名、路径或恢复提示

#### Scenario: preview degradation does not masquerade as generation failure

- **WHEN** 图片生成成功但预览读取失败
- **THEN** 系统 MUST NOT 把该状态表达成“生成失败”
- **AND** 用户可见文案 MUST 能区分“结果已生成”和“预览暂时不可用”

### Requirement: Codex Generated Image Artifact MUST Replay From History With The Same Turn Semantics

历史恢复后的 generated-image artifact MUST 与实时渲染保持同源语义，继续归属于原始 user turn。

#### Scenario: reopening the thread restores generated image next to its source question

- **WHEN** 用户关闭并重新打开包含图片生成结果的 `Codex` 历史线程
- **THEN** 历史幕布 MUST 重建 generated-image artifact
- **AND** 该 artifact MUST 继续显示在原 user question 对应的阅读流中

#### Scenario: history replay preserves completed preview when local image is still readable

- **WHEN** 历史线程中的 generated-image artifact 对应本地图片仍然可读取
- **THEN** 历史回放 MUST 渲染与实时阶段等价的图片预览
- **AND** 系统 MUST NOT 退化成仅显示路径文本

#### Scenario: history replay preserves degraded completion when preview can no longer load

- **WHEN** 历史线程中的 generated-image artifact 已有完成事实
- **AND** 对应本地图片在回放阶段无法再次读取
- **THEN** 历史回放 MUST 保留完成态和降级信息
- **AND** 系统 MUST NOT 因预览失败而丢失该 artifact 的结果归属
