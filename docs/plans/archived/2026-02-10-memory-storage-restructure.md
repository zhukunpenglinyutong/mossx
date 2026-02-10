# PLAN: 记忆落盘结构改造（项目分层文件夹 + 按天累加 + 项目元数据注入）

> 状态：已完成（待归档）
> 创建：2026-02-10
> 风险档位：中档（局部重构、可回滚）

---

## 一、问题

1. **存储粗糙** — 所有 workspace 的所有记忆混在一个 `memories.json` 里，无法按项目管理
2. **文件夹不可读** — 纯 UUID 做目录名，`ls` 完全无法辨识来源项目
3. **记忆缺少项目元数据** — `ProjectMemoryItem` 没有 `workspaceName`、`workspacePath` 字段，记忆脱离上下文后无法识别来源

---

## 二、当前结构（改造前）

```
~/.codemoss/project-memory/
├── memories.json       ← 多 workspace 记忆混存（示例）
└── settings.json       ← 全局设置
```

---

## 三、改造后结构

```
~/.codemoss/project-memory/
├── settings.json                              ← 全局设置（不动）
├── codex-simple-memory--52dbfc02/             ← {项目名slug}--{UUID前8位}
│   ├── 2026-02-10.json                        ← 当天 30 条记忆
│   └── 2026-02-11.json                        ← 次日新增
├── my-other-project--7e2569f4/
│   └── 2026-02-10.json                        ← 当天 8 条记忆
└── memories.json.bak                          ← 旧文件备份（迁移后保留）
```

### 目录命名规则

`{workspace_name_slug}--{workspace_id前8位}`

- `workspace_name_slug`：项目名 sanitize（小写、空格转 `-`、去特殊字符、截取前 50 字符）
- UUID 前 8 位保证唯一性（项目重名也不冲突）
- **人类可读 + 机器唯一**，`ls` 一目了然

### 日期文件格式

每个 `YYYY-MM-DD.json` 是 `Vec<ProjectMemoryItem>` JSON 数组，只含该 workspace 在该天创建的记忆。

---

## 四、数据模型变更

`ProjectMemoryItem` 新增两个字段：

| 字段 | Rust 类型 | TS 类型 | 说明 |
|------|-----------|---------|------|
| `workspace_name` | `Option<String>` | `workspaceName?: string` | 项目名（如 "codex-simple-memory"） |
| `workspace_path` | `Option<String>` | `workspacePath?: string` | 项目路径（如 "/Users/.../codex-simple-memory"） |

- 用 `Option` + `serde(default)` 保证向后兼容
- 旧记忆迁移时这两个字段为 `None`（反序列化不报错）
- 新记忆采集时由前端传入

---

## 五、核心设计决策

| 决策 | 方案 | 理由 |
|------|------|------|
| 目录命名 | `{slug}--{uuid前8位}` | 人类可读 + 唯一性 |
| 日期分桶依据 | `created_at` 的日期部分 | "按天累加"语义清晰 |
| 项目名变更适配 | `resolve_workspace_dir()` 扫描 `*--{uuid_prefix}` 后缀匹配 | 项目改名不影响数据查找 |
| `create` / `capture_auto` | 写入当天日期文件（追加到数组） | 新数据永远写当天 |
| `update` | 在记忆**原创建日期**的文件中原地修改 | 不跨文件移动，避免复杂度 |
| `delete` | 在记忆**原创建日期**的文件中标记 `deleted_at` | 保持软删除一致性 |
| `list` | 扫描 workspace 目录全部 `*.json` 聚合 + 过滤 + 排序 + 分页 | 跨天查询 |
| `get` | 遍历 workspace 目录按 id 查找 | 文件数通常 <365，可接受 |
| 锁策略 | 保持全局 `FILE_LOCK` Mutex | 当前够用，粒度可后续细化 |
| 迁移策略 | 首次调用自动触发 + **幂等可重试**（非一次性硬锁） | 避免半迁移状态无法恢复 |
| 旧文件处理 | 重命名为 `memories.json.bak` | 可回滚 |
| 新字段兼容 | `Option<String>` + `#[serde(default)]` | 旧数据反序列化安全 |

---

## 六、改动范围

### A. Rust 后端 `project_memory.rs`

