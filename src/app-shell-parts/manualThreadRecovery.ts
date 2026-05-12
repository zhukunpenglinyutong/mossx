type ManualRecoveryEngine = "claude" | "codex" | "gemini" | "opencode";
type ManualRecoveryWorkspace = {
  id: string;
  connected: boolean;
};
type ManualRecoveryResendMessage = {
  text: string;
  images?: string[];
};
type ManualRecoveryResendOptions = {
  suppressUserMessageRender: boolean;
  skipOptimisticUserBubble: boolean;
};

export type ManualThreadRecoveryResult =
  | { kind: "rebound"; threadId: string; retryable: false; userAction: "retry" }
  | {
      kind: "fresh";
      threadId: string;
      retryable: true;
      userAction: "start-fresh-thread";
    }
  | {
      kind: "failed";
      reason?: string | null;
      retryable: boolean;
      userAction: "recover-thread" | "start-fresh-thread";
    };

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

function buildManualRecoveryFailure(
  reason: string | null,
  allowFreshThread: boolean,
): ManualThreadRecoveryResult {
  return {
    kind: "failed",
    reason,
    retryable: true,
    userAction: allowFreshThread ? "start-fresh-thread" : "recover-thread",
  };
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
  const normalizedWorkspaceId = params.workspaceId.trim();
  const normalizedThreadId = params.threadId.trim();
  const allowFreshThread = params.allowFreshThread === true;
  if (!normalizedWorkspaceId || !normalizedThreadId) {
    return buildManualRecoveryFailure("missing workspace or thread id", allowFreshThread);
  }

  let recoveredThreadId: string | null = null;
  let refreshErrorMessage: string | null = null;
  try {
    recoveredThreadId = await params.refreshThread(normalizedWorkspaceId, normalizedThreadId);
  } catch (error) {
    refreshErrorMessage = normalizeManualRecoveryError(error);
    recoveredThreadId = null;
  }
  const normalizedRecoveredThreadId =
    typeof recoveredThreadId === "string" ? recoveredThreadId.trim() : "";
  if (normalizedRecoveredThreadId) {
    return {
      kind: "rebound",
      threadId: normalizedRecoveredThreadId,
      retryable: false,
      userAction: "retry",
    };
  }
  if (!allowFreshThread) {
    return buildManualRecoveryFailure(
      refreshErrorMessage ?? "no verified replacement thread",
      allowFreshThread,
    );
  }
  let freshThreadId: string | null = null;
  try {
    freshThreadId = await params.startThreadForWorkspace(normalizedWorkspaceId, {
      activate: true,
      engine: inferManualRecoveryEngine(
        normalizedWorkspaceId,
        normalizedThreadId,
        params.threadsByWorkspace,
      ),
    });
  } catch (error) {
    return buildManualRecoveryFailure(normalizeManualRecoveryError(error), allowFreshThread);
  }
  const normalizedFreshThreadId =
    typeof freshThreadId === "string" ? freshThreadId.trim() : "";
  return normalizedFreshThreadId
    ? {
        kind: "fresh",
        threadId: normalizedFreshThreadId,
        retryable: true,
        userAction: "start-fresh-thread",
      }
    : buildManualRecoveryFailure(
        refreshErrorMessage ?? "fresh thread unavailable",
        allowFreshThread,
      );
}

export async function recoverThreadBindingAndResendForManualRecovery<
  Workspace extends ManualRecoveryWorkspace,
>(params: {
  workspaceId: string;
  threadId: string;
  message: ManualRecoveryResendMessage;
  threadsByWorkspace: Record<string, Array<{ id: string; engineSource?: ManualRecoveryEngine }>>;
  resolveWorkspace: (workspaceId: string) => Workspace | null;
  refreshThread: (workspaceId: string, threadId: string) => Promise<string | null>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: {
      activate?: boolean;
      engine?: ManualRecoveryEngine;
    },
  ) => Promise<string | null>;
  connectWorkspace: (workspace: Workspace) => Promise<void>;
  sendUserMessageToThread: (
    workspace: Workspace,
    threadId: string,
    text: string,
    images: string[],
    options: ManualRecoveryResendOptions,
  ) => Promise<void>;
}): Promise<ManualThreadRecoveryResult> {
  const normalizedWorkspaceId = params.workspaceId.trim();
  const normalizedThreadId = params.threadId.trim();
  const nextText = params.message.text.trim();
  const nextImages = params.message.images ?? [];
  if (!normalizedWorkspaceId || !normalizedThreadId) {
    return buildManualRecoveryFailure("missing workspace or thread id", true);
  }
  if (!nextText && nextImages.length === 0) {
    return buildManualRecoveryFailure("missing message to resend", true);
  }

  const workspace = params.resolveWorkspace(normalizedWorkspaceId);
  if (!workspace) {
    return buildManualRecoveryFailure("workspace unavailable", true);
  }

  const recoveryResult = await recoverThreadBindingForManualRecovery({
    workspaceId: normalizedWorkspaceId,
    threadId: normalizedThreadId,
    threadsByWorkspace: params.threadsByWorkspace,
    refreshThread: params.refreshThread,
    startThreadForWorkspace: params.startThreadForWorkspace,
    allowFreshThread: true,
  });
  if (recoveryResult.kind === "failed") {
    return recoveryResult;
  }

  const targetThreadId = recoveryResult.threadId.trim();
  if (!targetThreadId) {
    return buildManualRecoveryFailure("recovery target unavailable", true);
  }

  try {
    if (!workspace.connected) {
      await params.connectWorkspace(workspace);
    }
    const suppressRecoveredUserMessage =
      shouldSuppressManualRecoveryResendUserMessage(recoveryResult);
    await params.sendUserMessageToThread(
      workspace,
      targetThreadId,
      nextText,
      nextImages,
      {
        suppressUserMessageRender: suppressRecoveredUserMessage,
        skipOptimisticUserBubble: suppressRecoveredUserMessage,
      },
    );
  } catch (error) {
    return buildManualRecoveryFailure(normalizeManualRecoveryError(error), true);
  }

  return recoveryResult;
}
