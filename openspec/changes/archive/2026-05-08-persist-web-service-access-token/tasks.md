## 1. Settings Contract（P0）

- [x] 1.1 [P0] 在前端 `AppSettings` 类型与默认 settings normalize 流程中增加 `webServiceToken: string | null`；验证：相关 TypeScript 类型检查通过。
- [x] 1.2 [P0] 在 Rust `AppSettings` 中增加 `web_service_token: Option<String>`，使用 `serde(default, rename = "webServiceToken")` 保持旧配置兼容；验证：settings 反序列化/默认值测试或 targeted Rust test。
- [x] 1.3 [P0] 增加 token normalization helper：缺失、空串、纯空白统一为 `null`，非空保存 trimmed 值；验证：focused unit test 覆盖边界。
- [x] 1.4 [P0] 更新 diagnostics/settings summary 脱敏逻辑：不得输出 `webServiceToken` 原值，最多输出 `hasWebServiceToken`；验证：diagnostics targeted test 断言序列化结果不包含固定 token。

## 2. Web Service Settings UI（P0）

- [x] 2.1 [P0] 在 `WebServiceSettings` 增加固定访问 Token 输入与说明文案，空值明确表示自动生成；验证：组件测试能看到固定 token 设置入口。
- [x] 2.2 [P0] 实现保存/清空固定 Token，调用既有 `onUpdateAppSettings` 并避免改写其它 settings 字段；验证：组件测试断言保存 payload。
- [x] 2.3 [P0] 实现生成/轮换固定 Token 动作，使用 Web Crypto、Rust UUID 或既有安全随机工具生成 token，禁止 `Math.random()`；验证：组件测试断言 token 非空且后续 start 会复用，代码审计确认随机源安全。
- [x] 2.4 [P1] 区分固定 Token 设置与当前运行期 Token 展示，避免用户误解为立即替换已运行服务 token；验证：文案和测试快照/文本断言。

## 3. Start Flow Integration（P0）

- [x] 3.1 [P0] 修改 `handleStart`，启动时将 normalized `appSettings.webServiceToken` 作为 `startWebServer` 的 `token` 参数传入；验证：固定 token 场景组件测试断言调用参数。
- [x] 3.2 [P0] 自动生成模式下启动时不传固定 token 或传 `null`，且不把返回的 runtime token 写回 settings；验证：组件测试断言 `onUpdateAppSettings` 未收到 runtime token。
- [x] 3.3 [P0] 保持端口保存、状态刷新、runtime token 掩码/显隐/复制现有行为；验证：现有 WebServiceSettings 测试继续通过。
- [x] 3.4 [P0] 验证 token 生效边界：stopped 状态下新固定 token 随下一次 Start 生效，running 状态下保存/清空/轮换不隐式替换当前 runtime token；验证：组件测试或集成测试覆盖两种状态。

## 4. Localization and Copy（P0）

- [x] 4.1 [P0] 补齐中英文 i18n：固定 token label、说明、清空、生成/轮换、next-start 生效提示；验证：settings 测试环境 key 不缺失。
- [x] 4.2 [P1] 文案明确 token 保存在本地设置中，安全边界沿用本地配置文件权限；验证：人工检查或文本断言。

## 5. Verification（P0）

- [x] 5.1 [P0] 运行 `pnpm vitest run src/features/settings/components/settings-view/sections/WebServiceSettings.test.tsx`。
- [x] 5.2 [P0] 运行 `npm run typecheck`。
- [x] 5.3 [P0] 如修改 Rust settings schema，运行对应 targeted Rust tests；若无 focused test，至少运行 `cargo test --manifest-path src-tauri/Cargo.toml settings` 或说明替代验证。
- [x] 5.4 [P0] 运行 diagnostics 脱敏 targeted test，确保固定 token 不进入 support bundle/settings summary。
- [x] 5.5 [P0] 运行 `openspec validate persist-web-service-access-token --strict --no-interactive`。
