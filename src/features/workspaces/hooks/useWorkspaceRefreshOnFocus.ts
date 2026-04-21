import { useEffect } from "react";
import type { WorkspaceInfo } from "../../../types";

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
  useEffect(() => {
    const handleFocus = () => {
      void (async () => {
        let latestWorkspaces = workspaces;
        try {
          const entries = await refreshWorkspaces();
          if (entries) {
            latestWorkspaces = entries;
          }
        } catch {
          // Silent: refresh errors show in debug panel.
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
      })();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleFocus();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeWorkspaceId, listThreadsForWorkspace, refreshWorkspaces, workspaces]);
}
