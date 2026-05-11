import { useCallback } from "react";
import type { Dispatch } from "react";
import i18n from "../../../i18n";
import type { RequestUserInputRequest, RequestUserInputResponse } from "../../../types";
import { respondToUserInputRequest } from "../../../services/tauri";
import type { ThreadAction } from "./useThreadsReducer";

type UseThreadUserInputOptions = {
  dispatch: Dispatch<ThreadAction>;
  resolveClaudeContinuationThreadId?: (
    workspaceId: string,
    threadId: string,
    turnId?: string | null,
  ) => string | null;
};

type SubmittedQuestion = {
  id: string;
  header: string;
  question: string;
  options?: Array<{ label: string; description: string }>;
  selectedOptions: string[];
  note: string;
};

type SubmittedUserInputPayload = {
  schema: "requestUserInputSubmitted/v1";
  submittedAt: number;
  questions: SubmittedQuestion[];
};

function normalizeSubmittedAnswer(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed;
}

function parseSubmittedAnswer(rawAnswers: string[]) {
  const selectedOptions: string[] = [];
  let note = "";

  for (const rawAnswer of rawAnswers) {
    const normalized = normalizeSubmittedAnswer(rawAnswer);
    if (!normalized) {
      continue;
    }
    if (normalized.toLowerCase().startsWith("user_note:")) {
      const parsedNote = normalized.slice("user_note:".length).trim();
      if (parsedNote) {
        note = parsedNote;
      }
      continue;
    }
    selectedOptions.push(normalized);
  }

  return { selectedOptions, note };
}

function buildSubmittedPayload(
  request: RequestUserInputRequest,
  response: RequestUserInputResponse,
): SubmittedUserInputPayload {
  const questions: SubmittedQuestion[] = request.params.questions
    .filter((question) => question.id.trim().length > 0)
    .map((question) => {
      const answerValue = response.answers[question.id]?.answers ?? [];
      const { selectedOptions, note } = parseSubmittedAnswer(answerValue);
      return {
        id: question.id,
        header: question.header,
        question: question.question,
        options: question.options,
        selectedOptions,
        note,
      };
    });

  return {
    schema: "requestUserInputSubmitted/v1",
    submittedAt: Date.now(),
    questions,
  };
}

function buildSubmittedFallbackOutput(payload: SubmittedUserInputPayload) {
  const isChineseLocale = (i18n.resolvedLanguage ?? i18n.language).startsWith("zh");
  const listSeparator = isChineseLocale ? "；" : "; ";
  const labelSeparator = isChineseLocale ? "：" : ": ";
  const lines: string[] = [i18n.t("approval.userInputSubmittedBanner")];
  for (const question of payload.questions) {
    const questionText =
      question.question.trim() || question.header.trim() || question.id;
    const selected = question.selectedOptions.join(listSeparator);
    const note = question.note
      ? `${i18n.t("approval.noteLabel")}${labelSeparator}${question.note}`
      : "";
    const value = [selected, note].filter(Boolean).join(listSeparator);
    lines.push(questionText);
    lines.push(value || i18n.t("approval.noAnswerProvided"));
  }
  if (lines.length === 1) {
    lines.push(i18n.t("approval.noDisplayableAnswer"));
  }
  return lines.join("\n");
}

function buildSubmittedTitle(payload: SubmittedUserInputPayload) {
  for (const question of payload.questions) {
    const firstSelected = question.selectedOptions.find(
      (value) => value.trim().length > 0,
    );
    if (firstSelected) {
      return firstSelected;
    }
    const note = question.note.trim();
    if (note) {
      return note;
    }
  }
  return i18n.t("approval.inputRequested");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "";
}

function isEmptyResponse(response: RequestUserInputResponse) {
  return Object.values(response.answers ?? {}).every((answer) => {
    const answers = Array.isArray(answer?.answers) ? answer.answers : [];
    return answers.every((value) => String(value ?? "").trim().length === 0);
  });
}

function isStaleSettledRequestError(
  error: unknown,
  response: RequestUserInputResponse,
) {
  const normalizedMessage = getErrorMessage(error).toLowerCase();
  if (normalizedMessage.includes("unknown request_id for askuserquestion")) {
    return true;
  }
  return isEmptyResponse(response) && normalizedMessage.includes("workspace not connected");
}

export function useThreadUserInput({
  dispatch,
  resolveClaudeContinuationThreadId,
}: UseThreadUserInputOptions) {
  const handleUserInputSubmit = useCallback(
    async (request: RequestUserInputRequest, response: RequestUserInputResponse) => {
      const rawThreadId = request.params.thread_id;
      const resolvedThreadId =
        (rawThreadId
          ? resolveClaudeContinuationThreadId?.(
              request.workspace_id,
              rawThreadId,
              request.params.turn_id,
            )
          : null) ?? rawThreadId;
      const isSharedThread = typeof rawThreadId === "string" && rawThreadId.startsWith("shared:");
      const stateThreadId = isSharedThread ? rawThreadId : resolvedThreadId;
      const runtimeThreadId = isSharedThread ? resolvedThreadId : rawThreadId;
      if (stateThreadId) {
        // After user confirms AskUserQuestion, Claude may take a few seconds to resume.
        // Mark thread as processing immediately to avoid a "stopped" visual gap.
        dispatch({
          type: "markProcessing",
          threadId: stateThreadId,
          isProcessing: true,
          timestamp: Date.now(),
        });
      }
      try {
        await respondToUserInputRequest(
          request.workspace_id,
          request.request_id,
          response.answers,
          {
            threadId: runtimeThreadId,
            turnId: request.params.turn_id,
          },
        );
      } catch (error) {
        if (stateThreadId) {
          dispatch({
            type: "markProcessing",
            threadId: stateThreadId,
            isProcessing: false,
            timestamp: Date.now(),
          });
        }
        if (isStaleSettledRequestError(error, response)) {
          dispatch({
            type: "removeUserInputRequest",
            requestId: request.request_id,
            workspaceId: request.workspace_id,
          });
          return;
        }
        throw error;
      }
      if (stateThreadId) {
        const payload = buildSubmittedPayload(request, response);
        dispatch({
          type: "upsertItem",
          workspaceId: request.workspace_id,
          threadId: stateThreadId,
          item: {
            id: `user-input-answer-${String(request.request_id)}`,
            kind: "tool",
            toolType: "requestUserInputSubmitted",
            title: buildSubmittedTitle(payload),
            detail: JSON.stringify(payload),
            status: "completed",
            output: buildSubmittedFallbackOutput(payload),
          },
          // Keep thread auto-title unchanged; this is a synthetic confirmation record.
          hasCustomName: true,
        });
      }
      dispatch({
        type: "removeUserInputRequest",
        requestId: request.request_id,
        workspaceId: request.workspace_id,
      });
    },
    [dispatch, resolveClaudeContinuationThreadId],
  );

  const handleUserInputDismiss = useCallback(
    (request: RequestUserInputRequest) => {
      dispatch({
        type: "removeUserInputRequest",
        requestId: request.request_id,
        workspaceId: request.workspace_id,
      });
    },
    [dispatch],
  );

  return { handleUserInputSubmit, handleUserInputDismiss };
}
