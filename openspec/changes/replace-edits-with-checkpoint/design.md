## Context

当前底部 `status panel` 的 `Edits` 模块承担的是“文件变化摘要”职责，但这个职责已经被更高价值的 surface 覆盖：

- 消息区 `File changes` 已经展示同一轮 file-change 事实
- 右侧 `session activity` 已经能聚合 session 级文件与命令活动
- 真正需要细看的场景已经有 `diff viewer / file view / git history`

于是 `Edits` 变成一个低信号、高重复、对新手不友好的模块。  
同时，这块底部区域又是用户眼睛最容易扫到的位置，它更适合承载“当前回合判断”，而不是“再列一遍文件名”。

本设计需要兼顾三类约束：

- 产品约束：便捷、易用、真实、好看
- 数据约束：核心结论不能靠大模型自由发挥
- 风格约束：保持现有 dock/status panel 气质，不引入胶囊/营销式控件

## Goals / Non-Goals

**Goals:**

- 用新的 `Checkpoint` 内部模块替换旧 `Edits`，用户侧文案默认显示为 `结果`
- 把底部区域升级成“决策压缩层”，优先回答 `现在什么状态 / 证据是什么 / 下一步做什么`
- 用固定 schema 承载真实事实，并限定模型只参与解释层
- 让 `dock` 与 `popover` 两种 status panel 形态共享同一语义，不再让 `popover` 残留 legacy `Edits`
- 让模块在模型不可用、验证信息缺失、命令尚未接入的情况下依然可安全退化
- 保持现有 dock/status panel 视觉系统，使用 icon 点缀和轻量按钮，不引入胶囊风格按钮

**Non-Goals:**

- 不重构右侧 `session activity` 的时间线架构
- 不把 `Checkpoint` 做成完整 CI 面板、完整 Git 面板或完整 command center
- 不要求第一阶段一次性接入所有 possible evidence producers
- 不要求第一阶段改变现有 diff/file view 的打开方式

### Decision 0：统一语义，区分 rich 和 compact 两种宿主

`Edits` 现在同时存在于 `dock` 与 `popover`，如果只替换其中一边，用户会立刻感知为产品不一致。

**选项 A：只替换 dock，popover 继续保留 `Edits`**

- 优点：实现更便宜
- 缺点：同一 status panel 出现双重语义，学习成本更高

**选项 B：两边都换成 `Checkpoint`，但使用不同密度**

- 优点：语义一致，宿主差异只体现在信息密度
- 缺点：需要设计 compact 版本

**采用选项 B。**

具体约束：

- `dock`
  - canonical rich surface
  - 展示完整 `Verdict / Evidence / Key Changes / Risks / Next Action`
- `popover`
  - compact surface
  - 必须共享同一 verdict 与 evidence contract
  - 可以压缩 secondary detail，但不得回退为 legacy `Edits` 文件列表

## Decisions

### Decision 1：内部叫 `Checkpoint`，用户看到 `结果`

**选项 A：继续叫 `Edits`**

- 优点：迁移最小
- 缺点：继续把“文件变化”误当成核心价值，方向错了

**选项 B：整个模块直接叫 `Ready`**

- 优点：强调可提交判断
- 缺点：语义太窄，无法覆盖 `运行中 / 阻塞 / 待复核`

**选项 C：内部 `Checkpoint`，用户文案 `结果`**

- 优点：内部语义稳定，用户侧更自然
- 缺点：需要同时维护 internal id 与 copy

**采用选项 C。**

实现层：

- internal capability / state / visibility id 使用 `checkpoint`
- 用户看到的 tab label 默认本地化为 `结果 / Result`

### Decision 2：采用三层 ownership，而不是让大模型直接写模块

**选项 A：全生成式**

- LLM 每轮直接写整个模块
- 风险：真实性差，容易把未运行测试写成绿色

**选项 B：纯静态规则**

- 全部字段由系统固定模板生成
- 风险：可解释性差，读起来太机械

