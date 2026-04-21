## Context

昨天归档的 `codex-config-flag-boundary-cleanup` 选择保留 `unified_exec` 作为唯一 official passthrough 项；这个决定解决了私有 feature flags 污染问题，但没有解决更深一层的 ownership 问题：桌面端仍然把用户全局 `~/.codex/config.toml` 当成自己设置保存链路的一部分。

结果有两个副作用：

- 在 macOS / Linux 上，产品默认值仍是 `false`，与官方“非 Windows 默认启用”相反。
- 用户改任意设置时，桌面端可能顺手把 `unified_exec = false` 写进 global config，造成“产品默认值覆盖官方默认值”的反直觉行为。

这次 follow-up 不再讨论 private flags；它只处理 `unified_exec` 的 source-of-truth：官方默认值是 baseline，桌面端只提供显式 override 和修复旧污染配置的受控入口。

## Goals / Non-Goals

**Goals:**

- 把 unified_exec 设置模型从布尔 passthrough 改成三态 policy。
- 停止通用 settings save / restore 对 global config 的静默写入。
- 让显式 override 只作用于桌面端启动的 runtime。
- 为 legacy global `unified_exec` 污染提供显式 repair UX。
- 让 external reload 语义与新 policy 一致。

**Non-Goals:**

- 不重做整个 Codex settings persistence。
- 不回滚昨日对 private flags ownership 的结论。
- 不自动批量清理用户外部 config。
- 不依赖新增 provider 或跨引擎抽象层。

## Decisions

### Decision 1: 将 unified_exec 语义升级为三态 app-local policy，而不是布尔 passthrough

**Decision**

- 引入三态 unified_exec policy：
  - `inherit`
  - `force_enabled`
  - `force_disabled`
- `inherit` 代表“跟随官方平台默认和 external config”。
- `force_enabled` / `force_disabled` 代表用户对桌面端 runtime 的显式 override。

**Why**

- 布尔值无法区分“用户明确禁用”和“产品默认值恰好是 false”。
- 三态模型才能表达“官方默认优先”与“桌面端显式 override”这两个同时存在的需求。

**Alternative considered**

- 保留布尔值并加平台默认：无法表达 inherit，迁移后仍会误把旧 `false` 当成用户意图。
- 完全交给 external config：边界更纯，但会丢失桌面端对 runtime override 的产品控制。

### Decision 2: legacy 布尔值迁移采用“true 显式保留，false 回落 inherit”

**Decision**

- 当新三态字段缺失时：
  - 旧 `experimentalUnifiedExecEnabled = true` 迁移为 `force_enabled`
  - 旧 `experimentalUnifiedExecEnabled = false` 迁移为 `inherit`

**Why**

- 旧版本大量 `false` 来自产品默认值，不代表用户真实意图。
- 如果把旧 `false` 直接迁移成 `force_disabled`，会把旧 bug 继续固化到新模型。

**Alternative considered**

- `false -> force_disabled`：保守但会延续错误默认。
- 统一全部迁移为 `inherit`：会吞掉旧用户主动开启 `true` 的明确意图。

### Decision 3: 普通 settings save / restore 不再写 global config；explicit override 改为 launch-scoped runtime override

**Decision**

- 从 `update_app_settings` 和 restore 链路中移除 unified_exec global config 写回。
- 在 Codex runtime 启动 / refresh 时，根据三态 policy 施加 launch-scoped override。
- 实现优先级：
  - 优先使用 CLI / launch 参数级 override
  - 若 CLI 合约要求文件型配置，则使用临时、受控、仅对本次 runtime 生效的配置载体

**Why**

- 这是把 override 约束在“桌面端启动的 runtime 范围”内的唯一可靠方式。
- 它能避免任意设置保存污染用户 global config，同时保留 explicit override 的即时生效能力。

**Alternative considered**

- 继续写 global config：实现简单，但 ownership 错误。
- 每次都要求用户手动编辑 `~/.codex/config.toml`：边界清楚，但产品不可用。

### Decision 4: external config reload 仅在 inherit 模式消费 unified_exec external value

**Decision**

- inherit 模式：
  - reload / restore 继续读取 external `unified_exec`
- explicit override 模式：
  - reload / restore 不再让 external `unified_exec` 覆盖桌面端 policy
  - runtime 行为由 explicit override 优先

**Why**

- inherit 的定义就是“外部官方配置仍然是 source-of-truth”。
- 一旦进入 explicit override，桌面端必须对自己启动的 runtime 负责，否则 reload 会把 override 重新冲掉。

**Alternative considered**

- reload 总是读取 external config 并覆盖桌面端：会让 explicit override 失效。
- reload 完全忽略 external unified_exec：会把 inherit 模式做残废。

### Decision 5: 对 legacy global `unified_exec` 污染使用显式 repair UX，而不是自动清理

**Decision**

- 当检测到 external config 中存在显式 `unified_exec` key，且当前策略为 inherit 时，桌面端展示 repair 提示：
  - keep current override
  - restore official default
- 只有用户确认 `restore official default` 后，才允许修改 global config。

**Why**

- 旧版本已经可能把 accidental `false` 写进了用户全局配置。
- 自动删除虽然“更干净”，但会再次越权改用户文件，并引入不可逆副作用。

**Alternative considered**

- 自动删 key：最彻底，但侵入性过高。
- 完全不提示：旧污染会持续影响 inherit 模式用户。

## Risks / Trade-offs

- [Risk] launch-scoped override 需要和当前 Codex CLI 启动链路对齐，可能引入一条新的 runtime 参数注入分支  
  Mitigation: 优先复用现有启动参数拼装点，并提供临时配置文件 fallback。

- [Risk] legacy `false -> inherit` 的迁移会让极少数真正想强制禁用的用户失去旧行为  
  Mitigation: repair / selector 首次可见，且 force disable 操作成本很低。

- [Risk] repair 提示过早或过频会带来 UX 噪音  
  Mitigation: 仅在检测到显式 external key 且策略为 inherit 时展示，用户确认后本地记忆 dismissal。

- [Trade-off] 本方案接受“用户 global config 里可能暂时仍有旧键残留”，换取不再静默写文件  
  这是有意选择：先修 ownership，再提供受控修复。

## Migration Plan

1. 新增 unified_exec 三态字段并保留 legacy bool 兼容读取。
2. 在 TS / Rust normalization 中实现 `true -> force_enabled`、`false -> inherit` 的迁移规则。
3. 从 `update_app_settings` / restore 中移除 unified_exec global config 写回。
4. 在 Codex runtime 启动 / refresh 链路注入 launch-scoped override。
5. 更新 settings UI 为 tri-state selector，并增加平台默认说明。
6. 增加 legacy global override 检测与 repair flow。
7. 补齐 targeted tests 并完成 lint / typecheck / test 验证。

**Rollback**

- 若 launch-scoped override 注入不稳定，可暂时退回 `inherit only` 产品策略，先禁用 explicit override，而不是恢复 global config 静默写回。
- 若 repair UX 引起兼容性争议，可先保留检测，不提供修改动作，但继续禁止普通 settings save 写文件。

## Open Questions

- 运行时 override 最终采用 CLI 直接参数还是临时配置文件载体，需要在实现前按当前 Codex CLI 合约做一次最小验证。
