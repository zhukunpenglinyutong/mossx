## Why

Claude Code 官方 plugin 会把 skill 安装到 `~/.claude/plugins/cache/<owner>/<plugin>/skills/`，但当前 Skills 面板只扫描 `~/.claude/skills` 等传统目录。用户通过 `/plugin` 安装的 skill 实际可被 Claude CLI 使用，却无法在 GUI 中查看、搜索或预览。

## 目标与边界

- 目标：将 Claude plugin cache 下的 `skills` 目录纳入本地 skill discovery。
- 目标：保持现有优先级与去重语义，用户自建 `~/.claude/skills` 仍优先于 plugin cache。
- 边界：不新增自定义 skill root 设置，不改变 Claude CLI 运行时加载逻辑，不处理 symlink skill 目录。

## What Changes

- 后端新增 `global_claude_plugin` source，扫描 `~/.claude/plugins/cache/*/*/skills`。
- Settings → Skills 的 Claude 引擎分组识别该 source，并能从 plugin cache 路径推导浏览根。
- Composer slash skill 候选保留 deterministic source priority。
- 补充 Rust targeted tests 覆盖 plugin cache roots 发现与 source merge。

## Capabilities

### Modified Capabilities

- `composer-context-project-resource-discovery`: local skill discovery MUST include Claude plugin cache skill roots.

## 验收标准

- 当 `~/.claude/plugins/cache/<owner>/<plugin>/skills/<name>/SKILL.md` 存在时，`skills_list` 返回对应 skill。
- 返回项 source 为 `global_claude_plugin`。
- Settings Skills 面板切换 Claude 时可以匹配并展示 plugin skill。
- 缺少 plugin cache 目录时 discovery 不失败。
