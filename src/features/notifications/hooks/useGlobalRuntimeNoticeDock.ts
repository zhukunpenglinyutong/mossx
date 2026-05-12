import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RuntimePoolRow, RuntimePoolSnapshot, WorkspaceInfo } from "../../../types";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";
import {
  getStartupTraceSnapshot,
  subscribeStartupTrace,
  type StartupTraceEvent,
  type StartupWorkspaceScope,
} from "../../startup-orchestration/utils/startupTrace";
import {
  clearGlobalRuntimeNotices,
  pushGlobalRuntimeNotice,
  subscribeGlobalRuntimeNotices,
  type GlobalRuntimeNotice,
  type GlobalRuntimeNoticeSeverity,
} from "../../../services/globalRuntimeNotices";
import { getRuntimePoolSnapshot } from "../../../services/tauri";

const GLOBAL_RUNTIME_NOTICE_DOCK_VISIBILITY_KEY = "globalRuntimeNoticeDock.visibility";
const GLOBAL_RUNTIME_NOTICE_STREAMING_WINDOW_MS = 8000;
const GLOBAL_RUNTIME_NOTICE_RUNTIME_POLL_MS = 5000;
const STARTUP_COMMAND_SUCCESS_DEDUPE_BUCKET_MS = 30000;
let lastMirroredStartupTraceSequence = 0;

export type GlobalRuntimeNoticeDockVisibility = "minimized" | "expanded";
export type GlobalRuntimeNoticeDockStatus = "idle" | "streaming" | "has-error";

type RuntimeSignalToken =
  | "startup-pending"
  | "resume-pending"
  | "ready"
  | "suspect-stale"
  | "cooldown"
  | "quarantined"
  | null;

type StartupNoticePayload = {
  severity: GlobalRuntimeNoticeSeverity;
  messageKey: string;
};

type WorkspaceLabelResolver = (workspaceId: string) => string;

