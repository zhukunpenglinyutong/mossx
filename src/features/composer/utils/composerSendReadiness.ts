import type { AccessMode, EngineType, RuntimeLifecycleState } from "../../../types";
import type { RequestUserInputState } from "../../threads/contracts/conversationFactContract";
import { isRequestUserInputSettled } from "../../threads/contracts/conversationFactContract";

export type ComposerActivityKind =
  | "idle"
  | "processing"
  | "waiting"
  | "ingress"
  | "queued"
  | "fusing"
  | "blocked"
  | "awaitingUserInput";

export type ComposerPrimaryAction = "send" | "queue" | "stop" | "jumpToRequest" | "wait";

export type ComposerDisabledReason =
  | "runtime-recovering"
  | "runtime-quarantined"
  | "runtime-ended"
  | "mode-blocked"
  | "config-loading"
  | "awaiting-user-input"
  | "empty-draft";

export type ComposerContextSummaryInput = {
  selectedMemoryCount?: number;
  selectedNoteCardCount?: number;
  fileReferenceCount?: number;
  imageCount?: number;
  selectedAgentName?: string | null;
  ledgerBlockCount?: number | null;
  ledgerGroupCount?: number | null;
};

export type ComposerSendReadinessInput = {
  engine: EngineType;
  providerLabel?: string | null;
  modelLabel?: string | null;
  modeLabel?: string | null;
  modeImpactLabel?: string | null;
  accessMode?: AccessMode | null;
  draftText: string;
  hasAttachments?: boolean;
  isProcessing?: boolean;
  streamActivityPhase?: "idle" | "waiting" | "ingress";
  queuedCount?: number;
  fusingQueuedMessageId?: string | null;
  canQueue?: boolean;
  canStop?: boolean;
  configLoading?: boolean;
  modeBlocked?: boolean;
  runtimeLifecycleState?: RuntimeLifecycleState | null;
  requestUserInputState?: RequestUserInputState | null;
  context?: ComposerContextSummaryInput;
};

export type ComposerSendReadiness = {
  target: {
    engine: EngineType;
    providerLabel: string;
    modelLabel: string;
    modeLabel: string | null;
    modeImpactLabel: string | null;
    accessModeLabel: string | null;
  };
  contextSummary: {
    chips: string[];
    compactLabel: string;
    detailLabel: string;
  };
  readiness: {
    canSend: boolean;
    canQueue: boolean;
    canStop: boolean;
    disabledReason: ComposerDisabledReason | null;
    primaryAction: ComposerPrimaryAction;
  };
  activity: {
    kind: ComposerActivityKind;
    severity: "neutral" | "info" | "warning";
    shortLabel: string;
    detailLabel: string;
    actionHint: string | null;
  };
  requestPointer: {
    state: RequestUserInputState;
    blocksSend: boolean;
    canJumpToRequest: boolean;
  } | null;
};

function hasDraftIntent(input: ComposerSendReadinessInput) {
  return input.draftText.trim().length > 0 || input.hasAttachments === true;
}

function sanitizeContextCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export function buildComposerContextSummary(input: ComposerContextSummaryInput = {}) {
  const chips: string[] = [];
  const ledgerBlockCount = sanitizeContextCount(input.ledgerBlockCount);
  const ledgerGroupCount = sanitizeContextCount(input.ledgerGroupCount);
  if (ledgerBlockCount > 0 || ledgerGroupCount > 0) {
    const ledgerChips: string[] = [];
    if (ledgerBlockCount > 0) {
      ledgerChips.push(`items:${ledgerBlockCount}`);
    }
    if (ledgerGroupCount > 0) {
      ledgerChips.push(`groups:${ledgerGroupCount}`);
    }
    return {
      chips: ledgerChips,
      compactLabel: ledgerChips.join(" · "),
      detailLabel: `Context ledger: ${ledgerChips.join(", ")}`,
    };
  }
  const selectedMemoryCount = sanitizeContextCount(input.selectedMemoryCount);
  const selectedNoteCardCount = sanitizeContextCount(input.selectedNoteCardCount);
  const fileReferenceCount = sanitizeContextCount(input.fileReferenceCount);
  const imageCount = sanitizeContextCount(input.imageCount);
  if (selectedMemoryCount > 0) {
    chips.push(`memory:${selectedMemoryCount}`);
  }
  if (selectedNoteCardCount > 0) {
    chips.push(`notes:${selectedNoteCardCount}`);
  }
  if (fileReferenceCount > 0) {
    chips.push(`files:${fileReferenceCount}`);
  }
  if (imageCount > 0) {
    chips.push(`images:${imageCount}`);
  }
  const selectedAgentName = input.selectedAgentName?.trim();
  if (selectedAgentName) {
    chips.push(`agent:${selectedAgentName}`);
  }
  return {
    chips,
    compactLabel: chips.length > 0 ? chips.join(" · ") : "no-extra-context",
    detailLabel:
      chips.length > 0
        ? `Sending with ${chips.join(", ")}`
        : "Sending without extra context.",
  };
}

