import { useCallback } from "react";
import { MODE_SELECT_FLASH_EVENT } from "../features/composer/components/ChatInputBox/selectors/modeSelectFlash";
import type {
  AccessMode,
  EngineType,
  MessageSendOptions,
  RequestUserInputRequest,
  RequestUserInputResponse,
} from "../types";
import {
  CODE_MODE_RESUME_PROMPT,
  LOCAL_PLAN_APPLY_REQUEST_PREFIX,
  PLAN_APPLY_ACTION_QUESTION_ID,
  PLAN_APPLY_EXECUTE_PROMPT,
  extractFirstUserInputAnswer,
} from "./utils";

type CollaborationMode = "plan" | "code";

type UsePlanApplyHandlersOptions = {
  activeEngine: EngineType;
  applySelectedCollaborationMode: (mode: CollaborationMode) => void;
  handleSetAccessMode: (mode: AccessMode) => void;
  handleUserInputSubmit: (
    request: RequestUserInputRequest,
    response: RequestUserInputResponse,
  ) => Promise<void>;
  interruptTurn: () => Promise<unknown>;
  resolveCollaborationRuntimeMode: (threadId: string) => CollaborationMode | null;
  resolveCollaborationUiMode: (threadId: string) => CollaborationMode | null;
  resolvedEffort: string | null;
  resolvedModel: string | null;
  selectedCollaborationModeId: string | null;
  sendUserMessage: (
    text: string,
    images: string[],
    options?: MessageSendOptions,
  ) => Promise<unknown>;
};

function buildImmediateCodeModePayload(
  resolvedModel: string | null,
  resolvedEffort: string | null,
): Record<string, unknown> {
  return {
    mode: "code",
    settings: {
      model: resolvedModel ?? null,
      reasoning_effort: resolvedEffort ?? null,
    },
  };
}

function resolveFallbackUiMode(selectedCollaborationModeId: string | null): CollaborationMode {
  return selectedCollaborationModeId === "plan" ? "plan" : "code";
}

export function usePlanApplyHandlers({
  activeEngine,
  applySelectedCollaborationMode,
  handleSetAccessMode,
  handleUserInputSubmit,
  interruptTurn,
  resolveCollaborationRuntimeMode,
  resolveCollaborationUiMode,
  resolvedEffort,
  resolvedModel,
  selectedCollaborationModeId,
  sendUserMessage,
}: UsePlanApplyHandlersOptions) {
  const handleUserInputSubmitWithPlanApply = useCallback(
    async (
      request: RequestUserInputRequest,
      response: RequestUserInputResponse,
    ) => {
      const requestThreadId = String(request.params.thread_id ?? "").trim();
      const runtimeMode = requestThreadId
        ? resolveCollaborationRuntimeMode(requestThreadId)
        : null;
      const fallbackUiMode = resolveFallbackUiMode(selectedCollaborationModeId);
      const uiMode = requestThreadId
        ? (resolveCollaborationUiMode(requestThreadId) ?? fallbackUiMode)
        : fallbackUiMode;
      const shouldForceResumeInCode =
        activeEngine === "codex" &&
        runtimeMode === "plan" &&
        uiMode === "code";
      await handleUserInputSubmit(request, response);
      const requestId = String(request.request_id ?? "");
      if (!requestId.startsWith(LOCAL_PLAN_APPLY_REQUEST_PREFIX)) {
        if (!shouldForceResumeInCode) {
          return;
        }
        applySelectedCollaborationMode("code");
        await interruptTurn();
        const firstAnswer = extractFirstUserInputAnswer(response);
        const resumePrompt = firstAnswer
          ? `${CODE_MODE_RESUME_PROMPT}\n\nUser confirmation: ${firstAnswer}`
          : CODE_MODE_RESUME_PROMPT;
        await sendUserMessage(resumePrompt, [], {
          collaborationMode: buildImmediateCodeModePayload(resolvedModel, resolvedEffort),
        });
        return;
      }
      const selectedAnswer = String(
        response.answers?.[PLAN_APPLY_ACTION_QUESTION_ID]?.answers?.[0] ?? "",
      )
        .trim()
        .toLowerCase();
      if (!selectedAnswer.startsWith("yes")) {
        applySelectedCollaborationMode("plan");
        return;
      }
      applySelectedCollaborationMode("code");
      await sendUserMessage(PLAN_APPLY_EXECUTE_PROMPT, [], {
        collaborationMode: buildImmediateCodeModePayload(resolvedModel, resolvedEffort),
        suppressUserMessageRender: true,
      });
    },
    [
      activeEngine,
      applySelectedCollaborationMode,
      handleUserInputSubmit,
      interruptTurn,
      resolveCollaborationRuntimeMode,
      resolveCollaborationUiMode,
      resolvedEffort,
      resolvedModel,
      selectedCollaborationModeId,
      sendUserMessage,
    ],
  );

  const handleExitPlanModeExecute = useCallback(
    async (mode: Extract<AccessMode, "default" | "full-access">) => {
      applySelectedCollaborationMode("code");
      handleSetAccessMode(mode);
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          window.dispatchEvent(new Event(MODE_SELECT_FLASH_EVENT));
        }, 0);
      }
      await sendUserMessage(PLAN_APPLY_EXECUTE_PROMPT, [], {
        collaborationMode: buildImmediateCodeModePayload(resolvedModel, resolvedEffort),
        accessMode: mode,
        suppressUserMessageRender: true,
      });
    },
    [
      applySelectedCollaborationMode,
      handleSetAccessMode,
      resolvedEffort,
      resolvedModel,
      sendUserMessage,
    ],
  );

  return {
    handleUserInputSubmitWithPlanApply,
    handleExitPlanModeExecute,
  };
}
