type ManualRecoveryEngine = "claude" | "codex" | "gemini" | "opencode";

function inferManualRecoveryEngine(
  workspaceId: string,
  threadId: string,
  threadsByWorkspace: Record<string, Array<{ id: string; engineSource?: ManualRecoveryEngine }>>,
): ManualRecoveryEngine {
  const thread = (threadsByWorkspace[workspaceId] ?? []).find((entry) => entry.id === threadId);
  if (thread?.engineSource) {
    return thread.engineSource;
  }
  const normalizedThreadId = threadId.trim().toLowerCase();
  if (normalizedThreadId.startsWith("claude:") || normalizedThreadId.startsWith("claude-pending-")) {
    return "claude";
  }
  if (normalizedThreadId.startsWith("gemini:") || normalizedThreadId.startsWith("gemini-pending-")) {
    return "gemini";
  }
  if (normalizedThreadId.startsWith("opencode:") || normalizedThreadId.startsWith("opencode-pending-")) {
    return "opencode";
  }
  return "codex";
}

export async function recoverThreadBindingForManualRecovery(params: {
  workspaceId: string;
  threadId: string;
  threadsByWorkspace: Record<string, Array<{ id: string; engineSource?: ManualRecoveryEngine }>>;
  refreshThread: (workspaceId: string, threadId: string) => Promise<string | null>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: {
      activate?: boolean;
      engine?: ManualRecoveryEngine;
    },
  ) => Promise<string | null>;
}): Promise<string | null> {
  let recoveredThreadId: string | null = null;
  try {
    recoveredThreadId = await params.refreshThread(params.workspaceId, params.threadId);
  } catch {
    recoveredThreadId = null;
  }
  const normalizedRecoveredThreadId =
    typeof recoveredThreadId === "string" ? recoveredThreadId.trim() : "";
  if (normalizedRecoveredThreadId) {
    return normalizedRecoveredThreadId;
  }
  const freshThreadId = await params.startThreadForWorkspace(params.workspaceId, {
    activate: true,
    engine: inferManualRecoveryEngine(
      params.workspaceId,
      params.threadId,
      params.threadsByWorkspace,
    ),
  });
  const normalizedFreshThreadId =
    typeof freshThreadId === "string" ? freshThreadId.trim() : "";
  return normalizedFreshThreadId || null;
}
