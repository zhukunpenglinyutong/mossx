import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type {
  GitBranchCompareCommitSets,
  GitCommitDetails,
  GitCommitDiff,
  GitHistoryCommit,
} from "../../../../../types";

type WorktreeBranchDiffState = {
  mode: "worktree";
  requestToken: number;
  branch: string;
  compareBranch: string;
  files: Pick<GitCommitDiff, "path" | "status">[];
  selectedPath: string | null;
  loading: boolean;
  error: string | null;
  selectedDiff: GitCommitDiff | null;
  selectedDiffLoading: boolean;
  selectedDiffError: string | null;
};

type BranchCompareDirection = "targetOnly" | "currentOnly";

type BranchCompareState = {
  mode: "branch";
  requestToken: number;
  branch: string;
  compareBranch: string;
  targetOnlyCommits: GitHistoryCommit[];
  currentOnlyCommits: GitHistoryCommit[];
  loading: boolean;
  error: string | null;
  selectedDirection: BranchCompareDirection | null;
  selectedCommitSha: string | null;
  selectedCommitDetails: GitCommitDetails | null;
  selectedCommitLoading: boolean;
  selectedCommitError: string | null;
};

type BranchDiffState = WorktreeBranchDiffState | BranchCompareState;

type BranchCompareHandlersScope = {
  branchCompareDetailsCacheRef: MutableRefObject<Map<string, GitCommitDetails>>;
  branchDiffCacheRef: MutableRefObject<Map<string, GitCommitDiff>>;
  closeBranchContextMenu: () => void;
  currentBranch: string | null | undefined;
  getGitBranchCompareCommits: (
    workspaceId: string,
    targetBranch: string,
    currentBranch: string,
  ) => Promise<GitBranchCompareCommitSets>;
  getGitCommitDetails: (
    workspaceId: string,
    commitHash: string,
  ) => Promise<GitCommitDetails>;
  getGitWorktreeDiffAgainstBranch: (
    workspaceId: string,
    branch: string,
  ) => Promise<GitCommitDiff[]>;
  getGitWorktreeDiffFileAgainstBranch: (
    workspaceId: string,
    branch: string,
    path: string,
  ) => Promise<GitCommitDiff>;
  localizeKnownGitError: (message: string) => string | null;
  setBranchDiffState: Dispatch<SetStateAction<BranchDiffState | null>>;
  setComparePreviewFileKey: Dispatch<SetStateAction<string | null>>;
  workspaceId: string | null | undefined;
};

