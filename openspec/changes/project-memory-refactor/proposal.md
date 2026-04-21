# Proposal: Project Memory Refactor (Draft v0)

## Why

经过一段时间真实使用，当前 Project Memory 在“采集 -> 融合写入 -> 消费注入”链路暴露出系统性问题：

- 记忆质量不稳定：存在摘要与正文重复、噪声记忆进入库、同义重复难以抑制。
- 链路一致性不足：输入采集与 assistant 完成存在时序竞态，边界条件下可能漏写或重复写。
- 助手内容保真不足：当前落库更偏摘要化，助手正文信息密度不够，难以支撑后续复盘与复用。
- 消费命中体验一般：手动 `@@` 可用，但候选排序、相关性与可解释性仍不足。
- 可观测性不够：缺少统一诊断面，出现异常时定位成本高。

问题已从“局部 bug”演变为“架构债务”，需要一次受控重构，而不是继续补丁式修复。

## 代码核对状态（2026-04-21）

- 当前代码仍是 V1 主路径：前端 bridge 与 facade 仍保留 `hardDelete` 删除参数，Project Memory 面板仍直接调用 V1 list/update/delete 形态。
- 未发现 V2 核心符号落地：`ProjectMemoryItemV2`、`MemoryListProjection`、`MemoryDetailPayload`、`OperationTrailEntry`、`project_memory_list_v2`、`project_memory_get_v2` 暂未进入代码。
- 本提案继续保持“待实施”状态；后续应先完成 Batch A 的 DTO / command / whitelist / IPC contract freeze，再进入存储与 UI 批次。

## 目标与边界

### 目标

- 目标 1：重构记忆 pipeline，明确 `capture / fusion / retrieval / storage` 四层职责与契约。
- 目标 2：保证写入幂等与一致性，消除重复写、漏写、竞态导致的数据偏差。
- 目标 3：保持现有问答采集触发机制不变，但提升单轮记忆内容保真度。
- 目标 4：同一轮中，将 `用户输入 + 助手思考 + 助手正文 + 操作记录` 绑定为一个完整记忆单元。
- 目标 5：提升消费质量与可解释性，确保“为什么注入这条记忆”可追踪。
- 目标 6：补齐可观测性与回归测试，形成可持续迭代的质量门禁。

### 边界

- 首期仍沿用现有文件存储形态（workspace 目录 + 按天分桶 JSON），不强制切换 DB。
- 首期不引入向量数据库与 embedding 检索，仅优化现有规则与排序策略。
- 保持现有 UI 主交互语义（`@@` 手动关联）不变，重点修复底层质量与稳定性。
- 编码实现需保持 Win/mac 跨平台兼容，平台差异通过适配层隔离，不允许散落平台分支逻辑。
- 采用模块化组合式改造，限制改动面，避免影响客户端其他既有功能。
- 大文件治理硬规则（强制）：以 `@/Users/chenxiangning/code/AI/github/mossx/.github/workflows/large-file-governance.yml` 为唯一判定基准，任何代码文件不得超过 3000 行边界；超过即判定为不通过，必须在提交前完成拆分。
- 大文件治理校验命令（强制）：`npm run check:large-files:gate`（`--threshold 3000 --mode fail`）；本提案后续所有实现与验收均以该门禁结果为准。
- 工具调用原始结果（大体量 output）默认不入记忆正文，仅保留必要操作轨迹信息。
- 助手思考仅存“摘要形态”，不存完整流式思考全文。
- 单轮问答原文（`userInput` 与 `assistantResponse`）不做长度截断，按原文无限制存储。
- 单轮问答原文（`userInput` 与 `assistantResponse`）按原文保存，不做脱敏改写。
- 历史旧数据保持原样，不做批量迁移或回填。
- 读取与展示统一按新模型执行；无法映射到新模型的旧数据不展示。

## 非目标

- 不在本轮重做 Project Memory 面板视觉设计。
- 不在本轮引入跨设备云端同步。
- 不在本轮改造为“自动全注入”策略。
- 不执行历史旧记忆的数据迁移任务。
- 不继续演进 V1 逻辑路径（V1 明确弃用）。

## What Changes

