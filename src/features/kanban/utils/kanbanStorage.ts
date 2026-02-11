import type { KanbanPanel, KanbanStoreData } from "../types";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";

const EMPTY_STORE: KanbanStoreData = { panels: [], tasks: [] };

export function loadKanbanData(): KanbanStoreData {
  const stored = getClientStoreSync<Record<string, unknown>>("app", "kanban");
  if (!stored || !Array.isArray(stored.tasks)) {
    return EMPTY_STORE;
  }

  // Migration: old data has no panels array — create a default panel per workspace
  if (!Array.isArray(stored.panels)) {
    const workspaceIds = [
      ...new Set(
        (stored.tasks as Array<{ workspaceId: string }>).map((t) => t.workspaceId)
      ),
    ];
    const now = Date.now();
    const panels: KanbanPanel[] = workspaceIds.map((wsId, i) => ({
      id: `panel_migrated_${wsId}`,
      workspaceId: wsId,
      name: "Default",
      sortOrder: (i + 1) * 1000,
      createdAt: now,
      updatedAt: now,
    }));

    const tasks = (stored.tasks as Array<Record<string, unknown>>).map((t) => ({
      ...t,
      panelId: (t.panelId as string) ?? `panel_migrated_${t.workspaceId as string}`,
    }));

    const migrated: KanbanStoreData = {
      panels,
      tasks: tasks as KanbanStoreData["tasks"],
    };
    saveKanbanData(migrated);
    return migrated;
  }

  return { panels: stored.panels as KanbanPanel[], tasks: stored.tasks as KanbanStoreData["tasks"] };
}

export function saveKanbanData(data: KanbanStoreData): void {
  writeClientStoreValue("app", "kanban", data);
}

/**
 * Migrate kanban data: replace UUID-based workspaceId with workspace path.
 * Returns the migrated data and whether any changes were made.
 */
export function migrateWorkspaceIds(
  data: KanbanStoreData,
  idToPath: Map<string, string>,
): { data: KanbanStoreData; migrated: boolean } {
  let migrated = false;
  const panels = data.panels.map((panel) => {
    const path = idToPath.get(panel.workspaceId);
    if (path && path !== panel.workspaceId) {
      migrated = true;
      return { ...panel, workspaceId: path };
    }
    return panel;
  });
  const tasks = data.tasks.map((task) => {
    const path = idToPath.get(task.workspaceId);
    if (path && path !== task.workspaceId) {
      migrated = true;
      return { ...task, workspaceId: path };
    }
    return task;
  });
  return { data: { panels, tasks }, migrated };
}

// --- Task creation draft persistence ---

export type TaskDraft = {
  title: string;
  description: string;
  engineType: string;
  modelId: string | null;
  images: string[];
};

const DRAFT_STORE_KEY = "kanban_task_draft";

function draftKey(panelId: string): string {
  return `${DRAFT_STORE_KEY}_${panelId}`;
}

export function loadTaskDraft(panelId: string): TaskDraft | null {
  const stored = getClientStoreSync<TaskDraft>("app", draftKey(panelId));
  if (!stored || (typeof stored.title !== "string" && typeof stored.description !== "string")) {
    return null;
  }
  return stored;
}

export function saveTaskDraft(panelId: string, draft: TaskDraft): void {
  writeClientStoreValue("app", draftKey(panelId), draft);
}

export function clearTaskDraft(panelId: string): void {
  writeClientStoreValue("app", draftKey(panelId), null);
}
