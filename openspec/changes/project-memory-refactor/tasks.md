## 0. 代码核对状态（2026-04-21）

- 当前代码仍停留在 V1 主路径：`src/services/tauri.ts` 与 `src/features/project-memory/services/projectMemoryFacade.ts` 仍暴露 `hardDelete` 删除语义，未发现 `ProjectMemoryItemV2` / `MemoryListProjection` / `MemoryDetailPayload` / `OperationTrailEntry` / `project_memory_list_v2` / `project_memory_get_v2` 等 V2 主路径符号。
- 因此本轮回写不把 A/B/C/D/E/F/G 任一 V2 实施批次标记完成；后续实现应从 Batch A 契约冻结开始，先移除 V1 `hardDelete` 主路径与冻结 TS/Rust DTO。

## 0. 可执行批次（按顺序落地）

### Batch A [P0] 契约冻结与模块切口

- [ ] A.1 [关联:1.1,1.2,2.1,4.5,9.3][文件:`src/services/tauri.ts`,`src/features/project-memory/services/projectMemoryFacade.ts`,`src-tauri/src/command_registry.rs`,`src-tauri/src/project_memory.rs` 或拆分后的 `src-tauri/src/project_memory/*`][目标: 冻结 V2 类型契约与命令边界][完成定义: 不再暴露 V1 `hardDelete` 与路径型参数，TS/Rust DTO 名称与字段一一对应] 先定义 `ProjectMemoryItemV2` / `MemoryListProjection` / `MemoryDetailPayload` / `OperationTrailEntry` / 结构化 patch / 删除命令载荷，并决定 Rust 侧是否将 `project_memory.rs` 拆为目录模块。
- [ ] A.2 [关联:1.3][文件:`src/features/project-memory/**`,`src/features/threads/hooks/useThreads.ts`,`src/features/threads/hooks/useThreadItemEvents.ts`,`src/features/threads/hooks/useThreadMessaging.ts`,`src/features/composer/hooks/useComposerAutocompleteState.ts`,`src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.tsx`,`src/utils/threadItems.ts`,`src-tauri/src/project_memory*`][目标: 锁定改动白名单][完成定义: 提交前可用白名单检查确认未误触 Git/File/Session 等其他能力] 输出“本次允许修改文件列表”，作为后续实现边界。
- [ ] A.3 [关联:9.3][验证:`npm run typecheck` + TS/Rust 契约测试草案][目标: 先把接口漂移风险消灭在实现前][完成定义: 新旧命令入口映射关系可被测试覆盖] 为 V2 IPC 契约测试先写 fixture 结构和断言清单。

#### Batch A 首轮实施清单（直接开工）

- [ ] A.1.1 [依赖:无][文件:`src/services/tauri.ts:2395-2555`,`src/features/project-memory/services/projectMemoryFacade.ts:1-88`,`src-tauri/src/project_memory.rs:18-121`,`src-tauri/src/project_memory.rs:941-1254`][目标: 盘点旧 V1 DTO / command / facade 差异][完成定义: 输出一份“旧字段 -> V2 字段”对照表，明确哪些字段删除、哪些字段兼容保留、哪些命令签名必须变化] 这一步只做契约梳理，不落实现逻辑。
- [ ] A.1.2 [依赖:A.1.1][文件:`src-tauri/src/project_memory.rs`,`src-tauri/src/command_registry.rs`][目标: 决定 Rust 侧是否拆模块][完成定义: 明确采用“单文件过渡”还是“目录模块化（model/store/commands/index/compat/reconcile/platform）”，并写入实现备注] 如果不先做这个决定，后面 B 批次会边写边搬家。
- [ ] A.1.3 [依赖:A.1.1][文件:`src-tauri/src/project_memory.rs` 或新建 `src-tauri/src/project_memory/model.rs`,`src-tauri/src/project_memory/read_models.rs`][目标: 冻结 Rust V2 DTO 草案][完成定义: 至少明确 `ProjectMemoryItemV2`,`MemoryListProjection`,`MemoryDetailPayload`,`OperationTrailEntry`,`ProjectMemoryPatch`,`ProjectMemoryDeleteInput` 的字段和可选性] 先定义类型，不接存储实现。
- [ ] A.1.4 [依赖:A.1.3][文件:`src/services/tauri.ts`,`src/features/project-memory/services/projectMemoryFacade.ts`][目标: 冻结 TS V2 DTO 草案][完成定义: TS 类型与 Rust DTO 一一镜像，`projectMemoryDelete` 不再接受 `hardDelete`，list/get 返回值已分离为 projection/detail] 仍然允许用旧实现占位，但类型必须先正确。
- [ ] A.1.5 [依赖:A.1.3][文件:`src-tauri/src/command_registry.rs`,`src/services/tauri.ts`][目标: 冻结 V2 命令命名与载荷形状][完成定义: list/get/update/delete/capture 的命令入参与返回值已书面确定，前端不得透传文件路径、分片路径、V1 删除开关] 这是后续所有实现批次的共同地基。
- [ ] A.2.1 [依赖:A.1.5][文件:`openspec/changes/project-memory-refactor/tasks.md` 当前文件][目标: 白名单落地到执行层][完成定义: `Batch B/C/D/E/F/G` 的写入文件边界已经固定，明确哪些批次可以并行、哪些文件必须单写者持有] 把“可改哪些文件”变成实施约束，不只停留在口头。
- [ ] A.3.1 [依赖:A.1.4,A.1.5][文件:`src/features/project-memory/contracts/projectMemoryIpc.contract.test.ts` 或等价新增文件,`src/features/project-memory/hooks/useProjectMemory.test.tsx`,`src/features/project-memory/components/ProjectMemoryPanel.test.tsx`,`src/features/threads/hooks/useThreads.memory-race.integration.test.tsx`][目标: 先写 IPC 契约测试草案][完成定义: 至少断言 list/get/update/delete/capture 的参数形状、枚举值、可选字段、返回模型区分 projection/detail] 允许先用 fixture/shape assertion，不要求真实命令通过。
- [ ] A.3.2 [依赖:A.3.1][验证:`npm run typecheck`][目标: 让类型漂移立即暴露][完成定义: 在不改业务逻辑前提下，TS 已能编译通过，且不存在继续引用 `hardDelete/deletedAt/detail` 作为 V2 主路径字段的新增代码] 这是进入 Batch B/C/D 的最小门槛。
- [ ] A.Exit [依赖:A.1.1-A.3.2][目标: Batch A 完成判定][完成定义: 已产出 Rust/TS DTO、命令边界、白名单、测试草案四件套；后续实现批次不再边写边改字段名] Batch A 未完成前，不允许开始 UI 批次。