**选项 C：Facts / Verdict / Summary 三层**

- `Facts Layer`
  - 由 deterministic subsystems 写入
  - 来源：file changes、commands、tasks/subagents/plan、validation、recent turn activity
- `Verdict Layer`
  - 由固定规则算出 `running / blocked / needs_review / ready`
- `Summary Layer`
  - LLM 可选生成一句摘要与简短风险说明
  - 只能读 facts，不能自造状态

**采用选项 C。**

额外约束：

- `Facts Layer` MUST 首先复用已有 canonical file-change contract
- 本设计不得再为 `Checkpoint` 新造一套平行 `file change aggregate`
- 当前 active change `normalize-conversation-file-change-surfaces` 若先落地，`Checkpoint` 直接消费其结果；若尚未归档，实施时需在 view-model 层做兼容桥接，而不是复制逻辑

### Decision 3：模块结构固定，内容可部分生成

最终 UI 采用固定骨架，不让每轮模块结构漂移。

```ts
type CheckpointViewModel = {
  status: "running" | "blocked" | "needs_review" | "ready";
  headline: string;
  summary: string | null;
  evidence: {
    changedFiles: number | null;
    additions: number | null;
    deletions: number | null;
    validations: Array<{
      kind: "lint" | "typecheck" | "tests" | "build" | "custom";
      status: "pass" | "fail" | "running" | "not_run" | "not_observed";
      sourceId: string | null;
    }>;
    commands: Array<{
      label: string;
      status: "success" | "fail" | "running";
      sourceId: string | null;
    }>;
  };
  keyChanges: Array<{
    id: string;
    label: string;
    summary: string;
    fileCount: number | null;
  }>;
  risks: Array<{
    code: string;
    severity: "high" | "medium" | "low";
    message: string;
    sourceId: string | null;
  }>;
  nextActions: Array<{
    type: "review_diff" | "open_risk" | "open_command" | "retry" | "commit";
    label: string;
    enabled: boolean;
  }>;
  sources: Array<{
    kind: "file_change" | "command" | "validation" | "plan" | "task" | "summary";
    sourceId: string;
  }>;
};
```

固定区域：

- `Verdict`
- `Evidence`
- `Key Changes`
- `Risks`
- `Next Action`

可生成部分：

- `summary`
- `risks.message`
- `nextActions` 排序与文案

额外规则：

- LLM 输出不得新增 schema 外字段
- 若生成失败，系统 MUST 回退为 deterministic copy

### Decision 3.5：明确 verdict 优先级，避免状态飘忽

首期 verdict 优先级固定为：

1. `blocked`
2. `running`
3. `needs_review`
4. `ready`

判定口径：

- `blocked`
  - 最近关键 command / validation 明确失败
  - 存在 high-severity risk 且无恢复动作
- `running`
  - 当前仍有 in-flight command、validation 或 plan execution
- `needs_review`
  - 已有改动，但验证不完整、或存在人工复核项
- `ready`
  - 关键验证通过，且没有未处理阻塞或高风险

这样可以避免“摘要像 ready，但 evidence 其实在 fail”的漂移。

### Decision 4：真实性优先，缺失数据显式暴露

该模块必须优先真实，而不是优先“看起来聪明”。

规则：

- 没跑过验证：显示 `Not run`
- 当前系统拿不到验证事实：显示 `Not observed`
- 没有模型摘要：使用 deterministic fallback sentence
- 每个高价值结论必须可追到 `sourceId`

这意味着第一阶段允许模块“有点朴素”，但不允许它“装懂”。

### Decision 5：文件变化降级为二级信息，不再霸占主视图

旧 `Edits` 的主要问题不是文件数据错，而是**文件数据被放到了错误层级**。

新的层级：

- 折叠态不再展示长文件列表
- 展开态的 `Key Changes` 只按意图分组展示摘要
- 具体文件列表变成展开后的 secondary detail
- 真正深入查看文件仍走既有 diff/file view 入口

