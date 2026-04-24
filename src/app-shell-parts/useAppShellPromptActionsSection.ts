import { useCallback } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { WorkspaceInfo } from "../types";

type PromptScope = "workspace" | "global";

type CreatePromptInput = {
  scope: PromptScope;
  name: string;
  description?: string | null;
  argumentHint?: string | null;
  content: string;
};

type UpdatePromptInput = {
  path: string;
  name: string;
  description?: string | null;
  argumentHint?: string | null;
  content: string;
};

type MovePromptInput = {
  path: string;
  scope: PromptScope;
};

type UseAppShellPromptActionsSectionOptions = {
  activeWorkspace: WorkspaceInfo | null;
  alertError: (error: unknown) => void;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  createPrompt: (data: CreatePromptInput) => Promise<void>;
  deletePrompt: (path: string) => Promise<void>;
  getGlobalPromptsDir: () => Promise<string | null>;
  getWorkspacePromptsDir: () => Promise<string>;
  movePrompt: (data: MovePromptInput) => Promise<void>;
  sendUserMessageToThread: (
    workspace: WorkspaceInfo,
    threadId: string,
    message: string,
    images: string[],
  ) => Promise<void>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { activate?: boolean },
  ) => Promise<string | null>;
  updatePrompt: (data: UpdatePromptInput) => Promise<void>;
};

export function useAppShellPromptActionsSection({
  activeWorkspace,
  alertError,
  connectWorkspace,
  createPrompt,
  deletePrompt,
  getGlobalPromptsDir,
  getWorkspacePromptsDir,
  movePrompt,
  sendUserMessageToThread,
  startThreadForWorkspace,
  updatePrompt,
}: UseAppShellPromptActionsSectionOptions) {
  const handleSendPromptToNewAgent = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!activeWorkspace || !trimmed) {
        return;
      }
      if (!activeWorkspace.connected) {
        await connectWorkspace(activeWorkspace);
      }
      const threadId = await startThreadForWorkspace(activeWorkspace.id, {
        activate: false,
      });
      if (!threadId) {
        return;
      }
      await sendUserMessageToThread(activeWorkspace, threadId, trimmed, []);
    },
    [activeWorkspace, connectWorkspace, sendUserMessageToThread, startThreadForWorkspace],
  );

  const handleCreatePrompt = useCallback(
    async (data: CreatePromptInput) => {
      try {
        await createPrompt(data);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, createPrompt],
  );

  const handleUpdatePrompt = useCallback(
    async (data: UpdatePromptInput) => {
      try {
        await updatePrompt(data);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, updatePrompt],
  );

  const handleDeletePrompt = useCallback(
    async (path: string) => {
      try {
        await deletePrompt(path);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, deletePrompt],
  );

  const handleMovePrompt = useCallback(
    async (data: MovePromptInput) => {
      try {
        await movePrompt(data);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, movePrompt],
  );

  const handleRevealWorkspacePrompts = useCallback(async () => {
    try {
      const path = await getWorkspacePromptsDir();
      await revealItemInDir(path);
    } catch (error) {
      alertError(error);
    }
  }, [alertError, getWorkspacePromptsDir]);

  const handleRevealGeneralPrompts = useCallback(async () => {
    try {
      const path = await getGlobalPromptsDir();
      if (!path) {
        return;
      }
      await revealItemInDir(path);
    } catch (error) {
      alertError(error);
    }
  }, [alertError, getGlobalPromptsDir]);

  return {
    handleSendPromptToNewAgent,
    handleCreatePrompt,
    handleUpdatePrompt,
    handleDeletePrompt,
    handleMovePrompt,
    handleRevealWorkspacePrompts,
    handleRevealGeneralPrompts,
  };
}
