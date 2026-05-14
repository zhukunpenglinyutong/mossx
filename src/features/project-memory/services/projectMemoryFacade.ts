import {
  projectMemoryCaptureAuto,
  projectMemoryCaptureTurnInput,
  projectMemoryCompleteTurn,
  projectMemoryCreate,
  projectMemoryDelete,
  projectMemoryDiagnostics,
  projectMemoryGet,
  projectMemoryGetDetail,
  projectMemoryGetSettings,
  projectMemoryList,
  projectMemoryListSummary,
  projectMemoryReconcile,
  projectMemoryUpdate,
  projectMemoryUpdateSettings,
  type ProjectMemoryItem,
  type ProjectMemoryListResult,
  type ProjectMemoryDiagnosticsResult,
  type ProjectMemoryReconcileResult,
  type ProjectMemorySettings,
  type NormalizedConversationTurnPayload,
} from "../../../services/tauri";

export type ListProjectMemoryParams = {
  workspaceId: string;
  query?: string | null;
  kind?: string | null;
  importance?: string | null;
  tag?: string | null;
  page?: number | null;
  pageSize?: number | null;
};

export type CreateProjectMemoryParams = {
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
  reviewState?: ProjectMemoryItem["reviewState"];
  source?: string | null;
  workspaceName?: string | null;
  workspacePath?: string | null;
  engine?: string | null;
};

export type UpdateProjectMemoryParams = {
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
  reviewState?: ProjectMemoryItem["reviewState"];
  source?: string | null;
  workspaceName?: string | null;
  workspacePath?: string | null;
  engine?: string | null;
};

export type CaptureTurnInputParams = NormalizedConversationTurnPayload & {
  userInput: string;
};

export type CompleteTurnMemoryParams = NormalizedConversationTurnPayload & {
  assistantResponse: string;
  memoryId?: string | null;
  kind?: string | null;
  title?: string | null;
  summary?: string | null;
  importance?: string | null;
};

export const projectMemoryFacade = {
  getSettings(): Promise<ProjectMemorySettings> {
    return projectMemoryGetSettings();
  },
  updateSettings(settings: ProjectMemorySettings): Promise<ProjectMemorySettings> {
    return projectMemoryUpdateSettings(settings);
  },
  list(params: ListProjectMemoryParams): Promise<ProjectMemoryListResult> {
    return projectMemoryList(params);
  },
  listSummary(params: ListProjectMemoryParams): Promise<ProjectMemoryListResult> {
    return projectMemoryListSummary(params);
  },
  get(memoryId: string, workspaceId: string): Promise<ProjectMemoryItem | null> {
    return projectMemoryGet(memoryId, workspaceId);
  },
  getDetail(memoryId: string, workspaceId: string): Promise<ProjectMemoryItem | null> {
    return projectMemoryGetDetail(memoryId, workspaceId);
  },
  create(params: CreateProjectMemoryParams): Promise<ProjectMemoryItem> {
    return projectMemoryCreate(params);
  },
  update(
    memoryId: string,
    workspaceId: string,
    patch: UpdateProjectMemoryParams,
  ): Promise<ProjectMemoryItem> {
    return projectMemoryUpdate(memoryId, workspaceId, patch);
  },
  delete(memoryId: string, workspaceId: string): Promise<void> {
    return projectMemoryDelete(memoryId, workspaceId);
  },
  diagnostics(workspaceId: string): Promise<ProjectMemoryDiagnosticsResult> {
    return projectMemoryDiagnostics(workspaceId);
  },
  reconcile(workspaceId: string, dryRun: boolean): Promise<ProjectMemoryReconcileResult> {
    return projectMemoryReconcile(workspaceId, dryRun);
  },
  captureAuto(input: {
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
    return projectMemoryCaptureAuto(input);
  },
  captureTurnInput(input: CaptureTurnInputParams): Promise<ProjectMemoryItem | null> {
    return projectMemoryCaptureTurnInput(input);
  },
  completeTurnMemory(input: CompleteTurnMemoryParams): Promise<ProjectMemoryItem> {
    return projectMemoryCompleteTurn(input);
  },
};