### Batch B [P0] Rust 存储底盘重建

- [ ] B.1 [关联:2.2][文件:`src-tauri/src/project_memory/model.rs`,`src-tauri/src/project_memory/store.rs`,`src-tauri/src/project_memory/compat.rs` 或等价拆分文件][目标: 建立 V2 canonical/derived 模型与兼容读模型][完成定义: Rust 单测可覆盖 V2 序列化、兼容旧记录解析、derived 字段不反向覆盖 canonical] 将当前单文件里的 `ProjectMemoryItem/Create/Update/Delete` 旧结构抽离成 V2 模型和兼容转换器。
- [ ] B.2 [关联:2.3,2.4][文件:`src-tauri/src/project_memory/store.rs`,`src-tauri/src/project_memory/pathing.rs`][目标: 实现 60MB 分片写入与透明聚合读取][完成定义: 同日主文件 + `.partN` 文件读取结果一致，调用方无需感知分片] 这里顺便落地 workspace slug/path resolver。
- [ ] B.3 [关联:2.5,2.7,9.7][文件:`src-tauri/src/project_memory/store.rs`,`src-tauri/src/project_memory/index.rs`,`src-tauri/src/project_memory/tests/*`][目标: 阻塞 I/O 迁入 blocking worker，并加坏分片隔离][完成定义: 大体量读写不阻塞命令主链路，单个坏文件只记日志不拖垮 list/get/search] 为坏分片、空文件、脏旧文件补测试样本。
- [ ] B.4 [关联:2.6][文件:`src-tauri/src/project_memory/read_models.rs`,`src-tauri/src/project_memory/commands.rs`][目标: 完成 list projection / detail hydration 双读模型][完成定义: `project_memory_list` 不返回超长正文，`project_memory_get` 返回完整 canonical 字段] 这是前端列表性能的基础，不要后置。

#### Batch B 首轮实施清单（直接开工）

- [ ] B.1.1 [依赖:A.Exit][文件:`src-tauri/src/project_memory.rs`,`src-tauri/src/lib.rs`][目标: 搭起 Rust 模块外壳并保持现有命令可编译][完成定义: 确认采用单文件过渡或目录模块化后，模块入口可被 `mod project_memory;` 正常加载，旧命令名暂不丢失] 先把结构切口切开，再迁模型。
- [ ] B.1.2 [依赖:B.1.1][文件:`src-tauri/src/project_memory/model.rs`,`src-tauri/src/project_memory/compat.rs` 或等价文件][目标: 落地 V2 canonical/compat 数据结构][完成定义: `ProjectMemoryItemV2`,`OperationTrailEntry`,`MemoryListProjection`,`MemoryDetailPayload` 及 legacy 兼容解析结构已存在，serde round-trip 单测可写] 这一步不接命令，只落类型与转换。
- [ ] B.2.1 [依赖:B.1.2][文件:`src-tauri/src/project_memory/pathing.rs`,`src-tauri/src/project_memory/store.rs`][目标: 实现 workspace/day/shard 路径解析器][完成定义: 可按 `workspaceId + date` 找到主文件与 `.partN` 文件集合，并保持 Win/mac 路径行为一致] 把路径/分片决策从业务命令里抽离。
- [ ] B.2.2 [依赖:B.2.1][文件:`src-tauri/src/project_memory/store.rs`][目标: 落地 60MB 分片写入与透明聚合读取][完成定义: 超阈值自动滚动写入 `YYYY-MM-DD.partN.json`，读取侧按时间稳定聚合且调用方无感知] 这里同时补原子写临时文件策略。
- [ ] B.3.1 [依赖:B.2.2][文件:`src-tauri/src/project_memory/store.rs`,`src-tauri/src/project_memory/index.rs`,`src-tauri/src/project_memory/commands.rs`][目标: 把阻塞 I/O 与索引重建迁入 blocking worker][完成定义: list/get/search/reconcile 的磁盘扫描与 JSON 解析不阻塞 Tauri 主命令线程] 需要明确 `spawn_blocking` 边界和错误回传格式。
- [ ] B.3.2 [依赖:B.3.1][文件:`src-tauri/src/project_memory/store.rs`,`src-tauri/src/project_memory/compat.rs`,`src-tauri/src/project_memory/tests/*`][目标: 做坏分片/坏旧文件隔离与诊断降级][完成定义: 单个坏文件仅记诊断并跳过，其他 workspace/list/get/search 可继续返回] 至少补坏 JSON、空文件、未知字段三类样本。
- [ ] B.4.1 [依赖:B.1.2,B.2.2][文件:`src-tauri/src/project_memory/read_models.rs`,`src-tauri/src/project_memory/commands.rs`,`src-tauri/src/command_registry.rs`][目标: 打通 projection/detail 双读模型命令][完成定义: `project_memory_list_v2` 只返回 projection，`project_memory_get_v2` 返回完整 detail payload，旧命令是否保留仅作兼容桥接需在注释中写明] 不允许列表命令回吐超长正文。
- [ ] B.Exit [依赖:B.1.1-B.4.1][目标: Batch B 完成判定][完成定义: Rust 侧已具备 V2 模型、兼容读、分片读写、blocking worker、projection/detail 命令雏形，并有对应 `cargo test --manifest-path src-tauri/Cargo.toml project_memory` 可跑的测试入口] Batch B 未完成前，不进入最终 UI 列表改造。

### Batch C [P0] 线程采集与融合主链路

