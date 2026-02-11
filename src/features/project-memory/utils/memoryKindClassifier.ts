export type MemoryKind =
  | "known_issue"
  | "code_decision"
  | "project_context"
  | "note";

type KindSignal = {
  phrases: string[];
  weight: number;
};

type KindRule = {
  kind: Exclude<MemoryKind, "note">;
  signals: KindSignal[];
  negations: string[];
  threshold: number;
  priority: number;
};

const KIND_RULES: KindRule[] = [
  {
    kind: "known_issue",
    signals: [
      {
        phrases: [
          "bug report",
          "stack trace",
          "panic at",
          "segfault",
          "core dump",
          "null pointer",
          "undefined is not",
          "cannot read property",
          "报错信息",
          "崩溃了",
          "异常堆栈",
          "空指针",
          "段错误",
        ],
        weight: 3,
      },
      {
        phrases: [
          "error",
          "exception",
          "failed",
          "failure",
          "crash",
          "broken",
          "issue",
          "problem",
          "fix",
          "debug",
          "defect",
          "regression",
          "bug",
          "报错",
          "失败",
          "异常",
          "故障",
          "修复",
          "调试",
          "缺陷",
          "回退",
        ],
        weight: 2,
      },
      {
        phrases: [
          "warning",
          "deprecated",
          "timeout",
          "retry",
          "workaround",
          "flaky",
          "告警",
          "超时",
          "重试",
          "临时方案",
        ],
        weight: 1,
      },
    ],
    negations: ["no error", "without error", "not a bug", "error-free", "没有报错", "无异常", "不是bug"],
    threshold: 3,
    priority: 3,
  },
  {
    kind: "code_decision",
    signals: [
      {
        phrases: [
          "architecture decision",
          "design choice",
          "tradeoff",
          "trade-off",
          "tech stack",
          "we chose",
          "decided to use",
          "migration plan",
          "架构决策",
          "技术选型",
          "权衡取舍",
          "我们选择了",
          "迁移方案",
        ],
        weight: 3,
      },
      {
        phrases: [
          "decision",
          "decide",
          "architecture",
          "pattern",
          "refactor",
          "migration",
          "approach",
          "strategy",
          "convention",
          "决策",
          "架构",
          "重构",
          "迁移",
          "方案",
          "策略",
          "规范",
        ],
        weight: 2,
      },
      {
        phrases: ["compare", "versus", "alternative", "pros and cons", "evaluate", "对比", "方案对比", "优劣", "评估"],
        weight: 1,
      },
    ],
    negations: [],
    threshold: 3,
    priority: 2,
  },
  {
    kind: "project_context",
    signals: [
      {
        phrases: [
          "project setup",
          "tech stack",
          "project structure",
          "monorepo",
          "repository",
          "toolchain",
          "development environment",
          "项目结构",
          "技术栈",
          "工程配置",
          "仓库结构",
          "开发环境",
        ],
        weight: 3,
      },
      {
        phrases: [
          "project",
          "workspace",
          "environment",
          "config",
          "dependency",
          "version",
          "framework",
          "library",
          "context",
          "stack",
          "项目",
          "环境",
          "配置",
          "依赖",
          "框架",
          "版本",
        ],
        weight: 2,
      },
      {
        phrases: ["setup", "install", "init", "scaffold", "boilerplate", "搭建", "初始化", "安装", "脚手架"],
        weight: 1,
      },
    ],
    negations: [],
    threshold: 3,
    priority: 1,
  },
];

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

export function classifyMemoryKind(text: string): MemoryKind {
  const lower = text.toLowerCase();
  let bestKind: MemoryKind = "note";
  let bestScore = 0;
  let bestPriority = 0;

  for (const rule of KIND_RULES) {
    if (includesAny(lower, rule.negations)) {
      continue;
    }

    let score = 0;
    for (const signal of rule.signals) {
      if (includesAny(lower, signal.phrases)) {
        score += signal.weight;
      }
    }

    if (score < rule.threshold) {
      continue;
    }

    if (score > bestScore || (score === bestScore && rule.priority > bestPriority)) {
      bestKind = rule.kind;
      bestScore = score;
      bestPriority = rule.priority;
    }
  }

  return bestKind;
}

export function classifyMemoryImportance(text: string): "high" | "medium" | "low" {
  const lower = text.toLowerCase();
  if (
    lower.includes("critical") ||
    lower.includes("urgent") ||
    lower.includes("security") ||
    lower.includes("production")
  ) {
    return "high";
  }
  if (text.length >= 240) {
    return "medium";
  }
  return "low";
}
