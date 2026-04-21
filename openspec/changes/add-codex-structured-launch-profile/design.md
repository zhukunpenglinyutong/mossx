## Context

当前代码已经具备 Codex 启动配置的核心底座：

- global `codexBin` / `codexArgs`
- workspace `codex_bin`
- workspace `settings.codexArgs`
- worktree 对 parent workspace args 的继承
- `codex_doctor` 对 binary、wrapper、PATH、probe 的诊断

真正欠缺的是“可见性”而不是“能力从零实现”。因此 Phase 1 最稳的做法，是复用现有字段与启动链路，把已有能力整理成一个明确的 Launch Configuration 体验，而不是新增一套更强但更重的启动配置系统。

这也符合“不影响正常功能”的约束：当前 `spawn_workspace_session` 仍然只吃 `codex_bin + codex_args`，[现有链路稳定]( /Users/chenxiangning/code/AI/github/mossx/src-tauri/src/backend/app_server.rs:591 )；如果首期就加 env、Apply、external reload ownership、remote parity，会把 blast radius 明显扩大。

## Goals / Non-Goals

**Goals:**

- 复用现有 `bin + args` 持久化字段，建立清晰的 Launch Configuration UX。
- 让用户在保存前看到 effective launch context，而不是靠猜。
- 让 workspace override / worktree inherit 可见且可验证。
- 保证普通保存只影响下次启动，不打断当前正常功能。
- 保证未修改配置的用户行为不变。

**Non-Goals:**

- 不引入 `environment` 编辑能力。
- 不引入 `Apply to connected runtime`。
- 不新增 persisted settings schema。
- 不改变 external config reload 与 remote backend 语义。

## Decisions

### Decision 1: Phase 1 只支持 `executable + arguments`

**Decision**

- Launch Configuration 在 Phase 1 只覆盖：
  - `executable`
  - `arguments`
- 不支持 `environment`。

**Why**

- 现有运行时路径本来就围绕 `codex_bin + codex_args` 运作。
- env 会立刻带来 masking、merge、平台差异、remote transport 和敏感值治理，收益不如复杂度高。

**Alternative considered**

- 一步到位加 env：长期更完整，但本期不稳。

### Decision 2: Phase 1 复用现有 persisted fields，不做 schema migration

**Decision**

- AppSettings 继续使用 `codexBin` / `codexArgs`。
- Workspace 继续使用 `codex_bin` / `settings.codexArgs`。
- Phase 1 不新增 `CodexLaunchProfile` persisted schema。

**Why**

- 这是最稳的兼容路径。
- 现有 runtime、settings、daemon 同步链路已经依赖这些字段，直接复用能避免 migration 与双真值风险。

**Alternative considered**

- 新增完整结构化持久化模型：未来更优雅，但当前会明显扩大改动面。

### Decision 3: Preview 与 Doctor 共享同一套 resolution，但 Save 保持 next-launch only

**Decision**

- 新增或扩展 backend preview contract，用来返回：
  - resolved executable
  - wrapper kind
  - user args
  - injected args
- `codex_doctor` 与 preview 共用同一套 launch resolution。
- 保存只持久化，不自动 apply 到 active runtime。

**Why**

- Preview 解决“我将会执行什么”。
- Doctor 解决“为什么 GUI 和 Terminal 不一样”。
- Save 不触发 runtime 重启，才能确保“不影响当前正常功能”。

**Alternative considered**

- 只做 doctor：不能解决保存前门禁。
- Save 自动 apply：会把设置增强升级成 runtime 变更。

### Decision 4: Workspace override 沿用现有优先级，不重新设计继承模型

**Decision**

- 继续沿用现有优先级：
  - workspace `codex_bin` 高于 global `codexBin`
  - workspace `codexArgs` 高于 parent workspace args（仅 worktree）高于 global `codexArgs`
- Phase 1 只把该优先级显式展示出来。

**Why**