- [ ] C.1 [关联:3.1][文件:`src/features/threads/hooks/useThreadItemEvents.ts`,`src/features/threads/hooks/useThreads.ts`][目标: 把 capture 输入侧与 completed 输出侧的上下文补齐到 `workspaceId/threadId/turnId/messageId`][完成定义: 待融合上下文中不再只有 `itemId + text` 的弱载荷] 必要时扩充 `onAgentMessageCompletedExternal` payload。
- [ ] C.2 [关联:3.2,3.3][文件:`src/features/threads/hooks/useThreads.ts`,`src/utils/threadItems.ts`,`src/features/threads/adapters/toolSnapshotHydration.ts`][目标: 以 turn snapshot 重建四段内容并执行幂等写入][完成定义: 同轮重复 completed 不重复写，缺快照时降级只写 `userInput + assistantResponse`] 这里要去掉当前 `outputDigest + detail` 主导的旧合并方式。
- [ ] C.3 [关联:3.4][文件:`src/utils/threadItems.ts`,`src/features/threads/adapters/*`,`src/features/project-memory/utils/*`][目标: 稳定生成 `operationTrail` 枚举与 7 字段结构][完成定义: Claude/Codex/Gemini/OpenCode 各类 tool item 都能稳定映射到统一 `actionType/status/errorCode`] 优先把 mapping matrix 实现成纯函数，便于 contract test。
- [ ] C.4 [关联:3.5,3.6][文件:`src/features/threads/hooks/useThreads.ts`,`src-tauri/src/project_memory/reconcile.rs` 或等价文件][目标: provisional stale recovery + 启动 reconciliation][完成定义: 应用重启后可恢复的补齐，不可恢复的静默清除，且首屏不被阻塞] 这批做完才允许切换默认入口。

#### Batch C 首轮实施清单（直接开工）

- [ ] C.1.1 [依赖:A.Exit][文件:`src/features/threads/hooks/useThreadItemEvents.ts`][目标: 扩充 assistant completed 外发载荷][完成定义: `onAgentMessageCompletedExternal` 至少可带出 `workspaceId/threadId/turnId/messageId/itemId/text`，必要时附带 engine/source 元信息] 先把 completed 事件从“弱文本通知”提升为“可融合上下文通知”。
- [ ] C.1.2 [依赖:C.1.1][文件:`src/features/threads/hooks/useThreads.ts`][目标: 重写 pending capture key 规则][完成定义: 待融合缓存以 `workspaceId+threadId+turnId/messageId` 为主键，不再只依赖 `itemId` 或旧 memoryId 关联] 这是幂等写入的基础。
- [ ] C.2.1 [依赖:C.1.2,B.4.1][文件:`src/utils/threadItems.ts`,`src/features/threads/adapters/turnMemorySnapshot.ts` 或等价新增文件][目标: 抽出 turn snapshot resolver 纯函数][完成定义: 可从 thread item 序列稳定提取 `userInput / assistantThinkingSummary / assistantResponse / operationTrail` 四段结构，缺失字段时有明确降级策略] 不要把快照重建逻辑继续堆在 `useThreads.ts` 里。
- [ ] C.2.2 [依赖:C.2.1][文件:`src/features/threads/hooks/useThreads.ts`,`src/features/project-memory/services/projectMemoryFacade.ts` 或后续 capture facade][目标: 用 V2 payload 替换旧 `digest + detail` 合并路径][完成定义: 不再调用基于 `summary/detail` 的旧 merge 逻辑，重复 completed 事件只写一次，assistant 正文保存原文] 现有 `buildAssistantOutputDigest` 在主路径退居兼容工具。
- [ ] C.3.1 [依赖:C.2.1][文件:`src/utils/threadItems.ts`,`src/features/threads/adapters/operationTrailMapper.ts` 或等价新增文件][目标: 产出统一 operationTrail 映射矩阵][完成定义: `command/file_read/file_write/tool_call/plan_update/other` 与 `success/failed/skipped`、`NONE/TIMEOUT/USER_CANCELLED/IO_ERROR/TOOL_ERROR/PERMISSION_DENIED/UNKNOWN` 可稳定推导] 纯函数优先，便于 contract test 和多引擎复用。
- [ ] C.3.2 [依赖:C.3.1][文件:`src/features/threads/hooks/useThreads.memory-race.integration.test.tsx`,`src/utils/threadItems.ts` 对应新增测试文件][目标: 把幂等与 operationTrail 结构写进测试基线][完成定义: 重复 completed、不完整 snapshot、跨引擎 tool item 三类场景有测试覆盖] 不允许只靠手测验证融合链路。
- [ ] C.4.1 [依赖:C.2.2,B.3.1][文件:`src/features/threads/hooks/useThreads.ts`,`src-tauri/src/project_memory/reconcile.rs` 或等价文件,`src-tauri/src/lib.rs` 若需启动调度][目标: 接入 provisional stale recovery 与后台 reconciliation][完成定义: 可恢复记录在后台补齐，不可恢复记录静默清除，且不阻塞首屏和首次发消息] 需要明确窗口关闭/切线程时的任务取消策略。
- [ ] C.Exit [依赖:C.1.1-C.4.1][目标: Batch C 完成判定][完成定义: 从输入触发到 assistant completed 的 V2 采集主链路闭环，已不再依赖旧 digest/detail 作为真值字段，关键 race/integration 测试可运行] Batch C 未完成前，不允许宣称“记忆质量问题已解决”。

### Batch D [P0] TS 契约与 Facade 切换

- [ ] D.1 [关联:A.1,B.4][文件:`src/services/tauri.ts`,`src/features/project-memory/services/projectMemoryFacade.ts`,`src/types.ts`][目标: 将前端所有 memory API 类型切换到 V2 DTO][完成定义: TS 侧不再依赖旧 `summary/detail/cleanText/deletedAt/hardDelete` 作为主路径字段] 保留兼容字段仅供只读降级工具使用。
- [ ] D.2 [关联:4.5,9.3][文件:`src/services/tauri.ts`,`src/features/project-memory/services/projectMemoryFacade.ts`][目标: 收口所有 memory 调用入口][完成定义: 前端不再直接调用旧 V1 删除模式，也不透传底层路径信息] Facade 需要成为唯一入口，便于后续替换实现。

#### Batch D 首轮实施清单（直接开工）

