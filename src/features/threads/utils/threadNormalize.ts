import type {
  RateLimitSnapshot,
  ReviewTarget,
  ThreadTokenUsage,
  TurnPlan,
  TurnPlanStep,
  TurnPlanStepStatus,
} from "../../../types";

export function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

export function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

export function normalizeStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => asString(entry)).filter(Boolean);
  }
  const single = asString(value);
  return single ? [single] : [];
}

export function normalizeRootPath(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function extractRpcErrorMessage(response: unknown) {
  if (!response || typeof response !== "object") {
    return null;
  }
  const record = response as Record<string, unknown>;
  if (!record.error) {
    return null;
  }
  const errorValue = record.error;
  if (typeof errorValue === "string") {
    return errorValue;
  }
  if (typeof errorValue === "object" && errorValue) {
    const message = asString((errorValue as Record<string, unknown>).message);
    return message || "Request failed.";
  }
  return "Request failed.";
}

export function normalizeTokenUsage(raw: Record<string, unknown>): ThreadTokenUsage {
  const total = (raw.total as Record<string, unknown>) ?? {};
  const last = (raw.last as Record<string, unknown>) ?? {};
  const optionalNumber = (value: unknown) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  const optionalString = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  const normalizeContextToolUsages = (value: unknown) => {
    if (!Array.isArray(value)) return null;
    return value
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const name = optionalString(record.name);
        const tokens = optionalNumber(record.tokens);
        if (!name || tokens === null) return null;
        return {
          name,
          server: optionalString(record.server),
          tokens,
        };
      })
      .filter((item): item is { name: string; server: string | null; tokens: number } => item !== null);
  };
  const normalizeContextCategoryUsages = (value: unknown) => {
    if (!Array.isArray(value)) return null;
    return value
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const name = optionalString(record.name);
        const tokens = optionalNumber(record.tokens);
        if (!name || tokens === null) return null;
        return {
          name,
          tokens,
          percent: optionalNumber(record.percent),
        };
      })
      .filter((item): item is { name: string; tokens: number; percent: number | null } => item !== null);
  };
  return {
    total: {
      totalTokens: asNumber(total.totalTokens ?? total.total_tokens),
      inputTokens: asNumber(total.inputTokens ?? total.input_tokens),
      cachedInputTokens: asNumber(
        total.cachedInputTokens ?? total.cached_input_tokens,
      ),
      outputTokens: asNumber(total.outputTokens ?? total.output_tokens),
      reasoningOutputTokens: asNumber(
        total.reasoningOutputTokens ?? total.reasoning_output_tokens,
      ),
    },
    last: {
      totalTokens: asNumber(last.totalTokens ?? last.total_tokens),
      inputTokens: asNumber(last.inputTokens ?? last.input_tokens),
      cachedInputTokens: asNumber(last.cachedInputTokens ?? last.cached_input_tokens),
      outputTokens: asNumber(last.outputTokens ?? last.output_tokens),
      reasoningOutputTokens: asNumber(
        last.reasoningOutputTokens ?? last.reasoning_output_tokens,
      ),
    },
    modelContextWindow: (() => {
      const value = raw.modelContextWindow ?? raw.model_context_window;
      return optionalNumber(value);
    })(),
    contextUsageSource: optionalString(
      raw.contextUsageSource ?? raw.context_usage_source,
    ),
    contextUsageFreshness: optionalString(
      raw.contextUsageFreshness ?? raw.context_usage_freshness,
    ),
    contextUsedTokens: optionalNumber(
      raw.contextUsedTokens ?? raw.context_used_tokens,
    ),
    contextUsedPercent: optionalNumber(
      raw.contextUsedPercent ?? raw.context_used_percent,
    ),
    contextRemainingPercent: optionalNumber(
      raw.contextRemainingPercent ?? raw.context_remaining_percent,
    ),
    contextToolUsages: normalizeContextToolUsages(
      raw.contextToolUsages ?? raw.context_tool_usages,
    ),
    contextToolUsagesTruncated:
      typeof (raw.contextToolUsagesTruncated ?? raw.context_tool_usages_truncated) === "boolean"
        ? Boolean(raw.contextToolUsagesTruncated ?? raw.context_tool_usages_truncated)
        : null,
    contextCategoryUsages: normalizeContextCategoryUsages(
      raw.contextCategoryUsages ?? raw.context_category_usages,
    ),
  };
}

