## Context

当前实现把五个语义不同的字段统一挂在 `src-tauri/src/codex/config.rs` 的 `[features]` 读写器之上，并在 `src-tauri/src/shared/settings_core.rs` 中做双向同步：

- `collab`
- `collaboration_modes`
- `steer`
- `unified_exec`
- `collaboration_mode_enforcement`

实际代码审计后，这五个字段属于三类：

1. dead / historical flag
   - `collab`
2. app-local product/runtime settings
   - `collaboration_modes`
   - `steer`
   - `collaboration_mode_enforcement`
3. official Codex config passthrough
   - `unified_exec`

当前 bug 的根因不是单个字段写错，而是 ownership model 错了：桌面端把私有交互开关和官方 CLI 配置放进同一个 external config bridge，并允许外部 `config.toml` 继续反向覆盖 app settings。这个设计会破坏 runtime reload、settings restore、UI gating 和 safety enforcement 的 source-of-truth。

## Goals / Non-Goals

**Goals:**

- 为这五个字段建立稳定的 ownership boundary。
- 停止私有字段与 external config 的双向同步。
- 保留仍有行为价值的本地功能，但把它们收回 app-local settings。
- 让 `unified_exec` 作为唯一官方 passthrough 项独立保留。
- 让实现可以按低风险迁移方式落地，不需要一次性改动大面积架构。

**Non-Goals:**

- 不重构整个 Codex settings 模块。
- 不修改 collaboration mode、steer、mode enforcement 的功能效果。
- 不自动清理用户已有 `config.toml` 中的历史私有字段。
- 不在本轮定义新的 provider 级 feature flag 系统。

## Decisions

### Decision 1: 将 ownership 按 official / private / dead 三类拆开

**Decision**

- `collab` 归类为 dead flag，不再参与任何 external config 同步与真实行为链路。
- `collaboration_modes`、`steer`、`collaboration_mode_enforcement` 归类为 app-local settings。
- `unified_exec` 归类为 official Codex config passthrough。

**Why**

- 这是与当前代码真实用途最一致的分类，不需要为了“形式统一”继续维持错误同步。
- 它能同时解释 issue 现象和后续实现边界。

**Alternative considered**

- 全部保留 external config 同步：兼容表面一致，但 ownership 继续错误。
- 全部移出 external config：更干净，但会把 `unified_exec` 从官方配置面割裂出去。

### Decision 2: 停止读取 private flags 对 app settings 的反向覆盖

**Decision**

- `get_app_settings_core()` 和相关 restore/reload 路径不再从 external `config.toml` 读取：
  - `collab`
  - `collaboration_modes`
  - `steer`
  - `collaboration_mode_enforcement`

**Why**

- 只停写不够；如果继续读，用户外部文件中的历史残留仍会污染 app settings。
- app-local 开关应只由本地 settings 文件控制。

**Alternative considered**

- 停写但保留读兼容：短期看似平滑，但会让历史遗留继续产生不可预测覆盖。

### Decision 3: `unified_exec` 保留为显式 passthrough，而不是混在“实验开关同步”里

**Decision**

- `unified_exec` 继续允许通过桌面端 settings 显式写入 external Codex config。
- 该通路在实现与文案上单列，不再通过“批量 feature flag 同步”隐式处理。

**Why**

- 它与官方当前配置面仍然一致，完全移除会削弱桌面端对官方 config 的可管理性。
- 但它必须和私有字段分开，否则用户仍会误解哪些字段属于官方。

**Alternative considered**

- 继续复用通用 `write_feature_flag()` 批量同步接口：简单，但语义继续模糊。
- 一并删除 passthrough：边界最纯，但会损失已存在的用户价值。

### Decision 4: `experimentalCollabEnabled` 从产品面退出，而不是保留一个无行为的“多代理”假开关

**Decision**

- 设置页不再把 `experimentalCollabEnabled` 作为真实能力开关继续对外暴露。
- 若出于兼容需要保留序列化字段，则它只作为 inert legacy field，不进入行为链和 external config。

**Why**

- 当前审计没有发现它控制任何真实行为。
- 保留一个无效的“多代理”开关只会继续制造认知噪音。

**Alternative considered**

- 先不动 UI，只停 config 同步：实现更小，但继续暴露假能力。

### Decision 5: 迁移策略采用“停止同步 + 忽略旧值”，不自动改写用户历史配置

**Decision**

- 本次迁移不自动删除用户 `config.toml` 中历史私有字段。
- 新版本只停止继续写入，并在读取时忽略它们。

**Why**

- 自动清理会对用户外部文件造成静默写入，风险与争议都更高。
- “停止污染 + 忽略旧值”已经能解决主问题，并且回滚简单。

**Alternative considered**

- 启动时自动清理旧键：更彻底，但对外部文件侵入性过高。

## Risks / Trade-offs

- [Risk] 用户历史 `config.toml` 中仍会残留旧字段，造成肉眼可见噪音
  - Mitigation: 停止继续写入，并在 settings 文案或 release notes 中说明这些字段已不再被桌面端消费。

- [Risk] 将 `experimentalCollabEnabled` 移出 UI 可能影响少量依赖旧截图或习惯的用户
  - Mitigation: 如需兼容，可先移除行为与同步，再在 UI 层做一次性收口。

- [Risk] `unified_exec` 单独保留 passthrough 后，settings 代码路径会出现“私有开关”和“官方开关”两条分支
  - Mitigation: 明确抽出 official passthrough helper，避免再走批量 feature 同步。

- [Trade-off] 本方案不追求一次性清理所有历史字段，而是优先保证 source-of-truth 正确
  - 这是有意取舍。当前目标是先修 ownership boundary，再视需要追加历史清理。

## Migration Plan

1. 在 Rust config bridge 中拆分 private flags 与 official passthrough。
2. 移除 settings_core 对四个 private flags 的 external read/write。
3. 将 `experimentalCollabEnabled` 从真实能力面退出。
4. 更新 settings 文案，明确哪些是 app-local，哪些是 official Codex config。
5. 补充回归测试：
   - private flags 不再写入 external config
   - historical private flags 不再覆盖 app settings
   - `unified_exec` 仍可显式透传
6. 通过 lint/typecheck/test 与相关 targeted verification。

**Rollback**

- 若 `unified_exec` 单独 passthrough 路径出现问题，可先保守回退为“完全停止 external feature 同步”，不恢复 private flags 双向同步。
- 若 UI 收口引发兼容风险，可临时保留 inert field，但继续禁止其进入行为链和 external config。

## Open Questions

- 暂无阻断实现的开放问题。
- 可选后续项：是否在后续 change 中追加一个“历史 private flags 清理工具或提示”。