- [ ] D.1.1 [依赖:A.Exit,B.4.1][文件:`src/services/tauri.ts`][目标: 切出 TS V2 DTO 与 invoke 签名][完成定义: `ProjectMemoryItemV2`,`MemoryListProjection`,`MemoryDetailPayload`,`ProjectMemoryPatch`,`ProjectMemoryDeleteInput` 等类型已导出，list/get/update/delete/capture 的参数和返回值与 Rust 对齐] 旧 V1 类型可保留只读别名，但不得继续作为默认导出语义。
- [ ] D.1.2 [依赖:D.1.1][文件:`src/features/project-memory/services/projectMemoryFacade.ts`][目标: 将 facade 收口到 V2 typed API][完成定义: `projectMemoryFacade` 不再暴露 `hardDelete`，删除/更新/获取详情都使用 typed payload，capture 接口只接受业务字段] 前端不得再直接拼底层 shard/path。
- [ ] D.2.1 [依赖:D.1.2][文件:`src/features/threads/hooks/useThreads.ts`,`src/features/threads/hooks/useThreadMessaging.ts`][目标: 清理线程侧对 `src/services/tauri.ts` 的直连访问][完成定义: 线程相关 memory 写入/读取经由 facade 或专用 memory service 进入，`useThreads.ts` 不再直接 import `projectMemoryCreate/projectMemoryUpdate` 旧入口] 这是边界收口的关键一步。
- [ ] D.2.2 [依赖:D.1.2][文件:`src/features/composer/hooks/useComposerAutocompleteState.ts`,`src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.tsx`][目标: 修正手动记忆联想消费 projection/detail 差异][完成定义: 列表联想只依赖 projection 字段，手动注入需要 detail 时通过独立 detail 获取或兼容字段兜底，不假设 list 返回完整正文] 避免列表接口再次被正文字段拖慢。
- [ ] D.2.3 [依赖:D.2.1,D.2.2][文件:`src/features/project-memory/contracts/projectMemoryIpc.contract.test.ts` 或等价新增文件,`src/features/composer/hooks/useComposerAutocompleteState.test.tsx`,`src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.test.tsx`][目标: 锁定 TS 契约与消费面回归][完成定义: facade 参数形状、projection/detail 区分、composer 联想行为均有测试或 shape assertion 覆盖] 这一步通过后再允许大规模 UI 改造。
- [ ] D.Exit [依赖:D.1.1-D.2.3][目标: Batch D 完成判定][完成定义: TS 服务层、facade、线程写入侧、composer 消费侧都已切到 V2 契约，旧 `hardDelete/detail` 主路径引用被清掉] Batch D 未完成前，不进入最终 UI 数据绑定。

### Batch E [P0] 详情与列表 UI 重建

- [ ] E.1 [关联:5.1,5.2,5.3,6.1,6.2][文件:`src/features/project-memory/hooks/useProjectMemory.ts`,`src/features/project-memory/components/ProjectMemoryPanel.tsx`][目标: 将当前 detail-first 面板切到 V2 结构化视图][完成定义: 列表按 `updatedAt` 排序，详情固定顺序渲染，空 thinking/operation 区块不占位，操作记录筛选可用] 当前面板文件过大，落地时应同步拆组件。
- [ ] E.2 [关联:5.4,6.3,6.4,6.5][文件:`src/features/project-memory/components/ProjectMemoryPanel.tsx` 或拆分后的 `components/detail/*`,`components/list/*`][目标: 完成时间线前 50 条、搜索防抖、详情高亮][完成定义: 列表不高亮，详情高亮正确，操作记录可加载更多] 搜索状态应留在 hook 层，不要堆回单个大组件。
- [ ] E.3 [关联:5.6,5.7][文件:`src/features/project-memory/components/detail/DetailChunkRenderer.tsx`,`src/features/project-memory/hooks/useProjectMemory.ts`,`src/features/project-memory/components/ProjectMemoryPanel.tsx`][目标: 超长正文渐进式渲染与任务取消][完成定义: 首个稳定文本块优先可见，折叠/切换/关窗时无残留 state update，复制按钮在渲染稳定前禁用] 这里建议独立成组件，不要塞回 `ProjectMemoryPanel.tsx`。

#### Batch E 首轮实施清单（直接开工）

- [ ] E.1.1 [依赖:B.4.1,D.Exit][文件:`src/features/project-memory/hooks/useProjectMemory.ts`][目标: 把 hook 改成 list/detail 双源状态管理][完成定义: 列表查询、详情水合、筛选状态、折叠状态、复制可用态不再混在单一 `items + selectedItem` 旧模型里] 先把状态层改对，再谈组件拆分。
- [ ] E.1.2 [依赖:E.1.1][文件:`src/features/project-memory/components/ProjectMemoryPanel.tsx`,`src/features/project-memory/components/list/*`,`src/features/project-memory/components/detail/*`][目标: 拆掉巨型面板组件][完成定义: 至少拆出 list pane、detail pane、operation timeline、delete confirm、filter bar 五类子组件，`ProjectMemoryPanel.tsx` 只保留编排层] 目标是把 UI 复杂度从单文件下沉到组合层。
- [ ] E.2.1 [依赖:E.1.2][文件:`src/features/project-memory/hooks/useProjectMemory.ts`,`src/features/project-memory/components/list/*`][目标: 落地默认排序、operation 筛选、多选和搜索防抖][完成定义: 列表按 `updatedAt desc`，有/无 operation trail 多选筛选可用，搜索 300ms debounce 且大小写不敏感] 列表层禁止直接做高亮。
- [ ] E.2.2 [依赖:E.1.2][文件:`src/features/project-memory/components/detail/*`][目标: 实现四区块固定顺序、默认折叠和 operation 前 50 条][完成定义: 顺序固定为 问题 -> 思考摘要 -> 正文 -> 操作时间线，空区块隐藏不占位，operation 先渲 50 条并可继续展开] 首次展开 assistantResponse 的规则也在这里落地。
- [ ] E.2.3 [依赖:E.2.2][文件:`src/features/project-memory/components/detail/*`,`src/features/project-memory/hooks/useProjectMemory.ts`][目标: 详情搜索命中高亮与复制可见内容语义对齐][完成定义: 仅详情展示命中高亮，复制内容严格等于用户当前可见内容，并附带 `turnId/messageId` 与 operation status] 若渐进渲染未稳定，复制按钮必须 loading/disabled。
- [ ] E.3.1 [依赖:E.2.2][文件:`src/features/project-memory/components/detail/DetailChunkRenderer.tsx`,`src/features/project-memory/hooks/useProjectMemory.ts`][目标: 实现超长正文渐进式渲染][完成定义: `userInput/assistantResponse` 首个稳定 chunk <= 200ms 可见，剩余 chunk 保序追加且不破坏换行/高亮语义] 不允许一次性把长正文全塞进主线程。
- [ ] E.3.2 [依赖:E.3.1][文件:`src/features/project-memory/components/ProjectMemoryPanel.test.tsx`,`src/features/project-memory/hooks/useProjectMemory.test.tsx`,`src/features/project-memory/components/detail/DetailChunkRenderer.test.tsx` 或等价新增文件][目标: 把折叠/切换/卸载取消行为写进测试][完成定义: 折叠、切换选中项、关窗卸载时无残留 state update；复制按钮在渲染完成前禁用] 这一步是 UI 稳定性的核心验收。
- [ ] E.Exit [依赖:E.1.1-E.3.2][目标: Batch E 完成判定][完成定义: V2 列表/详情 UI 已按新语义工作，组件完成拆分，搜索/筛选/折叠/复制/渐进渲染均可验证] Batch E 未完成前，不做 V2 面板上线切换。

