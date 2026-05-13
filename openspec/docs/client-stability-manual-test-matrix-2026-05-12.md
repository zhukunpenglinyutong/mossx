# Client Stability Manual Test Matrix - 2026-05-12

## 目的

这份文档用于人工验收以下三个已推进特性：

- `stabilize-runtime-session-lifecycle`
- `converge-conversation-fact-contract`
- `improve-composer-send-readiness-ux`

重点验证：

- runtime / thread 异常恢复是否可理解、可操作、不会静默丢上下文。
- conversation transcript 是否过滤内部控制面噪声，且 realtime / history 一致。
- Composer 发送前状态是否准确解释 target、context、disabled reason、queue/fuse/request 状态。
- Windows / macOS 交互和文件系统边界不出现路径、大小写、换行或 shell 假设问题。

## 测试前置条件

- 使用当前工作区启动桌面应用。
- 至少准备一个可用 workspace。
- 至少配置一个 Claude 或 Codex provider；若两者都有，优先都测。
- 测试前打开 DevTools console，便于记录异常。
- 测试过程中不要手动改数据库或 runtime 文件，除非对应 case 明确要求模拟异常。

## 测试记录约定

| 结果 | 含义 |
|---|---|
| Pass | 行为符合预期，无 console error，无明显 UI 破损 |
| Fail | 行为不符合预期，或出现不可恢复错误 |
| N/A | 当前环境不支持该 provider / OS / 能力 |

## A. Runtime Session Lifecycle

| ID | 场景 | 操作步骤 | 示例提示词 | 预期结果 | 失败判定 | 结果 |
|---|---|---|---|---|---|---|
| A-01 | 正常创建 runtime 并发送 | 打开 workspace，选择 Codex，发送普通问题 | `请用三点总结这个项目的主要模块。` | Composer 可发送；消息进入处理中；runtime 状态从 acquiring/active 收敛到可用状态 | 发送无反应、runtime 一直卡 recovering/stopping、无错误提示 |  |
| A-02 | runtime recovering 时 Composer 禁用原因 | 在 runtime 正在启动或恢复时立即尝试发送 | `现在继续执行上一条任务。` | Composer 显示 runtime recovering / reconnect 类原因，而不是只灰掉按钮 | 按钮禁用但无解释，或提示与实际状态不符 |  |
| A-03 | runtime ended 后可行动恢复 | 停止/结束当前 runtime 后再发送 | `继续刚才的回答。` | UI 出现 reconnect / retry / recover 类可行动入口；不出现“没反应” | 无恢复入口、raw error 直接污染聊天正文 |  |
| A-04 | `thread-not-found` stale recovery | 使用已有线程，模拟或触发 thread 丢失后继续发送 | `基于上文继续，但只给最终结论。` | 出现 stale thread recovery 行动面；recover-only / recover-and-resend 语义清晰 | 被当成普通 runtime 错误，或直接静默新建线程 |  |
| A-05 | `session-not-found` stale recovery | 删除或失效 provider session 后返回原线程继续发送 | `请读取上面的上下文并继续。` | `session-not-found` 和 `thread-not-found` 一样进入 recover-only / recover-and-resend | UI 只显示 generic reconnect，或无法恢复/重发 |  |
| A-06 | recover-only 不创建 fresh thread | 在 stale 状态点击 recover-only | 不需要新提示词 | 未验证 rebind 时返回 failed/retry 类结果；不会静默创建新 thread | recover-only 直接开了新 thread 或丢失原 thread 可见历史 |  |
| A-07 | recover-and-resend 允许 fresh continuation | 在 stale 状态点击 recover-and-resend | 使用当前 draft 或原失败消息 | 允许 fresh continuation；新线程中保留用户要发送的意图 | fresh 后用户 prompt 丢失，或错误标记成 verified rebind |  |
| A-08 | WebService reconnect 后状态刷新 | 断开/恢复 WebService 或让 app 后台后回来 | `恢复连接后告诉我当前线程状态。` | reconnect 后 thread list、active thread、runtime panel 状态收敛 | reconnect 后仍显示旧 active thread/runtime，需手动刷新才恢复 |  |
| A-09 | 自动恢复不会 retry storm | 连续触发 stale/runtime recoverable 错误 | `连续重试这条请求，但不要新建文件。` | 自动恢复最多一次，之后给用户可操作入口 | 消息重复发送多次、runtime 连续创建、日志刷屏 |  |

## B. Conversation Fact Contract

