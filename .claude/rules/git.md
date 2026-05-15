# Git 提交规范

> 基于 Conventional Commits 的实践规范，可在任意项目复用。

提交必须为英文

## 一、提交信息格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 各部分说明

- **type**（必填）：变更类型，见下表
- **scope**（可选）：影响范围，如模块/子系统名
- **subject**（必填）：简短描述，**英文小写开头，不加句号**，建议 ≤ 72 字符
- **body**（可选）：详细说明，使用列表罗列具体变更
- **footer**（可选）：BREAKING CHANGE、关联 issue/PR 编号等

---

## 二、Type 类型表

| Type | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: add file path tooltip on hover for file links` |
| `fix` | Bug 修复 | `fix(permissions): respect settings.json rules in plan mode` |
| `refactor` | 重构（不影响外部行为） | `refactor: extract UserMessageSanitizer utility` |
| `docs` | 文档变更 | `docs(readme): add acknowledgments section` |
| `test` | 测试相关 | `test(streaming): rewrite message patching logic` |
| `style` | 代码格式（不改语义） | `style: add braces to single-line if statements` |
| `perf` | 性能优化 | `perf: cache resolved file paths` |
| `chore` | 杂务（版本号、依赖、构建脚本等） | `chore(version): bump to v0.4.3-Alpha1` |
| `ci` | CI/CD 配置变更 | `ci: enable Checkstyle in build pipeline` |
| `build` | 构建系统/外部依赖变更 | `build: upgrade gradle to 8.5` |

---

## 三、Scope 命名建议

scope 用于标识变更影响的模块/子系统，按项目分层组织：

- **按层划分**：`webview`、`backend`、`bridge`、`api`
- **按功能划分**：`auth`、`permissions`、`session`、`settings`
- **按特性划分**：`notification`、`title`、`history`
- **元信息**：`version`、`changelog`、`readme`

> 单个 commit 只跨一个 scope；跨多个 scope 时省略 scope 或拆分提交。

---

## 四、Subject 书写规则

1. **使用英文**（国际化项目）
2. **祈使语气、动词开头**：`add` / `fix` / `remove` / `update`，而非 `added` / `fixes`
3. **首字母小写**，结尾**不加句号**
4. **聚焦"做了什么"**，避免冗余前缀如 `update code to`
5. **长度建议 ≤ 72 字符**，超出请放入 body

### 示例对比

```diff
- Fixed a bug.
+ fix: prevent digit loss when streaming numeric content

- update files
+ refactor: extract tooltip logic into reusable hook

- 添加新功能
+ feat(session): add lightweight reusable session templates
```

---

## 五、Body 书写规范

当变更复杂、需要解释 **WHY** 或列举多项改动时，使用 body。

### 推荐结构

```
<type>(<scope>): <subject>

<一段话解释为什么需要这次变更>

- 具体改动 1
- 具体改动 2
- 具体改动 3

Benefits:（可选）
- 收益 1
- 收益 2
```

### 真实示例

```
refactor: improve file link tooltip implementation

- Extract tooltip logic from MarkdownBlock into useMarkdownFileLinkTooltip hook
- Move tooltip styles from inline JS to CSS for better maintainability
- Replace estimated width calculation with actual DOM measurement
- Add LRU cache (max 200 entries) to prevent unbounded memory growth
- Add comprehensive test coverage for LRU cache implementation

Benefits:
- Reduced MarkdownBlock.tsx complexity (removed ~150 lines)
- More accurate tooltip positioning using getBoundingClientRect()
- Better memory management with automatic cache eviction
```

---

## 六、版本号规范

采用语义化版本（SemVer）+ 预发布迭代号：

```
v<major>.<minor>.<patch>[-<prerelease><N>]
```

- 正式版：`v0.1.4`、`v1.0.0`
- 预发布迭代：`v0.1.5-Alpha1` → `v0.1.5-Alpha2` → ... → `v0.1.5-Beta1` → `v0.1.5`

版本号 bump 提交统一使用 `chore(version)` 前缀：

```
chore(version): bump to v0.4.3-Alpha1
```

---

## 七、分支与合并流程

### 分支策略

- `main`：主分支，对应线上稳定版本
- `develop`：开发分支，所有功能合入此处
- `feature/*`、`fix/*`、`refactor/*`：从 `develop` 切出，完成后合回 `develop`

### PR 流程

1. 从 `develop` 切出功能分支
2. 完成开发后向 `develop` 提 PR（**不要直接提 main**）
3. PR AI 审查报告中的 **中风险/高风险** 问题必须修复后才能合并
4. 合并后由维护者定期将 `develop` 合入 `main` 并发版

---

## 八、PR 标题与描述

### PR 标题

复用 commit 规范：`<type>(<scope>): <subject>`

### PR 描述模板

```markdown
## Summary
- 1-3 句话说明本次变更目标

## Changes
- 关键改动 1
- 关键改动 2

## Test Plan
- [ ] 手动测试场景 A
- [ ] 单元测试覆盖 X 模块
- [ ] 验证回归场景 Y

## Related
- Closes #123
```

---

## 九、Issue 标签体系

### 状态（Status）

- 🟢 `in-progress` —— 进行中
- 🟡 `todo` —— 待开始
- 🔴 `deferred` —— 延期到下个版本
- ✅ `done` —— 已完成

### 优先级（Priority）

- `P0`：阻塞性问题
- `P1`：高优先级
- `P2`：中优先级
- `P3`：低优先级

### 类型（Labels）

- `feat`：新功能开发
- `enhancement`：功能增强
- `bugfix`：Bug 修复
- `documentation`：文档相关
- `tech-debt`：技术债务
- `testing`：测试相关

---

## 十、提交禁忌

提交信息中**禁止**包含：

- ❌ AI 生成署名（如 `Generated with Claude Code`、`Co-Authored-By: Claude`）
- ❌ Emoji 表情符号（保持简洁专业）
- ❌ 调试用语句（`WIP`、`test commit`、`asdf`）
- ❌ 个人化语气（`finally fixed!`、`I think this works`）
- ❌ 硬编码密钥、token、内部 URL

---

## 十一、快速参考卡片

```bash
# 新功能
feat(scope): add <feature>

# Bug 修复
fix(scope): prevent <bug behavior>

# 重构
refactor(scope): extract <thing> into <new structure>

# 文档
docs(scope): update <section>

# 版本发布
chore(version): bump to v<X.Y.Z>

# 跨多文件的复杂改动
feat(scope): <subject>

<解释为什么>

- 改动 1
- 改动 2
- 改动 3
```

---

## 附录：工具推荐

- **Commitlint**：本地校验提交格式 —— `@commitlint/config-conventional`
- **Husky**：git hook 管理，配合 commitlint 在 `commit-msg` 阶段校验
- **Conventional Changelog**：根据 commit 历史自动生成 CHANGELOG
- **gitmoji-cli**：如果项目允许 emoji（本规范不允许）

```bash
# 一键安装 commitlint
npm install --save-dev @commitlint/cli @commitlint/config-conventional
echo "module.exports = { extends: ['@commitlint/config-conventional'] }" > commitlint.config.js
```