### Batch F [P0] 删除链路与一致性刷新

- [ ] F.1 [关联:4.1,4.2,4.3,4.4][文件:`src-tauri/src/project_memory/commands.rs`,`src/features/project-memory/hooks/useProjectMemory.ts`,`src/features/project-memory/components/ProjectMemoryPanel.tsx`][目标: 核心段删除、单条操作删除、空壳回收、二次确认][完成定义: 删除后立即生效、无 Undo、无空壳、无墓碑] 这批要直接覆盖当前软删除思路。
- [ ] F.2 [关联:6.7,9.6][文件:`src-tauri/src/project_memory/index.rs`,`src/features/project-memory/hooks/useProjectMemory.ts`][目标: 删除/更新后的列表投影与搜索索引增量刷新][完成定义: 下一次 list/get/search 读取即反映最新状态，不出现 stale 命中] 这是删除体验是否可信的关键。

#### Batch F 首轮实施清单（直接开工）

- [ ] F.1.1 [依赖:B.4.1,D.Exit,E.1.2][文件:`src-tauri/src/project_memory/commands.rs`,`src/features/project-memory/services/projectMemoryFacade.ts`][目标: 定义结构化删除命令面][完成定义: 支持 `deleteMemory/deleteSection/deleteOperation` 三类 typed payload，且不再存在 `hardDelete` 开关语义] 删除能力必须和业务对象对齐，而不是沿用 V1 文件删除思路。
- [ ] F.1.2 [依赖:F.1.1][文件:`src-tauri/src/project_memory/commands.rs`,`src-tauri/src/project_memory/store.rs`][目标: 落地核心段删除、单条 operation 删除与空壳自动回收][完成定义: `userInput/assistantThinkingSummary/assistantResponse` 可独立删除，operation entry 可独立删除，剩余全空时自动静默删除整条记忆] 不保留墓碑，不留空壳。
- [ ] F.1.3 [依赖:F.1.1,E.1.2][文件:`src/features/project-memory/hooks/useProjectMemory.ts`,`src/features/project-memory/components/detail/*`,`src/features/project-memory/components/ProjectMemoryPanel.tsx`][目标: 接入二次确认与即时生效 UI][完成定义: 删除入口均需二次确认，确认后立即生效，无 Undo，无额外历史提示] 默认交互保持静默，不额外占位。
- [ ] F.2.1 [依赖:F.1.2][文件:`src-tauri/src/project_memory/index.rs`,`src-tauri/src/project_memory/commands.rs`,`src/features/project-memory/hooks/useProjectMemory.ts`][目标: 打通删除/更新后的 projection/index 增量刷新][完成定义: 下一次 list/get/search 读取即反映最新状态，已删除内容不会在 detail/list/search 残留] 这里要明确 backend 与 hook 层各自负责的失效边界。
- [ ] F.2.2 [依赖:F.2.1][文件:`src/features/project-memory/hooks/useProjectMemory.test.tsx`,`src/features/project-memory/components/ProjectMemoryPanel.test.tsx`,`src/features/project-memory/contracts/projectMemoryDelete.contract.test.ts` 或等价新增文件,`src-tauri/src/project_memory/tests/*`][目标: 建立删除一致性回归基线][完成定义: 段落删除、operation 删除、整条删除、空壳自动回收四类行为都有测试，且 detail/list/search 三路结果一致] 删除体验必须靠自动化守住。
- [ ] F.Exit [依赖:F.1.1-F.2.2][目标: Batch F 完成判定][完成定义: 删除链路与一致性刷新闭环，旧软删除/`deletedAt` 主路径退出，空壳与 stale 命中问题被消灭] Batch F 未完成前，不进入发布候选。

### Batch G [P1] 索引预热、兼容读与发布收口

- [ ] G.1 [关联:6.6,7.1,7.2,7.3][文件:`src-tauri/src/project_memory/index.rs`,`src-tauri/src/project_memory/platform.rs` 或等价文件][目标: 启动预热与 Win/mac 路径行为收口][完成定义: 索引预热后台化、Win/mac 分片读写一致、业务层无平台分支泄漏] 这里不要碰 UI 层主题/窗口逻辑，聚焦 memory。
- [ ] G.2 [关联:8.1,8.2][文件:`src/features/project-memory/**`,`src/services/tauri.ts`,`src-tauri/src/project_memory*`][目标: 全入口切 V2，封死 V1 回流][完成定义: 新流程不再命中 `detail` 自由编辑和 `hardDelete` 路径，旧逻辑仅作历史兼容读] 这一步之后才能写发布说明。
- [ ] G.3 [关联:8.3,9.8][文件:`openspec/changes/project-memory-refactor/tasks.md` 对应实现记录、发布说明文档][目标: 收口发布与回退文案][完成定义: 可以明确告诉使用者 V2 行为变化、回退方式、已知限制] 保持版本级回退，不做代码双轨。

#### Batch G 首轮实施清单（直接开工）

