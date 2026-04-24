import { invoke } from "@tauri-apps/api/core";

export type ProjectMemorySettings = {
  autoEnabled: boolean;
  captureMode: string;
  dedupeEnabled: boolean;
  desensitizeEnabled: boolean;
  workspaceOverrides: Record<string, { autoEnabled?: boolean }>;
};

export type ProjectMemoryItem = {
  id: string;
  workspaceId: string;
  kind: string;
  title: string;
  summary: string;
  detail?: string | null;
  rawText?: string | null;
  cleanText: string;
  tags: string[];
  importance: string;
  threadId?: string | null;
  messageId?: string | null;
  source: string;
  fingerprint: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  workspaceName?: string | null;
  workspacePath?: string | null;
  engine?: string | null;
};

export type ProjectMemoryListResult = {
  items: ProjectMemoryItem[];
  total: number;
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

export async function projectMemoryGet(
  memoryId: string,
  workspaceId: string,
): Promise<ProjectMemoryItem | null> {
  return invoke<ProjectMemoryItem | null>("project_memory_get", {
    memoryId,
    workspaceId,
  });
}

export async function projectMemoryCreate(input: {
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
}): Promise<ProjectMemoryItem> {
  return invoke<ProjectMemoryItem>("project_memory_create", {
    input: {
      workspaceId: input.workspaceId,
      kind: input.kind ?? null,
      title: input.title ?? null,
      summary: input.summary ?? null,
      detail: input.detail ?? null,
      tags: input.tags ?? null,
      importance: input.importance ?? null,
      threadId: input.threadId ?? null,
      messageId: input.messageId ?? null,
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
    kind?: string | null;
    title?: string | null;
    summary?: string | null;
    detail?: string | null;
    tags?: string[] | null;
    importance?: string | null;
  },
): Promise<ProjectMemoryItem> {
  return invoke<ProjectMemoryItem>("project_memory_update", {
    memoryId,
    workspaceId,
    patch: {
      kind: patch.kind ?? null,
      title: patch.title ?? null,
      summary: patch.summary ?? null,
      detail: patch.detail ?? null,
      tags: patch.tags ?? null,
      importance: patch.importance ?? null,
    },
  });
}

export async function projectMemoryDelete(
  memoryId: string,
  workspaceId: string,
  hardDelete?: boolean,
): Promise<void> {
  return invoke<void>("project_memory_delete", {
    memoryId,
    workspaceId,
    hardDelete: hardDelete ?? false,
  });
}

export async function projectMemoryCaptureAuto(input: {
  workspaceId: string;
  text: string;
  threadId?: string | null;
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
      messageId: input.messageId ?? null,
      source: input.source ?? null,
      workspaceName: input.workspaceName ?? null,
      workspacePath: input.workspacePath ?? null,
      engine: input.engine ?? null,
    },
  });
}
