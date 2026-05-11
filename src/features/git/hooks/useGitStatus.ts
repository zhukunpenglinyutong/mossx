import { useCallback, useEffect, useRef, useState } from "react";
import type { GitFileStatus, WorkspaceInfo } from "../../../types";
import { getGitStatus } from "../../../services/tauri";

type GitStatusState = {
  isGitRepository: boolean;
  branchName: string;
  files: GitFileStatus[];
  stagedFiles: GitFileStatus[];
  unstagedFiles: GitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
  error: string | null;
};

const emptyStatus: GitStatusState = {
  isGitRepository: true,
  branchName: "",
  files: [],
  stagedFiles: [],
  unstagedFiles: [],
  totalAdditions: 0,
  totalDeletions: 0,
  error: null,
};

const REFRESH_INTERVAL_MS = 30000;
const HEAVY_CHANGESET_FILE_THRESHOLD = 120;
const HEAVY_CHANGESET_REFRESH_INTERVAL_MS = 30000;
const BACKGROUND_REFRESH_INTERVAL_MS = 30000;
const HEAVY_CHANGESET_BACKGROUND_REFRESH_INTERVAL_MS = 60000;

export type GitStatusPollingMode = "active" | "background" | "paused";

type UseGitStatusOptions = {
  pollingEnabled?: boolean;
  pollingMode?: GitStatusPollingMode;
};

export function useGitStatus(
  activeWorkspace: WorkspaceInfo | null,
  options?: UseGitStatusOptions,
) {
  const pollingMode: GitStatusPollingMode =
    options?.pollingMode ??
    (options?.pollingEnabled === false ? "paused" : "active");
  const [status, setStatus] = useState<GitStatusState>(emptyStatus);
  const requestIdRef = useRef(0);
  const workspaceIdRef = useRef<string | null>(activeWorkspace?.id ?? null);
  const cachedStatusRef = useRef<Map<string, GitStatusState>>(new Map());
  const statusRef = useRef<GitStatusState>(emptyStatus);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const inFlightRequestIdRef = useRef<number | null>(null);
  const workspaceId = activeWorkspace?.id ?? null;
  const autoPollingAllowed = status.isGitRepository;

  const resolveBranchName = useCallback(
    (incoming: string | undefined, cached: GitStatusState | undefined) => {
      const trimmed = incoming?.trim();
      if (trimmed && trimmed !== "unknown") {
        return trimmed;
      }
      const cachedBranch = cached?.branchName?.trim();
      return cachedBranch && cachedBranch !== "unknown"
        ? cachedBranch
        : trimmed ?? "";
    },
    [],
  );

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const resolveNextRefreshInterval = useCallback(() => {
    const changedFileCount = statusRef.current.files.length;
    if (pollingMode === "background") {
      if (changedFileCount >= HEAVY_CHANGESET_FILE_THRESHOLD) {
        return HEAVY_CHANGESET_BACKGROUND_REFRESH_INTERVAL_MS;
      }
      return BACKGROUND_REFRESH_INTERVAL_MS;
    }
    if (changedFileCount >= HEAVY_CHANGESET_FILE_THRESHOLD) {
      return HEAVY_CHANGESET_REFRESH_INTERVAL_MS;
    }
    return REFRESH_INTERVAL_MS;
  }, [pollingMode]);

  const refresh = useCallback(() => {
    if (!workspaceId) {
      setStatus(emptyStatus);
      return Promise.resolve();
    }
    if (inFlightRef.current) {
      return inFlightRef.current;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const currentRequestId = requestId;
    const inFlight = (async () => {
      try {
        const data = await getGitStatus(workspaceId);
        if (
          requestIdRef.current !== requestId ||
          workspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        const cached = cachedStatusRef.current.get(workspaceId);
        const isGitRepository = data.isGitRepository ?? true;
        const resolvedBranchName = isGitRepository
          ? resolveBranchName(data.branchName, cached)
          : "";
        const nextStatus = {
          ...data,
          isGitRepository,
          branchName: resolvedBranchName,
          error: isGitRepository ? null : "not a git repository",
        };
        setStatus(nextStatus);
        cachedStatusRef.current.set(workspaceId, nextStatus);
      } catch (err) {
        console.error("Failed to load git status", err);
        if (
          requestIdRef.current !== requestId ||
          workspaceIdRef.current !== workspaceId
        ) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        const cached = cachedStatusRef.current.get(workspaceId);
        const nextStatus = cached
          ? { ...cached, error: message }
          : { ...emptyStatus, error: message };
        setStatus(nextStatus);
      } finally {
        if (inFlightRequestIdRef.current === currentRequestId) {
          inFlightRef.current = null;
          inFlightRequestIdRef.current = null;
        }
      }
    })();
    inFlightRequestIdRef.current = currentRequestId;
    inFlightRef.current = inFlight;
    return inFlight;
  }, [resolveBranchName, workspaceId]);

  useEffect(() => {
    if (workspaceIdRef.current !== workspaceId) {
      workspaceIdRef.current = workspaceId;
      requestIdRef.current += 1;
      inFlightRef.current = null;
      inFlightRequestIdRef.current = null;
      if (!workspaceId) {
        setStatus(emptyStatus);
        return;
      }
      const cached = cachedStatusRef.current.get(workspaceId);
      setStatus(cached ?? emptyStatus);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      setStatus(emptyStatus);
      return;
    }
    if (pollingMode === "paused") {
      return;
    }
    if (!autoPollingAllowed) {
      return;
    }

    let cancelled = false;
    let timeoutId = 0;
    const runAndSchedule = () => {
      if (cancelled) {
        return;
      }
      refresh()
        .catch(() => {})
        .finally(() => {
          if (cancelled) {
            return;
          }
          const delayMs = resolveNextRefreshInterval();
          timeoutId = window.setTimeout(() => {
            runAndSchedule();
          }, delayMs);
        });
    };
    if (pollingMode === "background") {
      const delayMs = resolveNextRefreshInterval();
      timeoutId = window.setTimeout(() => {
        runAndSchedule();
      }, delayMs);
    } else {
      runAndSchedule();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [autoPollingAllowed, pollingMode, refresh, resolveNextRefreshInterval, workspaceId]);

  return { status, refresh };
}
