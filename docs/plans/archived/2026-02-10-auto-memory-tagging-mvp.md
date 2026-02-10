# PLAN: 自动写入记忆标签化（MVP）

> 创建：2026-02-10  
> 状态：待执行  
> 目标：让自动采集写入的记忆默认带可用标签，恢复标签筛选的实际价值。

---

## 一、目标

1. 自动采集写入的记忆不再大量出现空 `tags`。
2. 保持低侵入：不改存储协议、不改前端调用契约、不引入新依赖。
3. 让“标签筛选/快捷标签”对新写入数据立即生效。

---

## 二、问题根因

当前自动链路未做标签提取：

1. Rust `project_memory_capture_auto` 中写入 `tags: Vec::new()`。
2. 前端融合兜底创建（`assistant_output_digest`）也未提供标签。

因此 UI 有标签筛选能力，但自动写入数据缺标签，体感为“标签没用”。

---

## 三、范围

### 3.1 必做（MVP）

1. `src-tauri/src/project_memory.rs`
  - 新增自动标签提取函数
  - 接入 `project_memory_capture_auto` 写入
  - 增加单元测试

### 3.2 可选增强（同批可做）

1. `src/features/threads/hooks/useThreads.ts`
  - 融合写入 `projectMemoryCreate` 时补传标签（与后端自动采集保持一致）

---

## 四、方案设计

### 4.1 标签来源优先级

1. 显式 `#tag`（最高优先）
2. 关键词抽取（基于 `clean_text` 的轻量规则）
3. 若无命中则为空数组（避免制造噪声标签）

### 4.2 关键词抽取规则（MVP）

1. 文本统一小写
2. 去停用词（中英）
3. 过滤长度（2~20）
4. 过滤纯数字
5. 去重并限制最多 5 个标签

### 4.3 约束

1. 保持 `normalize_tags` 作为最终防线（长度、去重、上限）
2. 不做复杂 NLP / 向量语义

---

## 五、实施步骤

1. 在 `project_memory.rs` 新增函数：
  - `extract_hashtag_tags(text: &str) -> Vec<String>`
  - `extract_keyword_tags(text: &str) -> Vec<String>`
  - `extract_auto_tags(text: &str) -> Vec<String>`
2. 将 `project_memory_capture_auto` 的 `tags: Vec::new()` 替换为：
  - `tags: extract_auto_tags(&clean_text)`
3. 为提取逻辑补测试：
  - 可提取 `#Java #SpringBoot`
  - 中文技术词可提取（如 `线程池`、`死锁`）
  - 停用词/纯数字被过滤
  - 去重与上限生效
4. 运行验证：
  - `cargo test --lib project_memory`
  - `npx tsc --noEmit`

---

## 六、验收标准（DoD）

1. 新产生的自动记忆能看到标签 chips。
2. 标签筛选可命中新自动记忆。
3. 旧数据不受影响（仍可手动补标签）。
4. 无后端 command 契约变化。

---

## 七、回滚方案

1. 代码回滚：恢复 `project_memory_capture_auto` 为 `tags: Vec::new()`。
2. 本次无 schema 迁移，无数据回滚需求。

---

## 八、风险与取舍

1. 风险：关键词提取可能产生少量噪声标签。
2. 取舍：先以可用性优先，后续可通过停用词表/黑名单迭代。
3. 边界：本期不做复杂语义标签与人工审核流程。

---

## 九、技术实现细节

### 9.1 代码落点（当前仓库）

1. `src-tauri/src/project_memory.rs`
  - 现有函数：`project_memory_capture_auto(input: AutoCaptureInput) -> Result<Option<ProjectMemoryItem>, String>`
  - 当前写入：`tags: Vec::new()`（待替换）
2. 标签规范函数：`normalize_tags(tags: Option<Vec<String>>) -> Vec<String>`
  - 自动提取结果最终应走该函数兜底

