import type { EngineType } from "../../types";
import type { KanbanLatestRunSummary } from "../tasks/types";

export type KanbanTaskStatus =
  | "todo"
  | "inprogress"
  | "testing"
  | "done";

export type KanbanScheduleMode = "manual" | "once" | "recurring";

export type KanbanRecurringUnit = "minutes" | "hours" | "days" | "weeks";

export type KanbanRecurringExecutionMode = "same_thread" | "new_thread";

export type KanbanNewThreadResultMode = "pass" | "none";

export type KanbanTaskExecutionSource =
  | "manual"
  | "autoStart"
  | "drag"
  | "scheduled"
  | "chained";

export type KanbanTaskExecutionLock = {
  token: string;
  source: KanbanTaskExecutionSource;
  acquiredAt: number;
};

export type KanbanTaskExecutionState = {
  lastSource?: KanbanTaskExecutionSource | null;
  lock?: KanbanTaskExecutionLock | null;
  blockedReason?: string | null;
  startedAt?: number | null;
  finishedAt?: number | null;
};

export type KanbanTaskSchedule = {
  mode: KanbanScheduleMode;
  seriesId?: string | null;
  paused?: boolean;
  pausedRemainingMs?: number | null;
  runAt?: number | null;
  interval?: number | null;
  unit?: KanbanRecurringUnit | null;
  timezone?: string | null;
  nextRunAt?: number | null;
  lastTriggeredAt?: number | null;
  lastTriggerSource?: KanbanTaskExecutionSource | null;
  overdue?: boolean;
  recurringExecutionMode?: KanbanRecurringExecutionMode | null;
  newThreadResultMode?: KanbanNewThreadResultMode | null;
  maxRounds?: number | null;
  completedRounds?: number | null;
};

export type KanbanTaskChain = {
  groupId: string;
  previousTaskId: string | null;
  groupCode?: string | null;
  blockedReason?: string | null;
};

export type KanbanTaskResultSnapshot = {
  sourceThreadId: string;
  sourceMessageId?: string | null;
  summary: string;
  artifactPaths: string[];
  capturedAt: number;
};

export type KanbanColumnDef = {
  id: KanbanTaskStatus;
  labelKey: string;
  color: string;
};

export type KanbanPanel = {
  id: string;
  workspaceId: string;
  name: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type KanbanTask = {
  id: string;
  workspaceId: string;
  panelId: string;
  title: string;
  description: string;
  status: KanbanTaskStatus;
  engineType: EngineType;
  modelId: string | null;
  branchName: string;
  images: string[];
  autoStart: boolean;
  sortOrder: number;
  threadId: string | null;
  schedule?: KanbanTaskSchedule;
  chain?: KanbanTaskChain;
  lastResultSnapshot?: KanbanTaskResultSnapshot | null;
  latestRunSummary?: KanbanLatestRunSummary | null;
  execution?: KanbanTaskExecutionState;
  createdAt: number;
  updatedAt: number;
};

export type KanbanViewState =
  | { view: "projects" }
  | { view: "panels"; workspaceId: string }
  | { view: "board"; workspaceId: string; panelId: string };

export type KanbanStoreData = {
  panels: KanbanPanel[];
  tasks: KanbanTask[];
};