| # | 改动 | 说明 |
|---|------|------|
| 1 | `ProjectMemoryItem` 新增 `workspace_name`, `workspace_path` 字段 | `Option<String>`, `#[serde(default)]` |
| 2 | `CreateProjectMemoryInput` 新增 `workspace_name`, `workspace_path` | `Option<String>` |
| 3 | `AutoCaptureInput` 新增 `workspace_name`, `workspace_path` | `Option<String>` |
| 4 | 新增 `slugify_workspace_name(name: &str) -> String` | 项目名 → 合法目录名 slug |
| 5 | 新增 `workspace_dir(workspace_id, workspace_name) -> PathBuf` | 构造 `{slug}--{uuid_prefix}/` 路径 |
| 6 | 新增 `resolve_workspace_dir(workspace_id) -> Option<PathBuf>` | 扫描 storage_dir 找 `*--{uuid_prefix}` 目录 |
| 7 | 新增 `date_file_path(ws_dir, date_str) -> PathBuf` | 日期文件路径 |
| 8 | 新增 `today_str() -> String` | UTC 日期字符串 |
| 9 | 新增 `read_date_file(path) -> Vec<ProjectMemoryItem>` | 读取单个日期文件 |
| 10 | 新增 `write_date_file(path, items)` | 写入单个日期文件 |
| 11 | 新增 `read_workspace_memories(ws_dir) -> Vec<ProjectMemoryItem>` | 聚合 workspace 目录全部 `*.json` |
| 12 | 新增 `find_memory_in_workspace(ws_dir, id) -> Option<(PathBuf, Vec<Item>)>` | 按 id 定位到日期文件 |
| 13 | 新增 `migrate_legacy_flat_file()` | 旧 `memories.json` → 新结构 |
| 14 | 新增 `ensure_migrated()` | 迁移前检查 marker/状态；失败可重试，成功后短路 |
| 15 | 改造 8 个 Tauri command 内部实现 | 签名扩展（新 Option 字段），内部调用新读写函数 |
| 16 | 清理旧 `data_path()`, `read_memories()`, `write_memories()` | |
| 17 | 新增/更新单元测试 | slugify、迁移、新读写、跨天查询 |

### B. 前端 TypeScript

| # | 改动 | 文件 | 说明 |
|---|------|------|------|
| 1 | `ProjectMemoryItem` 类型 +2 字段 | `tauri.ts` | `workspaceName?: string`, `workspacePath?: string` |
| 2 | `projectMemoryCaptureAuto` 参数 +2 字段 | `tauri.ts` | `workspaceName?`, `workspacePath?` |
| 3 | `projectMemoryCreate` 参数 +2 字段 | `tauri.ts` | 同上 |
| 4 | 调用点传入 workspace 信息 | `useThreadMessaging.ts` | 2 处 `projectMemoryCaptureAutoService` 调用加 `workspace.name`, `workspace.path` |
| 5 | 调用链补传 workspace 信息 | `useThreads.ts` | 在 pending payload 中新增 `workspaceName/workspacePath`，`projectMemoryCreate` 时透传 |
| 6 | facade 透传 | `projectMemoryFacade.ts` | 参数类型扩展 |
| 7 | hook 手动创建传入 | `useProjectMemory.ts` | `createMemory` 方法 |

### C. 不改的

- `settings.json` 位置和格式不变
- `ProjectMemorySettings` 结构不变
- `UpdateProjectMemoryInput` 不变（update 不改项目归属）
- `ProjectMemoryListResult` 返回结构不变
- i18n 不动（本次不涉及）

---

## 七、前端透明性分析

前端 API 层 **100% 透明**，存储层重构不影响前端调用逻辑：

- Tauri command 名称不变
- 参数格式向后兼容（新字段全是 Option）
- 返回的 `ProjectMemoryItem` 结构向后兼容（新字段是 Optional）
- 分页、过滤、排序逻辑一致

前端只需在**采集入口及融合写入链路**补传 `workspace.name` 和 `workspace.path`。

---

## 八、实施步骤