- [ ] G.1.1 [依赖:B.3.1,C.4.1][文件:`src-tauri/src/project_memory/index.rs`,`src-tauri/src/lib.rs` 或等价启动入口][目标: 将索引预热与 reconciliation 接入后台启动任务][完成定义: 应用启动后异步预热索引与补偿任务，首屏渲染、线程打开、首次发消息不被阻塞] 若窗口提前关闭，后台任务需可安全结束。
- [ ] G.1.2 [依赖:B.2.2][文件:`src-tauri/src/project_memory/platform.rs`,`src-tauri/src/project_memory/pathing.rs`,`src-tauri/src/project_memory/tests/*`][目标: 收口 Win/mac 路径与换行差异][完成定义: Win/mac 下分片命名、路径拼接、换行处理一致，业务层不再散落平台 if/else] 平台差异只能留在 adapter 层。
- [ ] G.2.1 [依赖:D.Exit,E.Exit,F.Exit][文件:`src/services/tauri.ts`,`src/features/project-memory/**`,`src/features/threads/hooks/useThreads.ts`,`src/features/threads/hooks/useThreadMessaging.ts`,`src/features/composer/**`,`src-tauri/src/project_memory*`][目标: 清理 V1 主路径引用并封死回流][完成定义: 新代码不再依赖 `summary/detail/cleanText/deletedAt/hardDelete` 旧主语义，旧逻辑仅保留历史兼容读所需最小桥接] 需要用 `rg` 做一次全仓回流扫描。
- [ ] G.2.2 [依赖:G.2.1][文件:`src/features/project-memory/components/ProjectMemoryPanel.tsx`,`src/features/project-memory/services/projectMemoryFacade.ts`,`src/services/tauri.ts`][目标: 清理旧 UI affordance 与旧 API 暴露面][完成定义: 不再出现“编辑 detail/保存 detail/硬删除”入口，复制/删除/筛选/折叠完全遵循 V2 语义] 这是用户直接感知的收口动作。
- [ ] G.3.1 [依赖:G.1.1,G.1.2,G.2.2][文件:`openspec/changes/project-memory-refactor/tasks.md`,`docs/` 下发布说明文档或等价输出][目标: 补齐发布说明、已知限制与版本级回退说明][完成定义: 可明确说明 V2 与 V1 的行为差异、历史旧数据显示策略、60MB 分片与渐进式渲染等用户可感知变化] 不做灰度，只给版本级回退方案。
- [ ] G.Exit [依赖:G.1.1-G.3.1][目标: Batch G 完成判定][完成定义: 索引预热后台化、平台适配收口、V1 主路径退出、发布文案可交付] Batch G 完成后才进入最终发布验收。

### 0.1 并行实施建议

- [ ] P-Window-1 [前置:A 完成][并行组: Rust 存储 / 线程融合 / TS 契约][说明: `Batch B`、`Batch C`、`Batch D` 可并行，但 `src/services/tauri.ts` 只允许一个实现批次持有写权限] 避免多人同时改同一 IPC 契约文件。
- [ ] P-Window-2 [前置:B.4 + D.1 完成][并行组: UI 重建 / 删除一致性][说明: `Batch E` 与 `Batch F` 可并行，前提是 V2 detail/list DTO 已冻结] 避免前端边写边改 payload。
- [ ] P-Window-3 [前置:E/F/G 基本完成][并行组: 测试与手测][说明: 9.x 验证批次可以并行跑，但 `9.5` 性能验收必须放在最终候选版本上] 不要在半成品上测性能。

### 0.2 开工门禁

- [ ] Gate-1 [前置:无][检查: 批次 owner 与文件白名单已确认][通过标准: 每个批次有明确写入文件范围，避免多人同时写 `useThreads.ts` / `tauri.ts` / `project_memory.rs`] 没有 owner 不开工。
- [ ] Gate-2 [前置:A.1][检查: V2 DTO 与命令命名冻结][通过标准: 后续批次只消费契约，不再边实现边改字段名] 没有契约冻结不进入 UI 批次。
- [ ] Gate-3 [前置:B.4,C.4,D.2,E.3,F.2][检查: 主路径功能已闭环][通过标准: 才允许进入 9.x 全量门禁] 没有闭环不跑最终发布验收。

### 0.3 单写者文件与批次 owner 约束

- [ ] Owner-1 [范围:`src/services/tauri.ts`][唯一 owner: Batch A -> Batch D][约束: A 完成契约冻结后，只有 D 才能继续改这个文件；其他批次只能提字段需求，不直接落盘] 避免 IPC 契约文件反复被多批次改坏。
- [ ] Owner-2 [范围:`src-tauri/src/command_registry.rs`][唯一 owner: Batch A -> Batch B][约束: A 冻结命令命名，B 负责真正接线；C/E/F/G 不直接改这里] 命令注册表只允许一条线维护。
- [ ] Owner-3 [范围:`src-tauri/src/project_memory.rs` 或拆分后的 `src-tauri/src/project_memory/*`][唯一 owner: Batch B，F/G 在 B 完成后可续改][约束: B 负责模块化与存储底盘，F 只补删除命令，G 只补预热/平台收口] 不允许边重构底盘边并行加 UI 语义。
- [ ] Owner-4 [范围:`src/features/threads/hooks/useThreads.ts`,`src/features/threads/hooks/useThreadItemEvents.ts`][唯一 owner: Batch C][约束: 线程采集与融合主链路只由 C 持有，其他批次通过 facade/adapter 配合] 避免 race 修复与契约切换互相覆盖。
- [ ] Owner-5 [范围:`src/features/project-memory/components/ProjectMemoryPanel.tsx`,`src/features/project-memory/components/list/*`,`src/features/project-memory/components/detail/*`][唯一 owner: Batch E，F 仅在 E.1.2 后补删除交互][约束: E 完成组件拆分前，不允许其他批次继续往大组件堆逻辑] 先拆后补行为。
- [ ] Owner-6 [范围:`src/features/project-memory/hooks/useProjectMemory.ts`][唯一 owner: Batch E，F 在 E.1.1 后可补一致性刷新][约束: 状态模型由 E 主导，F 只在其上接删除刷新，不重改查询模型] 避免 hook 反复推倒重来。
- [ ] Owner-7 [范围:`src/features/composer/hooks/useComposerAutocompleteState.ts`,`src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.tsx`,`src/features/threads/hooks/useThreadMessaging.ts`][唯一 owner: Batch D][约束: 这些 memory 消费侧入口随 V2 DTO 一次性切换，E/F 不直接改消费协议] projection/detail 切换必须一次收口。

## 1. V2 架构骨架与模块边界