- 建立 Memory Pipeline V2：
  - `InputCapture`：输入采集、清洗、脱敏、去重前置。
  - `FusionWrite`：assistant 完成后的结构化融合写入（update 优先 + create 降级）。
  - `MemoryRetrieval`：手动选择与注入构建的统一入口（含可解释排序信息）。
  - `MemoryStore`：统一存取与索引接口，收敛 workspace/date/file 细节。
  - `MemoryListProjection`：为列表/筛选/搜索提供轻量读模型，避免首屏为每条记录预加载整段原文。
  - `MemoryDetailHydrator`：仅在用户打开详情时按需装载 `userInput/assistantResponse/operationTrail` 完整数据。
  - `DetailChunkRenderer`：对超长 `userInput/assistantResponse` 区块执行首块优先 + 后续增量追加的渐进式渲染，避免详情打开时主线程卡顿。
  - `PlatformAdapter`：封装 Win/mac 文件路径、换行符与文件系统差异处理。
  - 旧的 `project-memory-ui` / `project-memory-crud` 设计若与本次 V2 冲突，以本提案中的 turn-bound 模型与交互约束为准。
- 引入 `TurnBound Memory Unit`（单轮绑定模型）：
  - `userInput`：用户本轮提问原文。
  - `assistantThinkingSummary`：助手思考摘要（仅摘要，不保存全文）。
  - `assistantResponse`：助手正文完整回复（非仅摘要）。
  - `operationTrail`：操作记录（如命令执行、文件改动、工具动作摘要），每条记录固定包含 7 个字段：
    - `actionType`
    - `target`
    - `status`（枚举：`success | failed | skipped`）
    - `timestamp`
    - `briefResult`
    - `durationMs`
    - `errorCode`
  - `actionType` 采用标准枚举口径，首期固定为：`command | file_read | file_write | tool_call | plan_update | other`。
  - `errorCode` 采用标准枚举口径，首期固定为：`NONE | TIMEOUT | USER_CANCELLED | IO_ERROR | TOOL_ERROR | PERMISSION_DENIED | UNKNOWN`。
  - `operationTrail` 必须按时间顺序逐条保存，不做同类连续操作合并或压缩。
  - `operationTrail` 默认展示顺序为时间正序（旧 -> 新）。
  - `operationTrail` 必须绑定具体轮次上下文（`turnId` 与 `messageId`），不得仅停留在 thread 级别。
  - 详情时间线每条 `operationTrail` 记录必须展示 `durationMs`。
  - `durationMs` 展示格式使用自动换算（如 `123ms` / `1.2s` / `2m`）。
- 工具调用结果存储策略调整：
  - 默认不存完整工具输出正文（避免噪声与体积膨胀）。
  - 仅存 `operationTrail` 的结构化摘要与关键元数据。
  - `operationTrail` 仅记录简要结果，不展开详细错误栈或长错误文本。
  - `userInput` 与 `assistantResponse` 采用原文直存策略，不执行脱敏替换。
- 兼容字段策略调整：
  - V2 以 `userInput/assistantThinkingSummary/assistantResponse/operationTrail` 为唯一业务真值。
  - `title/kind/importance/tags/source/fingerprint` 继续保留为元数据字段。
  - `summary/detail/cleanText` 若继续对外暴露，仅作为兼容读模型或索引字段，不能反向覆盖 V2 真值字段。
- 融合事件策略调整：
  - 不再假设 assistant completed 回调天然包含完整思考与操作信息。
  - 融合阶段必须从当前 turn 快照或标准化 thread items 中重建 `assistantThinkingSummary` 与 `operationTrail`。
  - 若快照缺失，允许降级为仅写入 `userInput + assistantResponse`，但不得阻塞主链路。
- provisional capture 策略调整：
  - `project_memory_capture_auto` 允许创建用于幂等保留的 provisional 记录。
  - 噪声过滤、去重、索引可继续使用 normalize/desensitize 结果，但 canonical `userInput` 必须保存原文，不得在 capture 阶段被改写。
  - 若 fusion 在同一运行期内超时未完成，系统必须先尝试基于 turn 快照补齐一次。
  - 若应用重启后仍存在未完成的 provisional 记录，系统启动时必须执行一次 reconciliation。
  - reconciliation 后仍无法恢复最终 assistant 正文的 provisional 记录，必须静默移除，避免污染记忆列表。
