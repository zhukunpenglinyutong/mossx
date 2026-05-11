## 1. 规格与实现前核对

- [x] 1.1 [P0][Depends: proposal/design/specs] 核对主窗体现有全局入口、detached window 模式和窗口创建/聚焦工具；输出拟复用的入口位置与窗口 label，验证方式：记录相关文件路径与复用点。
- [x] 1.2 [P0][Depends: 1.1] 确定首批客户端说明文档模块清单，至少覆盖当前主导航可见模块；输出文档节点列表，验证方式：节点 id 唯一且树形层级满足一级模块 + 二级功能点。
- [x] 1.3 [P0][Depends: 1.2] 将 proposal 中“首批文档内容范围”列出的一级模块逐项映射到真实客户端入口或源码模块；输出映射表，验证方式：每个一级模块都有入口/源码依据或明确合并说明。
- [x] 1.4 [P0][Depends: 1.1] 建立边界守护清单，确认本 change 不新增远程文档请求、用户可编辑文档存储、settings schema、workspace schema、runtime 控制能力或新生产依赖；输出守护清单，验证方式：实现前后用 `rg` 核对新增调用点。
- [x] 1.5 [P0][Depends: 1.1] 建立 Windows/macOS 兼容性检查清单，覆盖 window label、route key、drag region、尺寸、focus、关闭、路径示例和 no-console 行为；输出检查清单，验证方式：每项都有代码验证或手动验证方式。

## 2. 文档数据契约

- [x] 2.1 [P0][Depends: 1.3] 新增客户端说明文档 TypeScript 数据类型，包含 id、title、summary、entry、features、workflow、notes、relatedModules、children 等只读字段；输出类型文件，验证方式：`npm run typecheck` 通过。
- [x] 2.2 [P0][Depends: 2.1] 新增首批内置说明文档数据；输出结构化文档数据文件，验证方式：单元测试断言根节点非空、id 唯一、每个可选中节点有用途和核心功能点。
- [x] 2.3 [P0][Depends: 2.2] 为每个可选中文档节点补齐模块定位、入口位置、核心功能点、注意事项和关联模块；输出完整内容数据，验证方式：数据完整性测试逐项断言必填字段。
- [x] 2.4 [P0][Depends: 2.2] 校验所有 window/document key 使用 ASCII kebab-case，且不包含中文、空格、路径分隔符或平台保留字符；输出校验 helper 或测试，验证方式：跨平台 key fixture 通过。
- [x] 2.5 [P1][Depends: 2.3] 新增文档节点查询与默认选中工具；输出 selector/helper，验证方式：覆盖默认节点、未知节点、空数据三类测试。

## 3. 独立窗口与入口

- [x] 3.1 [P0][Depends: 1.1,1.5] 新增或复用客户端说明文档 open-or-focus 窗口契约；输出打开/聚焦函数，验证方式：重复触发不会创建多个不可控窗口，且不使用 shell `open` / Windows `start` / 外部浏览器作为基础打开路径。
- [x] 3.2 [P0][Depends: 3.1] 在主窗体增加客户端说明文档入口；输出入口 UI 与事件绑定，验证方式：点击入口能打开或聚焦说明窗口，主窗体状态保持不变。
- [x] 3.3 [P1][Depends: 3.1] 为说明窗口配置独立 route / mount surface / window shell；输出窗口页面壳层，验证方式：窗口直接加载时能渲染可恢复初始状态，并在 Windows/macOS 下保持同一 window label 语义。
- [x] 3.4 [P1][Depends: 3.3] 处理 macOS drag region 与 Windows 标准窗口交互差异；输出 shell class/attribute 适配，验证方式：交互控件不被拖拽区域吞事件，Windows 不出现新增 console window。

## 4. 阅读界面