| 步骤 | 内容 | 改动文件 |
|------|------|----------|
| **S1** | 数据模型扩展：`ProjectMemoryItem` / `CreateProjectMemoryInput` / `AutoCaptureInput` 新增字段 | `project_memory.rs` |
| **S2** | 路径辅助函数：`slugify_workspace_name`, `workspace_dir`, `resolve_workspace_dir`, `date_file_path`, `today_str` | `project_memory.rs` |
| **S3** | 文件读写：`read_date_file`, `write_date_file`, `read_workspace_memories`, `find_memory_in_workspace` | `project_memory.rs` |
| **S4** | 迁移逻辑：`migrate_legacy_flat_file` + `ensure_migrated` | `project_memory.rs` |
| **S5** | 改造 8 个 Tauri command | `project_memory.rs` |
| **S6** | 清理旧函数，更新/新增单元测试 | `project_memory.rs` |
| **S7** | TS 类型扩展 | `tauri.ts` |
| **S8** | Facade 透传 | `projectMemoryFacade.ts` |
| **S9** | 调用点传入 workspace 信息 | `useThreadMessaging.ts`, `useThreads.ts`, `useProjectMemory.ts` |
| **S10** | 验证：`cargo test` + `npm run typecheck` | — |

---

## 九、验证计划

1. **`cargo test project_memory`** — 全部测试通过（63 条）
2. **`npm run typecheck`** — 前端零错误
3. **迁移测试** — 构造旧 `memories.json`，验证迁移后目录结构和文件内容正确
4. **手动验证**：
   - 启动应用 → 旧数据已按 `{项目名}--{uuid前8位}/YYYY-MM-DD.json` 迁移
   - 新创建记忆写入正确目录和当天文件
   - `ls ~/.codemoss/project-memory/` 可读
   - 列表、查询、更新、删除功能正常
5. **失败恢复验证**：
   - 人为制造迁移中断（如写入新目录后中断）
   - 重启后可自动继续迁移或安全回滚，不出现“既读不到旧文件也读不到新结构”

---

## 十、回滚方案

- 迁移分阶段执行（建议）：
  1. 读取 `memories.json`
  2. 写入新目录结构（临时文件 + 原子 rename）
  3. 校验新结构完整性（条数/关键字段）
  4. 成功后再将旧文件重命名为 `memories.json.bak`
- 任一阶段失败：不标记迁移成功；保留旧文件；允许下次重试
- 回滚步骤：
  1. 删除新创建的 workspace 子目录
  2. 将 `memories.json.bak` 恢复为 `memories.json`
  3. 恢复旧代码
- 前端新字段全是 Optional，不传也不报错

---

## 十一、风险控制

| 风险 | 概率 | 缓解措施 |
|------|------|----------|
| 迁移时数据丢失 | 低 | 迁移前备份为 `.bak` |
| `list` 性能下降（多文件扫描） | 低 | 单 workspace 日文件数通常 <365，扫描开销可接受 |
| `get` 无法按日期定位 | 低 | 遍历全文件，文件数可控；后续可加 index |
| 项目改名后目录不匹配 | 低 | `resolve_workspace_dir` 按 UUID 后缀模糊匹配 |
| 并发写入同一天文件 | 低 | 保持全局 Mutex |
| 迁移半完成导致不可读 | 中 | 迁移流程幂等 + 状态标记 + 失败可重试 |
| 旧版客户端读不到新结构 | N/A | 当前无多版本并存场景 |

---

## 十二、时区口径（新增）

- 日期分桶默认按 **UTC**（与后端 `created_at` 一致，行为稳定）。
- 若产品期望“按用户本地自然日”展示，需在后续版本切换为本地时区分桶，并提供兼容迁移脚本。

---

## 十三、实施完成回写（2026-02-10）

### 13.1 实施结论

- 计划目标已落地：存储从单文件迁移为「按 workspace 目录 + 按天文件分桶」。
- 兼容迁移已落地：旧 `memories.json` 可自动迁移为新结构，并保留 `.bak`。
- 前端链路已打通：采集与融合写入均可透传 `workspaceName/workspacePath`。

### 13.2 与原计划的实际差异

| 项 | 计划 | 实际 |
|---|---|---|
| 测试规模 | 47 + 10~12 新增 | `project_memory` 63 条（已通过） |
| API 签名影响 | 前端基本透明 | `get/update/delete` 实际新增 `workspaceId` 参数（调用方已对齐） |
| 文档状态 | 待确认 | 已实现，进入待归档 |

### 13.3 验收结果

1. `npm run -s typecheck` 通过。
2. `cargo test project_memory --manifest-path src-tauri/Cargo.toml` 通过（63/63）。
3. 记忆模块前端核心测试通过（`useProjectMemory` / `outputDigest` / `useThreadItemEvents`）。

### 13.4 归档建议

- 可将本文件状态标记为 `archived`，并在 Phase 2 roadmap 中把 T1-1 固化为“已完成”。
