## Why

Spec Hub 现在已经能跑完整的 OpenSpec action，但日常浏览体验开始暴露出两个摩擦点：右侧执行台默认展开，首次进入时会挤压 artifact 阅读空间；左侧 change 列表只有 `all/active/blocked/archived` 四种视图，导致“暂时不做但又不该归档”的提案长期堆在 active 区，工作集噪音越来越高。  
这两个问题都不阻塞功能，但会直接降低 Spec Hub 作为“规范浏览 + 执行入口”的可读性和可分流性，现在已经值得在视图层做一次结构化收口。

## 目标与边界

- 目标：
  - 让 Spec Hub 首次打开时优先服务“看规范”，而不是默认占满执行台。
  - 为左侧 change 列表增加 `需求池`（backlog pool）分类，承接“活跃但暂不执行”的提案。
  - 保持 OpenSpec lifecycle status、gate、action availability 的既有语义不变，不把产品组织语义混进规范事实语义。
  - 补齐与本次变更直接相关的视图提示、空态和交互 affordance，减少“看不懂为什么在这里”的认知负担。
- 边界：
  - `需求池` 是 workspace 级视图组织能力，不是 `openspec/changes/` 的物理迁移，不修改 proposal/design/tasks/specs 文件内容。
  - 本次不新增 backend command；优先复用前端 runtime + `clientStorage` 完成状态叠加。
  - 本次不重做 Spec Hub 三栏 IA，不改 apply / verify / archive 执行链路。

## 非目标

- 不引入 `priority`、`owner`、`tag` 等更重的 change 管理字段。
- 不做多设备同步或把 `需求池` 写回 OpenSpec 仓库，避免制造无意义 spec diff。
- 不在本次实现 Spec Hub 的全文搜索、spec diff compare、跨 change 批量管理。

## What Changes

- 调整 Spec Hub 默认开屏行为：
  - 右侧 execution console / control center 在某个 workspace + spec-root scope 首次打开时默认折叠。
  - 用户手动展开/折叠后，系统 SHALL 记住该偏好；后续同 scope 打开时恢复用户上次选择。
- 新增 `需求池`（backlog pool）change 视图：
  - 左侧 filter chip 由 `all / active / blocked / archived` 扩展为 `all / active / backlog / blocked / archived`。
  - 用户可在 change row 上通过右键菜单（并提供 keyboard-accessible 等价入口）执行 `Move to backlog pool` / `Remove from backlog pool`。
  - backlog membership 仅影响列表分流，不改变 change 的 lifecycle status、artifact 完整性、或 action gate。
- 新增 backlog 可见性提示：
  - backlog 成员在 `all` / `blocked` 视图中仍保留底层状态展示，并附带 backlog 归属提示，避免“项目为什么不在 active”变成黑盒。
  - 当 backlog 为空时提供明确空态文案，说明它的用途是“暂缓执行而非归档”。
- 新增 runtime 级别的组织态叠加：
  - runtime 在构建 change snapshot 后，再叠加 workspace-scoped backlog overlay 与 control-center preference。
  - 当 change 被归档、删除或切换 spec root 后，系统自动清理失效 backlog membership，避免残留脏状态。

## 技术方案对比与取舍

### 方案 A：把 `需求池` 写进 OpenSpec change 元数据或目录结构

- 优点：跨设备、跨协作者天然同步。
- 缺点：这是产品层组织语义，不是规范事实；一旦写进 spec 仓库，就会制造无业务价值的文档噪音和 git churn。

### 方案 B：纯前端 workspace-scoped overlay（采用）

- 优点：不污染 OpenSpec artifact，能快速满足“我的工作集整理”诉求；实现范围收敛在 Spec Hub runtime/UI。
- 缺点：默认只对当前本机/当前用户生效，不提供团队共享 triage 视图。

### 方案 C：新建独立 sidecar 文件写入 workspace

- 优点：比本地 store 更可迁移，也不污染 OpenSpec 主目录。
- 缺点：会新增另一套持久化文件协议和 IO/error surface，本期收益不够高。

取舍：采用 B。`需求池` 本质是“我现在怎么组织自己的 change 视图”，不是规范事实；因此应作为 runtime overlay 持久化，而不是进入 OpenSpec 主数据。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `spec-hub-workbench-ui`: 增加 execution console 默认折叠、需求池 filter、change row triage menu、以及相应空态/提示文案。
- `spec-hub-runtime-state`: 增加 workspace-scoped control-center preference 与 backlog membership overlay，并定义 refresh 清理与过滤规则。

## 验收标准

1. 用户首次在某个 workspace + spec-root scope 打开 Spec Hub 时，execution console SHALL 默认折叠。
2. 用户在当前 scope 中手动展开或折叠 execution console 后，刷新页面或重新进入 Spec Hub SHALL 恢复上次选择，而不是回退到默认态。
3. 左侧 change filter SHALL 出现 `backlog` 视图；用户把一个非归档 change 移入 backlog 后，该条目 SHALL 从 `active` 视图移除，并出现在 `backlog` 视图中。
4. backlog 成员的 lifecycle status（如 `draft` / `blocked`）与 action gate SHALL 保持原有计算规则，不得因移入 backlog 而变成新 status。
5. 被移入 backlog 的 blocked change 仍 SHALL 出现在 `blocked` 视图中，确保 operational risk 不会被组织视图隐藏。
6. 当 backlog 中的 change 已归档、被删除、或当前 spec root 切换后不再存在时，runtime SHALL 自动清理失效 membership，不展示孤儿条目。
7. change row 的 backlog 操作 SHALL 支持 right click 触发，并提供 keyboard-accessible 等价入口，不得只剩鼠标 secondary click。
8. `all` / `blocked` / `backlog` 相关空态与提示文案 SHALL 走 i18n，不得硬编码中文或英文。

## Impact

- Frontend runtime:
  - `src/features/spec/hooks/useSpecHub.ts`
  - `src/lib/spec-core/types.ts`
- Frontend view:
  - `src/features/spec/components/spec-hub/presentational/SpecHubPresentationalImpl.tsx`
  - `src/features/spec/components/SpecHub.test.tsx`
  - `src/features/spec/specHubVisibleCopyKeys.ts`
- Persistent UI state:
  - `src/services/clientStorage.ts`（复用，不新增存储后端）
- QA / regression:
  - `src/features/spec/hooks/useSpecHub.test.tsx`
  - `src/features/spec/components/SpecHub.test.tsx`
