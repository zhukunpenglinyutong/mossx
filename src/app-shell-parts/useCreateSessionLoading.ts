import { useCallback } from "react";
import type { LoadingProgressDialogConfig } from "../features/app/hooks/useLoadingProgressDialogState";
import { runWithLoadingProgress } from "../features/app/utils/loadingProgressActions";
import type { EngineType, WorkspaceInfo } from "../types";

type UseCreateSessionLoadingOptions = {
  showLoadingProgressDialog: (config: LoadingProgressDialogConfig) => string;
  hideLoadingProgressDialog: (requestId: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export function useCreateSessionLoading({
  showLoadingProgressDialog,
  hideLoadingProgressDialog,
  t,
}: UseCreateSessionLoadingOptions) {
  return useCallback(
    async <T,>(
      params: {
        workspace: WorkspaceInfo;
        engine: EngineType;
      },
      action: () => Promise<T>,
    ): Promise<T> => {
      const engineLabel =
        params.engine === "codex"
          ? t("workspace.engineCodex")
          : params.engine === "gemini"
            ? t("workspace.engineGemini")
            : params.engine === "opencode"
              ? t("workspace.engineOpenCode")
              : t("workspace.engineClaudeCode");
      const workspaceLabel = params.workspace.name.trim() || params.workspace.path;
      return runWithLoadingProgress(
        { showLoadingProgressDialog, hideLoadingProgressDialog },
        {
          title: t("workspace.loadingProgressCreateSessionTitle"),
          message: t("workspace.loadingProgressCreateSessionMessage", {
            engine: engineLabel,
            workspace: workspaceLabel,
          }),
        },
        action,
      );
    },
    [hideLoadingProgressDialog, showLoadingProgressDialog, t],
  );
}
