import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { WorkspaceInfo } from "../../../types";
import {
  type CommitMessageEngine,
  type CommitMessageLanguage,
  commitGit,
  generateCommitMessageWithEngine,
  pushGit,
  stageGitFile,
  syncGit,
  unstageGitFile,
} from "../../../services/tauri";
import {
  sanitizeGeneratedCommitMessage,
  shouldApplyCommitMessage,
} from "../../../utils/commitMessage";
import { useGitStatus } from "../../git/hooks/useGitStatus";

type GitStatusState = ReturnType<typeof useGitStatus>["status"];

type GitCommitControllerOptions = {
  activeWorkspace: WorkspaceInfo | null;
  activeWorkspaceId: string | null;
  activeWorkspaceIdRef: RefObject<string | null>;
  gitStatus: GitStatusState;
  refreshGitStatus: () => void;
  refreshGitLog?: () => void;
};

type GitCommitController = {
  commitMessage: string;
  commitMessageLoading: boolean;
  commitMessageError: string | null;
  commitLoading: boolean;
  pushLoading: boolean;
  syncLoading: boolean;
  commitError: string | null;
  pushError: string | null;
  syncError: string | null;
  hasWorktreeChanges: boolean;
  onCommitMessageChange: (value: string) => void;
  onGenerateCommitMessage: (
    language?: CommitMessageLanguage,
    engine?: CommitMessageEngine,
  ) => Promise<void>;
  onCommit: (selectedPaths?: string[]) => Promise<void>;
  onCommitAndPush: (selectedPaths?: string[]) => Promise<void>;
  onCommitAndSync: (selectedPaths?: string[]) => Promise<void>;
  onPush: () => Promise<void>;
  onSync: () => Promise<void>;
};

function normalizeGitPath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

type ScopedCommitPlan = {
  hasSelectedChanges: boolean;
  stagePaths: string[];
  unstagePaths: string[];
};

function buildScopedCommitPlan(
  gitStatus: GitStatusState,
  selectedPaths?: string[],
): ScopedCommitPlan {
  const stagedByNormalizedPath = new Map<string, string>();
  const unstagedByNormalizedPath = new Map<string, string>();

  for (const file of gitStatus.stagedFiles) {
    const normalizedPath = normalizeGitPath(file.path);
    if (!stagedByNormalizedPath.has(normalizedPath)) {
      stagedByNormalizedPath.set(normalizedPath, file.path);
    }
  }

  for (const file of gitStatus.unstagedFiles) {
    const normalizedPath = normalizeGitPath(file.path);
    if (!unstagedByNormalizedPath.has(normalizedPath)) {
      unstagedByNormalizedPath.set(normalizedPath, file.path);
    }
  }

  const selectedPathSet =
    selectedPaths && selectedPaths.length > 0
      ? new Set(selectedPaths.map((path) => normalizeGitPath(path)))
      : null;

  const stagePaths: string[] = [];
  const unstagePaths: string[] = [];
  let hasSelectedChanges = false;

  for (const [normalizedPath, rawPath] of stagedByNormalizedPath) {
    const isHybridPath = unstagedByNormalizedPath.has(normalizedPath);
    if (isHybridPath) {
      hasSelectedChanges = true;
      continue;
    }

    const isSelected = selectedPathSet
      ? selectedPathSet.has(normalizedPath)
      : true;

    if (isSelected) {
      hasSelectedChanges = true;
      continue;
    }

    unstagePaths.push(rawPath);
  }

  for (const [normalizedPath, rawPath] of unstagedByNormalizedPath) {
    if (stagedByNormalizedPath.has(normalizedPath)) {
      continue;
    }

    const isSelected = selectedPathSet
      ? selectedPathSet.has(normalizedPath)
      : false;

    if (!isSelected) {
      continue;
    }

    hasSelectedChanges = true;
    stagePaths.push(rawPath);
  }

  return {
    hasSelectedChanges,
    stagePaths,
    unstagePaths,
  };
}

type ScopedCommitResult = {
  committed: boolean;
  postCommitError: string | null;
};

