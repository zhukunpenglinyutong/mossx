## 0. Planning Baseline

- [x] 0.1 [P0][输入: current Project Memory storage/retrieval code][输出: affected files map][验证: `rg -n "project_memory|MemoryReference|scoutProjectMemory|ProjectMemory" src src-tauri`][依赖:无] 梳理当前记忆存储、Memory Reference、retrieval pack 和 cleaner 链路。
- [x] 0.2 [P0][输入: provider constraints][输出: local embedding provider SPI decision][验证: design update][依赖:0.1] 明确 MVP 先实现 provider SPI + capability detection；无本地 provider 时 semantic status 为 unavailable，不得引入外部网络服务、向量数据库或未评审的大模型依赖。
- [x] 0.3 [P0][输入: current main specs][输出: spec conflict resolution note][验证: `rg -n "语义检索不在本变更实现" openspec/specs openspec/changes/project-memory-local-semantic-retrieval`][依赖:0.2] 明确本变更归档/同步时替换旧的“语义检索不在本变更实现”约束，避免主 spec 与 delta spec 冲突。
- [x] 0.Exit [P0][输出: artifacts valid][验证: `openspec validate project-memory-local-semantic-retrieval --strict --no-interactive`][依赖:0.1-0.3] OpenSpec strict pass。

## 1. Index Model And Lifecycle

- [x] 1.1 [P0][输出: embedding document builder][验证: unit tests][依赖:0.Exit] 实现 deterministic embedding document 构造，覆盖 title/tags/kind/userInput/assistantResponse/thinking/detail/cleanText。
- [x] 1.2 [P0][输出: local embedding provider SPI][验证: provider capability tests][依赖:1.1] 实现 providerId/modelId/dimensions/version/embed/health 合同；生产路径不得把 fake provider 识别为可用语义能力。
- [x] 1.3 [P0][输出: local embedding index schema/sidecar][验证: storage unit tests][依赖:1.2] 实现 workspace-local embedding index metadata 与 vector storage，不引入 vector DB。
- [x] 1.4 [P0][输出: contentHash/version lifecycle][验证: create/update/delete stale tests][依赖:1.3] 实现 create/update/delete/version/dimension 变化下的 stale 检测与清理。

## 2. Retrieval And Rerank

- [x] 2.1 [P0][输出: exact cosine scan][验证: vector scan tests][依赖:1.3] 实现当前 workspace 内 exact cosine scan，支持 topK。
- [x] 2.2 [P0][输出: hybrid candidate merge][验证: rerank tests][依赖:2.1] 合并 lexical 与 semantic candidates，按 memoryId 去重并保留 score components。
- [x] 2.3 [P1][输出: diagnostics][验证: debug payload tests][依赖:2.2] 输出 retrievalMode、score components、fallback reason，避免泄漏完整记忆正文。
- [x] 2.4 [P1][输出: local scan benchmark/guard][验证: 1k/5k/10k fixture or documented focused perf test][依赖:2.1] 给 exact scan 建立可重复性能边界；不得在发送路径同步全量重建索引。

## 3. Memory Reference Integration

- [x] 3.1 [P0][输出: Memory Reference semantic path][验证: hook/integration tests][依赖:2.2] 将 semantic retrieval 接入 Memory Reference 候选阶段，保持 retrieval pack payload 不变。
- [x] 3.2 [P0][输出: lexical fallback][验证: provider unavailable / stale index tests][依赖:3.1] semantic unavailable/error/stale 时回退 lexical，不阻塞发送。
- [x] 3.3 [P1][输出: golden query fixtures][验证: golden query tests][依赖:3.1] 建立模糊回忆查询黄金集，验证 top5 命中预期记忆。
- [x] 3.4 [P0][输出: prompt payload guard][验证: payload snapshot tests][依赖:3.1] 验证主会话 payload 不包含 vector、embedding document、internal score，只保留 retrieval pack / cleaner 结果。

## 4. Release Gates

- [x] 4.1 [P0][验证: focused vitest][输出: frontend/retrieval tests pass][依赖:3.1-3.3] 目标测试通过。
- [x] 4.2 [P0][验证: `npm run typecheck`][输出: TS pass][依赖:3.1] TypeScript 通过。
- [x] 4.3 [P0][验证: backend focused tests if Rust touched][输出: Rust pass or documented N/A][依赖:1.2] 如果触及 Rust/Tauri storage，运行对应 Rust 测试。
- [x] 4.4 [P0][验证: `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs && npm run check:heavy-test-noise`][输出: heavy-test-noise compatible][依赖:3.3] 确认 golden/perf 测试不产生大量 stdout/stderr、React act warning 或未断言调试输出。
- [x] 4.5 [P0][验证: `node --test scripts/check-large-files.test.mjs && npm run check:large-files:near-threshold && npm run check:large-files:gate`][输出: large-file compatible][依赖:1.3] 确认未提交大模型、大向量 fixture、生成索引文件或导致 `new/regressed` hard-debt 的超 policy 文件。
- [x] 4.6 [P0][验证: `openspec validate project-memory-local-semantic-retrieval --strict --no-interactive`][输出: OpenSpec strict pass][依赖:all] OpenSpec strict 通过。
- [x] 4.Exit [P0][输出: ready for implementation review][完成定义: 目标测试、typecheck、storage tests、CI governance sentries、OpenSpec strict 全部通过][依赖:4.1-4.6]
