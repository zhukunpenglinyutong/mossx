## Why

邮件发送配置能力已经具备，但它目前只解决“能否发送”的基础设施问题，还没有定义“某个对话完成后是否通知用户”的产品行为。

用户在长时间运行的 AI 对话里需要一个轻量、明确、可控的完成提醒入口：在当前对话中临时开启一次邮件通知，等本轮回答最终完成后，把最后一组用户问题与助手回答完整发送到已配置邮箱。

## 目标与边界

- 在对话输入区新增一个 email icon toggle，用于标记“当前对话的下一次完成结果发送邮件”。
- toggle 状态 MUST 按 conversation / thread 隔离，切换对话后不得串用其他对话的邮件发送意图。
- 发送语义为一次性：开启后只对当前正在生成或下一次提交的单轮 turn 生效，发送完成、发送失败或该 turn 进入终态后 MUST 自动关闭。
- 邮件内容 MUST 包含最后一组用户消息与助手完整回答，并且仅保留 `fileChange` 卡片摘要；其他 tool 调用信息不进入邮件正文。
- 发送能力 MUST 复用现有 `email-sending-settings` 定义的 backend sender contract，不在对话层读取 SMTP secret。

## 非目标

- 不新增 SMTP 配置入口，不修改邮箱 provider、secret 存储或测试发送行为。
- 不实现持续订阅式的“此对话后续每轮都发邮件”模式。
- 不给所有对话全局开启邮件通知。
- 不引入邮件模板编辑器、多人收件人、抄送、附件或富文本编辑能力。
- 不改变现有声音通知、系统通知和会话 completion lifecycle 的基础语义。

## What Changes

- 对话输入区域新增一个可访问的 email icon button，用于切换当前 conversation/thread 的一次性邮件发送意图。
- 当前 thread 的 email intent 被选中时，UI MUST 显示 selected 状态；切换到其他 thread 时 MUST 按该 thread 独立状态显示。
- 当目标 turn 到达 terminal completion 后，系统 MUST 收集最后一组 user + assistant 内容以及同轮关键结构化活动摘要，并通过 backend email sender 发送。
- 邮件发送成功、失败、取消或目标 turn 结束后，系统 MUST 清理该 thread 的一次性 intent，避免后续 turn 误发。
- 邮件发送失败 MUST 以结构化、可恢复方式反馈，不得阻塞对话终态结算，也不得泄露 SMTP secret。

## 技术方案对比

| 方案 | 描述 | 优点 | 风险 | 结论 |
|---|---|---|---|---|
| A. Frontend thread-scoped one-shot intent + terminal completion 调用 backend sender | UI 在当前 thread 保存一次性 intent；terminal completion 时由 conversation lifecycle 收集最后一轮内容并请求 backend 发送 | 行为轻量、对话隔离清晰、容易自动关闭；不污染全局 settings | 需要谨慎绑定 turn identity，避免 late event 误发 | 采用 |
| B. Backend 持久化每个 thread 的 email subscription | 后端保存 thread-level 邮件订阅，completion 事件由 backend 主动监听发送 | 重启后意图更强，可扩展成持续通知 | 对一次性需求过重，容易产生邮件噪音；需要更多 lifecycle 与 storage contract | 不采用 |
| C. 复用全局通知设置添加“完成后邮件”开关 | 在 Settings 中增加全局开关，所有对话完成都发送邮件 | 实现入口简单 | 不满足红框位置与对话隔离要求，误发风险高 | 不采用 |

## Capabilities

### New Capabilities
- `conversation-completion-email-notification`: 定义对话级一次性 completion email intent、按钮状态隔离、completion 后邮件内容收集与发送结果降级契约。

### Modified Capabilities
- 无。现有 `email-sending-settings` 作为已完成 sender contract 被消费；本变更不修改 SMTP 配置、secret handling 或测试发送 requirement。

## Impact

- Frontend:
  - 对话输入区 / composer control surface 增加 email icon toggle。
  - thread state 或相邻 reducer/hook 增加 thread-scoped one-shot email intent。
  - terminal completion handler 增加“存在 intent 时收集最后一轮内容并请求发送”的分支。
  - i18n 增加按钮 aria-label、tooltip、发送成功/失败反馈文案。
- Backend:
  - 复用现有邮件 sender service；如当前只暴露 test command，需新增受控 conversation email command 或内部调用入口。
  - 邮件正文生成不得接触 SMTP secret，错误返回继续使用结构化 email error。
- Specs:
  - 新增 `conversation-completion-email-notification` spec。
- Tests:
  - 覆盖 thread 隔离、一次性自动关闭、completion 后发送、失败不阻塞 lifecycle、内容包含 user/assistant 与 `fileChange` 卡片摘要。

## 验收标准

- 用户在对话 A 点亮 email icon 后，切到对话 B 时按钮 MUST 仍按 B 的独立状态显示；B 不得继承 A 的 intent。
- 用户在对话 A 点亮按钮并完成一轮回答后，系统 MUST 发送一封邮件，正文包含该轮最后一条用户消息、助手完整回答和同轮 `fileChange` 卡片摘要。
- 邮件发送尝试结束后，对话 A 的按钮 MUST 自动回到未选中状态；下一轮不会自动再次发送，除非用户重新点亮。
- 邮件未配置、disabled、secret 缺失、SMTP 失败或超时时，系统 MUST 给出可恢复反馈，并保持对话 completion 结果可见。
- 邮件发送链路 MUST NOT 读取、记录或展示 SMTP secret 明文。
- 未点亮按钮时，任何 conversation completion MUST NOT 触发邮件发送。