| ID | 场景 | 操作步骤 | 示例提示词 | 预期结果 | 失败判定 | 结果 |
|---|---|---|---|---|---|---|
| B-01 | realtime / history user bubble 一致 | 发送消息，等待完成，关闭并重新打开同一线程 | `请用一句话说明这个仓库的目标。` | reopen 后 user bubble 只出现一次 | reopen 后用户消息重复、顺序变化、空 bubble |  |
| B-02 | assistant completed snapshot 不重复正文 | 等待一条较长回复完成，再 reopen history | `请列出五个测试建议，每条一句话。` | assistant 正文不重复拼接，段落数量稳定 | 同一段回复重复出现，或 completed 后又追加一遍正文 |  |
| B-03 | synthetic approval marker 被隐藏 | 触发 approval / resume 类流程后查看 transcript | `如果需要修改文件，请先说明计划，不要直接改。` | 内部 approval resume marker 不作为普通聊天气泡出现 | 出现 synthetic marker、resume bookkeeping 等内部文本 |  |
| B-04 | `No response requested.` 不污染聊天 | 触发可能产生该 marker 的 Claude control flow | `只记录这个事实，不需要展开。` | marker 不作为 assistant 正文显示 | `No response requested.` 直接出现在普通消息中 |  |
| B-05 | 自然语言误伤检查 | 让模型解释这些控制词本身 | `请解释短语 "No response requested." 和 "developer_instructions" 的含义。` | 用户主动提到的自然语言内容正常显示 | 用户文本或 assistant 正常解释被过滤掉 |  |
| B-06 | `modeBlocked` 是 compact control row | 在受限 mode 下触发 blocked 操作 | `请直接修改一个文件并保存。` | `modeBlocked` 以 compact/status row 或明确提示出现，不混入 assistant 正文 | modeBlocked 原始 payload 显示成普通 assistant 文本 |  |
| B-07 | `request_user_input` pending 阻塞明确 | 触发需要用户选择/确认的请求 | `如果有多个选项，请向我提问再继续。` | message surface 出现 request card；Composer 指向该请求 | Composer 只显示 disabled，无跳转/定位线索 |  |
| B-08 | `request_user_input` settled 不再阻塞 | 提交、超时、关闭或取消 request 后再发送 | `现在继续执行，不需要再问我。` | submitted/timeout/dismissed/cancelled/stale 后 Composer 可继续发送 | 已完成/关闭的 request 仍阻塞输入 |  |
| B-09 | unknown provider payload 保守可见 | 使用非 P0 provider 或历史异常 payload 打开线程 | `请继续这个历史线程。` | 未识别 payload 不导致整屏崩溃；必要时 legacy-safe 可见 | conversation 崩溃、白屏、静默丢失用户可见内容 |  |
| B-10 | tool payload 不破坏 transcript | 触发命令、文件列表或工具结果 | `列出当前目录下和测试相关的文件，但不要修改。` | tool 结果进 tool card / tool row，不混入普通 assistant 正文 | tool JSON/raw payload 直接显示为聊天正文 |  |

## C. Composer Send Readiness UX

| ID | 场景 | 操作步骤 | 示例提示词 | 预期结果 | 失败判定 | 结果 |
|---|---|---|---|---|---|---|
| C-01 | target summary 正确 | 切换 engine/model/mode 后查看 Composer header | `请说明当前使用的模型和模式。` | header 显示当前 engine / model / mode，和实际选择一致 | header 显示旧模型、旧 engine 或模式错乱 |  |
| C-02 | context summary 正确 | 添加 memory / note / file / image / ledger context | `请基于我选中的上下文给出摘要。` | header 显示上下文摘要，如 files/images/notes/ledger 数量 | 数量错误、空上下文仍显示装饰性占位、窄屏挤压输入 |  |
| C-03 | empty draft disabled reason | 清空输入框，观察发送按钮与提示 | 无 | 空输入不可发送；不显示误导性“可发送” | 空输入可发送，或 disabled reason 被 runtime/request 状态错误覆盖 |  |
| C-04 | config loading 优先级 | 启动或切换 provider 配置加载时观察 Composer | `配置加载完成后再发送这条。` | config-loading 优先解释，不被 empty-draft 或 runtime 状态覆盖 | loading 时提示成空输入、modeBlocked 或其他错误原因 |  |
| C-05 | pending request pointer | 有 pending request_user_input 时观察 Composer | 不需要新提示词 | Composer 显示 awaiting-user-input / jump 类提示；表单仍在消息幕布 | Composer 尝试承载主表单，或没有定位入口 |  |
| C-06 | settled request 不阻塞 | request submitted/timeout/dismissed 后输入新消息 | `继续下一步。` | Composer 恢复可发送 | 旧 request 仍让按钮 disabled |  |
| C-07 | runtime lifecycle projection | runtime recovering/quarantined/ended 时观察 disabled reason | `恢复后继续。` | disabled reason 分别映射到 recovering/quarantined/ended 类解释 | runtime 状态和提示不一致，或只有 raw error |  |
| C-08 | queued message 展示 | 当前 turn processing 时输入第二条 | `补充一点：只输出结论。` | 能区分可排队、已排队、不可排队 | 直接丢弃输入，或没有 queue 状态提示 |  |
| C-09 | fuse eligibility | processing 中输入可融合普通文本 | `把上条补充为三点。` | 可融合时展示 fuse/queued 相关状态 | 可融合文本被当成 slash command 禁止融合 |  |
| C-10 | slash command 不融合 | processing 中输入 slash command | `/help` | slash command 不进入 fuse；提示不承诺可融合 | slash command 被错误融合进上一条普通消息 |  |
| C-11 | IME 输入不误发送 | 使用中文/日文 IME 组合输入，按 Enter 选词 | `测试中文输入法，不要提前发送。` | IME composing 期间不提前发送 | 选词 Enter 触发发送 |  |
| C-12 | 窄屏布局 | 缩窄窗口到移动/窄宽状态 | `请保持输入区可见。` | readiness header 不挤压输入区；按钮和 selector 可用 | header 换行严重、遮挡输入、按钮不可点 |  |
| C-13 | 深色/浅色主题 | 切换主题后查看 Composer header/footer | `主题切换后继续。` | 文案可读，图标/按钮对比度正常 | 文字低对比、icon 丢失、hover/focus 不可见 |  |

