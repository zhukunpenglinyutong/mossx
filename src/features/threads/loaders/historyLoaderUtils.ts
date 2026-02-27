import type {
  RequestUserInputQuestion,
  RequestUserInputRequest,
  TurnPlan,
} from "../../../types";
import { normalizePlanUpdate } from "../utils/threadNormalize";

export function asString(value: unknown): string {
  return typeof value === "string" ? value : value ? String(value) : "";
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function asRequestId(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed;
  }
  return null;
}

function toRecordList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asRecord(entry))
      .filter((entry) => Object.keys(entry).length > 0);
  }
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? [record] : [];
}

function normalizeUserInputQuestion(
  input: Record<string, unknown>,
  index: number,
): RequestUserInputQuestion | null {
  const questionId = asString(input.id ?? `question-${index + 1}`).trim();
  if (!questionId) {
    return null;
  }

  const options = toRecordList(input.options)
    .map((option) => {
      const label = asString(option.label ?? "").trim();
      const description = asString(option.description ?? "").trim();
      if (!label && !description) {
        return null;
      }
      return { label, description };
    })
    .filter((option): option is { label: string; description: string } => option !== null);

  const question = asString(input.question ?? input.prompt ?? "").trim();
  if (!question && options.length === 0) {
    return null;
  }

  return {
    id: questionId,
    header: asString(input.header ?? input.title ?? "").trim(),
    question,
    isOther: asBoolean(input.isOther ?? input.is_other),
    isSecret: asBoolean(input.isSecret ?? input.is_secret),
    options: options.length > 0 ? options : undefined,
  };
}

function normalizeUserInputQuestions(input: unknown): RequestUserInputQuestion[] {
  return toRecordList(input)
    .map((question, index) => normalizeUserInputQuestion(question, index))
    .filter((question): question is RequestUserInputQuestion => question !== null);
}

function normalizeUserInputRequest(
  request: Record<string, unknown>,
  workspaceId: string,
  threadId: string,
  turnIdFallback: string | null,
): RequestUserInputRequest | null {
  const params = asRecord(request.params);
  const requestId = asRequestId(request.request_id ?? request.requestId ?? request.id);
  if (requestId === null) {
    return null;
  }

  const resolvedWorkspaceId =
    asString(
      request.workspace_id ??
        request.workspaceId ??
        params.workspace_id ??
        params.workspaceId ??
        workspaceId,
    ).trim() || workspaceId;
  const resolvedThreadId =
    asString(
      params.thread_id ??
        params.threadId ??
        request.thread_id ??
        request.threadId ??
        threadId,
    ).trim() || threadId;
  const resolvedTurnId =
    asString(
      params.turn_id ??
        params.turnId ??
        request.turn_id ??
        request.turnId ??
        turnIdFallback ??
        "",
    ).trim() || (turnIdFallback ?? "");
  const resolvedItemId =
    asString(
      params.item_id ??
        params.itemId ??
        request.item_id ??
        request.itemId ??
        `request-${String(requestId)}`,
    ).trim() || `request-${String(requestId)}`;
  const questions = normalizeUserInputQuestions(
    params.questions ?? request.questions ?? [],
  );

  return {
    workspace_id: resolvedWorkspaceId,
    request_id: requestId,
    params: {
      thread_id: resolvedThreadId,
      turn_id: resolvedTurnId,
      item_id: resolvedItemId,
      questions,
    },
  };
}

export function extractLatestTurnPlan(thread: Record<string, unknown>): TurnPlan | null {
  const turns = Array.isArray(thread.turns) ? (thread.turns as Record<string, unknown>[]) : [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const turnId = asString(turn.id ?? turn.turnId ?? turn.turn_id ?? `turn-${index + 1}`);
    const explanation = turn.explanation ?? turn.planExplanation ?? turn.plan_explanation ?? null;
    const planRaw = turn.plan ?? turn.steps ?? null;
    const normalized = normalizePlanUpdate(turnId, explanation, planRaw);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export function extractUserInputQueueFromThread(
  thread: Record<string, unknown>,
  workspaceId: string,
  threadId: string,
): RequestUserInputRequest[] {
  const queue: RequestUserInputRequest[] = [];
  const seen = new Set<string>();

  const append = (
    candidate: unknown,
    turnIdFallback: string | null,
  ) => {
    for (const entry of toRecordList(candidate)) {
      const normalized = normalizeUserInputRequest(
        entry,
        workspaceId,
        threadId,
        turnIdFallback,
      );
      if (!normalized) {
        continue;
      }
      const key = `${normalized.workspace_id}:${String(normalized.request_id)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      queue.push(normalized);
    }
  };

  append(thread.userInputQueue ?? thread.user_input_queue, null);

  const turns = Array.isArray(thread.turns) ? (thread.turns as Record<string, unknown>[]) : [];
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    const turnId = asString(
      turn.id ?? turn.turnId ?? turn.turn_id ?? `turn-${index + 1}`,
    ).trim();
    append(
      turn.userInputQueue ??
        turn.user_input_queue ??
        turn.requestUserInput ??
        turn.request_user_input,
      turnId || null,
    );
  }

  return queue;
}