- 既有代码已经按这个方向工作，改动最小。
- 产品层要解决的是“可理解”，不是推翻当前优先级。

**Alternative considered**

- 重做成全新 profile inheritance：没有必要，也不稳。

### Decision 5: External reload 与 remote backend 在 Phase 1 保持现状

**Decision**

- 不修改 `reload_codex_runtime_config()` 语义。
- 不引入 remote backend preview/apply parity 改造。
- 若 remote 模式暂时不支持 preview，可在 UI 中降级为现状或隐藏该入口。

**Why**

- 这两块都属于额外 blast radius。
- 当前目标是先把本地桌面端 Launch Configuration 做稳，而不是顺便重构 reload / remote contracts。

**Alternative considered**

- 顺手一起改：容易把本期做成跨层重构。

## Interaction Contract

### Frontend Draft Model

frontend 可以使用轻量编辑态模型，但最终持久化仍映射回现有字段：

```ts
type CodexLaunchConfigurationDraft = {
  executable: string;
  arguments: string[];
};

type CodexLaunchConfigurationPreview = {
  resolvedExecutable: string;
  wrapperKind: "direct" | "cmd-wrapper" | "bat-wrapper";
  userArguments: string[];
  injectedArguments: string[];
  warnings: string[];
};
```

### Service / Tauri Contract

Phase 1 只需要 additive preview contract，不新增 apply contract：

- `codex_preview_launch_profile`
  - input: `codexBin`, `codexArgs`, `workspaceId?`
  - output: `CodexLaunchConfigurationPreview`

现有 `update_app_settings` 与 `update_workspace_settings` 继续负责保存；保存成功后默认下次启动生效。

## Risks / Trade-offs

- [Risk] 只做 `bin + args`，会让少数需要 env 的用户觉得能力不够  
  Mitigation: 明确这是 Phase 1，先解最普遍的 GUI/Terminal 启动不一致问题。

- [Risk] preview 与真正 runtime 行为漂移  
  Mitigation: preview 与 doctor 复用同一套 backend launch resolution，禁止 frontend 自行拼接。

- [Risk] remote 模式下 preview 能力不完整  
  Mitigation: Phase 1 不把 remote parity 当成功标准，必要时在 UI 上降级。

- [Risk] 用户误以为保存会立即生效  
  Mitigation: UI 文案明确标注“保存后下次启动生效，不影响当前连接”。

## Gates

### Save Gate

- executable / args 格式合法
- preview 成功返回 resolved launch context
- 保存动作不触发 active runtime restart

### No-Regression Gate

- 未修改设置的用户，其 effective launch 行为与当前版本一致
- worktree inheritance 不得回退
- current connected runtime 在保存后继续正常工作

### Observability Gate

- preview / doctor 必须返回相同的 resolved executable、wrapper kind、injected suffix
- 错误信息必须能区分字段格式错误与 runtime probe 错误

## Quality Gates

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `cargo test --manifest-path src-tauri/Cargo.toml`

targeted verification：

- TS:
  - Launch Configuration draft editing
  - preview 成功/失败
  - workspace inherit/override 展示
  - “下次启动生效”状态提示
- Rust:
  - launch resolution precedence
  - wrapper detection
  - preview contract
  - doctor / preview 一致性

## Migration Plan

1. 保持现有 persisted fields 不变。
2. 增加 backend preview contract，并复用现有 resolution / doctor 链路。
3. 更新 settings UI 与 workspace override UX。
4. 加上“next-launch only / 不影响当前连接”的用户提示。
5. 补齐 targeted tests 与基础门禁。

**Rollback**

- 若 preview contract 不稳定，可先仅保留现有 doctor 展示与文案优化。
- 不需要做数据回滚，因为 Phase 1 不引入新 schema。

## Open Questions

- remote 模式下 preview 是否直接隐藏，还是显示只读说明；实现时按现有 remote 设置体验选择成本更低的做法。
