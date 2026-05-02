export type CommitScopeStatusFile = {
  path: string;
};

export type CommitScopeStatusSnapshot = {
  stagedFiles: CommitScopeStatusFile[];
  unstagedFiles: CommitScopeStatusFile[];
};

export type ScopedCommitPlan = {
  hasSelectedChanges: boolean;
  stagePaths: string[];
  unstagePaths: string[];
};

export type ScopedCommitResult = {
  committed: boolean;
  postCommitError: string | null;
};

export type ScopedCommitOperationOptions = {
  workspaceId: string;
  gitStatus: CommitScopeStatusSnapshot;
  selectedPaths?: string[];
  commitMessage: string;
  stageFile: (workspaceId: string, path: string) => Promise<unknown>;
  unstageFile: (workspaceId: string, path: string) => Promise<unknown>;
  commit: (workspaceId: string, message: string) => Promise<unknown>;
  formatRestoreSelectionFailed?: (errorMessage: string) => string;
};

export function normalizeGitPath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function buildScopedCommitPlan(
  gitStatus: CommitScopeStatusSnapshot,
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

export async function runScopedCommitOperation({
  workspaceId,
  gitStatus,
  selectedPaths,
  commitMessage,
  stageFile,
  unstageFile,
  commit,
  formatRestoreSelectionFailed,
}: ScopedCommitOperationOptions): Promise<ScopedCommitResult> {
  if (!commitMessage.trim()) {
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
      await unstageFile(workspaceId, path);
    }
    for (const path of appliedUnstagePaths) {
      await stageFile(workspaceId, path);
    }
  };

  try {
    for (const path of commitPlan.unstagePaths) {
      await unstageFile(workspaceId, path);
      appliedUnstagePaths.push(path);
    }

    for (const path of commitPlan.stagePaths) {
      await stageFile(workspaceId, path);
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
    await commit(workspaceId, commitMessage.trim());
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
      await stageFile(workspaceId, path);
    }
    return { committed: true, postCommitError: null };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    return {
      committed: true,
      postCommitError: formatRestoreSelectionFailed
        ? formatRestoreSelectionFailed(rawMessage)
        : rawMessage,
    };
  }
}
