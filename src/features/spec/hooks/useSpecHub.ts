import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";
import { subscribeAppServerEvents } from "../../../services/events";
import {
  engineSendMessage,
  engineSendMessageSync,
  getWorkspaceFiles,
  sendUserMessage,
  startThread,
} from "../../../services/tauri";
import {
  buildSpecActions,
  buildSpecGateState,
  buildSpecWorkspaceSnapshot,
  initializeOpenSpecWorkspace,
  loadSpecProjectInfo,
  loadSpecArtifacts,
  runSpecAction,
  saveSpecProjectInfo,
  updateSpecTaskChecklist,
} from "../../../lib/spec-core/runtime";
import { normalizeSpecRootInput } from "../../../lib/spec-core/pathUtils";
import type { EngineType } from "../../../types";
import type {
  SpecApplyExecutionPhase,
  SpecApplyExecutionState,
  SpecApplyExecutor,
  SpecArtifactEntry,
  SpecChangeSummary,
  SpecEnvironmentMode,
  SpecHubAction,
  SpecHubActionKey,
  SpecTaskChecklistItem,
  SpecProjectInfoInput,
  SpecTimelineEvent,
  SpecVerifyState,
  SpecWorkspaceSnapshot,
} from "../../../lib/spec-core/types";

type UseSpecHubOptions = {
  workspaceId: string | null;
  files: string[];
  directories: string[];
};

const EMPTY_SNAPSHOT: SpecWorkspaceSnapshot = {
  provider: "unknown",
  supportLevel: "none",
  environment: {
    mode: "byo",
    status: "degraded",
    checks: [],
    blockers: ["No workspace selected."],
    hints: ["Select a workspace first."],
  },
  changes: [],
  blockers: ["No workspace selected."],
};

const EMPTY_ARTIFACTS: Record<SpecArtifactEntry["type"], SpecArtifactEntry> = {
  proposal: { type: "proposal", path: null, exists: false, content: "" },
  design: { type: "design", path: null, exists: false, content: "" },
  specs: { type: "specs", path: null, exists: false, content: "", sources: [] },
  tasks: { type: "tasks", path: null, exists: false, content: "" },
  verification: { type: "verification", path: null, exists: false, content: "" },
};

const TIMELINE_EVENT_LIMIT = 80;

function modeStoreKey(workspaceId: string | null) {
  return workspaceId ? `specHub.mode.${workspaceId}` : null;
}

function specRootStoreKey(workspaceId: string | null) {
  return workspaceId ? `specHub.specRoot.${workspaceId}` : null;
}

function providerScopeKey(workspaceId: string | null, provider: SpecWorkspaceSnapshot["provider"]) {
  return workspaceId ? `${workspaceId}:${provider}` : null;
}

function verifyStoreKey(
  workspaceId: string | null,
  provider: SpecWorkspaceSnapshot["provider"],
  changeId: string | null,
) {
  const scope = providerScopeKey(workspaceId, provider);
  return scope && changeId ? `specHub.verify.${scope}.${changeId}` : null;
}

function parsePersistedVerifyState(value: unknown): SpecVerifyState {
  if (!value || typeof value !== "object") {
    return { ran: false, success: false };
  }
  const success = (value as { success?: unknown }).success;
  if (typeof success !== "boolean") {
    return { ran: false, success: false };
  }
  return {
    ran: true,
    success,
  };
}

type RefreshOptions = {
  silent?: boolean;
  force?: boolean;
  rescanWorkspaceFiles?: boolean;
  customSpecRootOverride?: string | null;
};

type ExecuteActionOptions = {
  applyMode?: "guidance" | "execute";
  applyExecutor?: SpecApplyExecutor;
  applyContinueBrief?: SpecContinueExecutionBrief | null;
  applyUseContinueBrief?: boolean;
  ignoreAvailability?: boolean;
};

type ParsedApplyExecutionResult = {
  summary: string;
  changedFiles: string[];
  tests: string[];
  checks: string[];
  completedTaskIndices: number[];
  reportedTaskIndices: number[];
  unmappedTaskIndices: number[];
  reportedTaskRefs: string[];
  unmappedTaskRefs: string[];
  noChanges: boolean;
  nextSteps: string[];
  rawOutput: string;
};

export type SpecContinueExecutionBrief = {
  summary: string;
  recommendedNextAction: string | null;
  suggestedScope: string[];
  risks: string[];
  verificationPlan: string[];
  executionSequence: string[];
  generatedAt: number | null;
};

const APPLY_EXECUTORS = ["codex", "claude", "opencode"] as const;

const EMPTY_APPLY_EXECUTION: SpecApplyExecutionState = {
  status: "idle",
  phase: "idle",
  executor: null,
  startedAt: null,
  finishedAt: null,
  instructionsOutput: "",
  executionOutput: "",
  summary: "",
  changedFiles: [],
  tests: [],
  checks: [],
  completedTaskIndices: [],
  noChanges: false,
  error: null,
  logs: [],
};