export function useGitCommitController({
  activeWorkspace,
  activeWorkspaceId,
  activeWorkspaceIdRef,
  gitStatus,
  refreshGitStatus,
  refreshGitLog,
}: GitCommitControllerOptions): GitCommitController {
  const { t } = useTranslation();
  const [commitMessage, setCommitMessage] = useState("");
  const [commitMessageLoading, setCommitMessageLoading] = useState(false);
  const [commitMessageError, setCommitMessageError] = useState<string | null>(
    null,
  );
  const [commitLoading, setCommitLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const hasWorktreeChanges = useMemo(() => {
    const hasStagedChanges = gitStatus.stagedFiles.length > 0;
    const hasUnstagedChanges = gitStatus.unstagedFiles.length > 0;
    return hasStagedChanges || hasUnstagedChanges;
  }, [gitStatus.stagedFiles.length, gitStatus.unstagedFiles.length]);

  const handleCommitMessageChange = useCallback((value: string) => {
    setCommitMessage(value);
  }, []);

  const handleGenerateCommitMessage = useCallback(async (
    language: CommitMessageLanguage = "zh",
    engine: CommitMessageEngine = "codex",
  ) => {
    if (!activeWorkspace || commitMessageLoading) {
      return;
    }
    const workspaceId = activeWorkspace.id;
    setCommitMessageLoading(true);
    setCommitMessageError(null);
    try {
      const message = await generateCommitMessageWithEngine(workspaceId, language, engine);
      if (!shouldApplyCommitMessage(activeWorkspaceIdRef.current, workspaceId)) {
        return;
      }
      const cleanedMessage = sanitizeGeneratedCommitMessage(message);
      setCommitMessage(cleanedMessage);
    } catch (error) {
      if (!shouldApplyCommitMessage(activeWorkspaceIdRef.current, workspaceId)) {
        return;
      }
      const raw = error instanceof Error ? error.message : String(error);
      const isCodexRequired =
        engine === "codex" &&
        (raw.includes("requires the Codex CLI") ||
          raw.includes("workspace not connected"));
      setCommitMessageError(
        isCodexRequired ? t("git.commitMessageRequiresCodex") : raw,
      );
    } finally {
      if (shouldApplyCommitMessage(activeWorkspaceIdRef.current, workspaceId)) {
        setCommitMessageLoading(false);
      }
    }
  }, [activeWorkspace, commitMessageLoading, activeWorkspaceIdRef, t]);

  useEffect(() => {
    setCommitMessage("");
    setCommitMessageError(null);
    setCommitMessageLoading(false);
  }, [activeWorkspaceId]);

  const runScopedCommit = useCallback(async (
    selectedPaths?: string[],
  ): Promise<ScopedCommitResult> => {
    if (!activeWorkspace || !commitMessage.trim()) {
      return { committed: false, postCommitError: null };
    }

    const commitPlan = buildScopedCommitPlan(gitStatus, selectedPaths);
    if (!commitPlan.hasSelectedChanges) {
      return { committed: false, postCommitError: null };
    }

    const appliedUnstagePaths: string[] = [];
    const appliedStagePaths: string[] = [];

    const rollbackBeforeCommitFailure = async () => {
      for (const path of appliedStagePaths) {
        await unstageGitFile(activeWorkspace.id, path);
      }
      for (const path of appliedUnstagePaths) {
        await stageGitFile(activeWorkspace.id, path);
      }
    };

    try {
      for (const path of commitPlan.unstagePaths) {
        await unstageGitFile(activeWorkspace.id, path);
        appliedUnstagePaths.push(path);
      }

      for (const path of commitPlan.stagePaths) {
        await stageGitFile(activeWorkspace.id, path);
        appliedStagePaths.push(path);
      }
    } catch (error) {
      try {
        await rollbackBeforeCommitFailure();
      } catch {
        // Best effort rollback; surface original preparation error below.
      }
      throw error;
    }

    try {
      await commitGit(activeWorkspace.id, commitMessage.trim());
    } catch (error) {
      try {
        await rollbackBeforeCommitFailure();
      } catch {
        // Best effort rollback; surface commit error below.
      }
      throw error;
    }

    try {
      for (const path of appliedUnstagePaths) {
        await stageGitFile(activeWorkspace.id, path);
      }
      return { committed: true, postCommitError: null };
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      return {
        committed: true,
        postCommitError: t("git.commitRestoreSelectionFailed", {
          error: rawMessage,
        }),
      };
    }
  }, [activeWorkspace, commitMessage, gitStatus, t]);

  const handleCommit = useCallback(async (selectedPaths?: string[]) => {
    if (!activeWorkspace || commitLoading || !commitMessage.trim()) {
      return;
    }
    setCommitLoading(true);
    setCommitError(null);
    try {
      const result = await runScopedCommit(selectedPaths);
      if (!result.committed) {
        return;
      }
      setCommitMessage("");
      refreshGitStatus();
      refreshGitLog?.();
      if (result.postCommitError) {
        setCommitError(result.postCommitError);
      }
    } catch (error) {
      setCommitError(error instanceof Error ? error.message : String(error));
    } finally {
      setCommitLoading(false);
    }
  }, [
    activeWorkspace,
    commitLoading,
    commitMessage,
    refreshGitLog,
    refreshGitStatus,
    runScopedCommit,
  ]);

  const handleCommitAndPush = useCallback(async (selectedPaths?: string[]) => {
    if (
      !activeWorkspace ||
      commitLoading ||
      pushLoading ||
      !commitMessage.trim()
    ) {
      return;
    }
    setCommitLoading(true);
    setPushLoading(true);
    setCommitError(null);
    setPushError(null);
    let commitReadyForPush = false;
    try {
      const result = await runScopedCommit(selectedPaths);
      if (!result.committed) {
        return;
      }
      setCommitMessage("");
      if (result.postCommitError) {
        setCommitError(result.postCommitError);
        refreshGitStatus();
        refreshGitLog?.();
        return;
      }
      commitReadyForPush = true;
      setCommitLoading(false);
      await pushGit(activeWorkspace.id);
      refreshGitStatus();
      refreshGitLog?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (commitReadyForPush) {
        setPushError(errorMessage);
      } else {
        setCommitError(errorMessage);
      }
    } finally {
      setCommitLoading(false);
      setPushLoading(false);
    }
  }, [
    activeWorkspace,
    commitLoading,
    pushLoading,
    commitMessage,
    refreshGitLog,
    refreshGitStatus,
    runScopedCommit,
  ]);

  const handleCommitAndSync = useCallback(async (selectedPaths?: string[]) => {
    if (
      !activeWorkspace ||
      commitLoading ||
      syncLoading ||
      !commitMessage.trim()
    ) {
      return;
    }
    setCommitLoading(true);
    setSyncLoading(true);
    setCommitError(null);
    setSyncError(null);
    let commitReadyForSync = false;
    try {
      const result = await runScopedCommit(selectedPaths);
      if (!result.committed) {
        return;
      }
      setCommitMessage("");
      if (result.postCommitError) {
        setCommitError(result.postCommitError);
        refreshGitStatus();
        refreshGitLog?.();
        return;
      }
      commitReadyForSync = true;
      setCommitLoading(false);
      await syncGit(activeWorkspace.id);
      refreshGitStatus();
      refreshGitLog?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (commitReadyForSync) {
        setSyncError(errorMessage);
      } else {
        setCommitError(errorMessage);
      }
    } finally {
      setCommitLoading(false);
      setSyncLoading(false);
    }
  }, [
    activeWorkspace,
    commitLoading,
    syncLoading,
    commitMessage,
    refreshGitLog,
    refreshGitStatus,
    runScopedCommit,
  ]);

  const handlePush = useCallback(async () => {
    if (!activeWorkspace || pushLoading) {
      return;
    }
    setPushLoading(true);
    setPushError(null);
    try {
      await pushGit(activeWorkspace.id);
      refreshGitStatus();
      refreshGitLog?.();
    } catch (error) {
      setPushError(error instanceof Error ? error.message : String(error));
    } finally {
      setPushLoading(false);
    }
  }, [activeWorkspace, pushLoading, refreshGitLog, refreshGitStatus]);

  const handleSync = useCallback(async () => {
    if (!activeWorkspace || syncLoading) {
      return;
    }
    setSyncLoading(true);
    setSyncError(null);
    try {
      await syncGit(activeWorkspace.id);
      refreshGitStatus();
      refreshGitLog?.();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncLoading(false);
    }
  }, [activeWorkspace, refreshGitLog, refreshGitStatus, syncLoading]);

  return {
    commitMessage,
    commitMessageLoading,
    commitMessageError,
    commitLoading,
    pushLoading,
    syncLoading,
    commitError,
    pushError,
    syncError,
    hasWorktreeChanges,
    onCommitMessageChange: handleCommitMessageChange,
    onGenerateCommitMessage: handleGenerateCommitMessage,
    onCommit: handleCommit,
    onCommitAndPush: handleCommitAndPush,
    onCommitAndSync: handleCommitAndSync,
    onPush: handlePush,
    onSync: handleSync,
  };
}
