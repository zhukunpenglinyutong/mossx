import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { normalizeDiffPath } from "./GitDiffPanelInclusion";

type GitCommitSelectionFile = {
  path: string;
};

type UseGitCommitSelectionOptions = {
  stagedFiles: GitCommitSelectionFile[];
  unstagedFiles: GitCommitSelectionFile[];
};

export type CommitButtonProps = {
  commitMessage: string;
  selectedCount: number;
  hasAnyChanges: boolean;
  commitLoading: boolean;
  onCommit?: (selectedPaths?: string[]) => void | Promise<void>;
  selectedPaths: string[];
};

export function CommitButton({
  commitMessage,
  selectedCount,
  hasAnyChanges,
  commitLoading,
  onCommit,
  selectedPaths,
}: CommitButtonProps) {
  const { t } = useTranslation();
  const hasMessage = commitMessage.trim().length > 0;
  const canCommit = hasMessage && selectedCount > 0 && !commitLoading;

  return (
    <div className="commit-button-container">
      <button
        type="button"
        className="commit-button"
        onClick={() => {
          if (canCommit) {
            void onCommit?.(selectedPaths);
          }
        }}
        disabled={!canCommit}
        title={
          !hasMessage
            ? t("git.enterCommitMessage")
            : selectedCount === 0 && hasAnyChanges
              ? t("git.selectFilesToCommit")
              : !hasAnyChanges
                ? t("git.noChangesToCommit")
                : t("git.commitSelectedChanges")
        }
      >
        {commitLoading ? (
          <span className="commit-button-spinner" aria-hidden />
        ) : (
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
        <span>{commitLoading ? t("git.committing") : t("git.commit")}</span>
      </button>
    </div>
  );
}

export function useGitCommitSelection({
  stagedFiles,
  unstagedFiles,
}: UseGitCommitSelectionOptions) {
  const [commitSelectionOverrides, setCommitSelectionOverrides] = useState<Record<string, boolean>>({});

  const allFiles = useMemo(
    () => [
      ...stagedFiles.map((file) => ({ ...file, section: "staged" as const })),
      ...unstagedFiles.map((file) => ({ ...file, section: "unstaged" as const })),
    ],
    [stagedFiles, unstagedFiles],
  );

  const orderedCommitPaths = useMemo(() => {
    const seenPaths = new Set<string>();
    const paths: string[] = [];
    for (const file of allFiles) {
      const normalizedPath = normalizeDiffPath(file.path);
      if (seenPaths.has(normalizedPath)) {
        continue;
      }
      seenPaths.add(normalizedPath);
      paths.push(normalizedPath);
    }
    return paths;
  }, [allFiles]);

  const rawCommitPathByNormalizedPath = useMemo(() => {
    const pathMap = new Map<string, string>();
    for (const file of allFiles) {
      const normalizedPath = normalizeDiffPath(file.path);
      if (!pathMap.has(normalizedPath)) {
        pathMap.set(normalizedPath, file.path);
      }
    }
    return pathMap;
  }, [allFiles]);

  const stagedPathSet = useMemo(
    () => new Set(stagedFiles.map((file) => normalizeDiffPath(file.path))),
    [stagedFiles],
  );
  const unstagedPathSet = useMemo(
    () => new Set(unstagedFiles.map((file) => normalizeDiffPath(file.path))),
    [unstagedFiles],
  );
  const lockedHybridPathSet = useMemo(() => {
    const hybridPaths = new Set<string>();
    for (const path of stagedPathSet) {
      if (unstagedPathSet.has(path)) {
        hybridPaths.add(path);
      }
    }
    return hybridPaths;
  }, [stagedPathSet, unstagedPathSet]);

  const isCommitPathLocked = useCallback(
    (path: string) => lockedHybridPathSet.has(normalizeDiffPath(path)),
    [lockedHybridPathSet],
  );

  const isCommitPathSelected = useCallback(
    (path: string) => {
      const normalizedPath = normalizeDiffPath(path);
      if (lockedHybridPathSet.has(normalizedPath)) {
        return true;
      }
      const override = commitSelectionOverrides[normalizedPath];
      if (typeof override === "boolean") {
        return override;
      }
      return stagedPathSet.has(normalizedPath);
    },
    [commitSelectionOverrides, lockedHybridPathSet, stagedPathSet],
  );

  const setCommitSelection = useCallback(
    (paths: string[], selected: boolean) => {
      const normalizedPaths = Array.from(
        new Set(paths.map((path) => normalizeDiffPath(path))),
      ).filter((path) => !lockedHybridPathSet.has(path));
      if (normalizedPaths.length === 0) {
        return;
      }
      setCommitSelectionOverrides((previous) => {
        const next = { ...previous };
        for (const normalizedPath of normalizedPaths) {
          const defaultSelected = stagedPathSet.has(normalizedPath);
          if (selected === defaultSelected) {
            delete next[normalizedPath];
            continue;
          }
          next[normalizedPath] = selected;
        }
        return next;
      });
    },
    [lockedHybridPathSet, stagedPathSet],
  );

  const selectedCommitPaths = useMemo(
    () =>
      orderedCommitPaths
        .filter((path) => isCommitPathSelected(path))
        .map((path) => rawCommitPathByNormalizedPath.get(path) ?? path),
    [isCommitPathSelected, orderedCommitPaths, rawCommitPathByNormalizedPath],
  );
  const includedCommitPaths = useMemo(
    () => orderedCommitPaths.filter((path) => isCommitPathSelected(path)),
    [isCommitPathSelected, orderedCommitPaths],
  );
  const excludedCommitPaths = useMemo(
    () =>
      orderedCommitPaths.filter(
        (path) => !lockedHybridPathSet.has(path) && !isCommitPathSelected(path),
      ),
    [isCommitPathSelected, lockedHybridPathSet, orderedCommitPaths],
  );
  const partialCommitPaths = useMemo(
    () => Array.from(lockedHybridPathSet),
    [lockedHybridPathSet],
  );

  useEffect(() => {
    setCommitSelectionOverrides((previous) => {
      const validPaths = new Set(
        orderedCommitPaths.filter((path) => !lockedHybridPathSet.has(path)),
      );
      const next: Record<string, boolean> = {};
      let didChange = false;
      for (const [path, value] of Object.entries(previous)) {
        if (validPaths.has(path)) {
          next[path] = value;
          continue;
        }
        didChange = true;
      }
      return didChange ? next : previous;
    });
  }, [lockedHybridPathSet, orderedCommitPaths]);

  return {
    selectedCommitPaths,
    selectedCommitCount: selectedCommitPaths.length,
    includedCommitPaths,
    excludedCommitPaths,
    partialCommitPaths,
    isCommitPathLocked,
    setCommitSelection,
  };
}
