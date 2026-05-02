# Cross-Layer Thinking Guide（跨层思考指南）

## mossx 的主链路

```text
React Component
  -> Feature Hook
  -> Service Wrapper (src/services/tauri.ts)
  -> Tauri Command (Rust)
  -> Storage / Engine Runtime
  -> Response Mapping
  -> UI State + Render
```

## 高风险边界（High-Risk Boundaries）

- hook <-> `services/tauri.ts`
- `services/tauri.ts` <-> Rust command 参数/字段
- client storage <-> runtime default/fallback
- i18n key <-> UI copy fallback

## 变更前必做

1. 列出所有受影响 command/event/payload 字段。
2. 明确 request 与 response 的 mapping 方向。
3. 定义 fallback（Tauri 不可用 / web-service mode）。
4. 先定义验证策略再写代码。

## 常见失败模式

- 前端字段名改了，service mapping 没更新。
- optional 字段被当 required 使用。
- `undefined` 与显式空集合（如 `[]`）被错误地当成同一语义，导致 fallback 误吃全量数据。
- retry 流程非 idempotent，触发重复副作用。
- listener 未清理，导致重复触发。

## Optional Payload Contract

- 对 optional collection payload 必须显式区分三种状态：
  - `undefined` / `None`：调用方未提供 scope，允许 backend 使用既有 fallback。
  - `[]` / `Some([])`：调用方显式清空 scope，backend MUST 保持空结果，禁止回退到全量 diff。
  - `["a", "b"]` / `Some([...])`：调用方提供显式 scope，backend MUST 只处理该集合。
- 如果 UI 有“默认选中”与“用户手动清空后为空”两种空态，hook/service 层必须保留这个差异，不能只看当前集合内容。
- 涉及 path scope 的 payload，frontend 与 backend 必须共享 normalize contract，至少统一 `\\` / `/`、leading slash 与 trailing slash 处理。

## 最低验证集（Minimum Verification）

- `src/services/tauri.test.ts` payload mapping 测试。
- 对应 feature hook/component 的 error + edge case 测试。
- 至少覆盖一次“显式空 scope 不回退”的 UI + backend 回归测试。
- contract 相关命令：

```bash
npm run check:runtime-contracts
npm run doctor:strict
```

## PR 记录要求

- 标注 cross-layer 影响面。
- 标注关键 mapping 变更点。
- 标注验证结果与剩余风险。
