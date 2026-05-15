import type { ConversationItem } from "../../../types";

export type CodexRecoveryOutcomeKind =
  | "rebound"
  | "fresh"
  | "failed"
  | "abandoned"
  | "recoverable"
  | "recovered";

export type CodexLivenessStage =
  | "draft"
  | "durable"
  | "durable-safe"
  | "identity-stale"
  | "runtime-ready"
  | "active"
  | "suspected-silent"
  | "stalled"
  | "abandoned"
  | "fresh-continuation";

export type CodexAcceptedTurnFact = "accepted" | "empty-draft" | "unknown";

export type CodexAcceptedTurnRecord = {
  fact: CodexAcceptedTurnFact;
  source: string;
  updatedAt: number;
};

export type CodexAcceptedTurnResolution = {
  fact: CodexAcceptedTurnFact;
  source: string;
  hasDurableActivity: boolean;
};

export type CodexLivenessDiagnosticPayload = {
  workspaceId: string;
  threadId: string;
  stage: CodexLivenessStage;
  outcome?: CodexRecoveryOutcomeKind | null;
  acceptedTurnFact?: CodexAcceptedTurnFact | null;
  source: string;
  reason?: string | null;
  runtimeGeneration?: number | string | null;
  turnId?: string | null;
  lastEventAgeMs?: number | null;
};

function isOptimisticLocalItem(item: ConversationItem): boolean {
  return (
    item.id.startsWith("optimistic-user-") ||
    item.id.startsWith("optimistic-generated-image:")
  );
}

export function hasDurableCodexConversationActivity(
  items: readonly ConversationItem[] | null | undefined,
): boolean {
  if (!items || items.length === 0) {
    return false;
  }
  return items.some((item) => {
    if (isOptimisticLocalItem(item)) {
      return false;
    }
    if (item.kind === "message") {
      return item.text.trim().length > 0 || (item.images?.length ?? 0) > 0;
    }
    if (item.kind === "generatedImage") {
      return item.status !== "processing";
    }
    return true;
  });
}

export function resolveCodexAcceptedTurnFact(params: {
  record?: CodexAcceptedTurnRecord | null;
  items?: readonly ConversationItem[] | null;
}): CodexAcceptedTurnResolution {
  const hasDurableActivity = hasDurableCodexConversationActivity(params.items);
  if (params.record?.fact === "accepted" || hasDurableActivity) {
    return {
      fact: "accepted",
      source: params.record?.fact === "accepted" ? params.record.source : "durable-items",
      hasDurableActivity,
    };
  }
  if (params.record?.fact === "empty-draft") {
    return {
      fact: "empty-draft",
      source: params.record.source,
      hasDurableActivity,
    };
  }
  return {
    fact: "unknown",
    source: params.record?.source ?? "no-authoritative-fact",
    hasDurableActivity,
  };
}

export function canUseDisposableCodexDraftReplacement(
  resolution: CodexAcceptedTurnResolution,
): boolean {
  return resolution.fact === "empty-draft";
}

export function shouldDeferCodexActivityUntilTurnAccepted(
  resolution: CodexAcceptedTurnResolution,
): boolean {
  return resolution.fact === "empty-draft" ||
    (resolution.fact === "unknown" && !resolution.hasDurableActivity);
}

export function canUseLocalFirstSendCodexDraftReplacement(params: {
  resolution: CodexAcceptedTurnResolution;
  hasLocalUserIntent: boolean;
}): boolean {
  if (canUseDisposableCodexDraftReplacement(params.resolution)) {
    return true;
  }
  return (
    params.hasLocalUserIntent &&
    params.resolution.fact === "unknown" &&
    !params.resolution.hasDurableActivity
  );
}

export function buildCodexLivenessDiagnostic(
  payload: CodexLivenessDiagnosticPayload,
): Record<string, unknown> {
  return {
    workspaceId: payload.workspaceId,
    threadId: payload.threadId,
    engine: "codex",
    stage: payload.stage,
    outcome: payload.outcome ?? null,
    acceptedTurnFact: payload.acceptedTurnFact ?? null,
    source: payload.source,
    reason: payload.reason ?? null,
    runtimeGeneration: payload.runtimeGeneration ?? null,
    turnId: payload.turnId ?? null,
    lastEventAgeMs: payload.lastEventAgeMs ?? null,
  };
}
