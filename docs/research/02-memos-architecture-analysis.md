# MemOS 架构分析（基于本地源码核验）

**文档类型**: 技术调研 - 外部参考系统分析
**修订时间**: 2026-02-09
**核验基线**: `/Users/chenxiangning/code/AI/github/MemOS` 本地仓库

---

## 1. 结论先行

MemOS 是可验证的生产级 Memory OS 项目，但其架构复杂度明显高于 CodeMoss 当前需求。对 CodeMoss 的价值主要是"设计思想借鉴"，而不是"技术栈照搬"。

---

## 2. 已核验事实（来自本地源码）

### 2.1 项目基本信息

- 仓库存在且结构完整：`src/memos/*`
- README 标注：`MemOS 2.0: Stardust (Preview)`
- 包版本：`pyproject.toml` 中 `version = "2.0.4"`

### 2.2 架构模块确实存在

可见目录/模块：
- `src/memos/mem_cube/`
- `src/memos/memories/`
- `src/memos/graph_dbs/`
- `src/memos/vec_dbs/`
- `src/memos/mem_scheduler/`
- `src/memos/api/`

### 2.3 MemCube 抽象确实存在

- `src/memos/mem_cube/base.py` 定义 `BaseMemCube`
- 抽象对象包含 `text_mem/act_mem/para_mem/pref_mem`

### 2.4 文本记忆与数据模型确实存在

- `src/memos/memories/textual/base.py` 定义 `BaseTextMemory` 抽象接口
- `src/memos/memories/textual/item.py` 定义 `TextualMemoryItem` 与多类 `metadata`
- memory type 包含：`WorkingMemory/LongTermMemory/UserMemory/...`

### 2.5 存储与检索是"图 + 向量"的可配置组合

- 图存储模块：`graph_dbs`（含 `neo4j/polardb/nebular`）
- 向量存储模块：`vec_dbs`（`qdrant/milvus`）
- 工厂：`src/memos/vec_dbs/factory.py`
- API 初始化中有 `graph_db` 与 `vector_db` 组件注入

### 2.6 对外 API 路由（实际可见）

`src/memos/api/routers/server_router.py` 可见典型端点：
- `POST /product/add`
- `POST /product/search`
- `POST /product/get_memory`
- `GET /product/get_memory/{memory_id}`
- `POST /product/delete_memory`

---

## 3. 需要纠正的误区

1. 不能把示例伪代码当作 MemOS 真实接口签名。
2. 不能把某一实现路径绝对化为"唯一三层固定架构"。
3. 不能把"某功能在文档中提到"直接当作"当前开源代码默认启用"。

---

## 4. 对 CodeMoss 的可借鉴点

1. **隔离单元思想**：以 `MemCube` 对应知识/用户边界。
2. **统一记忆接口思想**：增删查改入口清晰。
3. **元数据驱动检索思想**：记忆条目有结构化 metadata。

---

## 5. 对 CodeMoss 的不建议照搬项

1. 复杂图数据库 + 向量数据库协同。
2. 高并发异步调度与重型基础设施。
3. 在 MVP 阶段引入过多记忆类型与多后端切换。

---

## 6. 专业判断

MemOS 的"研究与产品化深度"是真实的；但 CodeMoss 当前最优路径是"借鉴抽象，不复制基础设施"。

> L2（本质层）问题不是"能不能做复杂架构"，而是"当前收益是否覆盖复杂度成本"。
> L3（原则层）应坚持：先建立可闭环最小系统，再按数据驱动做能力升级。

---

## 7. 证据锚点（MemOS 本地路径）

- `/Users/chenxiangning/code/AI/github/MemOS/README.md`
- `/Users/chenxiangning/code/AI/github/MemOS/pyproject.toml`
- `/Users/chenxiangning/code/AI/github/MemOS/src/memos/mem_cube/base.py`
- `/Users/chenxiangning/code/AI/github/MemOS/src/memos/memories/textual/base.py`
- `/Users/chenxiangning/code/AI/github/MemOS/src/memos/memories/textual/item.py`
- `/Users/chenxiangning/code/AI/github/MemOS/src/memos/api/routers/server_router.py`
- `/Users/chenxiangning/code/AI/github/MemOS/src/memos/api/handlers/component_init.py`
- `/Users/chenxiangning/code/AI/github/MemOS/src/memos/vec_dbs/factory.py`