function resolveWorkspaceLabel(
  row: Pick<RuntimePoolRow, "workspaceId" | "workspaceName" | "workspacePath">,
) {
  const trimmedName = row.workspaceName.trim();
  if (trimmedName.length > 0) {
    return trimmedName;
  }
  const trimmedPath = row.workspacePath.trim();
  const segments = trimmedPath
    .split(/[\\/]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? (trimmedPath || row.workspaceId.trim());
}

function resolveRuntimeEngineLabel(engine: string) {
  switch (engine.trim().toLowerCase()) {
    case "claude":
      return "Claude Code";
    case "gemini":
      return "Gemini";
    case "opencode":
      return "OpenCode";
    case "codex":
      return "Codex";
    default:
      return engine.trim() || "Runtime";
  }
}

function resolveRuntimeSignalToken(row: RuntimePoolRow): RuntimeSignalToken {
  if (row.foregroundWorkState === "startup-pending") {
    return "startup-pending";
  }
  if (row.foregroundWorkState === "resume-pending") {
    return "resume-pending";
  }
  if (row.startupState === "starting") {
    return "startup-pending";
  }
  if (
    row.startupState === "ready" ||
    row.startupState === "suspect-stale" ||
    row.startupState === "cooldown" ||
    row.startupState === "quarantined"
  ) {
    return row.startupState;
  }
  return null;
}

function shouldPushRuntimeSignal(
  previousToken: RuntimeSignalToken,
  nextToken: RuntimeSignalToken,
) {
  if (!nextToken) {
    return false;
  }
  if (!previousToken) {
    return true;
  }
  if (nextToken === "ready") {
    return previousToken !== "ready";
  }
  return previousToken !== nextToken;
}

function resolveRuntimeSignalPayload(
  token: Exclude<RuntimeSignalToken, null>,
): {
  severity: GlobalRuntimeNoticeSeverity;
  messageKey: string;
} {
  switch (token) {
    case "startup-pending":
      return {
        severity: "info",
        messageKey: "runtimeNotice.runtime.startupPending",
      };
    case "resume-pending":
      return {
        severity: "warning",
        messageKey: "runtimeNotice.runtime.resumePending",
      };
    case "ready":
      return {
        severity: "info",
        messageKey: "runtimeNotice.runtime.ready",
      };
    case "suspect-stale":
      return {
        severity: "warning",
        messageKey: "runtimeNotice.runtime.suspectStale",
      };
    case "cooldown":
      return {
        severity: "warning",
        messageKey: "runtimeNotice.runtime.cooldown",
      };
    case "quarantined":
      return {
        severity: "error",
        messageKey: "runtimeNotice.runtime.quarantined",
      };
  }
}

function resolveStartupWorkspaceLabel(
  workspaceScope: StartupWorkspaceScope,
  resolveWorkspaceLabelById: WorkspaceLabelResolver,
) {
  return typeof workspaceScope === "object"
    ? resolveWorkspaceLabelById(workspaceScope.workspaceId)
    : "global";
}

function resolveStartupTaskNoticePayload(
  lifecycleState: Extract<StartupTraceEvent, { type: "task" }>["lifecycleState"],
): StartupNoticePayload | null {
  switch (lifecycleState) {
    case "started":
      return {
        severity: "info",
        messageKey: "runtimeNotice.startup.taskStarted",
      };
    case "completed":
      return {
        severity: "info",
        messageKey: "runtimeNotice.startup.taskCompleted",
      };
    case "failed":
      return {
        severity: "error",
        messageKey: "runtimeNotice.startup.taskFailed",
      };
    case "timed-out":
      return {
        severity: "warning",
        messageKey: "runtimeNotice.startup.taskTimedOut",
      };
    case "degraded":
      return {
        severity: "warning",
        messageKey: "runtimeNotice.startup.taskDegraded",
      };
    case "cancelled":
      return {
        severity: "warning",
        messageKey: "runtimeNotice.startup.taskCancelled",
      };
    case "queued":
      return null;
  }
}

function resolveStartupCommandNoticePayload(
  status: Extract<StartupTraceEvent, { type: "command" }>["status"],
): StartupNoticePayload {
  return status === "failed"
    ? {
        severity: "error",
        messageKey: "runtimeNotice.startup.commandFailed",
      }
    : {
        severity: "info",
        messageKey: "runtimeNotice.startup.commandCompleted",
      };
}

function resolveStartupMilestoneNoticePayload(
  milestone: Extract<StartupTraceEvent, { type: "milestone" }>["milestone"],
): StartupNoticePayload {
  switch (milestone) {
    case "shell-ready":
      return {
        severity: "info",
        messageKey: "runtimeNotice.startup.shellReady",
      };
    case "input-ready":
      return {
        severity: "info",
        messageKey: "runtimeNotice.startup.inputReady",
      };
    case "active-workspace-ready":
      return {
        severity: "info",
        messageKey: "runtimeNotice.startup.activeWorkspaceReady",
      };
  }
}

function resolveStartupCommandDedupeKey(event: Extract<StartupTraceEvent, { type: "command" }>) {
  if (event.status === "completed") {
    const workspaceKey =
      typeof event.workspaceScope === "object" ? event.workspaceScope.workspaceId : "global";
    const bucket = Math.floor(Date.now() / STARTUP_COMMAND_SUCCESS_DEDUPE_BUCKET_MS);
    return `startup:command:${event.commandLabel}:completed:${workspaceKey}:${bucket}`;
  }
  return `startup:command:${event.commandLabel}:${event.status}:${event.sequence}`;
}

function pushStartupTraceRuntimeNotice(
  event: StartupTraceEvent,
  resolveWorkspaceLabelById: WorkspaceLabelResolver,
) {
  if (event.type === "task") {
    const noticePayload = resolveStartupTaskNoticePayload(event.lifecycleState);
    if (!noticePayload) {
      return;
    }
    pushGlobalRuntimeNotice({
      severity: noticePayload.severity,
      category: "diagnostic",
      messageKey: noticePayload.messageKey,
      messageParams: {
        phase: event.phase,
        task: event.traceLabel,
        workspace: resolveStartupWorkspaceLabel(event.workspaceScope, resolveWorkspaceLabelById),
        durationMs: event.durationMs === null ? null : Math.round(event.durationMs),
        reason: event.fallbackReason,
      },
      dedupeKey: `startup:task:${event.taskId}:${event.lifecycleState}:${event.sequence}`,
    });
    return;
  }

  if (event.type === "command") {
    const noticePayload = resolveStartupCommandNoticePayload(event.status);
    pushGlobalRuntimeNotice({
      severity: noticePayload.severity,
      category: "diagnostic",
      messageKey: noticePayload.messageKey,
      messageParams: {
        command: event.commandLabel,
        workspace: resolveStartupWorkspaceLabel(event.workspaceScope, resolveWorkspaceLabelById),
        durationMs: Math.round(event.durationMs),
      },
      dedupeKey: resolveStartupCommandDedupeKey(event),
      mergeStrategy: event.status === "completed" ? "buffer" : "last",
    });
    return;
  }

  const noticePayload = resolveStartupMilestoneNoticePayload(event.milestone);
  pushGlobalRuntimeNotice({
    severity: noticePayload.severity,
    category: "bootstrap",
    messageKey: noticePayload.messageKey,
    messageParams: {
      milestone: event.milestone,
    },
    dedupeKey: `startup:milestone:${event.milestone}:${event.sequence}`,
  });
}

function resetMirroredStartupTraceSequenceIfTraceWasReset(
  events: readonly StartupTraceEvent[],
) {
  const latestSequence = events[events.length - 1]?.sequence ?? 0;
  if (latestSequence < lastMirroredStartupTraceSequence) {
    lastMirroredStartupTraceSequence = 0;
  }
}

function reconcileRuntimeSnapshot(
  snapshot: RuntimePoolSnapshot,
  previousStateByWorkspace: Map<string, RuntimeSignalToken>,
) {
  const nextStateByWorkspace = new Map<string, RuntimeSignalToken>();

  for (const row of snapshot.rows) {
    const nextToken = resolveRuntimeSignalToken(row);
    const previousToken = previousStateByWorkspace.get(row.workspaceId) ?? null;
    if (nextToken) {
      nextStateByWorkspace.set(row.workspaceId, nextToken);
    }
    if (!shouldPushRuntimeSignal(previousToken, nextToken)) {
      continue;
    }
    if (!nextToken) {
      continue;
    }
    const signal = resolveRuntimeSignalPayload(nextToken);
    pushGlobalRuntimeNotice({
      severity: signal.severity,
      category: "runtime",
      messageKey: signal.messageKey,
      messageParams: {
        workspace: resolveWorkspaceLabel(row),
        engine: resolveRuntimeEngineLabel(row.engine),
      },
      dedupeKey: `runtime:${row.workspaceId}:${nextToken}`,
    });
  }

  return nextStateByWorkspace;
}

function areRuntimeRowsSignalEquivalent(
  previousRows: readonly RuntimePoolRow[],
  nextRows: readonly RuntimePoolRow[],
) {
  if (previousRows.length !== nextRows.length) {
    return false;
  }
  const previousRowByKey = new Map(
    previousRows.map((row) => [`${row.workspaceId}\u0000${row.engine}`, row]),
  );
  return nextRows.every((nextRow) => {
    const previousRow = previousRowByKey.get(`${nextRow.workspaceId}\u0000${nextRow.engine}`);
    return (
      previousRow !== undefined &&
      previousRow.workspaceName === nextRow.workspaceName &&
      previousRow.workspacePath === nextRow.workspacePath &&
      previousRow.state === nextRow.state &&
      previousRow.lifecycleState === nextRow.lifecycleState &&
      previousRow.foregroundWorkState === nextRow.foregroundWorkState &&
      previousRow.startupState === nextRow.startupState &&
      previousRow.reasonCode === nextRow.reasonCode &&
      previousRow.recoverySource === nextRow.recoverySource &&
      previousRow.retryable === nextRow.retryable &&
      previousRow.userAction === nextRow.userAction
    );
  });
}

export function sanitizeGlobalRuntimeNoticeDockVisibility(
  value: unknown,
): GlobalRuntimeNoticeDockVisibility {
  return value === "expanded" ? "expanded" : "minimized";
}

export function resolveGlobalRuntimeNoticeDockStatus(
  notices: readonly GlobalRuntimeNotice[],
  nowMs: number,
): GlobalRuntimeNoticeDockStatus {
  if (notices.some((notice) => notice.severity === "error")) {
    return "has-error";
  }
  const latestNotice = notices[notices.length - 1];
  if (!latestNotice) {
    return "idle";
  }
  return nowMs - latestNotice.timestampMs <= GLOBAL_RUNTIME_NOTICE_STREAMING_WINDOW_MS
    ? "streaming"
    : "idle";
}

export function useGlobalRuntimeNoticeDock(workspaces: readonly WorkspaceInfo[] = []) {
  const [notices, setNotices] = useState<GlobalRuntimeNotice[]>([]);
  const [runtimeRows, setRuntimeRows] = useState<RuntimePoolRow[]>([]);
  const [visibility, setVisibility] = useState<GlobalRuntimeNoticeDockVisibility>(() =>
    sanitizeGlobalRuntimeNoticeDockVisibility(
      getClientStoreSync("app", GLOBAL_RUNTIME_NOTICE_DOCK_VISIBILITY_KEY),
    ),
  );
  const [statusNowMs, setStatusNowMs] = useState(() => Date.now());
  const runtimeStateByWorkspaceRef = useRef(new Map<string, RuntimeSignalToken>());
  const workspaceLabelById = useMemo(() => {
    const labelById = new Map<string, string>();
    for (const workspace of workspaces) {
      labelById.set(workspace.id, workspace.name.trim() || workspace.id);
    }
    return labelById;
  }, [workspaces]);
  const workspaceLabelByIdRef = useRef(workspaceLabelById);

  useEffect(() => {
    workspaceLabelByIdRef.current = workspaceLabelById;
  }, [workspaceLabelById]);

  useEffect(() => {
    return subscribeGlobalRuntimeNotices((snapshot) => {
      setNotices([...snapshot]);
    });
  }, []);

  useEffect(() => {
    const mirrorStartupTrace = () => {
      const snapshot = getStartupTraceSnapshot();
      resetMirroredStartupTraceSequenceIfTraceWasReset(snapshot.events);
      for (const event of snapshot.events) {
        if (event.sequence <= lastMirroredStartupTraceSequence) {
          continue;
        }
        lastMirroredStartupTraceSequence = event.sequence;
        pushStartupTraceRuntimeNotice(
          event,
          (workspaceId) => workspaceLabelByIdRef.current.get(workspaceId) ?? workspaceId,
        );
      }
    };

    mirrorStartupTrace();
    return subscribeStartupTrace(mirrorStartupTrace);
  }, []);

  useEffect(() => {
    writeClientStoreValue("app", GLOBAL_RUNTIME_NOTICE_DOCK_VISIBILITY_KEY, visibility);
  }, [visibility]);

  useEffect(() => {
    const latestNotice = notices[notices.length - 1];
    if (!latestNotice || notices.some((notice) => notice.severity === "error")) {
      return;
    }
    const remainingMs =
      latestNotice.timestampMs + GLOBAL_RUNTIME_NOTICE_STREAMING_WINDOW_MS - Date.now();
    if (remainingMs <= 0) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setStatusNowMs(Date.now());
    }, remainingMs + 16);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notices]);

  useEffect(() => {
    let disposed = false;

    const loadRuntimeSnapshot = async () => {
      try {
        const snapshot = await getRuntimePoolSnapshot();
        if (disposed) {
          return;
        }
        setRuntimeRows((previousRows) =>
          areRuntimeRowsSignalEquivalent(previousRows, snapshot.rows)
            ? previousRows
            : snapshot.rows,
        );
        runtimeStateByWorkspaceRef.current = reconcileRuntimeSnapshot(
          snapshot,
          runtimeStateByWorkspaceRef.current,
        );
      } catch (error) {
        if (!disposed) {
          console.error("[runtimeNoticeDock] failed to load runtime snapshot", error);
        }
      }
    };

    void loadRuntimeSnapshot();
    const intervalId = window.setInterval(() => {
      void loadRuntimeSnapshot();
    }, GLOBAL_RUNTIME_NOTICE_RUNTIME_POLL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const status = useMemo(
    () => resolveGlobalRuntimeNoticeDockStatus(notices, statusNowMs),
    [notices, statusNowMs],
  );

  const expand = useCallback(() => {
    setVisibility("expanded");
  }, []);

  const minimize = useCallback(() => {
    setVisibility("minimized");
  }, []);

  const clear = useCallback(() => {
    clearGlobalRuntimeNotices();
  }, []);

  return {
    notices,
    visibility,
    status,
    runtimeRows,
    expand,
    minimize,
    clear,
  };
}
