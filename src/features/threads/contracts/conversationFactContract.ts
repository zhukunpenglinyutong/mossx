import type { ConversationItem } from "../../../types";
import type { ConversationEngine } from "./conversationCurtainContracts";

export type ConversationFactKind =
  | "dialogue"
  | "reasoning"
  | "tool"
  | "control-event"
  | "hidden-control-plane"
  | "presentation-state";

export type ConversationFactVisibility =
  | "visible"
  | "hidden"
  | "compact"
  | "presentation-only";

export type ConversationFactConfidence = "exact" | "normalized" | "legacy-safe";

export type ConversationFactSource =
  | "realtime"
  | "completed"
  | "history"
  | "reconcile"
  | "local";

export type RequestUserInputState =
  | "pending"
  | "submitted"
  | "timeout"
  | "dismissed"
  | "cancelled"
  | "stale";

export type ConversationFact = {
  factKind: ConversationFactKind;
  visibility: ConversationFactVisibility;
  confidence: ConversationFactConfidence;
  engine: ConversationEngine;
  threadId: string;
  turnId?: string | null;
  source: ConversationFactSource;
  semanticKey?: string | null;
  item?: ConversationItem;
  requestUserInputState?: RequestUserInputState | null;
  controlReason?: string | null;
};

export type ConversationObservation = {
  engine: ConversationEngine;
  threadId: string;
  turnId?: string | null;
  source: ConversationFactSource;
  item?: ConversationItem | null;
  rawText?: string | null;
  rawType?: string | null;
  requestUserInputState?: RequestUserInputState | null;
};

const HIDDEN_CONTROL_MARKERS = [
  "<ccgui-approval-resume>",
  "No response requested.",
  "queue bookkeeping",
  "request_user_input_result",
] as const;

const COMPACT_CONTROL_REASONS = [
  "modeBlocked",
  "mode_blocked",
  "resume failed",
  "interrupted",
  "runtime recovered",
] as const;

const COMPACT_CONTROL_TOOL_TYPES = new Set(["modeblocked", "mode_blocked"]);

function normalizeControlProbe(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isExactOrControlLine(rawText: string | null | undefined, marker: string) {
  const normalizedMarker = marker.toLowerCase();
  return (rawText ?? "")
    .split(/\r?\n/)
    .map((line) => normalizeControlProbe(line).toLowerCase())
    .some((line) => line === normalizedMarker || line.startsWith(`${normalizedMarker}:`));
}

function isDeveloperInstructionsControlObservation(observation: ConversationObservation) {
  const rawType = normalizeControlProbe(observation.rawType ?? "").toLowerCase();
  if (rawType === "developer_instructions") {
    return true;
  }
  return (observation.rawText ?? "")
    .split(/\r?\n/)
    .map((line) => normalizeControlProbe(line).toLowerCase())
    .some(
      (line) =>
        line === "developer_instructions" ||
        line.startsWith("developer_instructions=") ||
        line.startsWith("developer_instructions:"),
    );
}

function isHiddenControlObservation(observation: ConversationObservation, rawProbeLower: string) {
  if (rawProbeLower.includes("<ccgui-approval-resume>")) {
    return true;
  }
  if (isDeveloperInstructionsControlObservation(observation)) {
    return true;
  }
  return HIDDEN_CONTROL_MARKERS.some((marker) =>
    isExactOrControlLine(observation.rawText, marker),
  );
}

function resolveCompactControlReason(observation: ConversationObservation) {
  const rawType = normalizeControlProbe(observation.rawType ?? "").toLowerCase();
  const rawText = observation.rawText ?? "";
  return COMPACT_CONTROL_REASONS.find((reason) => {
    const normalizedReason = reason.toLowerCase();
    return rawType === normalizedReason || isExactOrControlLine(rawText, reason);
  });
}

export function isRequestUserInputSettled(state: RequestUserInputState | null | undefined) {
  return (
    state === "submitted" ||
    state === "timeout" ||
    state === "dismissed" ||
    state === "cancelled" ||
    state === "stale"
  );
}

export function classifyConversationObservation(
  observation: ConversationObservation,
): ConversationFact {
  const item = observation.item ?? undefined;
  const rawProbe = normalizeControlProbe(
    [observation.rawType, observation.rawText, item?.kind].filter(Boolean).join(" "),
  );
  const rawProbeLower = rawProbe.toLowerCase();

  const base = {
    engine: observation.engine,
    threadId: observation.threadId,
    turnId: observation.turnId ?? null,
    source: observation.source,
    item,
  } satisfies Pick<
    ConversationFact,
    "engine" | "threadId" | "turnId" | "source" | "item"
  >;

  if (isHiddenControlObservation(observation, rawProbeLower)) {
    return {
      ...base,
      factKind: "hidden-control-plane",
      visibility: "hidden",
      confidence: "normalized",
      semanticKey: rawProbeLower,
      controlReason: "hidden-control-plane",
    };
  }

  if (observation.requestUserInputState) {
    return {
      ...base,
      factKind: "tool",
      visibility: "visible",
      confidence: "exact",
      semanticKey: `request_user_input:${observation.requestUserInputState}`,
      requestUserInputState: observation.requestUserInputState,
      controlReason: isRequestUserInputSettled(observation.requestUserInputState)
        ? "request-user-input-settled"
        : "request-user-input-pending",
    };
  }

  const compactReason = resolveCompactControlReason(observation);
  if (compactReason) {
    return {
      ...base,
      factKind: "control-event",
      visibility: "compact",
      confidence: "normalized",
      semanticKey: compactReason.toLowerCase(),
      controlReason: compactReason,
    };
  }

  if (item?.kind === "message") {
    return {
      ...base,
      factKind: "dialogue",
      visibility: "visible",
      confidence: "exact",
      semanticKey: `${item.role}:${item.text.trim()}`,
    };
  }

  if (item?.kind === "reasoning") {
    return {
      ...base,
      factKind: "reasoning",
      visibility: "visible",
      confidence: "exact",
      semanticKey: `${item.summary.trim()}:${item.content.trim()}`,
    };
  }

  if (item?.kind === "tool") {
    return {
      ...base,
      factKind: "tool",
      visibility: "visible",
      confidence: "exact",
      semanticKey: `${item.toolType}:${item.title}`,
    };
  }

  return {
    ...base,
    factKind: "dialogue",
    visibility: "visible",
    confidence: "legacy-safe",
    semanticKey: rawProbe || null,
  };
}

export function isCompactControlToolItem(
  item: ConversationItem | null | undefined,
): item is Extract<ConversationItem, { kind: "tool" }> {
  if (item?.kind !== "tool") {
    return false;
  }
  return COMPACT_CONTROL_TOOL_TYPES.has(item.toolType.trim().toLowerCase());
}

export function formatCompactControlToolItem(
  item: Extract<ConversationItem, { kind: "tool" }>,
): Extract<ConversationItem, { kind: "tool" }> {
  if (!isCompactControlToolItem(item)) {
    return item;
  }
  return {
    ...item,
    toolType: "modeBlocked",
    title: item.title.trim() || "Tool: mode policy",
    detail: item.detail.trim() || "modeBlocked",
    status: item.status ?? "completed",
    output: item.output?.trim() || "Mode policy blocked this action.",
  };
}
