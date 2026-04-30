## Context

Composer 模型选择器的手动刷新链路已经在父级完成：`ButtonArea` 解析当前 provider，`app-shell` / engine controller 负责刷新当前 provider 的 model catalog，再把刷新后的 `models` 传给 `ModelSelect`。

这次修复的缺口在 UI source of truth。`ModelSelect` 之前为了显示 Claude settings mapping，会在组件内读取并缓存 localStorage。该缓存只在 mount 时建立，既不会随 `Refresh Config` 重新读取，也会优先覆盖父级传入的 refreshed label。

## Decision

`ModelSelect` 不再读取 `CLAUDE_MODEL_MAPPING`。刷新后的 model label 由父级 model catalog 负责提供，selector 只做展示、选择和 footer action 交互。

## Rationale

- 符合 component guideline：`ModelSelect` 是 presentational component，runtime/config orchestration 留在父级。
- 符合 state guideline：同一份 model label 不在 component、localStorage、engine catalog 多处维护事实源。
- 避免为 `Refresh Config` 再补一套 localStorage event / storage listener，降低竞态和 stale cache 风险。

## Alternatives

| 方案 | 结论 | 原因 |
|---|---|---|
| 在 `ModelSelect` 里监听 localStorage / custom storage event | 不采用 | 会继续让 selector 持有第二份 source of truth，并复制父级 refresh 责任 |
| 点击刷新后强制 remount `ModelSelect` | 不采用 | 只能绕过当前 stale cache，不能修复 source-of-truth 边界 |
| 父级传入 refreshed `models`，selector 信任该 label | 采用 | 变更最小，边界清晰，测试可直接覆盖 |

## Validation

- 新增 focused regression test：旧 localStorage mapping 不覆盖 parent-provided refreshed label。
- 继续运行 `ModelSelect` / `ButtonArea` focused tests，确认 footer action 行为不回退。
- 运行 typecheck、targeted eslint 和 diff whitespace check。