## D. Windows / macOS Compatibility

| ID | 场景 | 操作步骤 | 示例提示词 | 预期结果 | 失败判定 | 结果 |
|---|---|---|---|---|---|---|
| D-01 | macOS path 展示 | 在 macOS 选择一个带空格路径的 workspace 或 file ref | `请读取这个文件引用并总结。` | 路径显示和引用正常，不被空格截断 | 文件引用失败、路径被 shell-style split |  |
| D-02 | Windows path 展示 | 在 Windows 选择 `C:\\Users\\...` 或含空格路径 file ref | `请基于这个 Windows 路径的文件继续。` | 路径分隔符不破坏 UI 或 context summary | `\\` 被错误转义，路径大小写导致找不到文件 |  |
| D-03 | CRLF 内容 | 打开 CRLF 文件并让模型总结 | `请总结这个 CRLF 文件的前三个要点。` | 文本正常读取，conversation 不出现异常断行噪声 | CRLF 导致重复段落、过滤误伤、tool row 崩溃 |  |
| D-04 | 大小写敏感边界 | 准备大小写相近文件名并引用其中一个 | `请只基于我选中的那个文件回答。` | macOS/Windows 下不会错误引用另一个大小写相近文件 | 引用错文件，或 history reopen 后文件名大小写变化 |  |
| D-05 | 无 shell 假设 | 在 Windows 执行不依赖 bash 的普通问答/恢复流程 | `不要执行 shell，只解释当前状态。` | runtime/recovery/Composer 行为正常 | UI 或日志出现 bash/zsh-only command 假设导致失败 |  |

## E. Regression And Gate Awareness

| ID | 场景 | 操作步骤 | 示例提示词 | 预期结果 | 失败判定 | 结果 |
|---|---|---|---|---|---|---|
| E-01 | 大文件治理无新增风险 | 人工确认本轮没有继续膨胀大组件行为 | 无 | 大组件只消费 view model，新增判断不堆进 UI 组件 | UI 组件继续新增大量业务判断 |  |
| E-02 | heavy-test-noise 告警门禁感知 | 观察测试或手动日志是否有重复噪声 | 无 | 恢复/重试不会刷屏，错误可分类 | retry storm、重复 toast、console error 洪泛 |  |
| E-03 | history reopen 回归 | 完成 A/B/C 关键 case 后重启 app 并 reopen | `请基于历史继续一句话。` | visible transcript、Composer state、active thread 状态稳定 | 重启后消息重复、request 卡片复活、Composer 仍 blocked |  |

## 推荐测试顺序

1. 先测 `C-01` 到 `C-04`，确认 Composer 基础状态解释正常。
2. 再测 `A-01` 到 `A-03`，确认 runtime 正常启动、结束、恢复入口可见。
3. 接着测 `B-01` 到 `B-05`，确认 transcript 不被控制面污染。
4. 然后测 `B-07`、`B-08`、`C-05`、`C-06`，确认 request_user_input lifecycle。
5. 最后测 `A-04` 到 `A-09`，覆盖 stale recovery 和 reconnect。
6. 有 Windows 环境时补测 D 组；只有 macOS 时至少测 `D-01`、`D-03`、`D-04`。

## 缺陷记录模板

```text
Case ID:
OS:
Provider:
Workspace:
操作步骤:
示例提示词:
实际结果:
预期结果:
Console / log:
截图或录屏:
是否可稳定复现:
```

## 总结记录

| 模块 | Pass | Fail | N/A | 备注 |
|---|---:|---:|---:|---|
| Runtime Session Lifecycle |  |  |  |  |
| Conversation Fact Contract |  |  |  |  |
| Composer Send Readiness UX |  |  |  |  |
| Windows / macOS Compatibility |  |  |  |  |
| Regression And Gate Awareness |  |  |  |  |