- Tauri 命令边界调整：
  - V2 前端仅允许调用类型化的 memory commands，不允许将任意文件路径、分片路径或目录路径作为删除/更新参数传入 Rust 后端。
  - 删除与更新命令仅接收 `workspaceId`、`memoryId` 与结构化 patch；具体 shard/file 路径必须由 Rust 存储层内部解析。
  - V2 主路径不再暴露 V1 风格的 `hardDelete` 语义开关，避免旧删除模型回流。
- 后端执行模型调整：
  - JSON 读写、分片扫描、索引重建、兼容解析等阻塞型存储任务必须在 Rust 后端的 blocking worker 中执行，不得直接阻塞 Tauri 命令主链路。
  - 后台任务失败时仅返回稳定错误码与简短诊断，不向前端暴露原始堆栈。
- 存储容错策略补强：
  - 单个日期分片或旧数据文件损坏时，系统必须隔离坏文件并继续读取其他可用分片。
  - 被隔离的坏文件仅进入诊断日志，不得导致整个 workspace 的记忆列表、详情或搜索整体不可用。
- 引入幂等键策略：基于 `workspaceId + threadId + turnId/messageId` 防止重复写。
- 重写摘要/正文规整逻辑：明确“summary 与 detail 的去冗余规则”。
- 增加统一诊断日志：记录 capture/fusion/retrieval 的关键决策与降级原因。
- 增加回归测试矩阵：覆盖竞态、重复事件、重复文本、异常降级、兼容旧数据。
- 新增展示层“新模型门禁”：
  - 仅渲染满足新模型字段要求的记忆。
  - 历史旧数据若无法映射到新模型字段集合，直接静默跳过，不做降级样式兜底。
  - 对被跳过的旧数据不做额外统计、提示或告警展示。
- 记忆详情展示顺序固定为：
  - `用户问题 -> 助手思考摘要 -> 助手正文 -> 操作记录时间线`
  - 前端不得自行重排该顺序。
  - 四个区块均支持折叠/展开交互。
  - 默认展示策略为折叠；首次进入详情时自动展开“助手正文”区块，其余区块保持折叠。
  - 当 `assistantThinkingSummary` 为空时，思考摘要区块直接隐藏，不显示占位文案。
  - 当 `operationTrail` 为空时，操作记录区块直接隐藏，不显示任何占位文案。
  - 当 `userInput` 或 `assistantResponse` 为超长文本时，详情必须启用渐进式渲染：先展示首个文本块，再按原顺序增量追加剩余内容。
  - 渐进式渲染不得改变原文顺序、换行、搜索高亮定位与最终复制结果语义。
  - 若用户在渐进式渲染过程中折叠区块、切换详情或关闭窗口，未完成的渲染任务必须被取消。
- 记忆列表标题回退规则：
  - 标题回退链路固定为：`assistantResponse 首句 -> userInput 首句 -> Untitled Memory`。
- 核心内容段交互规则：
  - `userInput` / `assistantThinkingSummary` / `assistantResponse` 支持独立删除（最小粒度）。
  - 独立删除前必须二次确认。
  - 删除后对应段落直接移除，不做占位展示。
  - 删除确认后立即生效，不提供撤销（Undo）。
- `operationTrail` 交互规则：
  - 允许删除单条操作记录。
  - 删除单条操作记录前必须二次确认。
  - 删除后彻底移除，不保留“已删除”占位或系统痕迹。
  - 删除确认后立即生效，不提供撤销（Undo）。
  - 不支持编辑单条操作记录内容。
  - 当记录较长时，详情默认展示前 50 条，提供“加载更多”增量展开。
- 整条记忆删除规则：
  - 删除前必须二次确认。
  - 二次确认文案统一为简短风格：`此操作不可撤销，确认删除？`
  - 删除后无痕移除，不保留“已删除”占位或系统痕迹。
  - 删除确认后立即生效，不提供撤销（Undo）。
  - 当独立删除导致记忆无有效内容时，系统静默自动删除整条记忆（不保留空壳，不弹窗提示）。