### 9.2 建议函数（示意，非最终代码）

```rust
// src-tauri/src/project_memory.rs
fn extract_hashtag_tags(text: &str) -> Vec<String>;
fn extract_keyword_tags(text: &str) -> Vec<String>;
fn extract_auto_tags(text: &str) -> Vec<String> {
  // 优先 hashtag，其次关键词
  // 提前裁剪到 <= 5
  // 最终 normalize_tags(Some(tags))
}
```

### 9.3 接入点（当前结构）

在 `project_memory_capture_auto` 构建 `ProjectMemoryItem` 时：

1. 现状：`tags: Vec::new(),`
2. 目标：`tags: extract_auto_tags(&clean_text),`

---

## 十、测试用例

### 10.1 单元测试

建议新增/更新测试点（在 `project_memory.rs` tests 模块）：

1. `extract_hashtag_tags`：可提取 `#Java #SpringBoot`
2. `extract_keyword_tags`：中文技术词场景可提取（如 `线程池`、`死锁`）
3. `extract_keyword_tags`：停用词/纯数字过滤
4. `extract_auto_tags`：hashtag 优先
5. `extract_auto_tags`：去重与上限（<=5）生效
6. `project_memory_capture_auto`：命中场景下 `tags` 非空

### 10.2 集成测试

```bash
# 1. Rust 目标测试
cargo test --lib project_memory

# 2. 前端类型检查
npx tsc --noEmit

# 3. 手动验证
# - 触发自动采集(对话/note)
# - 检查生成的记忆是否包含标签
# - 验证标签筛选是否生效
```

---

## 十一、验证标准

### 11.1 功能验证

- [ ] 新自动记忆包含至少 1 个标签
- [ ] 显式 hashtag 优先生效
- [ ] 中文技术词正确提取
- [ ] 停用词被过滤
- [ ] 标签数量限制（<=5）生效
- [ ] 前端标签筛选命中新增自动标签
- [ ] 纯数字被过滤
- [ ] 标签去重生效
- [ ] 标签数量上限为 5

### 11.2 性能验证

- [ ] 标签提取延迟 < 10ms
- [ ] 无阻塞 UI 主线程
- [ ] 内存占用增加 < 5MB

### 11.3 兼容性验证

- [ ] 旧数据正常显示(空标签)
- [ ] 前端标签筛选正常工作
- [ ] 无 command 契约变更

---

## 十二、上线检查清单

### 12.1 代码审查

- [ ] 所有单元测试通过
- [ ] Rust 代码格式化(`cargo fmt`)
- [ ] Clippy 检查无警告(`cargo clippy`)
- [ ] 前端 TypeScript 检查通过

### 12.2 文档更新

- [ ] 更新 `docs/research/00-project-memory-feature-overview.md`
- [ ] 更新 `docs/plans/2026-02-10-phase2-roadmap.md`
- [ ] 标注本 plan 为"已完成"

### 12.3 发布准备

- [ ] 创建 git commit
- [ ] 标记版本号(v0.x.x)
- [ ] 准备 changelog 说明

---

## 十三、后续优化方向

### 13.1 短期(1-2 周)

1. 根据用户反馈调整停用词表
2. 增加技术领域词库(Java/React/Rust 等)
3. 优化中文分词规则

### 13.2 中期(1-2 月)

1. 支持用户自定义标签规则
2. 标签使用频率统计
3. 标签推荐(基于历史)

### 13.3 长期(3+ 月)

1. 基于 NLP 的语义标签
2. 标签层级结构(父子关系)
3. 跨项目标签同步

---

## 十四、成功指标

### 14.1 定量指标

- 自动记忆标签覆盖率 > 90%
- 标签筛选使用率提升 > 50%
- 用户手动补标签频率降低 > 70%

### 14.2 定性指标

- 用户反馈:"标签有用且准确"
- 无噪声标签投诉
- 标签筛选流程顺畅
