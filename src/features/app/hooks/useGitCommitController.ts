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
import {
  runScopedCommitOperation,
  type CommitScopeStatusSnapshot,
} from "../../git/utils/commitScope";

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
    selectedPaths?: string[],
  ) => Promise<void>;
  onCommit: (selectedPaths?: string[]) => Promise<void>;
  onCommitAndPush: (selectedPaths?: string[]) => Promise<void>;
  onCommitAndSync: (selectedPaths?: string[]) => Promise<void>;
  onPush: () => Promise<void>;
  onSync: () => Promise<void>;
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
    selectedPaths?: string[],
  ) => {
    if (!activeWorkspace || commitMessageLoading) {
      return;
    }
    const workspaceId = activeWorkspace.id;
    setCommitMessageLoading(true);
    setCommitMessageError(null);
    try {
      const message = await generateCommitMessageWithEngine(
        workspaceId,
        language,
        engine,
        selectedPaths,
      );
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

  const runScopedCommit = useCallback(async (selectedPaths?: string[]) => {
    if (!activeWorkspace) {
      return { committed: false, postCommitError: null };
    }
    return runScopedCommitOperation({
      workspaceId: activeWorkspace.id,
      gitStatus: gitStatus as CommitScopeStatusSnapshot,
      selectedPaths,
      commitMessage,
      stageFile: stageGitFile,
      unstageFile: unstageGitFile,
      commit: commitGit,
      formatRestoreSelectionFailed: (error) =>
        t("git.commitRestoreSelectionFailed", { error }),
    });
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
