export type CodexLeadTone =
  | "plan"
  | "result"
  | "verify"
  | "summary"
  | "risk"
  | "decision"
  | "next";

export type CodexLeadMarkerRule = {
  tone: CodexLeadTone;
  icon: string;
  keywords: string[];
  exact?: RegExp[];
  priority?: number;
};

export type CodexLeadMarkerConfig = {
  maxLeadLength: number;
  minScore: number;
  rules: CodexLeadMarkerRule[];
};

export const DEFAULT_CODEX_LEAD_MARKER_CONFIG: CodexLeadMarkerConfig = {
  maxLeadLength: 64,
  minScore: 3,
  rules: [
    {
      tone: "plan",
      icon: "🧭",
      keywords: [
        "plan",
        "planning",
        "计划",
        "方案",
        "实施方案",
        "执行方案",
        "执行计划",
        "steps",
        "实施步骤",
        "work plan",
      ],
      exact: [/^plan(?:\s+mode)?[:：]?$/i, /^(计划|方案|执行计划|实施方案)[:：]?$/],
      priority: 2,
    },
    {
      tone: "result",
      icon: "📌",
      keywords: [
        "result",
        "results",
        "outcome",
        "change summary",
        "变更结果",
        "执行结果",
        "结果",
        "完成情况",
        "已完成",
      ],
      exact: [/^(变更结果|执行结果|结果|outcomes?|results?)[:：]?$/i],
      priority: 2,
    },
    {
      tone: "verify",
      icon: "✅",
      keywords: [
        "verify",
        "verification",
        "check",
        "checks",
        "validation",
        "校验",
        "验证",
        "检查",
        "验收",
        "回归",
        "测试通过",
      ],
      exact: [/^(已执行校验|校验|验证|检查|验收|verification|checks?)[:：]?$/i],
      priority: 2,
    },
    {
      tone: "summary",
      icon: "🧾",
      keywords: ["summary", "recap", "tl;dr", "总结", "结论", "概览", "核心结论"],
      exact: [/^(总结|结论|概览|summary|recap)[:：]?$/i],
      priority: 1,
    },
    {
      tone: "risk",
      icon: "⚠️",
      keywords: ["risk", "warning", "caveat", "风险", "注意", "注意事项", "陷阱", "坑", "边界"],
    },
    {
      tone: "decision",
      icon: "🧠",
      keywords: [
        "decision",
        "decisions",
        "trade-off",
        "tradeoff",
        "architecture decision",
        "决策",
        "取舍",
        "架构决策",
      ],
    },
    {
      tone: "next",
      icon: "🚀",
      keywords: [
        "next",
        "next step",
        "next steps",
        "follow-up",
        "todo",
        "action",
        "下一步",
        "后续",
        "行动项",
        "待办",
        "建议",
      ],
      exact: [/^(下一步|后续|行动项|待办|next\s+steps?)[:：]?$/i],
      priority: 1,
    },
  ],
};

function normalizeLeadText(rawText: string): string {
  return rawText
    .trim()
    .replace(/^[\s\-*\d.()【】#>\u005B\u005D]+/, "")
    .replace(/^[:：\-\s]+|[:：\-\s]+$/g, "")
    .replace(/^[\p{Emoji_Presentation}\p{Emoji}\uFE0F\u200D]+/gu, "")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function scoreLeadRule(text: string, rule: CodexLeadMarkerRule): number {
  let score = 0;

  if (rule.exact?.some((pattern) => pattern.test(text))) {
    score += 8;
  }

  for (const keyword of rule.keywords) {
    const token = keyword.trim().toLowerCase();
    if (!token) {
      continue;
    }
    if (text === token) {
      score += 5;
      continue;
    }
    if (text.startsWith(token)) {
      score += 3;
      continue;
    }
    if (text.includes(token)) {
      score += 1;
    }
  }

  if (rule.priority) {
    score += rule.priority;
  }

  return score;
}

export function detectCodexLeadMarker(
  rawText: string,
  config: CodexLeadMarkerConfig = DEFAULT_CODEX_LEAD_MARKER_CONFIG,
): { tone: CodexLeadTone; icon: string } | null {
  const text = normalizeLeadText(rawText);
  if (!text || text.length > config.maxLeadLength) {
    return null;
  }

  let best: { tone: CodexLeadTone; icon: string; score: number } | null = null;
  for (const rule of config.rules) {
    const score = scoreLeadRule(text, rule);
    if (score < config.minScore) {
      continue;
    }
    if (!best || score > best.score) {
      best = { tone: rule.tone, icon: rule.icon, score };
    }
  }

  return best ? { tone: best.tone, icon: best.icon } : null;
}
