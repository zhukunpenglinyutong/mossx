import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { message } from "@tauri-apps/plugin-dialog";
import type { WorkspaceInfo, WorkspaceSettings } from "../../../types";
import { listGitBranches } from "../../../services/tauri";

type WorktreeBaseRefGroup = "local" | "origin" | "upstream" | "remote";

type WorktreeBaseRefOption = {
  name: string;
  group: WorktreeBaseRefGroup;
  shortSha: string | null;
};

type WorktreePromptState = {
  workspace: WorkspaceInfo;
  branch: string;
  baseRef: string;
  baseRefOptions: WorktreeBaseRefOption[];
  isLoadingBaseRefs: boolean;
  isNonGitRepository: boolean;
  nonGitRepositoryRawError: string | null;
  publishToOrigin: boolean;
  setupScript: string;
  savedSetupScript: string | null;
  isSubmitting: boolean;
  isSavingScript: boolean;
  error: string | null;
  errorRetryCommand: string | null;
  scriptError: string | null;
} | null;

type UseWorktreePromptOptions = {
  addWorktreeAgent: (
    workspace: WorkspaceInfo,
    branch: string,
    options?: {
      baseRef?: string;
      publishToOrigin?: boolean;
    },
  ) => Promise<WorkspaceInfo | null>;
  updateWorkspaceSettings: (
    id: string,
    settings: Partial<WorkspaceSettings>,
  ) => Promise<WorkspaceInfo>;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  onSelectWorkspace: (workspaceId: string) => void;
  onWorktreeCreated?: (worktree: WorkspaceInfo, parent: WorkspaceInfo) => Promise<void> | void;
  onCompactActivate?: () => void;
  onError?: (message: string) => void;
};

type UseWorktreePromptResult = {
  worktreePrompt: WorktreePromptState;
  openPrompt: (workspace: WorkspaceInfo) => void;
  confirmPrompt: () => Promise<void>;
  cancelPrompt: () => void;
  updateBranch: (value: string) => void;
  updateBaseRef: (value: string) => void;
  updatePublishToOrigin: (value: boolean) => void;
  updateSetupScript: (value: string) => void;
};

function normalizeSetupScript(value: string | null | undefined): string | null {
  const next = value ?? "";
  return next.trim().length > 0 ? next : null;
}

function normalizeSha(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 8);
}

function classifyBaseRef(remote: string | null | undefined): WorktreeBaseRefGroup {
  if (!remote) {
    return "local";
  }
  if (remote === "origin") {
    return "origin";
  }
  if (remote === "upstream") {
    return "upstream";
  }
  return "remote";
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isNonGitRepositoryError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find repository") ||
    normalized.includes("not a git repository") ||
    normalized.includes("class=repository") ||
    normalized.includes("code=notfound") ||
    normalized.includes("repository not found") ||
    normalized.includes("git root not found")
  );
}

const WORKTREE_VALIDATION_ERROR_PREFIX = "WORKTREE_VALIDATION_ERROR:";
const WORKTREE_PUSH_FAILED_PREFIX = "Worktree created locally, but push failed:";

type ParsedWorktreeError = {
  message: string;
  nonGitRepository: boolean;
  nonGitRepositoryRawError: string | null;
  retryCommand: string | null;
};