- [x] 4.1 [P0][Depends: 2.3,3.3] 实现左侧树形分类组件；输出树组件，验证方式：一级模块和二级功能点可展开、选择、保持可访问名称。
- [x] 4.2 [P0][Depends: 2.3,3.3] 实现右侧详情说明组件；输出详情组件，验证方式：展示用途、入口位置、核心功能点、关联模块，并按数据展示流程与注意事项。
- [x] 4.3 [P0][Depends: 4.1,4.2] 实现说明窗口布局与选择状态联动；输出完整窗口阅读 surface，验证方式：选择树节点后详情区更新且不残留旧内容。
- [x] 4.4 [P1][Depends: 4.3] 实现空数据、未知节点、内容缺失的可恢复状态；输出 fallback UI，验证方式：异常数据测试不白屏、不崩溃。
- [x] 4.5 [P1][Depends: 4.2] 补齐路径、命令、文件位置示例的 Windows/POSIX 双平台表述；输出文档内容更新，验证方式：内容测试或 snapshot 不出现单一 `/Users/...` 或单一 drive-letter 假设。

## 5. 样式与体验

- [x] 5.1 [P1][Depends: 4.3] 补充说明窗口 scoped CSS，保持左树右详情布局在常规窗口尺寸下可读；输出样式文件，验证方式：桌面窗口无明显溢出、空白带或遮挡。
- [x] 5.2 [P2][Depends: 5.1] 补充必要 i18n 文案或中文静态文案治理；输出文案更新，验证方式：入口、空状态和详情 section 标题一致可读。
- [x] 5.3 [P1][Depends: 5.1] 增加 Windows/macOS layout guard 或等价 focused UI 测试；输出测试，验证方式：窗口 shell class、drag region、交互控件和滚动区域契约被断言。

## 6. 测试与验证

- [x] 6.1 [P0][Depends: 2.1-4.5] 增加 focused Vitest tests，覆盖文档数据完整性、默认选中、树形选择、详情渲染、异常态、跨平台 key 校验；输出测试文件，验证方式：目标测试通过。
- [x] 6.2 [P0][Depends: 3.1-4.4] 增加窗口入口或 open-or-focus contract 测试；输出测试或 mock 验证，验证方式：重复点击复用窗口语义被断言，且基础打开路径不使用 shell/platform command。
- [x] 6.3 [P0][Depends: 6.1,6.2] 执行 `npm run lint`；输出命令结果，验证方式：无 ESLint 错误。
- [x] 6.4 [P0][Depends: 6.1,6.2] 执行 `npm run typecheck`；输出命令结果，验证方式：无 TypeScript 错误。
- [x] 6.5 [P0][Depends: 6.1,6.2] 执行 `npm run test`；输出命令结果，验证方式：JS 测试通过。
- [x] 6.6 [P0][Depends: 6.1,6.2] 执行 `npm run check:runtime-contracts`；输出命令结果，验证方式：runtime contract 检查通过。
- [x] 6.7 [P0][Depends: 3.1-3.4] 执行 `npm run doctor:win`；输出命令结果，验证方式：Windows doctor checks 通过。
- [x] 6.8 [P0][Depends: 3.1-3.4] 执行 `cargo test`，工作目录为 `src-tauri`；输出命令结果，验证方式：Rust 测试通过。
- [x] 6.9 [P1][Depends: 3.3,3.4] 若实现涉及 Tauri window command、Tauri config 或 macOS window shell，执行 `npm run tauri -- build --debug --no-bundle`；输出命令结果，验证方式：macOS debug build 通过。
- [x] 6.10 [P0][Depends: 1.4] 执行边界守护 `rg` 检查，确认未新增远程文档请求、iframe、第三方文档 SDK、settings/workspace schema 和 runtime 控制调用；输出检查命令与结果。

## 7. OpenSpec 收尾

- [x] 7.1 [P0][Depends: 1-6] 执行 `openspec validate add-client-module-documentation-window --strict --no-interactive`；输出验证结果，验证方式：change strict validation 通过。
- [x] 7.2 [P1][Depends: 7.1] 实现完成后同步主 specs 并准备归档；输出 synced spec 与 archive 前检查结果，验证方式：`openspec validate --all --strict --no-interactive` 通过。
