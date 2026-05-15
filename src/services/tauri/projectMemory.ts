import { invoke } from "@tauri-apps/api/core";

export type ProjectMemorySettings = {
  autoEnabled: boolean;
  captureMode: string;
  dedupeEnabled: boolean;
  desensitizeEnabled: boolean;
  workspaceOverrides: Record<string, { autoEnabled?: boolean }>;
};

export type ProjectMemoryReviewState =
  | "unreviewed"
  | "kept"
  | "converted"
  | "obsolete"
  | "dismissed";

export type ProjectMemoryItem = {
  id: string;
  workspaceId: string;
  schemaVersion?: number | null;
  recordKind?: "conversation_turn" | "manual_note" | "legacy" | null;
  kind: string;
  title: string;
  summary: string;
  detail?: string | null;
  rawText?: string | null;
  cleanText: string;
  tags: string[];
  importance: string;
  threadId?: string | null;
  turnId?: string | null;
  messageId?: string | null;
  assistantMessageId?: string | null;
  userInput?: string | null;
  assistantResponse?: string | null;
  assistantThinkingSummary?: string | null;
  reviewState?: ProjectMemoryReviewState | null;
  source: string;
  fingerprint: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  workspaceName?: string | null;
  workspacePath?: string | null;
  engine?: string | null;
};

export type NormalizedConversationTurnPayload = {
  workspaceId: string;
  threadId: string;
  turnId: string;
  engine?: string | null;
  userInput?: string | null;
  assistantResponse?: string | null;
  assistantMessageId?: string | null;
  assistantThinkingSummary?: string | null;
  workspaceName?: string | null;
  workspacePath?: string | null;
};

export type ProjectMemoryListResult = {
  items: ProjectMemoryItem[];
  total: number;
};

export type ProjectMemoryHealthState =
  | "complete"
  | "input_only"
  | "assistant_only"
  | "pending_fusion"
  | "capture_failed";

export type ProjectMemoryDiagnosticsResult = {
  workspaceId: string;
  total: number;
  healthCounts: Record<ProjectMemoryHealthState, number>;
  duplicateTurnGroups: Array<{
    workspaceId: string;
    threadId: string;
    turnId: string;
    memoryIds: string[];
  }>;
  badFiles: Array<{
    fileName: string;
    error: string;
  }>;
};

export type ProjectMemoryReconcileResult = {
  workspaceId: string;
  dryRun: boolean;
  fixableCount: number;
  fixedCount: number;
  skippedCount: number;
  duplicateGroups: number;
  changedMemoryIds: string[];
};

export async function projectMemoryGetSettings(): Promise<ProjectMemorySettings> {
  return invoke<ProjectMemorySettings>("project_memory_get_settings");
}

export async function projectMemoryUpdateSettings(
  settings: ProjectMemorySettings,
): Promise<ProjectMemorySettings> {
  return invoke<ProjectMemorySettings>("project_memory_update_settings", {
    settings,
  });
}

export async function projectMemoryList(params: {
  workspaceId: string;
  query?: string | null;
  kind?: string | null;
  importance?: string | null;
  tag?: string | null;
  page?: number | null;
  pageSize?: number | null;
}): Promise<ProjectMemoryListResult> {
  return invoke<ProjectMemoryListResult>("project_memory_list", {
    workspaceId: params.workspaceId,
    query: params.query ?? null,
    kind: params.kind ?? null,
    importance: params.importance ?? null,
    tag: params.tag ?? null,
    page: params.page ?? null,
    pageSize: params.pageSize ?? null,
  });
}

export async function projectMemoryListSummary(params: {
  workspaceId: string;
  query?: string | null;
  kind?: string | null;
  importance?: string | null;
  tag?: string | null;
  page?: number | null;
  pageSize?: number | null;
}): Promise<ProjectMemoryListResult> {
  return projectMemoryList(params);
}

export async function projectMemoryGet(
  memoryId: string,
  workspaceId: string,
): Promise<ProjectMemoryItem | null> {
  return invoke<ProjectMemoryItem | null>("project_memory_get", {
    memoryId,
    workspaceId,
  });
}

export async function projectMemoryGetDetail(
  memoryId: string,
  workspaceId: string,
): Promise<ProjectMemoryItem | null> {
  return projectMemoryGet(memoryId, workspaceId);
}

export async function projectMemoryCreate(input: {
  workspaceId: string;
  schemaVersion?: number | null;
  recordKind?: ProjectMemoryItem["recordKind"];
  kind?: string | null;
  title?: string | null;
  summary?: string | null;
  detail?: string | null;
  tags?: string[] | null;
  importance?: string | null;
  threadId?: string | null;
  turnId?: string | null;
  messageId?: string | null;
  assistantMessageId?: string | null;
  userInput?: string | null;
  assistantResponse?: string | null;
  assistantThinkingSummary?: string | null;
  reviewState?: ProjectMemoryReviewState | null;
  source?: string | null;
  workspaceName?: string | null;
  workspacePath?: string | null;
  engine?: string | null;
}): Promise<ProjectMemoryItem> {
  return invoke<ProjectMemoryItem>("project_memory_create", {
    input: {
      workspaceId: input.workspaceId,
      schemaVersion: input.schemaVersion ?? null,
      recordKind: input.recordKind ?? null,
      kind: input.kind ?? null,
      title: input.title ?? null,
      summary: input.summary ?? null,
      detail: input.detail ?? null,
      tags: input.tags ?? null,
      importance: input.importance ?? null,
      threadId: input.threadId ?? null,
      turnId: input.turnId ?? null,
      messageId: input.messageId ?? null,
      assistantMessageId: input.assistantMessageId ?? null,
      userInput: input.userInput ?? null,
      assistantResponse: input.assistantResponse ?? null,
      assistantThinkingSummary: input.assistantThinkingSummary ?? null,
      reviewState: input.reviewState ?? null,
      source: input.source ?? null,
      workspaceName: input.workspaceName ?? null,
      workspacePath: input.workspacePath ?? null,
      engine: input.engine ?? null,
    },
  });
}