function isApplyExecutor(value: unknown): value is SpecApplyExecutor {
  return typeof value === "string" && (APPLY_EXECUTORS as readonly string[]).includes(value);
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const direct = raw.trim();
  if (!direct) {
    return null;
  }
  try {
    const parsed = JSON.parse(direct);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore and try fenced / inline json extraction
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore and continue
    }
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = raw.slice(firstBrace, lastBrace + 1).trim();
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function readUnknownArrayField(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function parseTaskReferenceFromText(text: string) {
  const match = text.match(/^(\d+(?:\.\d+)+)\b/);
  return match?.[1]?.trim() ?? null;
}

function mapTaskRefsToIndices(refs: string[], checklist: SpecTaskChecklistItem[]) {
  if (refs.length === 0 || checklist.length === 0) {
    return [];
  }
  const refToIndex = new Map<string, number>();
  for (const item of checklist) {
    const ref = parseTaskReferenceFromText(item.text);
    if (ref) {
      refToIndex.set(ref, item.index);
    }
  }
  const indices: number[] = [];
  for (const ref of refs) {
    const normalized = ref.trim();
    if (!normalized) {
      continue;
    }
    const mapped = refToIndex.get(normalized);
    if (mapped !== undefined) {
      indices.push(mapped);
    }
  }
  return indices;
}

function parseIntegerIndices(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  const indices: number[] = [];
  for (const entry of value) {
    if (typeof entry === "number" && Number.isInteger(entry) && entry >= 0) {
      indices.push(entry);
      continue;
    }
    if (typeof entry === "string" && /^\d+$/.test(entry.trim())) {
      indices.push(Number(entry.trim()));
    }
  }
  return indices;
}

function mapReportedTaskIndicesToChecklist(
  reportedIndices: number[],
  checklist: SpecTaskChecklistItem[],
) {
  const checklistIndexSet = new Set(checklist.map((item) => item.index));
  const checklistByLine = new Map<number, number>();
  for (const item of checklist) {
    if (!checklistByLine.has(item.lineNumber)) {
      checklistByLine.set(item.lineNumber, item.index);
    }
  }

  const mappedIndices: number[] = [];
  const unmappedIndices: number[] = [];
  for (const reported of reportedIndices) {
    if (checklistIndexSet.has(reported)) {
      mappedIndices.push(reported);
      continue;
    }

    const byLine = checklistByLine.get(reported);
    if (byLine !== undefined) {
      mappedIndices.push(byLine);
      continue;
    }

    const oneBasedCandidate = reported - 1;
    if (reported > 0 && checklistIndexSet.has(oneBasedCandidate)) {
      mappedIndices.push(oneBasedCandidate);
      continue;
    }

    unmappedIndices.push(reported);
  }

  return {
    mappedIndices,
    unmappedIndices,
  };
}

function parseApplyExecutionResult(rawOutput: string, checklist: SpecTaskChecklistItem[]) {
  const payload = extractJsonObject(rawOutput);
  if (!payload) {
    return {
      summary: rawOutput.trim().split(/\r?\n/).find((line) => line.trim()) ?? "",
      changedFiles: [],
      tests: [],
      checks: [],
      completedTaskIndices: [],
      reportedTaskIndices: [],
      unmappedTaskIndices: [],
      reportedTaskRefs: [],
      unmappedTaskRefs: [],
      noChanges: /no\s+changes?/i.test(rawOutput),
      nextSteps: [],
      rawOutput,
    } satisfies ParsedApplyExecutionResult;
  }

  const changedFiles = toStringArray(
    readUnknownArrayField(payload, ["changed_files", "changedFiles", "modified_files", "files"]),
  );

  const explicitIndices = parseIntegerIndices(
    readUnknownArrayField(payload, [
      "completed_task_indices",
      "completedTaskIndices",
      "completed_tasks",
    ]),
  );
  const normalizedIndices = mapReportedTaskIndicesToChecklist(explicitIndices, checklist);

  const explicitRefs = toStringArray(
    readUnknownArrayField(payload, ["completed_task_refs", "completedTaskRefs"]),
  );
  const completedFromRefs = mapTaskRefsToIndices(explicitRefs, checklist);
  const knownTaskRefs = new Set(
    checklist
      .map((item) => parseTaskReferenceFromText(item.text))
      .filter((value): value is string => Boolean(value)),
  );
  const unmappedTaskRefs = explicitRefs.filter((ref) => !knownTaskRefs.has(ref.trim()));

  const summary =
    typeof payload.summary === "string"
      ? payload.summary.trim()
      : typeof payload.result === "string"
        ? payload.result.trim()
        : typeof payload.message === "string"
          ? payload.message.trim()
          : "";

  const nextSteps = toStringArray(readUnknownArrayField(payload, ["next_steps", "nextSteps", "hints"]));
  const tests = toStringArray(
    readUnknownArrayField(payload, ["tests", "test_results", "testResults"]),
  );
  const checks = toStringArray(
    readUnknownArrayField(payload, ["checks", "check_results", "checkResults"]),
  );

  const normalizedMergedIndices = [...normalizedIndices.mappedIndices, ...completedFromRefs]
    .filter((index) => index >= 0)
    .filter((index, idx, source) => source.indexOf(index) === idx)
    .sort((a, b) => a - b);

  const noChanges =
    typeof payload.no_changes === "boolean"
      ? payload.no_changes
      : typeof payload.noChange === "boolean"
        ? payload.noChange
        : changedFiles.length === 0 && /no\s+changes?/i.test(rawOutput);

  return {
    summary,
    changedFiles,
    tests,
    checks,
    completedTaskIndices: normalizedMergedIndices,
    reportedTaskIndices: explicitIndices,
    unmappedTaskIndices: normalizedIndices.unmappedIndices,
    reportedTaskRefs: explicitRefs,
    unmappedTaskRefs,
    noChanges,
    nextSteps,
    rawOutput,
  } satisfies ParsedApplyExecutionResult;
}

function buildApplyExecutionPrompt(input: {
  changeId: string;
  instructions: string;
  checklist: SpecTaskChecklistItem[];
  continueBrief?: SpecContinueExecutionBrief | null;
}) {
  const allowedTaskIndices = input.checklist.map((item) => item.index);
  const allowedTaskRefs = Array.from(
    new Set(
      input.checklist
        .map((item) => parseTaskReferenceFromText(item.text))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const checklistPreview =
    input.checklist.length > 0
      ? input.checklist
          .map((item) => `- [${item.checked ? "x" : " "}] #${item.index}: ${item.text}`)
          .join("\n")
      : "- (no checklist detected)";
  const continueBriefSummary = input.continueBrief?.summary?.trim() || "";
  const continueBriefRecommended = input.continueBrief?.recommendedNextAction?.trim() || "";
  const continueBriefScope = input.continueBrief?.suggestedScope ?? [];
  const continueBriefRisks = input.continueBrief?.risks ?? [];
  const continueBriefVerificationPlan = input.continueBrief?.verificationPlan ?? [];
  const continueBriefSequence = input.continueBrief?.executionSequence ?? [];
  const continueBriefLines = input.continueBrief
    ? [
        `- summary: ${continueBriefSummary || "(empty)"}`,
        `- recommended_next_action: ${continueBriefRecommended || "(none)"}`,
        `- suggested_scope: ${continueBriefScope.length > 0 ? continueBriefScope.join(" | ") : "(none)"}`,
        `- risks: ${continueBriefRisks.length > 0 ? continueBriefRisks.join(" | ") : "(none)"}`,
        `- verification_plan: ${
          continueBriefVerificationPlan.length > 0 ? continueBriefVerificationPlan.join(" | ") : "(none)"
        }`,
        `- execution_sequence: ${
          continueBriefSequence.length > 0 ? continueBriefSequence.join(" -> ") : "(none)"
        }`,
      ].join("\n")
    : "- not provided";

  return [
    "You are executing an OpenSpec apply workflow in the current workspace.",
    `Target change: ${input.changeId}`,
    "Use full-access coding operations to implement pending tasks and run the minimum validation needed.",
    "CRITICAL: if specs delta is missing, you MUST create the missing specs/**/*.md first before any task-only polish.",
    "Prioritize required tasks (p0/p1) before p2 tasks.",
    "",
    "OpenSpec apply instructions:",
    input.instructions || "(empty)",
    "",
    "Latest Continue AI brief (read-only planning context):",
    continueBriefLines,
    "",
    "Current tasks checklist (index + text):",
    checklistPreview,
    "",
    "Completed-task output rules (strict):",
    `- completed_task_indices must be a subset of: [${allowedTaskIndices.join(", ")}]`,
    `- completed_task_refs must be a subset of: [${allowedTaskRefs.join(", ")}]`,
    "- Never invent task ids from other changes (for example: 10.1 when not listed).",
    "",
    "Return JSON only. No markdown fence. Schema:",
    "{",
    '  "summary": "one-line execution summary",',
    '  "changed_files": ["relative/path.ts"],',
    '  "completed_task_indices": [0, 1],',
    '  "completed_task_refs": ["4.1"],',
    '  "no_changes": false,',
    '  "next_steps": ["run verify"]',
    "}",
  ].join("\n");
}

function extractThreadIdFromRpc(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const result = (record.result as Record<string, unknown> | undefined) ?? undefined;
  const thread =
    (result?.thread as Record<string, unknown> | undefined) ??
    (record.thread as Record<string, unknown> | undefined);
  const turn =
    (result?.turn as Record<string, unknown> | undefined) ??
    (record.turn as Record<string, unknown> | undefined);
  const candidates = [
    result?.threadId,
    result?.thread_id,
    thread?.id,
    result?.turnId,
    result?.turn_id,
    turn?.id,
    record.threadId,
    record.thread_id,
    record.turnId,
    record.turn_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function extractResultTextFromTurnCompleted(params: Record<string, unknown>) {
  const result =
    (params.result as Record<string, unknown> | undefined) ??
    undefined;
  const candidates = [
    typeof params.text === "string" ? params.text : "",
    typeof result?.text === "string" ? String(result.text) : "",
    typeof result?.output_text === "string" ? String(result.output_text) : "",
    typeof result?.outputText === "string" ? String(result.outputText) : "",
    typeof result?.content === "string" ? String(result.content) : "",
  ];
  return candidates.map((entry) => entry.trim()).find((entry) => entry.length > 0) ?? "";
}

export function useSpecHub({ workspaceId, files, directories }: UseSpecHubOptions) {
  const [snapshot, setSnapshot] = useState<SpecWorkspaceSnapshot>(EMPTY_SNAPSHOT);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Record<SpecArtifactEntry["type"], SpecArtifactEntry>>(
    EMPTY_ARTIFACTS,
  );
  const [timeline, setTimeline] = useState<SpecTimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunningAction, setIsRunningAction] = useState<SpecHubActionKey | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [isSavingProjectInfo, setIsSavingProjectInfo] = useState(false);
  const [projectInfoError, setProjectInfoError] = useState<string | null>(null);
  const [isUpdatingTaskIndex, setIsUpdatingTaskIndex] = useState<number | null>(null);
  const [taskUpdateError, setTaskUpdateError] = useState<string | null>(null);
  const [environmentMode, setEnvironmentMode] = useState<SpecEnvironmentMode>("managed");
  const [customSpecRoot, setCustomSpecRootState] = useState<string | null>(null);
  const [persistedVerifyState, setPersistedVerifyState] = useState<SpecVerifyState>({
    ran: false,
    success: false,
  });
  const [applyExecution, setApplyExecution] = useState<SpecApplyExecutionState>(
    EMPTY_APPLY_EXECUTION,
  );
  const latestFsRef = useRef({ files, directories });
  const lastAutoRefreshAtRef = useRef(0);
  const refreshSequenceRef = useRef(0);
  const artifactLoadSequenceRef = useRef(0);
  const initialLoadedRef = useRef(false);
  const skipNextSignatureRefreshRef = useRef(false);
  const previousProviderScopeRef = useRef<string | null>(null);
  const skipScopePersistenceRef = useRef(false);
  const selectedChangeIdByScopeRef = useRef<Record<string, string | null>>({});
  const timelineByScopeRef = useRef<Record<string, SpecTimelineEvent[]>>({});
  const applyExecutionByScopeRef = useRef<Record<string, SpecApplyExecutionState>>({});

  useEffect(() => {
    latestFsRef.current = { files, directories };
  }, [files, directories]);

  useEffect(() => {
    const key = modeStoreKey(workspaceId);
    if (!key) {
      setEnvironmentMode("managed");
      return;
    }
    const value = getClientStoreSync<SpecEnvironmentMode>("app", key);
    setEnvironmentMode(value === "byo" ? "byo" : "managed");
  }, [workspaceId]);

  useEffect(() => {
    const key = specRootStoreKey(workspaceId);
    if (!key) {
      setCustomSpecRootState(null);
      return;
    }
    const value = getClientStoreSync<string | null>("app", key);
    const normalized = normalizeSpecRootInput(value);
    setCustomSpecRootState(normalized);
  }, [workspaceId]);

  const selectedChange = useMemo<SpecChangeSummary | null>(
    () => snapshot.changes.find((entry) => entry.id === selectedChangeId) ?? null,
    [selectedChangeId, snapshot.changes],
  );

  const currentProviderScope = useMemo(
    () => providerScopeKey(workspaceId, snapshot.provider),
    [snapshot.provider, workspaceId],
  );

  useEffect(() => {
    const nextScope = currentProviderScope;
    const prevScope = previousProviderScopeRef.current;
    if (nextScope === prevScope) {
      return;
    }

    if (prevScope) {
      selectedChangeIdByScopeRef.current[prevScope] = selectedChangeId;
      timelineByScopeRef.current[prevScope] = timeline;
      applyExecutionByScopeRef.current[prevScope] = applyExecution;
    }

    previousProviderScopeRef.current = nextScope;
    skipScopePersistenceRef.current = true;

    if (!nextScope) {
      setSelectedChangeId(null);
      setTimeline([]);
      setApplyExecution(EMPTY_APPLY_EXECUTION);
      return;
    }

    setSelectedChangeId(selectedChangeIdByScopeRef.current[nextScope] ?? null);
    setTimeline(timelineByScopeRef.current[nextScope] ?? []);
    setApplyExecution(applyExecutionByScopeRef.current[nextScope] ?? EMPTY_APPLY_EXECUTION);
  }, [applyExecution, currentProviderScope, selectedChangeId, timeline]);

  useEffect(() => {
    if (skipScopePersistenceRef.current) {
      skipScopePersistenceRef.current = false;
      return;
    }
    if (!currentProviderScope) {
      return;
    }
    selectedChangeIdByScopeRef.current[currentProviderScope] = selectedChangeId;
    timelineByScopeRef.current[currentProviderScope] = timeline;
    applyExecutionByScopeRef.current[currentProviderScope] = applyExecution;
  }, [applyExecution, currentProviderScope, selectedChangeId, timeline]);

  useEffect(() => {
    const key = verifyStoreKey(workspaceId, snapshot.provider, selectedChange?.id ?? null);
    if (!key) {
      setPersistedVerifyState({ ran: false, success: false });
      return;
    }
    const value = getClientStoreSync<unknown>("app", key);
    setPersistedVerifyState(parsePersistedVerifyState(value));
  }, [selectedChange?.id, snapshot.provider, workspaceId]);

  useEffect(() => {
    const scope = currentProviderScope;
    if (!scope) {
      setApplyExecution(EMPTY_APPLY_EXECUTION);
      return;
    }
    const scoped = applyExecutionByScopeRef.current[scope];
    setApplyExecution(scoped ?? EMPTY_APPLY_EXECUTION);
  }, [currentProviderScope, selectedChange?.id, workspaceId]);

  const lastVerifyEvent = useMemo(
    () =>
      selectedChange
        ? (timeline.find(
            (entry) => entry.kind === "validate" && entry.command.includes(selectedChange.id),
          ) ?? null)
        : null,
    [selectedChange, timeline],
  );

  const verifyState = useMemo<SpecVerifyState>(
    () =>
      lastVerifyEvent
        ? {
            ran: true,
            success: lastVerifyEvent.success,
          }
        : persistedVerifyState,
    [lastVerifyEvent, persistedVerifyState],
  );

  const actions = useMemo<SpecHubAction[]>(
    () =>
      selectedChange
        ? buildSpecActions({
            change: selectedChange,
            supportLevel: snapshot.supportLevel,
            provider: snapshot.provider,
            environment: snapshot.environment,
            verifyState,
            taskProgress: artifacts.tasks.taskProgress,
          })
        : [],
    [
      artifacts.tasks.taskProgress,
      selectedChange,
      snapshot.environment,
      snapshot.provider,
      snapshot.supportLevel,
      verifyState,
    ],
  );

  const gate = useMemo(
    () =>
      buildSpecGateState({
        snapshot,
        selectedChange,
        lastVerifyEvent,
        verifyState,
        artifacts,
      }),
    [artifacts, lastVerifyEvent, selectedChange, snapshot, verifyState],
  );

  const validationIssues = useMemo(
    () => lastVerifyEvent?.validationIssues ?? [],
    [lastVerifyEvent],
  );

  const loadArtifactsForChange = useCallback(
    async (change: SpecChangeSummary | null) => {
      const sequence = artifactLoadSequenceRef.current + 1;
      artifactLoadSequenceRef.current = sequence;
      if (!workspaceId || !change) {
        if (sequence === artifactLoadSequenceRef.current) {
          setArtifacts(EMPTY_ARTIFACTS);
        }
        return;
      }
      const next = await loadSpecArtifacts({ workspaceId, change, customSpecRoot });
      if (sequence !== artifactLoadSequenceRef.current) {
        return;
      }
      setArtifacts(next);
    },
    [customSpecRoot, workspaceId],
  );

  const refresh = useCallback(async (options: RefreshOptions = {}) => {
    if (!workspaceId) {
      setSnapshot(EMPTY_SNAPSHOT);
      setSelectedChangeId(null);
      setArtifacts(EMPTY_ARTIFACTS);
      return;
    }
    const silent = options.silent ?? false;
    if (silent && !options.force) {
      const now = Date.now();
      if (now - lastAutoRefreshAtRef.current < 900) {
        return;
      }
      lastAutoRefreshAtRef.current = now;
    }

    const sequence = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = sequence;

    if (!silent) {
      setIsLoading(true);
    }

    try {
      if (options.rescanWorkspaceFiles) {
        try {
          const fsSnapshot = await getWorkspaceFiles(workspaceId);
          latestFsRef.current = {
            files: fsSnapshot.files,
            directories: fsSnapshot.directories,
          };
        } catch {
          // keep latest known file snapshot as fallback
        }
      }
      const latest = latestFsRef.current;
      const effectiveCustomSpecRoot =
        options.customSpecRootOverride !== undefined
          ? options.customSpecRootOverride
          : customSpecRoot;
      const nextSnapshot = await buildSpecWorkspaceSnapshot({
        workspaceId,
        files: latest.files,
        directories: latest.directories,
        mode: environmentMode,
        customSpecRoot: effectiveCustomSpecRoot,
      });
      if (sequence !== refreshSequenceRef.current) {
        return;
      }
      setSnapshot(nextSnapshot);

      const nextSelected =
        selectedChangeId && nextSnapshot.changes.some((entry) => entry.id === selectedChangeId)
          ? selectedChangeId
          : nextSnapshot.changes[0]?.id ?? null;

      setSelectedChangeId(nextSelected);
      const nextScope = providerScopeKey(workspaceId, nextSnapshot.provider);
      if (nextScope) {
        selectedChangeIdByScopeRef.current[nextScope] = nextSelected;
      }
      const change = nextSnapshot.changes.find((entry) => entry.id === nextSelected) ?? null;
      await loadArtifactsForChange(change);
      if (sequence !== refreshSequenceRef.current) {
        return;
      }
    } finally {
      if (!silent && sequence === refreshSequenceRef.current) {
        setIsLoading(false);
      }
    }
  }, [customSpecRoot, environmentMode, loadArtifactsForChange, selectedChangeId, workspaceId]);

  const snapshotSignature = useMemo(() => {
    const fileSignature = [...new Set(files.filter(Boolean))].sort().join("|");
    const dirSignature = [...new Set(directories.filter(Boolean))].sort().join("|");
    return `${workspaceId ?? "none"}::${environmentMode}::${customSpecRoot ?? "default"}::${fileSignature}::${dirSignature}`;
  }, [customSpecRoot, directories, environmentMode, files, workspaceId]);

  useEffect(() => {
    if (skipNextSignatureRefreshRef.current) {
      skipNextSignatureRefreshRef.current = false;
      return;
    }
    const first = !initialLoadedRef.current;
    const timer = window.setTimeout(() => {
      void refresh({ silent: !first, force: first }).finally(() => {
        initialLoadedRef.current = true;
      });
    }, first ? 0 : 420);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refresh, snapshotSignature]);

  const selectChange = useCallback(
    async (changeId: string) => {
      setSelectedChangeId(changeId);
      if (currentProviderScope) {
        selectedChangeIdByScopeRef.current[currentProviderScope] = changeId;
      }
      const change = snapshot.changes.find((entry) => entry.id === changeId) ?? null;
      await loadArtifactsForChange(change);
    },
    [currentProviderScope, loadArtifactsForChange, snapshot.changes],
  );

  const switchMode = useCallback(
    (nextMode: SpecEnvironmentMode) => {
      setEnvironmentMode(nextMode);
      const key = modeStoreKey(workspaceId);
      if (key) {
        writeClientStoreValue("app", key, nextMode);
      }
    },
    [workspaceId],
  );

  const executeAction = useCallback(
    async (actionKey: SpecHubActionKey, options: ExecuteActionOptions = {}) => {
      if (!workspaceId || !selectedChange) {
        return null;
      }
      const action = actions.find((entry) => entry.key === actionKey);
      const shouldIgnoreAvailability = options.ignoreAvailability === true;
      if (!action || (!action.available && !shouldIgnoreAvailability)) {
        return null;
      }
      if (action.kind === "native" && snapshot.provider !== "openspec") {
        setActionError(`Provider mismatch: native action requires openspec, got ${snapshot.provider}`);
        return null;
      }
      const isApply = actionKey === "apply";
      const applyMode = options.applyMode ?? "execute";
      const selectedExecutor = isApplyExecutor(options.applyExecutor)
        ? options.applyExecutor
        : "codex";
      const continueBrief =
        options.applyUseContinueBrief === false ? null : options.applyContinueBrief ?? null;
      const appendApplyLog = (phase: SpecApplyExecutionPhase, message: string) => {
        setApplyExecution((prev) => ({
          ...prev,
          logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] [${phase}] ${message}`],
        }));
      };

      setActionError(null);
      setIsRunningAction(actionKey);
      if (isApply) {
        setApplyExecution({
          ...EMPTY_APPLY_EXECUTION,
          status: "running",
          phase: "preflight",
          executor: selectedExecutor,
          startedAt: Date.now(),
          logs: [
            `[${new Date().toLocaleTimeString()}] [preflight] apply ${applyMode} started with ${selectedExecutor}`,
          ],
        });
      }

      try {
        const event = await runSpecAction({
          workspaceId,
          changeId: selectedChange.id,
          action: actionKey,
          provider: snapshot.provider,
          customSpecRoot,
        });

        const linkedEvents: SpecTimelineEvent[] = event.gitRefs.map((ref) => ({
          id: `${event.id}-${ref}`,
          at: event.at,
          kind: "git-link",
          action: actionKey,
          command: `git show ${ref}`,
          success: true,
          output: `Detected related git ref: ${ref}`,
          validationIssues: [],
          gitRefs: [ref],
        }));

        if (actionKey === "verify") {
          const key = verifyStoreKey(workspaceId, snapshot.provider, selectedChange.id);
          if (key) {
            writeClientStoreValue("app", key, {
              success: event.success,
              at: event.at,
            });
          }
          setPersistedVerifyState({ ran: true, success: event.success });
        }

        setTimeline((prev) => [event, ...linkedEvents, ...prev].slice(0, TIMELINE_EVENT_LIMIT));

        if (!isApply) {
          await refresh();
          return event;
        }

        setApplyExecution((prev) => ({
          ...prev,
          phase: "instructions",
          instructionsOutput: event.output,
        }));
        appendApplyLog("instructions", "OpenSpec instructions captured.");

        if (applyMode === "guidance") {
          await refresh();
          setApplyExecution((prev) => ({
            ...prev,
            status: event.success ? "success" : "failed",
            phase: "finalize",
            finishedAt: Date.now(),
            summary: event.success ? "Guidance generated successfully." : "",
            noChanges: true,
            error: event.success ? null : event.output || "Failed to generate guidance.",
          }));
          return event;
        }

        if (!event.success) {
          throw new Error(event.output || "Failed to generate apply instructions.");
        }

        const checklistSnapshot = artifacts.tasks.taskChecklist ?? [];
        const prompt = buildApplyExecutionPrompt({
          changeId: selectedChange.id,
          instructions: event.output,
          checklist: checklistSnapshot,
          continueBrief,
        });
        if (continueBrief) {
          appendApplyLog("instructions", "Continue brief attached to apply execution prompt.");
        }

        setApplyExecution((prev) => ({
          ...prev,
          phase: "execution",
          executionOutput: "",
        }));
        appendApplyLog("execution", `Dispatching execution to ${selectedExecutor}.`);
        const waitForTurnResult = (initialThreadId: string) =>
          new Promise<string>((resolve, reject) => {
            const trackedThreadIds = new Set<string>([initialThreadId]);
            let streamBuffer = "";
            let heartbeatCount = 0;
            let finished = false;
            let unlisten = () => {};

            const timeoutId = window.setTimeout(() => {
              if (finished) {
                return;
              }
              finished = true;
              unlisten();
              reject(new Error("Timed out waiting for apply execution."));
            }, 15 * 60 * 1000);

            const finish = (handler: () => void) => {
              if (finished) {
                return;
              }
              finished = true;
              window.clearTimeout(timeoutId);
              unlisten();
              handler();
            };

            unlisten = subscribeAppServerEvents((payload) => {
              if (payload.workspace_id !== workspaceId) {
                return;
              }
              const message = payload.message as Record<string, unknown>;
              const method = String(message.method ?? "");
              const params = (message.params as Record<string, unknown> | undefined) ?? {};
              const turn = params.turn as Record<string, unknown> | undefined;
              const threadId = String(
                params.threadId ?? params.thread_id ?? turn?.threadId ?? turn?.thread_id ?? "",
              );

              if (method === "thread/started" && threadId && trackedThreadIds.has(threadId)) {
                const sessionId = String(params.sessionId ?? params.session_id ?? "");
                const rawEngine = String(params.engine ?? "").toLowerCase();
                if (
                  sessionId &&
                  sessionId !== "pending" &&
                  (rawEngine === "claude" || rawEngine === "opencode")
                ) {
                  const promotedThreadId = `${rawEngine}:${sessionId}`;
                  if (!trackedThreadIds.has(promotedThreadId)) {
                    trackedThreadIds.add(promotedThreadId);
                    appendApplyLog("execution", `Bound promoted thread ${promotedThreadId}.`);
                  }
                }
                return;
              }

              if (!threadId || !trackedThreadIds.has(threadId)) {
                return;
              }

              if (method === "item/agentMessage/delta") {
                const delta = String(params.delta ?? "");
                if (!delta) {
                  return;
                }
                streamBuffer += delta;
                setApplyExecution((prev) => ({
                  ...prev,
                  executionOutput: `${prev.executionOutput}${delta}`,
                }));
                return;
              }

              if (method === "item/started") {
                const item = (params.item as Record<string, unknown> | undefined) ?? {};
                const toolName = String(item.tool ?? item.id ?? "").trim();
                if (toolName) {
                  appendApplyLog("execution", `Tool started: ${toolName}`);
                }
                return;
              }

              if (method === "item/completed") {
                const item = (params.item as Record<string, unknown> | undefined) ?? {};
                const toolName = String(item.tool ?? item.id ?? "").trim();
                if (toolName) {
                  appendApplyLog("execution", `Tool completed: ${toolName}`);
                }
                return;
              }

              if (method === "processing/heartbeat") {
                heartbeatCount += 1;
                if (heartbeatCount === 1 || heartbeatCount % 6 === 0) {
                  appendApplyLog("execution", `Execution heartbeat ${heartbeatCount}s.`);
                }
                return;
              }

              if (method === "turn/error" || method === "error") {
                const errorValue =
                  params.error && typeof params.error === "object"
                    ? String((params.error as Record<string, unknown>).message ?? "")
                    : String(params.error ?? "");
                finish(() => reject(new Error(errorValue.trim() || "Apply execution failed.")));
                return;
              }

              if (method === "turn/completed") {
                const completedText = extractResultTextFromTurnCompleted(params);
                const finalText = streamBuffer.trim() || completedText.trim();
                finish(() => resolve(finalText));
              }
            });
          });

        const runSyncWithHeartbeat = async () => {
          let heartbeatCount = 0;
          const timer = window.setInterval(() => {
            heartbeatCount += 1;
            if (heartbeatCount === 1 || heartbeatCount % 5 === 0) {
              appendApplyLog("execution", `Execution running... ${heartbeatCount}s`);
            }
          }, 1000);
          try {
            const generated = await engineSendMessageSync(workspaceId, {
              text: prompt,
              engine: selectedExecutor as EngineType,
              accessMode: "full-access",
              continueSession: false,
              customSpecRoot,
            });
            return generated?.text ?? "";
          } finally {
            window.clearInterval(timer);
          }
        };

        let generatedText = "";
        if (selectedExecutor === "codex") {
          const threadStart = await startThread(workspaceId);
          const threadId = extractThreadIdFromRpc(threadStart);
          if (threadId) {
            appendApplyLog("execution", `Execution thread created: ${threadId}`);
            const waitPromise = waitForTurnResult(threadId);
            await sendUserMessage(workspaceId, threadId, prompt, {
              accessMode: "full-access",
              customSpecRoot,
            });
            generatedText = await waitPromise;
          } else {
            appendApplyLog("execution", "No thread id returned, fallback to sync execution.");
            generatedText = await runSyncWithHeartbeat();
          }
        } else {
          const trigger = await engineSendMessage(workspaceId, {
            text: prompt,
            engine: selectedExecutor as EngineType,
            accessMode: "full-access",
            continueSession: false,
            customSpecRoot,
          });
          const threadId = extractThreadIdFromRpc(trigger);
          if (threadId) {
            appendApplyLog("execution", `Execution thread created: ${threadId}`);
            generatedText = await waitForTurnResult(threadId);
          } else {
            appendApplyLog("execution", "No thread id returned, fallback to sync execution.");
            generatedText = await runSyncWithHeartbeat();
          }
        }
        const parsed = parseApplyExecutionResult(generatedText, checklistSnapshot);
        const checklistIndexSet = new Set(checklistSnapshot.map((item) => item.index));
        const completedTaskIndices = parsed.completedTaskIndices.filter((index) =>
          checklistIndexSet.has(index),
        );
        const invalidReportedIndices = parsed.unmappedTaskIndices;
        const invalidReportedRefs = parsed.unmappedTaskRefs;

        setApplyExecution((prev) => ({
          ...prev,
          executionOutput: parsed.rawOutput,
          summary: parsed.summary,
          changedFiles: parsed.changedFiles,
          tests: parsed.tests,
          checks: parsed.checks,
          completedTaskIndices,
          noChanges: parsed.noChanges,
        }));
        appendApplyLog("execution", "Agent execution finished.");
        if (invalidReportedIndices.length > 0 || invalidReportedRefs.length > 0) {
          const invalidRefText = invalidReportedRefs.length > 0
            ? ` invalid refs: ${invalidReportedRefs.join(", ")}.`
            : "";
          appendApplyLog(
            "task-writeback",
            `Skipped unmatched task ids from execution output (invalid indices: ${invalidReportedIndices.length}).${invalidRefText}`,
          );
        }

        const checklistByIndex = new Map(checklistSnapshot.map((item) => [item.index, item]));
        const writebackTargets = completedTaskIndices.filter((index) => {
          const item = checklistByIndex.get(index);
          return item ? !item.checked : false;
        });

        if (writebackTargets.length > 0) {
          setApplyExecution((prev) => ({
            ...prev,
            phase: "task-writeback",
          }));
          appendApplyLog(
            "task-writeback",
            `Writing ${writebackTargets.length} completed task(s) to tasks.md.`,
          );

          const toggledTaskIndices: number[] = [];
          let latestTasks = artifacts.tasks;
          try {
            for (const taskIndex of writebackTargets) {
              const updated = await updateSpecTaskChecklist({
                workspaceId,
                change: selectedChange,
                taskIndex,
                checked: true,
                customSpecRoot,
              });
              toggledTaskIndices.push(taskIndex);
              latestTasks = {
                ...latestTasks,
                content: updated.content,
                taskChecklist: updated.taskChecklist,
                taskProgress: updated.taskProgress,
              };
              setArtifacts((prev) => ({
                ...prev,
                tasks: latestTasks,
              }));
            }
          } catch (writebackError) {
            for (let index = toggledTaskIndices.length - 1; index >= 0; index -= 1) {
              const taskIndex = toggledTaskIndices[index];
              try {
                const reverted = await updateSpecTaskChecklist({
                  workspaceId,
                  change: selectedChange,
                  taskIndex,
                  checked: false,
                  customSpecRoot,
                });
                latestTasks = {
                  ...latestTasks,
                  content: reverted.content,
                  taskChecklist: reverted.taskChecklist,
                  taskProgress: reverted.taskProgress,
                };
                setArtifacts((prev) => ({
                  ...prev,
                  tasks: latestTasks,
                }));
              } catch {
                // keep best-effort rollback behavior
              }
            }
            const reason =
              writebackError instanceof Error ? writebackError.message : String(writebackError);
            throw new Error(`Task write-back failed: ${reason}`);
          }

          setTimeline((prev) => {
            const writebackEvent: SpecTimelineEvent = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              at: Date.now(),
              kind: "task-update",
              action: "apply",
              command: `auto-check ${selectedChange.id} (${writebackTargets.length})`,
              success: true,
              output: `Auto-marked ${writebackTargets.length} task(s) as completed.`,
              validationIssues: [],
              gitRefs: [],
            };
            return [writebackEvent, ...prev].slice(0, TIMELINE_EVENT_LIMIT);
          });
        }

        setApplyExecution((prev) => ({
          ...prev,
          phase: "finalize",
        }));
        appendApplyLog("finalize", "Refreshing runtime state.");
        await refresh({ force: true, rescanWorkspaceFiles: true });
        setApplyExecution((prev) => ({
          ...prev,
          status: "success",
          phase: "finalize",
          finishedAt: Date.now(),
          summary:
            prev.summary ||
            (parsed.noChanges
              ? "Execution finished with no code changes."
              : `Execution finished with ${parsed.changedFiles.length} changed file(s).`),
          noChanges: parsed.noChanges,
          error: null,
          logs:
            parsed.nextSteps.length > 0
              ? [...prev.logs, `[${new Date().toLocaleTimeString()}] [finalize] Next: ${parsed.nextSteps.join(" | ")}`]
              : prev.logs,
        }));
        return event;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setActionError(message);
        if (isApply) {
          setApplyExecution((prev) => ({
            ...prev,
            status: "failed",
            phase: prev.phase === "idle" ? "preflight" : prev.phase,
            finishedAt: Date.now(),
            error: message,
            logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] [${prev.phase}] ${message}`],
          }));
        }
        return null;
      } finally {
        setIsRunningAction(null);
      }
    },
    [
      actions,
      artifacts.tasks,
      currentProviderScope,
      customSpecRoot,
      refresh,
      selectedChange,
      snapshot.provider,
      workspaceId,
    ],
  );

  const executeBootstrap = useCallback(
    async (projectInfo: SpecProjectInfoInput) => {
      if (!workspaceId) {
        return false;
      }
      setBootstrapError(null);
      setIsBootstrapping(true);
      try {
        const event = await initializeOpenSpecWorkspace({
          workspaceId,
          projectInfo,
          customSpecRoot,
        });
        setTimeline((prev) => [event, ...prev].slice(0, TIMELINE_EVENT_LIMIT));
        if (!event.success) {
          setBootstrapError(event.output || "OpenSpec bootstrap failed");
          return false;
        }
        await refresh({ force: true, rescanWorkspaceFiles: true });
        return true;
      } catch (error) {
        setBootstrapError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setIsBootstrapping(false);
      }
    },
    [customSpecRoot, refresh, workspaceId],
  );

  const persistProjectInfo = useCallback(
    async (projectInfo: SpecProjectInfoInput) => {
      if (!workspaceId) {
        return false;
      }
      setProjectInfoError(null);
      setIsSavingProjectInfo(true);
      try {
        const saved = await saveSpecProjectInfo({
          workspaceId,
          projectInfo,
          customSpecRoot,
        });
        const event: SpecTimelineEvent = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          at: Date.now(),
          kind: "action",
          action: "bootstrap",
          command: `write ${saved.path}`,
          success: true,
          output: `${saved.historyEntry}\nProject context saved: ${saved.path}`,
          validationIssues: [],
          gitRefs: [],
        };
        setTimeline((prev) => [event, ...prev].slice(0, TIMELINE_EVENT_LIMIT));
        return true;
      } catch (error) {
        setProjectInfoError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setIsSavingProjectInfo(false);
      }
    },
    [customSpecRoot, workspaceId],
  );

  const updateTaskChecklistItem = useCallback(
    async (taskIndex: number, checked: boolean) => {
      if (!workspaceId || !selectedChange) {
        return false;
      }
      setTaskUpdateError(null);
      const previousTasks = artifacts.tasks;
      setIsUpdatingTaskIndex(taskIndex);

      setArtifacts((prev) => {
        const checklist = prev.tasks.taskChecklist ?? [];
        if (checklist.length === 0) {
          return prev;
        }
        const nextChecklist = checklist.map((item) =>
          item.index === taskIndex ? { ...item, checked } : item,
        );
        const requiredTasks = nextChecklist.filter((item) => item.priority !== "p2");
        const taskProgress = {
          total: nextChecklist.length,
          checked: nextChecklist.filter((item) => item.checked).length,
          requiredTotal: requiredTasks.length,
          requiredChecked: requiredTasks.filter((item) => item.checked).length,
        };
        return {
          ...prev,
          tasks: {
            ...prev.tasks,
            taskChecklist: nextChecklist,
            taskProgress,
          },
        };
      });

      try {
        const updated = await updateSpecTaskChecklist({
          workspaceId,
          change: selectedChange,
          taskIndex,
          checked,
          customSpecRoot,
        });
        setArtifacts((prev) => ({
          ...prev,
          tasks: {
            ...prev.tasks,
            content: updated.content,
            taskChecklist: updated.taskChecklist,
            taskProgress: updated.taskProgress,
          },
        }));
        const event: SpecTimelineEvent = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          at: Date.now(),
          kind: "task-update",
          action: "apply",
          command: `toggle ${updated.path} [${taskIndex + 1}] -> ${checked ? "checked" : "unchecked"}`,
          success: true,
          output: `Task ${taskIndex + 1} marked as ${checked ? "done" : "pending"}.`,
          validationIssues: [],
          gitRefs: [],
        };
        setTimeline((prev) => [event, ...prev].slice(0, TIMELINE_EVENT_LIMIT));
        await refresh({ silent: true, force: true });
        return true;
      } catch (error) {
        setArtifacts((prev) => ({
          ...prev,
          tasks: previousTasks,
        }));
        setTaskUpdateError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setIsUpdatingTaskIndex(null);
      }
    },
    [artifacts.tasks, customSpecRoot, refresh, selectedChange, workspaceId],
  );

  const loadProjectInfo = useCallback(async () => {
    if (!workspaceId) {
      return null;
    }
    return loadSpecProjectInfo({ workspaceId, customSpecRoot });
  }, [customSpecRoot, workspaceId]);

  const setCustomSpecRoot = useCallback(
    async (nextPath: string | null) => {
      const key = specRootStoreKey(workspaceId);
      const normalized = normalizeSpecRootInput(nextPath);
      skipNextSignatureRefreshRef.current = true;
      setCustomSpecRootState(normalized);
      if (key) {
        writeClientStoreValue("app", key, normalized);
      }
      await refresh({
        force: true,
        customSpecRootOverride: normalized,
      });
    },
    [refresh, workspaceId],
  );

  return {
    snapshot,
    selectedChange,
    artifacts,
    actions,
    timeline,
    gate,
    validationIssues,
    environmentMode,
    isLoading,
    isRunningAction,
    actionError,
    applyExecution,
    isBootstrapping,
    bootstrapError,
    isSavingProjectInfo,
    projectInfoError,
    isUpdatingTaskIndex,
    taskUpdateError,
    customSpecRoot,
    refresh,
    selectChange,
    executeAction,
    executeBootstrap,
    persistProjectInfo,
    updateTaskChecklistItem,
    loadProjectInfo,
    setCustomSpecRoot,
    switchMode,
  };
}