export function useGitHistoryPanelBranchCompareHandlers(
  scope: BranchCompareHandlersScope,
) {
  const {
    branchCompareDetailsCacheRef,
    branchDiffCacheRef,
    closeBranchContextMenu,
    currentBranch,
    getGitBranchCompareCommits,
    getGitCommitDetails,
    getGitWorktreeDiffAgainstBranch,
    getGitWorktreeDiffFileAgainstBranch,
    localizeKnownGitError,
    setBranchDiffState,
    setComparePreviewFileKey,
    workspaceId,
  } = scope;
  const branchDiffLoadTokenRef = useRef(0);

  const handleShowDiffWithWorktree = useCallback(async (targetBranch: string) => {
    if (!workspaceId || !targetBranch) {
      return;
    }
    const compareBranch = currentBranch ?? "";
    const requestToken = branchDiffLoadTokenRef.current + 1;
    branchDiffLoadTokenRef.current = requestToken;
    closeBranchContextMenu();
    setBranchDiffState({
      mode: "worktree",
      requestToken,
      branch: targetBranch,
      compareBranch,
      files: [],
      selectedPath: null,
      loading: true,
      error: null,
      selectedDiff: null,
      selectedDiffLoading: false,
      selectedDiffError: null,
    });
    try {
      const diffs = await getGitWorktreeDiffAgainstBranch(workspaceId, targetBranch);
      if (requestToken !== branchDiffLoadTokenRef.current) {
        return;
      }
      setBranchDiffState((previous) => {
        if (
          !previous
          || previous.mode !== "worktree"
          || previous.requestToken !== requestToken
          || previous.branch !== targetBranch
          || previous.compareBranch !== compareBranch
        ) {
          return previous;
        }
        return {
          mode: "worktree",
          requestToken,
          branch: targetBranch,
          compareBranch,
          files: diffs.map((entry) => ({
            path: entry.path,
            status: entry.status,
          })),
          selectedPath: null,
          loading: false,
          error: null,
          selectedDiff: null,
          selectedDiffLoading: false,
          selectedDiffError: null,
        };
      });
    } catch (error) {
      if (requestToken !== branchDiffLoadTokenRef.current) {
        return;
      }
      const raw = error instanceof Error ? error.message : String(error);
      setBranchDiffState((previous) => {
        if (
          !previous
          || previous.mode !== "worktree"
          || previous.requestToken !== requestToken
          || previous.branch !== targetBranch
          || previous.compareBranch !== compareBranch
        ) {
          return previous;
        }
        return {
          mode: "worktree",
          requestToken,
          branch: targetBranch,
          compareBranch,
          files: [],
          selectedPath: null,
          loading: false,
          error: localizeKnownGitError(raw) ?? raw,
          selectedDiff: null,
          selectedDiffLoading: false,
          selectedDiffError: null,
        };
      });
    }
  }, [
    branchDiffLoadTokenRef,
    closeBranchContextMenu,
    currentBranch,
    getGitWorktreeDiffAgainstBranch,
    localizeKnownGitError,
    setBranchDiffState,
    workspaceId,
  ]);

  const handleCompareWithCurrentBranch = useCallback(async (targetBranch: string) => {
    if (!workspaceId || !targetBranch) {
      return;
    }
    const compareBranch = currentBranch;
    if (!compareBranch) {
      return;
    }
    const requestToken = branchDiffLoadTokenRef.current + 1;
    branchDiffLoadTokenRef.current = requestToken;
    closeBranchContextMenu();
    setComparePreviewFileKey(null);
    setBranchDiffState({
      mode: "branch",
      requestToken,
      branch: targetBranch,
      compareBranch,
      targetOnlyCommits: [],
      currentOnlyCommits: [],
      loading: true,
      error: null,
      selectedDirection: null,
      selectedCommitSha: null,
      selectedCommitDetails: null,
      selectedCommitLoading: false,
      selectedCommitError: null,
    });
    try {
      const commitSets = await getGitBranchCompareCommits(
        workspaceId,
        targetBranch,
        compareBranch,
      );
      if (requestToken !== branchDiffLoadTokenRef.current) {
        return;
      }
      setBranchDiffState((previous) => {
        if (
          !previous
          || previous.mode !== "branch"
          || previous.requestToken !== requestToken
          || previous.branch !== targetBranch
          || previous.compareBranch !== compareBranch
        ) {
          return previous;
        }
        return {
          mode: "branch",
          requestToken,
          branch: targetBranch,
          compareBranch,
          targetOnlyCommits: commitSets.targetOnlyCommits,
          currentOnlyCommits: commitSets.currentOnlyCommits,
          loading: false,
          error: null,
          selectedDirection: null,
          selectedCommitSha: null,
          selectedCommitDetails: null,
          selectedCommitLoading: false,
          selectedCommitError: null,
        };
      });
    } catch (error) {
      if (requestToken !== branchDiffLoadTokenRef.current) {
        return;
      }
      const raw = error instanceof Error ? error.message : String(error);
      setBranchDiffState((previous) => {
        if (
          !previous
          || previous.mode !== "branch"
          || previous.requestToken !== requestToken
          || previous.branch !== targetBranch
          || previous.compareBranch !== compareBranch
        ) {
          return previous;
        }
        return {
          mode: "branch",
          requestToken,
          branch: targetBranch,
          compareBranch,
          targetOnlyCommits: [],
          currentOnlyCommits: [],
          loading: false,
          error: localizeKnownGitError(raw) ?? raw,
          selectedDirection: null,
          selectedCommitSha: null,
          selectedCommitDetails: null,
          selectedCommitLoading: false,
          selectedCommitError: null,
        };
      });
    }
  }, [
    branchDiffLoadTokenRef,
    closeBranchContextMenu,
    currentBranch,
    getGitBranchCompareCommits,
    localizeKnownGitError,
    setBranchDiffState,
    setComparePreviewFileKey,
    workspaceId,
  ]);

  const handleSelectWorktreeDiffFile = useCallback(
    async (branch: string, compareBranch: string, file: { path: string; status: string }) => {
      if (!workspaceId) {
        return;
      }
      const cacheKey = `${workspaceId}\u0000worktree\u0000${branch}\u0000${compareBranch}\u0000${file.path}`;
      const cached = branchDiffCacheRef.current.get(cacheKey) ?? null;
      setBranchDiffState((previous) => {
        if (
          !previous ||
          previous.mode !== "worktree" ||
          previous.branch !== branch ||
          previous.compareBranch !== compareBranch
        ) {
          return previous;
        }
        return {
          ...previous,
          selectedPath: file.path,
          selectedDiff: cached,
          selectedDiffLoading: !cached,
          selectedDiffError: null,
        };
      });
      if (cached) {
        return;
      }
      try {
        const detail = await getGitWorktreeDiffFileAgainstBranch(workspaceId, branch, file.path);
        const resolvedDetail: GitCommitDiff = {
          ...detail,
          path: file.path,
          status: detail.status || file.status,
        };
        branchDiffCacheRef.current.set(cacheKey, resolvedDetail);
        setBranchDiffState((previous) => {
          if (
            !previous ||
            previous.mode !== "worktree" ||
            previous.branch !== branch ||
            previous.compareBranch !== compareBranch ||
            previous.selectedPath !== file.path
          ) {
            return previous;
          }
          return {
            ...previous,
            selectedDiff: resolvedDetail,
            selectedDiffLoading: false,
            selectedDiffError: null,
          };
        });
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        setBranchDiffState((previous) => {
          if (
            !previous ||
            previous.mode !== "worktree" ||
            previous.branch !== branch ||
            previous.compareBranch !== compareBranch ||
            previous.selectedPath !== file.path
          ) {
            return previous;
          }
          return {
            ...previous,
            selectedDiff: null,
            selectedDiffLoading: false,
            selectedDiffError: localizeKnownGitError(raw) ?? raw,
          };
        });
      }
    },
    [
      branchDiffCacheRef,
      getGitWorktreeDiffFileAgainstBranch,
      localizeKnownGitError,
      setBranchDiffState,
      workspaceId,
    ],
  );

  const handleSelectBranchCompareCommit = useCallback(
    async (
      branch: string,
      compareBranch: string,
      direction: BranchCompareDirection,
      commit: { sha: string },
    ) => {
      if (!workspaceId) {
        return;
      }
      setComparePreviewFileKey(null);
      const cacheKey = `${workspaceId}\u0000${commit.sha}`;
      const cached = branchCompareDetailsCacheRef.current.get(cacheKey) ?? null;
      setBranchDiffState((previous) => {
        if (
          !previous ||
          previous.mode !== "branch" ||
          previous.branch !== branch ||
          previous.compareBranch !== compareBranch
        ) {
          return previous;
        }
        return {
          ...previous,
          selectedDirection: direction,
          selectedCommitSha: commit.sha,
          selectedCommitDetails: cached,
          selectedCommitLoading: !cached,
          selectedCommitError: null,
        };
      });
      if (cached) {
        return;
      }
      try {
        const details = await getGitCommitDetails(workspaceId, commit.sha);
        branchCompareDetailsCacheRef.current.set(cacheKey, details);
        setBranchDiffState((previous) => {
          if (
            !previous ||
            previous.mode !== "branch" ||
            previous.branch !== branch ||
            previous.compareBranch !== compareBranch ||
            previous.selectedCommitSha !== commit.sha ||
            previous.selectedDirection !== direction
          ) {
            return previous;
          }
          return {
            ...previous,
            selectedCommitDetails: details,
            selectedCommitLoading: false,
            selectedCommitError: null,
          };
        });
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        setBranchDiffState((previous) => {
          if (
            !previous ||
            previous.mode !== "branch" ||
            previous.branch !== branch ||
            previous.compareBranch !== compareBranch ||
            previous.selectedCommitSha !== commit.sha ||
            previous.selectedDirection !== direction
          ) {
            return previous;
          }
          return {
            ...previous,
            selectedCommitDetails: null,
            selectedCommitLoading: false,
            selectedCommitError: localizeKnownGitError(raw) ?? raw,
          };
        });
      }
    },
    [
      branchCompareDetailsCacheRef,
      getGitCommitDetails,
      localizeKnownGitError,
      setBranchDiffState,
      setComparePreviewFileKey,
      workspaceId,
    ],
  );

  return {
    handleShowDiffWithWorktree,
    handleCompareWithCurrentBranch,
    handleSelectWorktreeDiffFile,
    handleSelectBranchCompareCommit,
  };
}