- [ ] 1.1 [P0][依赖:无][输入: 现有 project-memory / threads hooks][输出: V2 模块目录与 Facade 接线骨架][验证: typecheck 通过，旧调用编译不报错] 建立 `MemoryCapture/Fusion/Store/Search/View/PlatformAdapter` 模块骨架。
- [ ] 1.2 [P0][依赖:1.1][输入: 现有 memory facade 调用点 + `src/services/tauri.ts` 契约][输出: 统一 V2 Facade 入口与服务层类型边界][验证: 关键调用点均经 Facade 访问，类型契约无悬空旧字段] 收敛 V2 外部访问路径，减少跨模块直接依赖。
- [ ] 1.3 [P1][依赖:1.2][输入: 非记忆功能模块调用图][输出: 回归隔离清单（受影响文件白名单）][验证: 白名单外无行为变更] 建立“零回归改动面”约束。

## 2. V2 数据模型与存储落盘

- [ ] 2.1 [P0][依赖:1.1][输入: proposal/design 数据字段][输出: `ProjectMemoryItemV2`、`OperationTrailEntry` 与兼容字段矩阵][验证: 类型单测覆盖字段完整性，明确 canonical/derived 字段边界] 建立 V2 结构模型与枚举。
- [ ] 2.2 [P0][依赖:2.1][输入: 现有 JSON 存储实现][输出: V2 读写接口（按 workspace/date）+ 兼容读模型][验证: create/get/list/update/delete 基础用例通过，`summary/detail/cleanText` 不反向覆盖真值字段] 完成 V2 存储 CRUD 基线。
- [ ] 2.3 [P0][依赖:2.2][输入: 大体量写入样本][输出: 60MB 分片写入（`YYYY-MM-DD.partN.json`）][验证: 超阈值自动分片且文件可读] 实现大文件分片策略。
- [ ] 2.4 [P0][依赖:2.3][输入: 同日多分片数据][输出: 透明聚合读取逻辑][验证: list/get 结果与未分片语义一致] 实现分片无感读取。
- [ ] 2.5 [P1][依赖:2.2][输入: 并发读写场景][输出: 文件锁与原子落盘增强][验证: 并发写入无数据损坏] 强化一致性保障。
- [ ] 2.6 [P0][依赖:2.4][输入: 列表/详情读取诉求 + 原文大字段][输出: `MemoryListProjection` 与 `MemoryDetailPayload` 双读模型][验证: 列表接口不强制水合完整原文，详情接口可完整返回 canonical 字段] 建立 projection/hydration 分离读取路径。
- [ ] 2.7 [P0][依赖:2.4,2.5][输入: 大体量 JSON 读写与索引重建场景][输出: blocking worker 执行模型 + 坏分片隔离策略][验证: 阻塞 I/O 不占用 Tauri 命令主链路，单个损坏分片不影响其余数据读取] 完成存储底盘加固。

## 3. Capture + Fusion 幂等链路

- [ ] 3.1 [P0][依赖:1.2,2.1][输入: 现有发送事件与 assistant 完成事件][输出: V2 capture 入口（保持现有触发机制）+ turn snapshot resolver][验证: 发送后可产生待融合上下文，完成事件可定位当前 turn 快照] 对接 capture 入口。
- [ ] 3.2 [P0][依赖:3.1,2.2][输入: turn/message 生命周期事件][输出: `workspaceId+threadId+turnId/messageId` 幂等写入规则][验证: 重复完成事件不重复写入] 实现 fusion 幂等。
- [ ] 3.3 [P0][依赖:3.2][输入: 单轮问答数据 + turn 快照项][输出: 单轮绑定写入（问题/思考摘要/正文/操作记录）][验证: 每条记忆可追溯 turnId/messageId，缺失快照时可降级写入] 完成主写入路径。
- [ ] 3.4 [P1][依赖:3.3][输入: 操作事件流][输出: operationTrail 正序落库与 status/errorCode 规范化][验证: 时间线顺序与状态枚举正确，tool/command/file-change 映射稳定] 对齐操作记录标准。
- [ ] 3.5 [P1][依赖:3.3][输入: provisional capture 记录与 stale 场景][输出: 同运行期 stale recovery + 启动期 reconciliation][验证: 无法补齐 assistant 正文的 provisional 记录被静默清理] 完成中断恢复治理。
- [ ] 3.6 [P0][依赖:3.5,2.6][输入: 启动生命周期 + 后台任务调度][输出: reconciliation / 索引预热后台化执行策略][验证: 首屏渲染与消息发送不被后台任务阻塞] 完成启动期非阻塞治理。

## 4. 删除语义与空壳清理

- [ ] 4.1 [P0][依赖:2.2][输入: 详情删除交互需求][输出: 核心段独立删除接口（结构化 patch）][验证: userInput/thinkingSummary/assistantResponse 可独立删除，`detail` 不再作为自由编辑真值] 实现最小粒度删除能力。
- [ ] 4.2 [P0][依赖:4.1][输入: operationTrail 列表][输出: 单条 operation 删除接口][验证: 单条删除后无痕移除] 实现操作记录单条删除。
- [ ] 4.3 [P0][依赖:4.1,4.2][输入: 删除后二次状态][输出: 空壳静默自动删除整条记忆][验证: 核心段+操作均空时自动删除] 实现空壳清理。
- [ ] 4.4 [P1][依赖:4.1,4.2][输入: 删除确认交互][输出: 统一确认文案与不可撤销行为][验证: 删除确认后立即生效且无 Undo] 完成删除交互约束。
- [ ] 4.5 [P0][依赖:1.2,2.2][输入: V2 delete/update/get/list 命令合同][输出: typed payload 命令边界与内部路径解析约束][验证: 前端命令不传文件路径、不传 V1 `hardDelete` 开关，Rust 内部自行解析 shard 路径] 收紧破坏性命令边界。

## 5. 详情展示与复制体验