- 删除权限策略：
  - 首期不做权限限制，默认允许本地用户执行删除操作。
- 记忆详情增加“复制整轮内容”按钮：
  - 复制范围固定为 `用户问题 + 助手思考摘要 + 助手正文 + 操作记录时间线`。
  - 当 `operationTrail` 为空时，仅复制已有三段内容，不追加占位文本。
  - 复制策略为“所见即所得”：详情面板当前可见文本内容按展示顺序原样复制（看到什么复制什么）。
  - 复制内容中的 `operationTrail` 必须包含每条记录的 `status` 字段。
  - 复制结果末尾追加 `turnId/messageId`，用于回溯定位。
  - 当当前可见长文本区块仍处于渐进式渲染过程中时，复制按钮必须显示加载中或暂不可用；待可见内容渲染稳定后再允许复制。
- 记忆列表筛选增强：
  - 新增“是否包含操作记录”筛选维度（`有操作记录 / 无操作记录`）。
  - 该筛选支持多选组合。
  - 记忆列表默认按 `updatedAt` 降序排序。
  - 列表项增加“有操作记录”可视标记（图标或标签）。
  - “有操作记录”标记支持点击，点击后直接启用“有操作记录”筛选。
- 记忆列表检索增强：
  - 列表搜索范围需纳入 `userInput`、`assistantThinkingSummary`、`assistantResponse`、`operationTrail.briefResult`。
  - 搜索输入采用 300ms 防抖触发。
  - 搜索命中支持高亮。
  - 高亮仅在详情视图展示，不在列表摘要区域展示。
  - 搜索默认不区分大小写。
- 性能门槛（首期）：
  - 记忆列表首屏加载（50 条）P95 <= 300ms。
  - 记忆详情打开 P95 <= 200ms。
  - 关键词搜索（1k 条规模）P95 <= 500ms。
  - 对启用渐进式渲染的超长详情文本，上述“详情打开”指标以首个稳定文本块可见为准，不要求完整全文一次性完成渲染。
- 大文件行为约束（在“原文无限制存储”前提下）：
  - 当单日记忆文件超过 60MB 时，后续写入自动滚动到同日分片文件（`YYYY-MM-DD.partN.json`）。
  - 读取层对同日分片透明聚合，保证用户无感。
- 启动期性能策略：
  - 应用启动后自动重建一次记忆索引缓存，降低首次搜索抖动。
  - provisional reconciliation 与索引预热必须在后台执行，不得阻塞首屏渲染或主对话发送。
- 一致性策略：
  - 任意 create/update/delete 成功后，系统必须同步刷新受影响记忆的列表投影与搜索索引。
  - 删除后的段落、操作记录或整条记忆不得继续出现在旧缓存、旧搜索结果或详情残留视图中。
- 上线策略：
  - 直接切换到 V2 路径，不采用灰度开关。
  - V1 明确弃用且不再改造。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 继续在现有链路打补丁 | 改动小，见效快 | 架构债务继续累积，问题反复 | 不采用 |
| B | 分层重构（V2）+ 兼容旧存储 | 风险可控，可持续演进 | 需要一次性梳理契约与测试 | **首期采用** |
| C | 直接迁移到 DB + 向量检索 | 上限高 | 改动面过大，回归风险高 | 二期候选 |

取舍：先落地方案 B，先把稳定性与可解释性做实，再评估 C 的必要性与时机。

## Capabilities

### New Capabilities

- `project-memory-pipeline-v2`: 记忆采集、融合、消费、存储的统一分层契约。

### Modified Capabilities

- `project-memory-auto-capture`: 输入采集规则与去重判定升级。
- `project-memory-consumption`: 注入前检索排序与可解释信息增强。
- `project-memory-storage`: 存储访问层抽象与一致性约束补强。
- `project-memory-ui`: 详情展示、列表筛选与删除交互切换到 V2 只读结构化模型。
- `project-memory-crud`: 读取、结构化更新与硬删除语义切换到 V2 契约。

## 验收标准

