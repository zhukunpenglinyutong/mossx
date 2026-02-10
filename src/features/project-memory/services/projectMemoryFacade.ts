import {
  projectMemoryCaptureAuto,
  projectMemoryCreate,
  projectMemoryDelete,
  projectMemoryGet,
  projectMemoryGetSettings,
  projectMemoryList,
  projectMemoryUpdate,
  projectMemoryUpdateSettings,
  type ProjectMemoryItem,
  type ProjectMemoryListResult,
  type ProjectMemorySettings,
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
  kind?: string | null;
  title?: string | null;
  summary?: string | null;
  detail?: string | null;
  tags?: string[] | null;
  importance?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  source?: string | null;
  workspaceName?: string | null;
  workspacePath?: string | null;
  engine?: string | null;
};

export type UpdateProjectMemoryParams = {
  kind?: string | null;
  title?: string | null;
  summary?: string | null;
  detail?: string | null;
  tags?: string[] | null;
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
  get(memoryId: string, workspaceId: string): Promise<ProjectMemoryItem | null> {
    return projectMemoryGet(memoryId, workspaceId);
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
  delete(memoryId: string, workspaceId: string, hardDelete?: boolean): Promise<void> {
    return projectMemoryDelete(memoryId, workspaceId, hardDelete);
  },
  captureAuto(input: {
    workspaceId: string;
    text: string;
    threadId?: string | null;
    messageId?: string | null;
    source?: string | null;
    workspaceName?: string | null;
    workspacePath?: string | null;
    engine?: string | null;
  }): Promise<ProjectMemoryItem | null> {
    return projectMemoryCaptureAuto(input);
  },
};