这样做可以同时满足：

- 新手先看结论
- 老手一键钻进真实 diff

同时保留一个硬约束：

- secondary file detail 必须来自 canonical file-change facts
- 不允许再为 `Checkpoint` 额外做一套 `FileChangesList v2` 的独立推断器

### Decision 6：视觉上延续现有 dock 风格，不做一套新设计语言

风格要求直接写死：

- 复用现有 `status panel` 容器、分隔、字号、暗色层级
- 允许 icon 点缀，但 icon 只做导航和语义提示，不做 decorative hero
- 操作使用现有轻量 `ghost / text / icon+label` 按钮语言
- **禁止**胶囊风格按钮、圆角药丸 chips、营销式浮卡、彩色 KPI 卡片墙
- 状态颜色只服务于 `pass/fail/running/risk` 语义，不做大面积情绪化渲染

### Decision 7：迁移旧 `Edits` preference，但不丢用户配置

旧可见性控制和持久化里已经存在 `bottomActivity.edits`。  
新模块需要迁移到 `bottomActivity.checkpoint`，但不能让老用户的隐藏偏好失效。

迁移策略：

- 读取阶段：如果没有 `bottomActivity.checkpoint`，则把 `bottomActivity.edits` 视为兼容 alias
- 写入阶段：统一写回 `bottomActivity.checkpoint`
- settings copy 与 i18n 文案同步切换成 `结果 / Checkpoint`

## Risks / Trade-offs

- [Risk] 验证事实接入不完整，首期 evidence 看起来“信息不够满”  
  → Mitigation：允许 `Not observed`，先保证真实再逐步丰富 producer。

- [Risk] 模块目标从“文件列表”切成“决策压缩层”后，部分老用户会短期找不到旧文件列表  
  → Mitigation：在 `Key Changes` 下保留 secondary file list / Review Diff 入口，不直接砍掉跳转能力。

- [Risk] 如果 summary 过长，会把底部 panel 又做回信息堆  
  → Mitigation：headline 1 行、summary 2 行、risk/action 数量上限固定。

- [Risk] 如果 verdict 规则过度复杂，会让状态难以预测  
  → Mitigation：首期仅保留 `running / blocked / needs_review / ready` 四态，并把优先级写入实现 contract。

- [Risk] 当前 active change `normalize-conversation-file-change-surfaces` 仍然在强化 `Edits` 语义，可能与本 change 的“下线旧 Edits”形成 wording 冲突  
  → Mitigation：在本 change 中显式修改 `opencode-mode-ux`，并要求实现阶段以 canonical file facts 为共享依赖，而不是继续强化 `Edits` 名称本身。

## Migration Plan

1. 引入 `CheckpointViewModel` 与 deterministic verdict rules，不改外层壳。
2. 先让 `dock` 与 `popover` 都切到统一 `结果` 语义，但 `popover` 先使用 compact layout。
3. 用 `结果` tab 替换旧 `Edits` tab，并保留 legacy visibility alias。
4. 将 file-change primary surface 降级为 `Key Changes` secondary detail。
5. 接入模型摘要作为 optional enhancement；若 unavailable，继续使用 fallback sentence。
6. 更新 tests、i18n、settings visibility copy。

回滚策略：

- 若模型摘要不稳定：关闭 summary generation，仅保留 deterministic facts + verdict
- 若整体体验回退过大：保持 `结果` 结构不变，仅在 `Key Changes` 中暂时增强文件明细，避免回滚到旧 `Edits`

## Open Questions

- 用户侧最终 tab 文案是否固定为 `结果`，还是保留 `结果 / Checkpoint` 双语并存一版观察反馈。
- 第一阶段是否接入显式 `Commit ready` 动作，还是仅停留在 `Review Diff / Open Risk / Retry`。
- `validation` 事实是否只消费“本轮已观察到的命令结果”，还是需要单独的验证事件总线。
