type ManualRecoveryEngine = "claude" | "codex" | "gemini" | "opencode";

export type ManualThreadRecoveryResult =
  | { kind: "rebound"; threadId: string }
  | { kind: "fresh"; threadId: string }
  | { kind: "failed"; reason?: string | null };

export function shouldSuppressManualRecoveryResendUserMessage(
  result: ManualThreadRecoveryResult,
): boolean {
  return result.kind === "rebound";
}

function normalizeManualRecoveryError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

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
  allowFreshThread?: boolean;
}): Promise<ManualThreadRecoveryResult> {
  const normalizedThreadId = params.threadId.trim();
  if (!params.workspaceId.trim() || !normalizedThreadId) {
    return { kind: "failed", reason: "missing workspace or thread id" };
  }

  let recoveredThreadId: string | null = null;
  let refreshErrorMessage: string | null = null;
  try {
    recoveredThreadId = await params.refreshThread(params.workspaceId, normalizedThreadId);
  } catch (error) {
    refreshErrorMessage = normalizeManualRecoveryError(error);
    recoveredThreadId = null;
  }
  const normalizedRecoveredThreadId =
    typeof recoveredThreadId === "string" ? recoveredThreadId.trim() : "";
  if (normalizedRecoveredThreadId) {
    return { kind: "rebound", threadId: normalizedRecoveredThreadId };
  }
  if (params.allowFreshThread === false) {
    return {
      kind: "failed",
      reason: refreshErrorMessage ?? "no verified replacement thread",
    };
  }
  let freshThreadId: string | null = null;
  try {
    freshThreadId = await params.startThreadForWorkspace(params.workspaceId, {
      activate: true,
      engine: inferManualRecoveryEngine(
        params.workspaceId,
        normalizedThreadId,
        params.threadsByWorkspace,
      ),
    });
  } catch (error) {
    return { kind: "failed", reason: normalizeManualRecoveryError(error) };
  }
  const normalizedFreshThreadId =
    typeof freshThreadId === "string" ? freshThreadId.trim() : "";
  return normalizedFreshThreadId
    ? { kind: "fresh", threadId: normalizedFreshThreadId }
    : {
        kind: "failed",
        reason: refreshErrorMessage ?? "fresh thread unavailable",
      };
}
