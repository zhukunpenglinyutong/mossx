## 1. Contract Discovery

- [x] 1.1 创建或关联 Trellis task 到 OpenSpec change `add-claude-reasoning-effort-support`，确保实现记录可追踪到本 change。输入：当前 OpenSpec change；输出：Trellis task 关联记录；验证：任务记录中明确引用该 change-id。依赖：无；优先级：P0。
- [x] 1.2 定位 Claude send params 的 TypeScript 类型、Tauri service mapping、Rust backend params 结构与 Claude engine `build_command` 入口；输出受影响文件清单并确认不复用 model catalog 字段。输入：现有 Claude 发送链路代码；输出：实现改动点清单；验证：`rg` 能定位 `effort` 需要穿透的所有边界。依赖：1.1；优先级：P0。
- [x] 1.3 确认现有 composer/provider selector 的 provider-scoped UI gating 模式；输出 reasoning selector 应挂载的位置与测试入口；UI 主标签使用 `思考强度`，空值状态表达为 `Claude 默认` 或等价文案，并保留 Codex 既有 reasoning selector 行为。输入：现有 composer UI 代码；输出：UI 接入点说明；验证：能指出 Claude、Codex 与无 reasoning provider 的分支条件。依赖：1.2；优先级：P0。

## 2. Frontend Implementation

- [x] 2.1 扩展 Claude send params TypeScript contract，新增可选 `effort` 字段并限制合法值为 `low | medium | high | xhigh | max`。输入：现有 send params 类型；输出：类型定义更新；验证：`npm run typecheck` 不出现新增类型错误。依赖：1.1；优先级：P0。
- [x] 2.2 在 Claude provider / Claude Code engine 下展示 reasoning effort selector，并确保 Gemini、OpenCode 等无 reasoning provider 不展示该控件，同时保留 Codex 既有 reasoning selector；selector 主标签使用 `思考强度`，未选择时展示 `Claude 默认` 或等价空值状态。输入：现有 composer/provider selector UI；输出：provider-scoped selector；验证：focused UI test 覆盖 Claude 展示、Gemini 隐藏、Codex 保留和空值展示。依赖：1.3、2.1；优先级：P0。
- [x] 2.3 将用户选择的 reasoning effort 写入 Claude message send payload；未选择时不写入有效 effort 值。输入：selector state 与 send handler；输出：send payload mapping；验证：focused frontend test 断言 `high` 被传递、空值不传递。依赖：2.2；优先级：P0。

## 3. IPC And Service Mapping

- [x] 3.1 更新 Tauri service / IPC mapping，确保 `effort` 从 frontend payload 保留到 backend command params。输入：service mapping 与 invoke payload；输出：保留 `effort` 的 mapping；验证：service mapping test 断言 `effort: "high"` 未丢失。依赖：2.1、2.3；优先级：P0。
- [x] 3.2 确认非 Claude send path 不接收或不转发 Claude-specific `effort`。输入：各 provider send mapping；输出：provider-scoped payload 行为；验证：focused test 断言非 Claude payload 不包含 Claude effort。依赖：3.1；优先级：P1。

## 4. Rust Claude Engine Implementation

- [x] 4.1 扩展 Rust Claude send params 结构以接收可选 `effort`，保持旧 payload 兼容。输入：backend params struct；输出：可反序列化 optional effort 字段；验证：现有 backend tests 继续通过。依赖：3.1；优先级：P0。
- [x] 4.2 在 Claude engine `build_command` 中添加 allowlist 校验，仅对 `low`、`medium`、`high`、`xhigh`、`max` 追加 `--effort <value>`。输入：Claude engine command builder；输出：安全 CLI args 拼接；验证：Rust unit test 覆盖全部合法值。依赖：4.1；优先级：P0。
- [x] 4.3 对缺失、空值、非法 effort 增加防护，确保不追加 `--effort` 且不把非法字符串写入 CLI args。输入：Claude engine command builder；输出：fail-soft invalid effort handling；验证：Rust unit test 覆盖缺失与非法值。依赖：4.2；优先级：P0。

## 5. Verification And Documentation

- [x] 5.1 增加或更新 frontend focused tests，覆盖 Claude selector 展示、非 Claude 隐藏、选择值进入 send payload、未选择不注入默认值。输入：frontend UI/send tests；输出：回归测试；验证：对应 Vitest suite 通过。依赖：2.2、2.3、3.1；优先级：P0。
- [x] 5.2 增加或更新 Rust focused tests，覆盖 allowed effort 到 `--effort <value>` 的映射、非法值忽略、缺失值不追加参数。输入：Rust Claude engine tests；输出：command building tests；验证：focused cargo test 通过。依赖：4.2、4.3；优先级：P0。
- [x] 5.3 执行 OpenSpec strict validation、TypeScript typecheck、相关 Vitest 与 Rust tests，并把验证证据写入实现记录或后续 verification artifact。输入：完成的实现与测试；输出：验证结果；验证：`openspec validate --all --strict --no-interactive`、`npm run typecheck`、focused Vitest、focused cargo test 均通过或记录明确阻塞原因。依赖：5.1、5.2；优先级：P0。