- 不出现“summary 与 detail 大段重复”写入。
- 同一 turn 的重复完成事件不会导致重复写入（幂等生效）。
- 同一 turn 的记忆中，必须可追溯到完整用户提问与完整助手正文回复。
- `userInput` 与 `assistantResponse` 必须按原文完整保存，不允许因长度做截断。
- `userInput` 与 `assistantResponse` 必须按原文直存，不执行脱敏改写。
- 助手思考应以摘要形式按单轮关联并可检索，不保存流式思考全文。
- `userInput` / `assistantThinkingSummary` / `assistantResponse` 必须支持独立删除，删除后段落不占位。
- `userInput` / `assistantThinkingSummary` / `assistantResponse` 的独立删除必须二次确认，确认后无痕移除。
- 上述独立删除操作确认后必须立即永久生效，不提供 Undo。
- 工具调用原始大段输出默认不写入记忆正文，仅保留结构化操作轨迹。
- `operationTrail` 每条记录必须完整包含七字段：`actionType/target/status/timestamp/briefResult/durationMs/errorCode`。
- `actionType` 与 `errorCode` 必须使用统一枚举口径，禁止自由文本漂移。
- `operationTrail.status` 仅允许 `success/failed/skipped` 三态；`cancelled/timeout` 等细分原因统一写入 `errorCode`。
- `operationTrail` 必须保持时间序顺序与逐条可回放语义，不允许同类压缩导致审计信息丢失。
- `operationTrail` 时间线默认按正序展示（旧 -> 新）。
- `operationTrail` 必须可回溯到具体问答轮次（绑定 `turnId/messageId`）。
- `operationTrail` 的失败信息仅保留简要错误标识，不展示详细错误内容。
- `operationTrail` 在详情中默认仅展示前 50 条，必须支持“加载更多”渐进展开。
- 记忆详情必须按固定顺序展示：`用户问题 -> 助手思考摘要 -> 助手正文 -> 操作记录时间线`。
- 记忆详情四区块必须支持折叠/展开；首次进入详情时自动展开“助手正文”，其余区块默认折叠。
- 当 `assistantThinkingSummary` 为空时，思考摘要区块必须直接不展示且不占位。
- 当 `operationTrail` 为空时，操作记录区块必须直接不展示且不占位。
- 当 `userInput` 或 `assistantResponse` 为超长文本时，详情必须先渲染首个稳定文本块，再渐进式补齐剩余内容，不得一次性卡死渲染线程。
- 渐进式渲染必须保持原文顺序、换行与高亮定位一致，不得导致复制结果与最终可见内容不一致。
- 详情区块在折叠、切换或窗口关闭时，未完成的渐进式渲染任务必须被取消，不得产生卸载后的状态更新。
- 记忆标题必须遵循回退链路：`assistantResponse 首句 -> userInput 首句 -> Untitled Memory`。
- `operationTrail` 必须支持单条删除，且不提供单条编辑能力。
- `operationTrail` 单条删除操作必须包含二次确认，确认后执行不可逆的无痕删除。
- `operationTrail` 单条删除确认后必须立即永久生效，不提供 Undo。
- 整条记忆删除必须与上述删除策略一致：二次确认、无痕删除、立即永久生效且不可撤销。
- 删除二次确认文案必须统一为简短不可撤销提示（`此操作不可撤销，确认删除？`）。
- 首期删除能力不做权限门禁限制。
- 独立删除后若记忆已无有效内容（核心段与操作记录均为空），必须静默自动删除整条记忆。
- 记忆详情必须提供“复制整轮内容”按钮，复制内容范围与展示顺序保持一致。
- 复制内容必须遵循“所见即所得”规则：按当前界面可见内容与顺序原样复制。
- 复制内容中的 `operationTrail` 记录必须包含 `status` 信息。
- 复制内容末尾必须附带 `turnId/messageId` 追溯信息。
- 当当前可见长文本区块仍处于渐进式渲染过程中时，复制按钮必须处于加载中或暂不可用状态，避免复制不完整可见视图。
- 输入采集失败、融合失败、检索失败都可降级且不阻塞主对话发送。
- 手动选择注入链路在高频发送场景下保持稳定，无跨线程污染。
- 记忆列表必须支持按“是否包含操作记录（有/无）”进行筛选。
- “是否包含操作记录（有/无）”筛选必须支持多选。
- 记忆列表默认排序必须为 `updatedAt` 降序。
- 记忆列表项必须支持“有操作记录”可视标记。
- 记忆详情中 `operationTrail` 每条记录必须展示 `durationMs`。
- `durationMs` 在详情中的展示必须使用自动换算格式。
- 列表“有操作记录”标记必须支持点击并直达“有操作记录”筛选状态。
- 记忆列表搜索范围必须包含 `assistantResponse` 全文。
- 记忆列表搜索范围必须覆盖 `userInput`、`assistantThinkingSummary`、`assistantResponse`、`operationTrail.briefResult`。
- 搜索命中必须支持高亮，且高亮仅在详情展示。
- 所有新增或修改代码文件必须通过大文件硬门禁：以 `@/Users/chenxiangning/code/AI/github/mossx/.github/workflows/large-file-governance.yml` 对应的 `npm run check:large-files:gate` 为准，单文件严格不得超过 3000 行。
- 搜索匹配必须默认不区分大小写。
- 搜索触发必须使用 300ms 防抖。
- 性能指标必须满足：列表首屏 P95<=300ms、详情打开 P95<=200ms、1k 条搜索 P95<=500ms。
- 列表首屏读取 MUST 使用轻量投影结果，不得要求先完整水合每条记忆的原文大字段。
- 打开详情时 MUST 按需装载完整原文段落与操作记录，且不得影响列表滚动与筛选稳定性。
- 超长 `userInput/assistantResponse` MUST 启用渐进式渲染，先显示首块文本，再按原顺序增量补齐剩余内容。
- 渐进式渲染过程中 MUST 保持详情可交互，且在区块折叠、详情切换或窗口关闭时取消未完成任务。
- 单日文件超过 60MB 后必须自动分片写入，且读取层保持透明聚合。
- 应用启动后必须自动完成一次索引缓存重建，以降低首次搜索抖动。
- 启动期 provisional reconciliation 与索引预热必须后台执行，不得阻塞首屏渲染或消息发送。
- 任意结构化更新或删除生效后，列表/详情/搜索结果必须在下一次读取时立即反映最新状态，不得出现 stale 命中。
- 删除/更新类 Tauri 命令 MUST 仅接受类型化标识符与结构化 patch，不得接受任意文件路径参数或 V1 式删除模式开关。
- 阻塞型 JSON 读写、分片扫描、索引重建 MUST 在 Rust blocking worker 中执行，不得拖慢 Tauri 命令主链路。
- 单个损坏分片或损坏旧文件 MUST 被隔离跳过，不得使整个 workspace 的 list/get/search 失败。
- V2 必须直接启用；V1 明确弃用且不再改造。
- Win/mac 必须保持行为一致；平台差异通过适配层封装，不得影响其他客户端功能。
- 回归测试覆盖关键竞态路径并稳定通过。
- 历史数据不迁移；展示时一律按新模型校验，无法通过校验的旧记录不展示。
- 无法展示的旧记录按静默策略跳过，不输出额外用户可见提示。

## Impact

- 规范影响（预期）：
  - `project-memory-auto-capture`
  - `project-memory-consumption`
  - `project-memory-storage`
  - `project-memory-ui`
  - `project-memory-crud`
  - （新增）`project-memory-pipeline-v2`
- 代码影响（预期）：
  - `src/services/tauri.ts`
  - `src/features/project-memory/components/ProjectMemoryPanel.tsx`
  - `src/features/project-memory/hooks/useProjectMemory.ts`
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/features/threads/hooks/useThreads.ts`
  - `src/utils/threadItems.ts`
  - `src/features/project-memory/utils/memoryContextInjection.ts`
  - `src/features/project-memory/utils/outputDigest.ts`
  - `src/features/project-memory/services/projectMemoryFacade.ts`
  - `src-tauri/src/project_memory.rs`
  - `src/features/threads/hooks/useThreadItemEvents.ts`
  - `src/styles/project-memory.css`