function parseWorktreeError(
  rawMessage: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): ParsedWorktreeError {
  const normalized = rawMessage.trim();
  if (isNonGitRepositoryError(normalized)) {
    return {
      message: t("workspace.nonGitRepositoryError"),
      nonGitRepository: true,
      nonGitRepositoryRawError: normalized,
      retryCommand: null,
    };
  }

  const retryMatch = normalized.match(/Retry with:\s*(.+)$/m);
  const retryCommand = retryMatch?.[1]?.trim() || null;

  if (normalized.startsWith(WORKTREE_PUSH_FAILED_PREFIX)) {
    const reason = normalized
      .slice(WORKTREE_PUSH_FAILED_PREFIX.length)
      .split("\n")[0]
      .trim();
    return {
      message: t("workspace.worktreePublishFailedRecoverable", {
        reason: reason || t("workspace.worktreePublishFailedReasonUnknown"),
      }),
      nonGitRepository: false,
      nonGitRepositoryRawError: null,
      retryCommand,
    };
  }

  if (normalized.startsWith(WORKTREE_VALIDATION_ERROR_PREFIX)) {
    const detail = normalized.slice(WORKTREE_VALIDATION_ERROR_PREFIX.length).trim();
    if (
      detail.startsWith("baseRef is required.") ||
      detail.startsWith("Base ref not found:") ||
      detail.startsWith("Base ref is not a commit:")
    ) {
      return {
        message: t("workspace.worktreeCreateErrorBaseRef"),
        nonGitRepository: false,
        nonGitRepositoryRawError: null,
        retryCommand: null,
      };
    }
    if (detail.startsWith("Worktree path conflict:")) {
      const path = detail.slice("Worktree path conflict:".length).trim();
      return {
        message: t("workspace.worktreeCreateErrorPathConflict", { path }),
        nonGitRepository: false,
        nonGitRepositoryRawError: null,
        retryCommand: null,
      };
    }
    if (detail.startsWith("Invalid branch name:")) {
      const branch = detail.slice("Invalid branch name:".length).trim();
      return {
        message: t("workspace.worktreeCreateErrorBranchInvalid", { branch }),
        nonGitRepository: false,
        nonGitRepositoryRawError: null,
        retryCommand: null,
      };
    }
    if (detail.startsWith("Branch name is required.")) {
      return {
        message: t("workspace.worktreeCreateErrorBranchRequired"),
        nonGitRepository: false,
        nonGitRepositoryRawError: null,
        retryCommand: null,
      };
    }
    return {
      message: detail,
      nonGitRepository: false,
      nonGitRepositoryRawError: null,
      retryCommand: null,
    };
  }

  return {
    message: normalized,
    nonGitRepository: false,
    nonGitRepositoryRawError: null,
    retryCommand,
  };
}

