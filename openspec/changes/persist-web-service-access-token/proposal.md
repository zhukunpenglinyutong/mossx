## Why

当前 Web Service 每次启动都会生成新的随机访问 token。对于把桌面端长期部署在固定机器、从手机/平板/其它电脑访问 Web UI 的用户，重启 ccgui 或 daemon 后必须回到桌面端重新复制 token，同一客户端无法长期复用配置。

daemon 侧已经支持启动时接收调用方传入的 token；本变更只补齐 settings 持久化与 UI 启动透传，降低远程访问的重复配置成本，同时保留默认随机 token 的安全预期。

## 目标与边界

### 目标

- 允许用户在 Web Service 设置中显式配置固定访问 token，并持久化到 `AppSettings`。
- 启动 Web Service 时将固定 token 传给 daemon，使 stop/start、daemon 重启、应用重启后 token 保持不变。
- 默认仍保持“自动生成”模式：用户未填写固定 token 时，每次启动继续由 daemon 生成随机 token。
- 提供清晰的 token 轮换入口，便于用户怀疑泄露时生成新固定 token。
- 继续复用现有 Web Service token 掩码、显隐、复制与鉴权展示语义。

### 边界

- 本变更只覆盖 Web Service 访问 token 的 settings 持久化、UI 编辑和启动透传。
- 固定 token 是用户显式选择；系统不会在默认自动生成模式下偷偷把 daemon 生成的 token 写回 settings。
- token 仍存储在本地 `AppSettings` 中，安全边界沿用现有本地配置文件权限模型。
- 不改变 daemon RPC token、`remoteBackendToken`、`backendMode`、Web API/WebSocket 鉴权算法或授权范围。

## 非目标

- 不引入 OAuth/JWT/多用户/角色权限系统。
- 不实现 token 加密存储或系统 keychain 集成。
- 不改变默认启动行为为“首次生成后自动固定”。
- 不新增公网部署、TLS、反向代理或多实例管理能力。
- 不重构 Web Service runtime 或 daemon lifecycle。

## What Changes

- `AppSettings` 增加可选 `webServiceToken` 字段，用于保存用户显式配置的固定 Web Service 访问 token。
- Web Service 设置面板增加“固定访问 token / 自动生成”编辑能力：
  - 空值表示自动生成。
  - 非空值表示启动时复用该 token。
  - 提供生成新 token 的轮换动作并保存为固定 token。
- `startWebServer` 调用从 `startWebServer({ port })` 改为在存在固定 token 时传入 `token`。
- UI 文案明确区分：
  - 当前运行中的 runtime token。
  - 下次启动会使用的固定 token 设置。
- 保持已运行服务的 token 展示、复制和鉴权语义不变。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | daemon 每次自动生成 token 后，前端写回 `AppSettings`，后续自动复用 | 老用户无需主动配置即可获得持久 token | 改变默认安全语义；一次启动后的随机 token 会静默变成长期凭据；与“默认自动生成”预期冲突 | 不采用 |
| B | 用户显式配置固定 token；空值继续自动生成；启动时只在非空时透传 token | 默认行为不变；安全边界清晰；实现面最小，复用 daemon 现有 token 参数 | 用户需要主动设置一次固定 token | **采用** |
| C | 引入 keychain/secret store 保存 token | 本地凭据保护更强 | 跨平台实现与迁移成本高，超出本 issue 的体验修复范围 | 后续单独评估 |

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `client-web-service-settings`: Web Service 设置需要支持显式持久化访问 token，并在启动时复用该 token；默认自动生成语义必须保持不变。

## 验收标准

- 用户未配置固定 token 时，启动 Web Service MUST 继续不传 token，由 daemon 自动生成运行期 token。
- 用户配置固定 token 并保存后，启动 Web Service MUST 将该 token 传给 daemon，返回的 runtime token MUST 与配置值一致。
- stop/start、daemon 重启或应用重启后，只要 settings 中固定 token 未变，Web Service MUST 继续使用相同 token。
- 用户清空固定 token 后，下一次启动 MUST 恢复自动生成模式。
- 用户点击生成/轮换 token 后，系统 MUST 写入一个非空固定 token，并在后续启动中复用。
- 用户点击生成/轮换 token 后，系统 MUST 使用安全随机来源生成固定 token，不得使用 `Math.random()` 或可预测伪随机来源。
- UI MUST 明确提示固定 token 保存于本地设置，且空值表示自动生成。
- 现有 runtime token 掩码显示、显隐、复制、鉴权失败/成功语义 MUST 保持不变。
- diagnostics bundle、日志和错误信息 MUST NOT 泄漏 `webServiceToken` 原值，最多只能暴露是否已配置。
- `backendMode`、`remoteBackendToken` 与 daemon RPC control plane MUST 不受该设置改动影响。

## Impact

- Frontend:
  - `src/features/settings/components/settings-view/sections/WebServiceSettings.tsx`
  - `src/features/settings/components/settings-view/sections/WebServiceSettings.test.tsx`
  - `src/features/settings/hooks/useAppSettings.ts`
  - `src/services/tauri.ts`
  - `src/types.ts`
  - `src/i18n/locales/en.part1.ts`
  - `src/i18n/locales/zh.part1.ts`
- Backend / settings schema:
  - `src-tauri/src/types.rs`
  - settings serialization/default handling tests if present
- Specs:
  - `openspec/specs/client-web-service-settings/spec.md` modified through this change delta
- Dependencies:
  - No new runtime dependency expected; token generation should use existing browser/Rust facilities or an already-present utility.
