import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KanbanPanel,
  KanbanTask,
  KanbanTaskStatus,
  KanbanStoreData,
  KanbanViewState,
} from "../types";
import type { EngineType, WorkspaceInfo } from "../../../types";
import { loadKanbanData, migrateWorkspaceIds, saveKanbanData } from "../utils/kanbanStorage";
import { generateKanbanId, generatePanelId } from "../utils/kanbanId";

type CreateTaskInput = {
  workspaceId: string;
  panelId: string;
  title: string;
  description: string;
  engineType: EngineType;
  modelId: string | null;
  branchName: string;
  images: string[];
  autoStart: boolean;
};

type CreatePanelInput = {
  workspaceId: string;
  name: string;
};

export function useKanbanStore(workspaces?: WorkspaceInfo[]) {
  const [store, setStore] = useState<KanbanStoreData>(() => loadKanbanData());
  const [viewState, setViewState] = useState<KanbanViewState>({
    view: "projects",
  });

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveKanbanData(store);
    }, 300);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [store]);

  // Migrate: convert old UUID-based workspaceId to workspace path
  const migratedRef = useRef(false);
  useEffect(() => {
    if (!workspaces?.length || migratedRef.current) return;
    const idToPath = new Map(workspaces.map((w) => [w.id, w.path]));
    const result = migrateWorkspaceIds(store, idToPath);
    if (result.migrated) {
      migratedRef.current = true;
      setStore(result.data);
    } else {
      migratedRef.current = true;
    }
  }, [workspaces, store]);

  // --- Panel CRUD ---

  const createPanel = useCallback((input: CreatePanelInput): KanbanPanel => {
    const now = Date.now();
    const panel: KanbanPanel = {
      id: generatePanelId(),
      workspaceId: input.workspaceId,
      name: input.name,
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    };
    setStore((prev) => ({
      ...prev,
      panels: [...prev.panels, panel],
    }));
    return panel;
  }, []);

  const updatePanel = useCallback(
    (panelId: string, changes: Partial<KanbanPanel>) => {
      setStore((prev) => ({
        ...prev,
        panels: prev.panels.map((p) =>
          p.id === panelId ? { ...p, ...changes, updatedAt: Date.now() } : p
        ),
      }));
    },
    []
  );

  const deletePanel = useCallback((panelId: string) => {
    setStore((prev) => ({
      ...prev,
      panels: prev.panels.filter((p) => p.id !== panelId),
      tasks: prev.tasks.filter((t) => t.panelId !== panelId),
    }));
  }, []);

  // --- Task CRUD ---

  const createTask = useCallback((input: CreateTaskInput): KanbanTask => {
    const now = Date.now();
    const task: KanbanTask = {
      id: generateKanbanId(),
      workspaceId: input.workspaceId,
      panelId: input.panelId,
      title: input.title,
      description: input.description,
      status: input.autoStart ? "inprogress" : "todo",
      engineType: input.engineType,
      modelId: input.modelId,
      branchName: input.branchName,
      images: input.images,
      autoStart: input.autoStart,
      sortOrder: now,
      threadId: null,
      createdAt: now,
      updatedAt: now,
    };
    setStore((prev) => ({
      ...prev,
      tasks: [...prev.tasks, task],
    }));
    return task;
  }, []);

  const updateTask = useCallback(
    (taskId: string, changes: Partial<KanbanTask>) => {
      setStore((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId ? { ...t, ...changes, updatedAt: Date.now() } : t
        ),
      }));
    },
    []
  );

  const deleteTask = useCallback((taskId: string) => {
    setStore((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== taskId),
    }));
  }, []);

  const reorderTask = useCallback(
    (taskId: string, newStatus: KanbanTaskStatus, newSortOrder: number) => {
      setStore((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: newStatus,
                sortOrder: newSortOrder,
                updatedAt: Date.now(),
              }
            : t
        ),
      }));
    },
    []
  );

  return {
    panels: store.panels,
    tasks: store.tasks,
    kanbanViewState: viewState,
    setKanbanViewState: setViewState,
    createPanel,
    updatePanel,
    deletePanel,
    createTask,
    updateTask,
    deleteTask,
    reorderTask,
  };
}