export async function projectMemoryUpdate(
  memoryId: string,
  workspaceId: string,
  patch: {
    schemaVersion?: number | null;
    recordKind?: ProjectMemoryItem["recordKind"];
    kind?: string | null;
    title?: string | null;
    summary?: string | null;
    detail?: string | null;
    tags?: string[] | null;
    importance?: string | null;
    threadId?: string | null;
    turnId?: string | null;
    messageId?: string | null;
    assistantMessageId?: string | null;
    userInput?: string | null;
    assistantResponse?: string | null;
    assistantThinkingSummary?: string | null;
    reviewState?: ProjectMemoryReviewState | null;
    source?: string | null;
    workspaceName?: string | null;
    workspacePath?: string | null;
    engine?: string | null;
  },
): Promise<ProjectMemoryItem> {
  return invoke<ProjectMemoryItem>("project_memory_update", {
    memoryId,
    workspaceId,
    patch: {
      schemaVersion: patch.schemaVersion ?? null,
      recordKind: patch.recordKind ?? null,
      kind: patch.kind ?? null,
      title: patch.title ?? null,
      summary: patch.summary ?? null,
      detail: patch.detail ?? null,
      tags: patch.tags ?? null,
      importance: patch.importance ?? null,
      threadId: patch.threadId ?? null,
      turnId: patch.turnId ?? null,
      messageId: patch.messageId ?? null,
      assistantMessageId: patch.assistantMessageId ?? null,
      userInput: patch.userInput ?? null,
      assistantResponse: patch.assistantResponse ?? null,
      assistantThinkingSummary: patch.assistantThinkingSummary ?? null,
      reviewState: patch.reviewState ?? null,
      source: patch.source ?? null,
      workspaceName: patch.workspaceName ?? null,
      workspacePath: patch.workspacePath ?? null,
      engine: patch.engine ?? null,
    },
  });
}

export async function projectMemoryDelete(
  memoryId: string,
  workspaceId: string,
): Promise<void> {
  return invoke<void>("project_memory_delete", {
    memoryId,
    workspaceId,
  });
}

export async function projectMemoryDiagnostics(
  workspaceId: string,
): Promise<ProjectMemoryDiagnosticsResult> {
  return invoke<ProjectMemoryDiagnosticsResult>("project_memory_diagnostics", {
    workspaceId,
  });
}

export async function projectMemoryReconcile(
  workspaceId: string,
  dryRun: boolean,
): Promise<ProjectMemoryReconcileResult> {
  return invoke<ProjectMemoryReconcileResult>("project_memory_reconcile", {
    workspaceId,
    dryRun,
  });
}

export async function projectMemoryCaptureAuto(input: {
  workspaceId: string;
  text: string;
  threadId?: string | null;
  turnId?: string | null;
  messageId?: string | null;
  source?: string | null;
  workspaceName?: string | null;
  workspacePath?: string | null;
  engine?: string | null;
}): Promise<ProjectMemoryItem | null> {
  return invoke<ProjectMemoryItem | null>("project_memory_capture_auto", {
    input: {
      workspaceId: input.workspaceId,
      text: input.text,
      threadId: input.threadId ?? null,
      turnId: input.turnId ?? null,
      messageId: input.messageId ?? null,
      source: input.source ?? null,
      workspaceName: input.workspaceName ?? null,
      workspacePath: input.workspacePath ?? null,
      engine: input.engine ?? null,
    },
  });
}

export async function projectMemoryCaptureTurnInput(
  input: NormalizedConversationTurnPayload & { userInput: string },
): Promise<ProjectMemoryItem | null> {
  return projectMemoryCaptureAuto({
    workspaceId: input.workspaceId,
    text: input.userInput,
    threadId: input.threadId,
    turnId: input.turnId,
    messageId: input.turnId,
    source: "conversation_turn",
    workspaceName: input.workspaceName ?? null,
    workspacePath: input.workspacePath ?? null,
    engine: input.engine ?? null,
  });
}

export async function projectMemoryCompleteTurn(
  input: NormalizedConversationTurnPayload & {
    assistantResponse: string;
    memoryId?: string | null;
    kind?: string | null;
    title?: string | null;
    summary?: string | null;
    importance?: string | null;
  },
): Promise<ProjectMemoryItem> {
  const patch = {
    schemaVersion: 2,
    recordKind: "conversation_turn" as const,
    kind: input.kind ?? "conversation",
    title: input.title ?? null,
    summary: input.summary ?? null,
    importance: input.importance ?? null,
    threadId: input.threadId,
    turnId: input.turnId,
    messageId: input.assistantMessageId ?? input.turnId,
    assistantMessageId: input.assistantMessageId ?? null,
    userInput: input.userInput ?? null,
    assistantResponse: input.assistantResponse,
    assistantThinkingSummary: input.assistantThinkingSummary ?? null,
    source: "conversation_turn",
    workspaceName: input.workspaceName ?? null,
    workspacePath: input.workspacePath ?? null,
    engine: input.engine ?? null,
  };

  if (input.memoryId) {
    try {
      return await projectMemoryUpdate(input.memoryId, input.workspaceId, patch);
    } catch {
      // Fall through to turn-key create/upsert when the provisional id is stale.
    }
  }

  return projectMemoryCreate({
    workspaceId: input.workspaceId,
    ...patch,
  });
}