export function normalizeRateLimits(raw: Record<string, unknown>): RateLimitSnapshot {
  const primary = (raw.primary as Record<string, unknown>) ?? null;
  const secondary = (raw.secondary as Record<string, unknown>) ?? null;
  const credits = (raw.credits as Record<string, unknown>) ?? null;
  return {
    primary: primary
      ? {
          usedPercent: asNumber(primary.usedPercent ?? primary.used_percent),
          windowDurationMins: (() => {
            const value = primary.windowDurationMins ?? primary.window_duration_mins;
            if (typeof value === "number") {
              return value;
            }
            if (typeof value === "string") {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })(),
          resetsAt: (() => {
            const value = primary.resetsAt ?? primary.resets_at;
            if (typeof value === "number") {
              return value;
            }
            if (typeof value === "string") {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })(),
        }
      : null,
    secondary: secondary
      ? {
          usedPercent: asNumber(secondary.usedPercent ?? secondary.used_percent),
          windowDurationMins: (() => {
            const value = secondary.windowDurationMins ?? secondary.window_duration_mins;
            if (typeof value === "number") {
              return value;
            }
            if (typeof value === "string") {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })(),
          resetsAt: (() => {
            const value = secondary.resetsAt ?? secondary.resets_at;
            if (typeof value === "number") {
              return value;
            }
            if (typeof value === "string") {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })(),
        }
      : null,
    credits: credits
      ? {
          hasCredits: Boolean(credits.hasCredits ?? credits.has_credits),
          unlimited: Boolean(credits.unlimited),
          balance: typeof credits.balance === "string" ? credits.balance : null,
        }
      : null,
    planType:
      typeof raw.planType === "string"
        ? raw.planType
        : typeof raw.plan_type === "string"
          ? raw.plan_type
          : null,
  };
}

export function normalizePlanStepStatus(value: unknown): TurnPlanStepStatus {
  const raw = typeof value === "string" ? value : "";
  const normalized = raw.replace(/[_\s-]/g, "").toLowerCase();
  if (normalized === "inprogress") {
    return "inProgress";
  }
  if (normalized === "completed") {
    return "completed";
  }
  return "pending";
}

export function normalizePlanUpdate(
  turnId: string,
  explanation: unknown,
  plan: unknown,
): TurnPlan | null {
  const steps = Array.isArray(plan)
    ? plan
        .map((entry) => {
          const step = asString((entry as Record<string, unknown>)?.step ?? "");
          if (!step) {
            return null;
          }
          return {
            step,
            status: normalizePlanStepStatus(
              (entry as Record<string, unknown>)?.status,
            ),
          } satisfies TurnPlanStep;
        })
        .filter((entry): entry is TurnPlanStep => Boolean(entry))
    : [];
  const note = asString(explanation).trim();
  if (!steps.length && !note) {
    return null;
  }
  return {
    turnId,
    explanation: note ? note : null,
    steps,
  };
}

export function settlePlanInProgressSteps(
  plan: TurnPlan | null,
  targetStatus: Exclude<TurnPlanStepStatus, "inProgress">,
): TurnPlan | null {
  if (!plan) {
    return plan;
  }
  let changed = false;
  const nextSteps = plan.steps.map((step) => {
    if (step.status !== "inProgress") {
      return step;
    }
    changed = true;
    return {
      ...step,
      status: targetStatus,
    };
  });
  if (!changed) {
    return plan;
  }
  return {
    ...plan,
    steps: nextSteps,
  };
}

export function resolvePlanStepStatusForDisplay(
  status: TurnPlanStepStatus,
  isProcessing: boolean,
): TurnPlanStepStatus {
  if (!isProcessing && status === "inProgress") {
    return "pending";
  }
  return status;
}

function parseSlashCommandHead(input: string): { command: string; rest: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const withoutSlash = trimmed.slice(1);
  if (!withoutSlash) {
    return null;
  }
  const token = withoutSlash.split(/\s+/, 1)[0]?.trim();
  if (!token) {
    return null;
  }
  const rest = withoutSlash.slice(token.length).trim();
  return {
    command: token.toLowerCase(),
    rest,
  };
}

export function parseReviewTarget(input: string): ReviewTarget {
  const trimmed = input.trim();
  const parsed = parseSlashCommandHead(trimmed);
  const rest =
    parsed && parsed.command === "review"
      ? parsed.rest
      : trimmed;
  if (!rest) {
    return { type: "uncommittedChanges" };
  }
  const lower = rest.toLowerCase();
  if (lower.startsWith("base ")) {
    const branch = rest.slice(5).trim();
    return { type: "baseBranch", branch };
  }
  if (lower.startsWith("commit ")) {
    const payload = rest.slice(7).trim();
    const [sha, ...titleParts] = payload.split(/\s+/);
    const title = titleParts.join(" ").trim();
    return {
      type: "commit",
      sha: sha ?? "",
      ...(title ? { title } : {}),
    };
  }
  if (lower.startsWith("custom ")) {
    const instructions = rest.slice(7).trim();
    return { type: "custom", instructions };
  }
  return { type: "custom", instructions: rest };
}