export function resolveComposerDisabledReason(
  input: ComposerSendReadinessInput,
): ComposerDisabledReason | null {
  if (input.configLoading) {
    return "config-loading";
  }
  if (input.requestUserInputState && !isRequestUserInputSettled(input.requestUserInputState)) {
    return "awaiting-user-input";
  }
  if (input.modeBlocked) {
    return "mode-blocked";
  }
  if (
    input.runtimeLifecycleState === "recovering" ||
    input.runtimeLifecycleState === "stopping" ||
    input.runtimeLifecycleState === "replacing"
  ) {
    return "runtime-recovering";
  }
  if (input.runtimeLifecycleState === "quarantined") {
    return "runtime-quarantined";
  }
  if (input.runtimeLifecycleState === "ended") {
    return "runtime-ended";
  }
  if (!hasDraftIntent(input)) {
    return "empty-draft";
  }
  return null;
}

export function projectComposerActivity(
  input: ComposerSendReadinessInput,
): ComposerSendReadiness["activity"] {
  const disabledReason = resolveComposerDisabledReason(input);
  if (disabledReason && disabledReason !== "empty-draft") {
    return {
      kind: disabledReason === "awaiting-user-input" ? "awaitingUserInput" : "blocked",
      severity: "warning",
      shortLabel: disabledReason,
      detailLabel: `Composer is blocked by ${disabledReason}.`,
      actionHint: disabledReason === "awaiting-user-input" ? "jumpToRequest" : "wait",
    };
  }
  if (input.fusingQueuedMessageId) {
    return {
      kind: "fusing",
      severity: "info",
      shortLabel: "fusing",
      detailLabel: "Queued message is being fused into the active turn.",
      actionHint: null,
    };
  }
  if ((input.queuedCount ?? 0) > 0) {
    return {
      kind: "queued",
      severity: "info",
      shortLabel: `queued:${input.queuedCount}`,
      detailLabel: `${input.queuedCount} queued message(s).`,
      actionHint: null,
    };
  }
  if (input.streamActivityPhase === "ingress") {
    return {
      kind: "ingress",
      severity: "info",
      shortLabel: "streaming",
      detailLabel: "Response stream is entering the conversation.",
      actionHint: null,
    };
  }
  if (input.streamActivityPhase === "waiting") {
    return {
      kind: "waiting",
      severity: "info",
      shortLabel: "waiting",
      detailLabel: "Request accepted; waiting for first response.",
      actionHint: null,
    };
  }
  if (input.isProcessing) {
    return {
      kind: "processing",
      severity: "info",
      shortLabel: "processing",
      detailLabel: "Current turn is running.",
      actionHint: input.canStop ? "stop" : null,
    };
  }
  return {
    kind: "idle",
    severity: "neutral",
    shortLabel: "ready",
    detailLabel: "Ready to send.",
    actionHint: null,
  };
}

export function buildComposerSendReadiness(
  input: ComposerSendReadinessInput,
): ComposerSendReadiness {
  const disabledReason = resolveComposerDisabledReason(input);
  const isActiveTurn =
    input.isProcessing === true ||
    input.streamActivityPhase === "waiting" ||
    input.streamActivityPhase === "ingress";
  const hasHardBlock = disabledReason !== null && disabledReason !== "empty-draft";
  const canSend = disabledReason === null && !isActiveTurn;
  const canQueue =
    hasDraftIntent(input) &&
    input.canQueue === true &&
    isActiveTurn &&
    !hasHardBlock;
  const requestPointer =
    input.requestUserInputState && !isRequestUserInputSettled(input.requestUserInputState)
      ? {
          state: input.requestUserInputState,
          blocksSend: true,
          canJumpToRequest: true,
        }
      : null;
  const primaryAction: ComposerPrimaryAction = canSend
    ? "send"
    : requestPointer
      ? "jumpToRequest"
      : canQueue
        ? "queue"
      : input.isProcessing && input.canStop
        ? "stop"
        : "wait";

  return {
    target: {
      engine: input.engine,
      providerLabel: input.providerLabel ?? input.engine,
      modelLabel: input.modelLabel ?? "default",
      modeLabel: input.modeLabel ?? null,
      modeImpactLabel: input.modeImpactLabel ?? null,
      accessModeLabel: input.accessMode ?? null,
    },
    contextSummary: buildComposerContextSummary(input.context),
    readiness: {
      canSend,
      canQueue,
      canStop: input.canStop === true,
      disabledReason,
      primaryAction,
    },
    activity: projectComposerActivity(input),
    requestPointer,
  };
}
