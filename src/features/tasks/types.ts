import type { EngineType } from "../../types";

export type TaskRunStatus =
  | "queued"
  | "planning"
  | "running"
  | "waiting_input"
  | "blocked"
  | "failed"
  | "completed"
  | "canceled";

export type TaskRunTrigger =
  | "manual"
  | "scheduled"
  | "chained"
  | "retry"
  | "resume"
  | "forked";

export type TaskRunArtifact = {
  kind: "message" | "file" | "patch" | "command" | "summary" | "link";
  label: string;
  ref?: string | null;
  summary?: string | null;
};

export type TaskRunRecoveryAction =
  | "open_conversation"
  | "retry"
  | "resume"
  | "cancel"
  | "fork_new_run";

export type TaskRunDefinitionRef = {
  taskId: string;
  source: "kanban";
  workspaceId: string;
  title?: string | null;
};

export type TaskRunRecord = {
  runId: string;
  task: TaskRunDefinitionRef;
  engine: Extract<EngineType, "claude" | "codex" | "gemini">;
  status: TaskRunStatus;
  trigger: TaskRunTrigger;
  linkedThreadId?: string | null;
  parentRunId?: string | null;
  upstreamRunId?: string | null;
  planSnapshot?: string | null;
  currentStep?: string | null;
  latestOutputSummary?: string | null;
  blockedReason?: string | null;
  failureReason?: string | null;
  artifacts: TaskRunArtifact[];
  availableRecoveryActions: TaskRunRecoveryAction[];
  startedAt?: number | null;
  updatedAt: number;
  finishedAt?: number | null;
};

export type TaskRunStoreData = {
  version: 1;
  runs: TaskRunRecord[];
};

export type KanbanLatestRunSummary = {
  runId: string;
  status: TaskRunStatus;
  trigger: TaskRunTrigger;
  engine: Extract<EngineType, "claude" | "codex" | "gemini">;
  linkedThreadId?: string | null;
  latestOutputSummary?: string | null;
  blockedReason?: string | null;
  failureReason?: string | null;
  artifactCount: number;
  updatedAt: number;
  finishedAt?: number | null;
};

export type CreateTaskRunInput = {
  taskId: string;
  workspaceId: string;
  taskTitle?: string | null;
  engine: EngineType;
  trigger: TaskRunTrigger;
  linkedThreadId?: string | null;
  parentRunId?: string | null;
  upstreamRunId?: string | null;
  now?: number;
};

export type TaskRunPatch = Partial<
  Pick<
    TaskRunRecord,
    | "status"
    | "linkedThreadId"
    | "planSnapshot"
    | "currentStep"
    | "latestOutputSummary"
    | "blockedReason"
    | "failureReason"
    | "artifacts"
    | "availableRecoveryActions"
    | "startedAt"
    | "finishedAt"
  >
> & {
  now?: number;
};
