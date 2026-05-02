## Why

`add-model-selector-config-actions` 已经把 `Refresh Config` 接入 composer 模型选择器，用户可以在编辑 `~/.claude/settings.json` 后手动刷新当前 provider 的模型 catalog。

但 `ModelSelect` 仍会在 mount 时从 localStorage 读取一次 `CLAUDE_MODEL_MAPPING`，并优先使用这份缓存值作为 Claude 模型显示名。这样会造成一个状态漂移：父级已经刷新出新的 settings label，selector 仍可能继续显示旧的 localStorage mapping，用户看起来就像手动刷新没有生效。

## What Changes

- 让 `ModelSelect` 保持 presentational，只信任父级传入的 `models` catalog label。
- 移除 selector 内部对 `CLAUDE_MODEL_MAPPING` 的一次性读取和缓存。
- 增加回归测试，覆盖 stale localStorage mapping 不得覆盖刷新后的 parent-provided label。

## Scope

- Frontend only:
  - `src/features/composer/components/ChatInputBox/selectors/ModelSelect.tsx`
  - `src/features/composer/components/ChatInputBox/selectors/ModelSelect.test.tsx`
- 不新增 runtime command。
- 不改变 `Refresh Config` 的 provider 路由和 engine refresh 行为。
- 不改变 Claude settings 文件格式。

## Acceptance

- 当 localStorage 中存在旧 Claude model mapping，且父级 `models` prop 已传入新的 label 时，selector MUST 显示新的 parent-provided label。
- `ModelSelect` MUST 不再把旧 localStorage mapping 作为模型显示名 source of truth。
- 既有默认模型 i18n fallback 继续保持。
- `Refresh Config` 已有按钮与 loading 行为继续通过现有 tests。