- [ ] 5.1 [P0][依赖:3.3][输入: 详情渲染组件][输出: 固定顺序只读渲染（问题->思考摘要->正文->时间线）][验证: 顺序不可重排，V2 详情不暴露自由编辑与保存入口] 落地详情结构。
- [ ] 5.2 [P0][依赖:5.1][输入: 折叠交互需求][输出: 四区块折叠/展开与默认展开策略][验证: 首次仅正文展开，其余折叠] 实现折叠规则。
- [ ] 5.3 [P0][依赖:5.1][输入: 空段场景数据][输出: thinking/operation 空段隐藏逻辑][验证: 空段不占位] 完成空段展示策略。
- [ ] 5.4 [P0][依赖:5.1,3.4][输入: operationTrail 超长数据][输出: 默认前 50 条 + 加载更多][验证: 分段加载正确且顺序稳定] 实现时间线分页展示。
- [ ] 5.5 [P1][依赖:5.1,3.3][输入: 复制按钮需求][输出: 所见即所得复制（含 status + turnId/messageId）][验证: 复制文本与可见内容一致] 完成复制能力。
- [ ] 5.6 [P0][依赖:5.1,2.6][输入: 超长 `userInput/assistantResponse` 详情数据][输出: `DetailChunkRenderer` 渐进式渲染能力][验证: 首个稳定文本块优先可见，剩余 chunk 按原顺序追加且详情保持可交互] 落地长文本渐进式渲染。
- [ ] 5.7 [P0][依赖:5.6,5.5][输入: 渐进式渲染中的折叠/切换/关闭场景][输出: chunk 任务取消与复制按钮加载态][验证: 卸载后无残留 state update，渲染未完成时复制暂不可用，完成后恢复可用] 完成长文本生命周期治理。

## 6. 列表筛选、搜索与性能

- [ ] 6.1 [P0][依赖:2.4][输入: 列表渲染层][输出: 默认 `updatedAt` 降序 + 有操作记录标记][验证: 排序与标记稳定显示] 完成列表基础语义。
- [ ] 6.2 [P0][依赖:6.1][输入: 筛选需求][输出: 有/无操作记录多选筛选 + 标记点击直达筛选][验证: 交互与结果一致] 完成筛选增强。
- [ ] 6.3 [P0][依赖:2.4,5.1][输入: 搜索需求][输出: 全字段搜索（user/thinking/assistant/trail）][验证: 多字段命中准确] 完成检索覆盖。
- [ ] 6.4 [P0][依赖:6.3][输入: 搜索输入事件][输出: 300ms 防抖 + 大小写不敏感匹配][验证: 防抖触发次数可控且结果正确] 实现搜索交互稳态。
- [ ] 6.5 [P1][依赖:6.3,5.1][输入: 命中结果数据][输出: 详情命中高亮（列表不高亮）][验证: 高亮仅在详情展示] 完成高亮策略。
- [ ] 6.6 [P1][依赖:2.4,6.3][输入: 启动生命周期][输出: 启动后自动重建索引缓存][验证: 首次搜索耗时下降且指标达标] 完成索引预热。
- [ ] 6.7 [P0][依赖:2.6,4.x,6.6][输入: create/update/delete 事件][输出: 列表投影与搜索索引增量失效/刷新机制][验证: 删除后列表、详情、搜索下一次读取即反映最新状态，无 stale 命中] 完成缓存一致性治理。

## 7. Win/mac 兼容与平台适配

- [ ] 7.1 [P0][依赖:1.1,2.2][输入: 文件路径与换行处理逻辑][输出: `PlatformAdapter` 封装层][验证: Win/mac 路径/换行行为一致] 抽离平台差异实现。
- [ ] 7.2 [P0][依赖:7.1,2.3][输入: Win/mac 分片读写样本][输出: 跨平台分片读写兼容修正][验证: 双平台读写回归通过] 补齐平台落盘兼容。
- [ ] 7.3 [P1][依赖:7.1][输入: 业务层文件操作调用][输出: 平台分支清理报告][验证: 业务层无散落平台 if/else] 完成平台逻辑收敛。

## 8. V2 直切与 V1 弃用收口

- [ ] 8.1 [P0][依赖:1.2,3.3,6.1][输入: 现有记忆入口路由][输出: 全入口切换到 V2][验证: 主流程不再命中 V1 逻辑] 完成 V2 直切。
- [ ] 8.2 [P0][依赖:8.1][输入: V1 相关调用点 + 旧 UI/CRUD 契约][输出: V1 弃用清单、旧 UI/CRUD 让步清单与防回流保护][验证: 新变更不再修改/调用 V1，旧 editable/soft-delete 语义不再回流] 固化 V1 弃用边界。
- [ ] 8.3 [P1][依赖:8.2][输入: 发布说明草案][输出: V2 变更公告与回退说明（版本级）][验证: 文档可用于发布沟通] 完成交付文档收口。

## 9. 验证门禁（必须通过）

- [ ] 9.1 [P0][依赖:2.x,3.x,4.x][输入: 后端变更][输出: Rust 单测与集成测试（模型/分片/幂等/删除）][验证: `cargo test` 通过] 完成后端质量门禁。
- [ ] 9.2 [P0][依赖:5.x,6.x,8.x][输入: 前端变更][输出: 前端测试（详情/删除/复制/筛选/搜索/高亮/渐进式渲染）][验证: `vitest` 目标用例通过] 完成前端质量门禁。
- [ ] 9.3 [P0][依赖:2.x,3.x,4.5][输入: `src/services/tauri.ts` 与 Rust command payload][输出: TS/Rust IPC 契约测试][验证: 前后端字段名、可选字段、枚举值一致，且 V2 delete/update/get/list 不暴露路径参数与 V1 `hardDelete` 开关] 完成命令合同门禁。
- [ ] 9.4 [P0][依赖:7.x][输入: Win/mac 兼容场景][输出: 双平台手测清单结果][验证: 双平台行为一致] 完成平台兼容验收。
- [ ] 9.5 [P0][依赖:9.1,9.2,9.3,9.4][输入: 全量候选版本][输出: 性能验收记录（P95 指标）][验证: 列表<=300ms、详情首个稳定文本块<=200ms、1k搜索<=500ms，且启动后台任务不拖慢首屏] 完成性能门禁。
- [ ] 9.6 [P0][依赖:6.7,9.2][输入: 删除/更新后的读模型行为][输出: stale 命中回归用例][验证: 已删段落、已删操作、已删整条记忆不再出现在列表/详情/搜索] 完成一致性门禁。
- [ ] 9.7 [P0][依赖:2.7,9.1][输入: 损坏分片与坏旧文件样本][输出: 容错回归用例][验证: 单个坏文件被隔离跳过，其余 list/get/search 正常返回] 完成容错门禁。
- [ ] 9.8 [P0][依赖:9.5,9.6,9.7][输入: 发布前构建][输出: typecheck/lint/build 全绿与回归报告][验证: `npm run typecheck && npm run lint && npm run build` 通过] 完成发布门禁。
