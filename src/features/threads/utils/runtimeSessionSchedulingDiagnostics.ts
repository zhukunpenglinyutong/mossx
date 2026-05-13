import type {
  RuntimeSessionVisibilityPriority,
} from "./runtimeSessionScheduling";

export type RuntimeSessionSchedulingDiagnosticInput = {
  workspaceId: string | null;
  threadId: string;
  engine: string | null;
  turnId: string | null;
  visibility: RuntimeSessionVisibilityPriority;
  ingressCadenceMs?: number | null;
  bufferDepth?: number | null;
  flushDurationMs?: number | null;
  renderCostMs?: number | null;
  longTaskCount?: number | null;
  rollbackFlags?: {
    backgroundRenderGating: boolean;
    backgroundBufferedFlush: boolean;
    stagedHydration: boolean;
  };
};

export type RuntimeSessionSchedulingDiagnosticPayload =
  Required<
    Pick<
      RuntimeSessionSchedulingDiagnosticInput,
      "threadId" | "visibility"
    >
  > &
    Omit<
      RuntimeSessionSchedulingDiagnosticInput,
      "threadId" | "visibility"
    > & {
      emittedAtMs: number;
    };

export function buildRuntimeSessionSchedulingDiagnostic(
  input: RuntimeSessionSchedulingDiagnosticInput,
  nowMs = Date.now(),
): RuntimeSessionSchedulingDiagnosticPayload {
  return {
    workspaceId: normalizeNullableString(input.workspaceId),
    threadId: input.threadId,
    engine: normalizeNullableString(input.engine),
    turnId: normalizeNullableString(input.turnId),
    visibility: input.visibility,
    ingressCadenceMs: normalizeNullableNumber(input.ingressCadenceMs),
    bufferDepth: normalizeNullableInteger(input.bufferDepth),
    flushDurationMs: normalizeNullableNumber(input.flushDurationMs),
    renderCostMs: normalizeNullableNumber(input.renderCostMs),
    longTaskCount: normalizeNullableInteger(input.longTaskCount),
    rollbackFlags: input.rollbackFlags,
    emittedAtMs: Math.max(0, Math.trunc(nowMs)),
  };
}

function normalizeNullableString(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeNullableNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : null;
}

function normalizeNullableInteger(value: number | null | undefined) {
  const normalized = normalizeNullableNumber(value);
  return normalized === null ? null : Math.trunc(normalized);
}
