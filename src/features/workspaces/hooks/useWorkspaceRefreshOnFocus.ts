import { useEffect, useRef } from "react";
import type { WorkspaceInfo } from "../../../types";

const FOCUS_REFRESH_COOLDOWN_MS = 30_000;

type WorkspaceRefreshOptions = {
  workspaces: WorkspaceInfo[];
  activeWorkspaceId: string | null;
  refreshWorkspaces: () => Promise<WorkspaceInfo[] | void>;
  listThreadsForWorkspace: (
    workspace: WorkspaceInfo,
    options?: {
      preserveState?: boolean;
      includeOpenCodeSessions?: boolean;
      recoverySource?: "focus-refresh";
    },
  ) => Promise<void>;
};

export function useWorkspaceRefreshOnFocus({
  workspaces,
  activeWorkspaceId,
  refreshWorkspaces,
  listThreadsForWorkspace,
}: WorkspaceRefreshOptions) {
  const inFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  useEffect(() => {
    let cooldownTimer: number | null = null;
    let disposed = false;

    const clearCooldownTimer = () => {
      if (cooldownTimer !== null) {
        window.clearTimeout(cooldownTimer);
        cooldownTimer = null;
      }
    };

    const runRefresh = async () => {
      if (disposed) {
        return;
      }
      inFlightRef.current = true;
      pendingRefreshRef.current = false;
      lastRefreshStartedAtRef.current = Date.now();
      try {
        let latestWorkspaces = workspaces;
        try {
          const entries = await refreshWorkspaces();
          if (entries) {
            latestWorkspaces = entries;
          }
        } catch {
          // Silent: refresh errors show in debug panel.
        }
        if (disposed) {
          return;
        }
        const connected = latestWorkspaces.filter((entry) => entry.connected);
        const visible = connected.filter((workspace) => {
          if (workspace.id === activeWorkspaceId) {
            return true;
          }
          return !workspace.settings.sidebarCollapsed;
        });
        const active = visible.find((w) => w.id === activeWorkspaceId);
        const rest = visible.filter((w) => w.id !== activeWorkspaceId);
        if (active) {
          await listThreadsForWorkspace(active, {
            preserveState: true,
            includeOpenCodeSessions: false,
            recoverySource: "focus-refresh",
          });
        }
        await Promise.allSettled(
          rest.map((workspace) =>
            listThreadsForWorkspace(workspace, {
              preserveState: true,
              includeOpenCodeSessions: false,
              recoverySource: "focus-refresh",
            }),
          ),
        );
      } finally {
        inFlightRef.current = false;
        if (!disposed && pendingRefreshRef.current) {
          scheduleRefresh();
        }
      }
    };

    const scheduleRefresh = () => {
      if (disposed) {
        return;
      }
      clearCooldownTimer();
      if (inFlightRef.current) {
        pendingRefreshRef.current = true;
        return;
      }
      const elapsedMs = Date.now() - lastRefreshStartedAtRef.current;
      if (elapsedMs >= FOCUS_REFRESH_COOLDOWN_MS) {
        void runRefresh();
        return;
      }
      pendingRefreshRef.current = true;
      cooldownTimer = window.setTimeout(() => {
        cooldownTimer = null;
        void runRefresh();
      }, FOCUS_REFRESH_COOLDOWN_MS - elapsedMs);
    };

    const handleFocus = () => {
      scheduleRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleFocus();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      pendingRefreshRef.current = false;
      clearCooldownTimer();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeWorkspaceId, listThreadsForWorkspace, refreshWorkspaces, workspaces]);
}