export function useWorktreePrompt({
  addWorktreeAgent,
  updateWorkspaceSettings,
  connectWorkspace,
  onSelectWorkspace,
  onWorktreeCreated,
  onCompactActivate,
  onError,
}: UseWorktreePromptOptions): UseWorktreePromptResult {
  const { t } = useTranslation();
  const [worktreePrompt, setWorktreePrompt] = useState<WorktreePromptState>(null);

  const promptWorkspaceId = worktreePrompt?.workspace.id ?? null;

  useEffect(() => {
    if (!promptWorkspaceId) {
      return;
    }
    let canceled = false;
    setWorktreePrompt((prev) =>
      prev
        ? {
            ...prev,
            isLoadingBaseRefs: true,
            error: null,
          }
        : prev,
    );
    void listGitBranches(promptWorkspaceId)
      .then((response) => {
        if (canceled) {
          return;
        }
        const map = new Map<string, WorktreeBaseRefOption>();
        for (const branch of response.localBranches ?? []) {
          const name = branch.name?.trim() ?? "";
          if (!name) {
            continue;
          }
          map.set(name, {
            name,
            group: "local",
            shortSha: normalizeSha(branch.headSha),
          });
        }
        for (const branch of response.remoteBranches ?? []) {
          const name = branch.name?.trim() ?? "";
          if (!name || name.endsWith("/HEAD")) {
            continue;
          }
          map.set(name, {
            name,
            group: classifyBaseRef(branch.remote),
            shortSha: normalizeSha(branch.headSha),
          });
        }
        const options = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
        setWorktreePrompt((prev) => {
          if (!prev || prev.workspace.id !== promptWorkspaceId) {
            return prev;
          }
          const trimmedCurrent = prev.baseRef.trim();
          const keepCurrent =
            trimmedCurrent.length > 0 &&
            options.some((option) => option.name === trimmedCurrent);
          return {
            ...prev,
            baseRefOptions: options,
            baseRef: keepCurrent ? trimmedCurrent : "",
            isLoadingBaseRefs: false,
            isNonGitRepository: false,
            nonGitRepositoryRawError: null,
            error: null,
            errorRetryCommand: null,
          };
        });
      })
      .catch((error) => {
        if (canceled) {
          return;
        }
        const message = normalizeErrorMessage(error);
        const nonGitRepository = isNonGitRepositoryError(message);
        setWorktreePrompt((prev) =>
          prev && prev.workspace.id === promptWorkspaceId
            ? {
                ...prev,
                baseRefOptions: nonGitRepository ? [] : prev.baseRefOptions,
                baseRef: nonGitRepository ? "" : prev.baseRef,
                isLoadingBaseRefs: false,
                isNonGitRepository: nonGitRepository,
                nonGitRepositoryRawError: nonGitRepository ? message : null,
                error: nonGitRepository ? t("workspace.nonGitRepositoryError") : message,
                errorRetryCommand: null,
              }
            : prev,
        );
      });
    return () => {
      canceled = true;
    };
  }, [promptWorkspaceId, t]);

  const openPrompt = useCallback((workspace: WorkspaceInfo) => {
    const defaultBranch = `codex/${new Date().toISOString().slice(0, 10)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const savedSetupScript = normalizeSetupScript(workspace.settings.worktreeSetupScript);
    setWorktreePrompt({
      workspace,
      branch: defaultBranch,
      baseRef: "",
      baseRefOptions: [],
      isLoadingBaseRefs: true,
      isNonGitRepository: false,
      nonGitRepositoryRawError: null,
      publishToOrigin: true,
      setupScript: savedSetupScript ?? "",
      savedSetupScript,
      isSubmitting: false,
      isSavingScript: false,
      error: null,
      errorRetryCommand: null,
      scriptError: null,
    });
  }, []);

  const updateBranch = useCallback((value: string) => {
    setWorktreePrompt((prev) =>
      prev
        ? {
            ...prev,
            branch: value,
            error: prev.isNonGitRepository ? t("workspace.nonGitRepositoryError") : null,
            errorRetryCommand: null,
          }
        : prev,
    );
  }, [t]);

  const updateBaseRef = useCallback((value: string) => {
    setWorktreePrompt((prev) => {
      if (!prev) {
        return prev;
      }
      const next = value.trim();
      if (!next) {
        return {
          ...prev,
          baseRef: "",
          error: prev.isNonGitRepository ? t("workspace.nonGitRepositoryError") : null,
          errorRetryCommand: null,
        };
      }
      if (!prev.baseRefOptions.some((option) => option.name === next)) {
        return prev;
      }
      return {
        ...prev,
        baseRef: next,
        error: prev.isNonGitRepository ? t("workspace.nonGitRepositoryError") : null,
        errorRetryCommand: null,
      };
    });
  }, [t]);

  const updatePublishToOrigin = useCallback((value: boolean) => {
    setWorktreePrompt((prev) => (prev ? { ...prev, publishToOrigin: value } : prev));
  }, []);

  const updateSetupScript = useCallback((value: string) => {
    setWorktreePrompt((prev) =>
      prev
        ? {
            ...prev,
            setupScript: value,
            scriptError: null,
            error: prev.isNonGitRepository ? t("workspace.nonGitRepositoryError") : null,
            errorRetryCommand: null,
          }
        : prev,
    );
  }, [t]);

  const cancelPrompt = useCallback(() => {
    setWorktreePrompt(null);
  }, []);

  const baseRefLookup = useMemo(() => {
    if (!worktreePrompt) {
      return null;
    }
    return new Set(worktreePrompt.baseRefOptions.map((option) => option.name));
  }, [worktreePrompt]);

  const persistSetupScript = useCallback(
    async (prompt: NonNullable<WorktreePromptState>) => {
      const nextScript = normalizeSetupScript(prompt.setupScript);
      if (nextScript === prompt.savedSetupScript) {
        return prompt.workspace;
      }
      setWorktreePrompt((prev) =>
        prev
          ? {
              ...prev,
              isSavingScript: true,
              scriptError: null,
              error: null,
              errorRetryCommand: null,
            }
          : prev,
      );
      try {
        const updated = await updateWorkspaceSettings(prompt.workspace.id, {
          ...prompt.workspace.settings,
          worktreeSetupScript: nextScript,
        });
        setWorktreePrompt((prev) =>
          prev
            ? {
                ...prev,
                workspace: updated,
                savedSetupScript: nextScript,
                setupScript: nextScript ?? "",
                isSavingScript: false,
                scriptError: null,
              }
            : prev,
        );
        return updated;
      } catch (error) {
        const message = normalizeErrorMessage(error);
        setWorktreePrompt((prev) =>
          prev ? { ...prev, isSavingScript: false, scriptError: message } : prev,
        );
        throw new Error(message);
      }
    },
    [updateWorkspaceSettings],
  );

  const confirmPrompt = useCallback(async () => {
    if (!worktreePrompt || worktreePrompt.isSubmitting) {
      return;
    }
    const snapshot = worktreePrompt;
    if (snapshot.isNonGitRepository) {
      const message = t("workspace.nonGitRepositoryError");
      setWorktreePrompt((prev) =>
        prev
          ? {
              ...prev,
              isSubmitting: false,
              error: message,
              errorRetryCommand: null,
            }
          : prev,
      );
      onError?.(message);
      return;
    }
    setWorktreePrompt((prev) =>
      prev
        ? {
            ...prev,
            isSubmitting: true,
            error: null,
            errorRetryCommand: null,
            scriptError: null,
          }
        : prev,
    );

    let parentWorkspace = snapshot.workspace;
    try {
      parentWorkspace = await persistSetupScript(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWorktreePrompt((prev) =>
        prev ? { ...prev, isSubmitting: false, error: message, errorRetryCommand: null } : prev,
      );
      onError?.(message);
      return;
    }

    try {
      const baseRef = snapshot.baseRef.trim();
      if (!baseRef) {
        throw new Error(t("workspace.baseBranchPlaceholderError"));
      }
      if (baseRefLookup && !baseRefLookup.has(baseRef)) {
        throw new Error(t("workspace.baseBranchInvalid"));
      }
      const worktreeWorkspace = await addWorktreeAgent(parentWorkspace, snapshot.branch, {
        baseRef,
        publishToOrigin: snapshot.publishToOrigin,
      });
      if (!worktreeWorkspace) {
        setWorktreePrompt(null);
        return;
      }
      const createdBranch = worktreeWorkspace.worktree?.branch || worktreeWorkspace.name;
      const tracking = worktreeWorkspace.worktree?.tracking?.trim() || null;
      const publishStatus = snapshot.publishToOrigin
        ? tracking
          ? t("workspace.worktreePublishStatusCreatedTracking", { tracking })
          : t("workspace.worktreePublishStatusCreatedNoTracking")
        : tracking
          ? t("workspace.worktreePublishStatusSkippedTracking", { tracking })
          : t("workspace.worktreePublishStatusSkipped");
      void message(
        `${t("workspace.worktreeCreateSuccess", { branch: createdBranch })}\n${publishStatus}`,
        {
          title: t("workspace.worktreeCreateResultTitle"),
          kind: "info",
        },
      );
      onSelectWorkspace(worktreeWorkspace.id);
      if (!worktreeWorkspace.connected) {
        await connectWorkspace(worktreeWorkspace);
      }
      try {
        await onWorktreeCreated?.(worktreeWorkspace, parentWorkspace);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onError?.(message);
      }
      onCompactActivate?.();
      setWorktreePrompt(null);
    } catch (error) {
      const rawMessage = normalizeErrorMessage(error);
      const parsed = parseWorktreeError(rawMessage, t);
      setWorktreePrompt((prev) =>
        prev
          ? {
              ...prev,
              isSubmitting: false,
              isNonGitRepository: parsed.nonGitRepository,
              nonGitRepositoryRawError: parsed.nonGitRepositoryRawError,
              error: parsed.message,
              errorRetryCommand: parsed.retryCommand,
            }
          : prev,
      );
      onError?.(parsed.message);
    }
  }, [
    addWorktreeAgent,
    baseRefLookup,
    connectWorkspace,
    onCompactActivate,
    onError,
    onSelectWorkspace,
    onWorktreeCreated,
    persistSetupScript,
    t,
    worktreePrompt,
  ]);

  return {
    worktreePrompt,
    openPrompt,
    confirmPrompt,
    cancelPrompt,
    updateBranch,
    updateBaseRef,
    updatePublishToOrigin,
    updateSetupScript,
  };
}
