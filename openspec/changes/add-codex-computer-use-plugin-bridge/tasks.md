## 0. 实施批次

### Batch A [P0] Bridge foundation

- [x] A.1 新增 backend `computer_use` 模块骨架与 typed status contract；输入：proposal/design/specs，输出：独立模块目录与状态模型定义，验证：command registry 可编译接线且旧命令不回归
- [x] A.2 新增 frontend `computer-use` feature facade 与 `src/services/tauri/computerUse.ts`；输入：后端 status contract，输出：前端统一调用入口，验证：不直接在 feature 内 `invoke()`，类型通过
- [x] A.3 接入整块 feature flag / kill switch；输入：bridge 模块入口，输出：可完全关闭的 capability gate，验证：关闭后不触发 discovery、UI 不误报可用

### Batch B [P0] Official plugin discovery

- [x] B.1 实现对 `~/.codex/config.toml` 中 marketplace/plugin 启用状态的只读发现；输入：本机 Codex 配置，输出：plugin detected/enabled 基础字段，验证：已安装/未安装两类样本返回稳定结果
- [x] B.2 实现对官方 plugin cache / manifest / helper 路径的只读解析；输入：本机官方安装目录与 cache，输出：plugin metadata 与 helper presence 结果，验证：不得复制、重打包或写回官方资产
- [x] B.3 统一 `ready / blocked / unavailable / unsupported` 状态模型、判定优先级与最小 blocked reason 枚举；输入：discovery 结果，输出：前后端共享状态对象，验证：状态映射单测覆盖主要分支且优先级稳定
- [x] B.4 固化 `ready` 严格判定；输入：Phase 1 最小前置条件 contract，输出：严格 ready gate，验证：缺少 Codex App、plugin、plugin enablement 或存在未确认关键前置条件时均不能返回 `ready`

### Batch C [P0] Platform adapters

- [x] C.1 新增 `macOS` adapter，收敛 Codex App、plugin、cache、helper 与桥接前置条件判断；输入：macOS 本机布局，输出：结构化 readiness / blocked reason，验证：macOS 样本路径与缺失路径都可诊断
- [x] C.2 新增 `Windows` adapter，统一返回 unsupported contract；输入：Windows 平台识别，输出：显式 unsupported 结果，验证：不会尝试解析任何 macOS helper/bundle 路径
- [x] C.3 将平台选择收口到 backend adapter layer；输入：运行平台，输出：单一 platform dispatch，验证：macOS/Windows 分流测试通过，互不串线

### Batch D [P1] Availability surface

- [x] D.1 在设置页或等价入口挂载 Computer Use status surface；输入：frontend facade 与状态模型，输出：独立状态面板，验证：未进入该面板时不触发 bridge 初始化
- [x] D.2 展示 platform、Codex App、plugin detected/enabled、availability status 与 guidance；输入：结构化后端结果，输出：面板渲染与文案，验证：`blocked/unavailable/unsupported` 三类状态有清晰表达
- [x] D.3 完成 `Windows` unsupported 文案与交互收敛；输入：Windows adapter 结果，输出：不误导的 unsupported UI，验证：无启用/安装完成类误导动作
- [x] D.4 明确 Phase 1 status-only UI 边界；输入：surface 设计与 future activation lane 预留位，输出：仅状态表达与 guidance 的面板，验证：不存在真实 helper invoke 入口

### Batch E [P1] Verification and regression guard

- [x] E.1 为 discovery、status mapping、platform dispatch 增加 targeted tests；输入：backend/frontend 新增模块，输出：覆盖关键状态分支的测试，验证：相关测试稳定通过
- [x] E.1.a 增加 false-positive guard tests；输入：unverified helper/permission/approval 场景，输出：禁止误报 `ready` 的测试，验证：相关场景固定返回 `blocked`
- [x] E.2 执行基础质量门禁；输入：完整接线代码，输出：lint/type/test/cargo test 结果，验证：`npm run lint`、`npm run typecheck`、`npm run test`、`cargo test --manifest-path src-tauri/Cargo.toml` 通过
- [ ] E.3 手测最小矩阵；输入：macOS 已安装官方 Codex 的环境与一台 Windows 环境，输出：状态截图与行为记录，验证：macOS 正确识别 ready/blocked，Windows 固定 unsupported，现有功能无回归

## 1. 回滚策略

- [ ] R.1 若 bridge discovery 影响现有设置或 Codex 主流程，优先通过 feature flag 整块关闭 Computer Use module
- [ ] R.2 若 `macOS` helper 桥接性判断不稳定，先保留 availability surface，回退真正执行桥入口
- [ ] R.3 若平台分流出现误判，先收敛到只读状态展示，禁止任何后续 bridge activation
