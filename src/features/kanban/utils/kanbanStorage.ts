import type {
  KanbanPanel,
  KanbanStoreData,
  KanbanTask,
  KanbanTaskChain,
  KanbanTaskExecutionLock,
  KanbanTaskExecutionState,
  KanbanTaskResultSnapshot,
} from "../types";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";
import { normalizeTaskSchedule } from "./scheduling";
import { normalizeTaskRunStore } from "../../tasks/utils/taskRunStorage";
import type { KanbanLatestRunSummary } from "../../tasks/types";

const EMPTY_STORE: KanbanStoreData = { panels: [], tasks: [] };

function normalizeExecutionLock(raw: unknown): KanbanTaskExecutionLock | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const input = raw as Record<string, unknown>;
  const source = input.source;
  if (
    source !== "manual" &&
    source !== "autoStart" &&
    source !== "drag" &&
    source !== "scheduled" &&
    source !== "chained"
  ) {
    return null;
  }
  if (typeof input.token !== "string" || typeof input.acquiredAt !== "number") {
    return null;
  }
  return {
    token: input.token,
    source,
    acquiredAt: input.acquiredAt,
  };
}

function normalizeExecutionState(raw: unknown): KanbanTaskExecutionState | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const input = raw as Record<string, unknown>;
  const lastSource = input.lastSource;
  const normalizedLastSource =
    lastSource === "manual" ||
    lastSource === "autoStart" ||
    lastSource === "drag" ||
    lastSource === "scheduled" ||
    lastSource === "chained"
      ? lastSource
      : null;
  const blockedReason =
    typeof input.blockedReason === "string" ? input.blockedReason : null;
  const startedAt =
    typeof input.startedAt === "number" && Number.isFinite(input.startedAt)
      ? input.startedAt
      : null;
  const finishedAt =
    typeof input.finishedAt === "number" && Number.isFinite(input.finishedAt)
      ? input.finishedAt
      : null;
  return {
    lastSource: normalizedLastSource,
    lock: normalizeExecutionLock(input.lock),
    blockedReason,
    startedAt,
    finishedAt,
  };
}

function normalizeTaskChain(raw: unknown): KanbanTaskChain | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const input = raw as Record<string, unknown>;
  if (typeof input.groupId !== "string") {
    return undefined;
  }
  const previousTaskId =
    typeof input.previousTaskId === "string" ? input.previousTaskId : null;
  const groupCode =
    typeof input.groupCode === "string" && /^\d{3}$/.test(input.groupCode)
      ? input.groupCode
      : null;
  const blockedReason =
    typeof input.blockedReason === "string" ? input.blockedReason : null;
  return {
    groupId: input.groupId,
    previousTaskId,
    groupCode,
    blockedReason,
  };
}

function normalizeResultSnapshot(raw: unknown): KanbanTaskResultSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const input = raw as Record<string, unknown>;
  if (
    typeof input.sourceThreadId !== "string" ||
    typeof input.summary !== "string" ||
    typeof input.capturedAt !== "number"
  ) {
    return null;
  }
  return {
    sourceThreadId: input.sourceThreadId,
    sourceMessageId:
      typeof input.sourceMessageId === "string" ? input.sourceMessageId : null,
    summary: input.summary,
    capturedAt: input.capturedAt,
    artifactPaths: Array.isArray(input.artifactPaths)
      ? input.artifactPaths.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

function normalizeLatestRunSummary(raw: unknown): KanbanLatestRunSummary | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const input = raw as Record<string, unknown>;
  const artifactCount =
    typeof input.artifactCount === "number" && Number.isFinite(input.artifactCount)
      ? Math.max(0, Math.floor(input.artifactCount))
      : 0;
  const normalized = normalizeTaskRunStore({
    version: 1,
    runs: [
      {
        runId: input.runId,
        task: {
          taskId: "__summary__",
          workspaceId: "__summary__",
        },
        engine: input.engine,
        status: input.status,
        trigger: input.trigger,
        linkedThreadId: input.linkedThreadId,
        latestOutputSummary: input.latestOutputSummary,
        blockedReason: input.blockedReason,
        failureReason: input.failureReason,
        artifacts: Array.from({ length: artifactCount }, (_, index) => ({
          kind: "summary",
          label: `artifact-${index + 1}`,
        })),
        availableRecoveryActions: [],
        updatedAt: input.updatedAt,
        finishedAt: input.finishedAt,
      },
    ],
  });
  const run = normalized.runs[0];
  if (!run) {
    return null;
  }
  return {
    runId: run.runId,
    status: run.status,
    trigger: run.trigger,
    engine: run.engine,
    linkedThreadId: run.linkedThreadId ?? null,
    latestOutputSummary: run.latestOutputSummary ?? null,
    blockedReason: run.blockedReason ?? null,
    failureReason: run.failureReason ?? null,
    artifactCount: run.artifacts.length,
    updatedAt: run.updatedAt,
    finishedAt: run.finishedAt ?? null,
  };
}

function normalizeTask(task: Record<string, unknown>): KanbanTask {
  return {
    id: String(task.id ?? ""),
    workspaceId: String(task.workspaceId ?? ""),
    panelId: String(task.panelId ?? ""),
    title: typeof task.title === "string" ? task.title : "",
    description: typeof task.description === "string" ? task.description : "",
    status:
      task.status === "todo" ||
      task.status === "inprogress" ||
      task.status === "testing" ||
      task.status === "done"
        ? task.status
        : "todo",
    engineType:
      task.engineType === "claude" ||
      task.engineType === "codex" ||
      task.engineType === "gemini" ||
      task.engineType === "opencode"
        ? task.engineType
        : "claude",
    modelId: typeof task.modelId === "string" ? task.modelId : null,
    branchName: typeof task.branchName === "string" ? task.branchName : "main",
    images: Array.isArray(task.images)
      ? task.images.filter((entry): entry is string => typeof entry === "string")
      : [],
    autoStart: Boolean(task.autoStart),
    sortOrder: typeof task.sortOrder === "number" ? task.sortOrder : Date.now(),
    threadId: typeof task.threadId === "string" ? task.threadId : null,
    schedule: normalizeTaskSchedule(task.schedule),
    chain: normalizeTaskChain(task.chain),
    lastResultSnapshot: normalizeResultSnapshot(task.lastResultSnapshot),
    latestRunSummary: normalizeLatestRunSummary(task.latestRunSummary),
    execution: normalizeExecutionState(task.execution),
    createdAt: typeof task.createdAt === "number" ? task.createdAt : Date.now(),
    updatedAt: typeof task.updatedAt === "number" ? task.updatedAt : Date.now(),
  };
}

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

    const tasks = (stored.tasks as Array<Record<string, unknown>>).map((t) =>
      normalizeTask({
        ...t,
        panelId: (t.panelId as string) ?? `panel_migrated_${t.workspaceId as string}`,
      }),
    );

    const migrated: KanbanStoreData = {
      panels,
      tasks,
    };
    saveKanbanData(migrated);
    return migrated;
  }

  const normalizedTasks = (stored.tasks as Array<Record<string, unknown>>).map(normalizeTask);
  return {
    panels: stored.panels as KanbanPanel[],
    tasks: normalizedTasks,
  };
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
