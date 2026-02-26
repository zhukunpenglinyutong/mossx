import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import Archive from "lucide-react/dist/esm/icons/archive";
import ArrowRightCircle from "lucide-react/dist/esm/icons/arrow-right-circle";
import BadgeCheck from "lucide-react/dist/esm/icons/badge-check";
import CalendarDays from "lucide-react/dist/esm/icons/calendar-days";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import ChevronsUpDown from "lucide-react/dist/esm/icons/chevrons-up-down";
import CircleDashed from "lucide-react/dist/esm/icons/circle-dashed";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import FileCode2 from "lucide-react/dist/esm/icons/file-code-2";
import FilePenLine from "lucide-react/dist/esm/icons/file-pen-line";
import FileSearch from "lucide-react/dist/esm/icons/file-search";
import FolderTree from "lucide-react/dist/esm/icons/folder-tree";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import GitPullRequestArrow from "lucide-react/dist/esm/icons/git-pull-request-arrow";
import HeartPulse from "lucide-react/dist/esm/icons/heart-pulse";
import ListChecks from "lucide-react/dist/esm/icons/list-checks";
import Maximize2 from "lucide-react/dist/esm/icons/maximize-2";
import MessageCircle from "lucide-react/dist/esm/icons/message-circle";
import Minimize2 from "lucide-react/dist/esm/icons/minimize-2";
import PanelRightClose from "lucide-react/dist/esm/icons/panel-right-close";
import PanelRightOpen from "lucide-react/dist/esm/icons/panel-right-open";
import Plus from "lucide-react/dist/esm/icons/plus";
import ImagePlus from "lucide-react/dist/esm/icons/image-plus";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import ShieldAlert from "lucide-react/dist/esm/icons/shield-alert";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import TriangleAlert from "lucide-react/dist/esm/icons/triangle-alert";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import X from "lucide-react/dist/esm/icons/x";
import XCircle from "lucide-react/dist/esm/icons/x-circle";
import { Badge } from "../../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import type { EngineType } from "../../../types";
import { subscribeAppServerEvents } from "../../../services/events";
import {
  detectEngines,
  engineSendMessage,
  engineSendMessageSync,
  getWorkspaceFiles,
  getActiveEngine,
  listExternalSpecTree,
  pickImageFiles,
  sendUserMessage,
  startThread,
} from "../../../services/tauri";
import { Markdown } from "../../messages/components/Markdown";
import { ComposerAttachments } from "../../composer/components/ComposerAttachments";
import { useComposerImageDrop } from "../../composer/hooks/useComposerImageDrop";
import { EngineIcon } from "../../engine/components/EngineIcon";
import { useSpecHub, type SpecContinueExecutionBrief } from "../hooks/useSpecHub";
import {
  buildSpecActions,
  buildSpecWorkspaceSnapshot,
  evaluateOpenSpecChangePreflight,
  loadSpecArtifacts,
  runSpecAction,
} from "../../../lib/spec-core/runtime";
import type {
  SpecChangeStatus,
  SpecHubActionKey,
  SpecProjectInfoInput,
  SpecTaskChecklistItem,
} from "../../../lib/spec-core/types";
import { isAbsoluteSpecRootInput, normalizeSpecRootInput } from "../../../lib/spec-core/pathUtils";

type SpecHubProps = {
  workspaceId: string | null;
  workspaceName: string | null;
  files: string[];
  directories: string[];
  onBackToChat: () => void;
};

type ChangeFilter = "all" | "active" | "blocked" | "archived";
type ProjectAgent = "codex" | "claude" | "opencode";
type AiTakeoverStatus = "idle" | "running" | "success" | "failed";
type AiTakeoverPhase = "kickoff" | "agent" | "refresh";
type AiTakeoverRefreshState = "idle" | "refreshed" | "refresh-failed";
type AiTakeoverLogLevel = "info" | "success" | "error";

type AiTakeoverLogEntry = {
  id: string;
  at: number;
  phase: AiTakeoverPhase;
  level: AiTakeoverLogLevel;
  message: string;
};
type GuidanceActionKey = "continue" | "apply";
type ApplyExecutionViewState = ReturnType<typeof useSpecHub>["applyExecution"];
type ProposalDraftMode = "create" | "append";
type ProposalExecutionPhase = "idle" | "input" | "dispatch" | "execution" | "finalize";
type ProposalExecutionStatus = "idle" | "running" | "success" | "failed";
type VerifyAutoCompleteExecutionPhase =
  | "idle"
  | "completion-dispatch"
  | "completion-execution"
  | "completion-finalize"
  | "verify-dispatch"
  | "verify-finalize";
type VerifyAutoCompleteExecutionStatus = "idle" | "running" | "success" | "failed";
type ContinueAiEnhancementExecutionPhase =
  | "idle"
  | "analysis-dispatch"
  | "analysis-execution"
  | "analysis-finalize"
  | "apply-dispatch"
  | "apply-execution"
  | "apply-finalize";
type ContinueAiEnhancementExecutionStatus = "idle" | "running" | "success" | "failed";
type AutoComboGuardStatus = "idle" | "running" | "success" | "failed";
type AutoComboGuardPhase = "idle" | "audit" | "remediate" | "verify" | "finalize";
type ProposalExecutionState = {
  status: ProposalExecutionStatus;
  phase: ProposalExecutionPhase;
  mode: ProposalDraftMode | null;
  targetChangeId: string | null;
  executor: ProjectAgent | null;
  startedAt: number | null;
  finishedAt: number | null;
  streamOutput: string;
  finalOutput: string;
  summary: string;
  error: string | null;
  preflightBlockers: string[];
  preflightHints: string[];
  logs: string[];
};
type VerifyAutoCompleteExecutionState = {
  status: VerifyAutoCompleteExecutionStatus;
  phase: VerifyAutoCompleteExecutionPhase;
  executor: ProjectAgent | null;
  startedAt: number | null;
  finishedAt: number | null;
  streamOutput: string;
  finalOutput: string;
  summary: string;
  error: string | null;
  logs: string[];
  validateSkipped: boolean;
};
type ContinueAiEnhancementExecutionState = {
  status: ContinueAiEnhancementExecutionStatus;
  phase: ContinueAiEnhancementExecutionPhase;
  executor: ProjectAgent | null;
  startedAt: number | null;
  finishedAt: number | null;
  streamOutput: string;
  summary: string;
  finalOutput: string;
  error: string | null;
  logs: string[];
};
type AutoComboGuardExecutionState = {
  status: AutoComboGuardStatus;
  phase: AutoComboGuardPhase;
  executor: ProjectAgent | null;
  startedAt: number | null;
  finishedAt: number | null;
  streamOutput: string;
  summary: string;
  changedFiles: string[];
  tests: string[];
  checks: string[];
  completedTaskIndices: number[];
  error: string | null;
  logs: string[];
};
type ContinueBriefEntry = SpecContinueExecutionBrief & {
  rawOutput: string;
  changeId: string;
  specRoot: string;
  generatedAt: number;
};

const AI_TAKEOVER_PHASES: AiTakeoverPhase[] = ["kickoff", "agent", "refresh"];
const AI_TAKEOVER_BLOCKER_PREFIX = /^Archive preflight failed:/i;
const AI_TAKEOVER_NON_FIXABLE_PATTERNS: RegExp[] = [
  /Strict verify must pass before archive/i,
  /Required tasks are incomplete/i,
  /Change is already archived/i,
  /Select a change first/i,
];
const AI_TAKEOVER_FIXABLE_PATTERNS: RegExp[] = [
  /^Archive preflight failed:/im,
  /MODIFIED failed for header/i,
  /RENAMED failed for header/i,
  /target spec does not exist/i,
  /only ADDED requirements are allowed/i,
  /Requirement must contain SHALL or MUST keyword/i,
  /requirement missing in .* -> /i,
];
const GUIDANCE_NO_SUGGESTION_PATTERNS: RegExp[] = [
  /no (new|additional|further) (suggestion|change|task|step)/i,
  /no actionable guidance/i,
  /nothing to (update|do|apply)/i,
  /already (up to date|complete|satisfied)/i,
  /无新增建议|没有新增建议|无需更新|无可执行建议|无需新增操作/,
];
const GUIDANCE_RAW_COLLAPSE_TAGS = ["project_context", "rules", "dependencies"];
const APPLY_FEEDBACK_FLOATING_WIDTH = 420;
const APPLY_FEEDBACK_FLOATING_MARGIN = 12;
const FEEDBACK_FLOATING_BASE_X = APPLY_FEEDBACK_FLOATING_MARGIN + 24;
const FEEDBACK_FLOATING_BASE_Y = 108;
const FEEDBACK_FLOATING_GAP = 56;
const FEEDBACK_FLOATING_MIN_STEP = 220;
const FEEDBACK_FLOATING_MIN_GAP = 24;
const PROPOSAL_MAX_ATTACHMENTS = 6;
const PROPOSAL_MAX_DATA_URL_BYTES = 8 * 1024 * 1024;
const PROPOSAL_ALLOWED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".tiff",
  ".tif",
];
const PROPOSAL_ALLOWED_IMAGE_MIME_PREFIXES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
];
const ACTION_BLOCKERS_COLLAPSED_VISIBLE_COUNT = 1;
const CONTINUE_BRIEF_STALE_MS = 10 * 60 * 1000;
const ARCHIVED_CHANGE_DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})-.+/;
const EMPTY_APPLY_EXECUTION_VIEW: ApplyExecutionViewState = {
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
const EMPTY_PROPOSAL_EXECUTION: ProposalExecutionState = {
  status: "idle",
  phase: "idle",
  mode: null,
  targetChangeId: null,
  executor: null,
  startedAt: null,
  finishedAt: null,
  streamOutput: "",
  finalOutput: "",
  summary: "",
  error: null,
  preflightBlockers: [],
  preflightHints: [],
  logs: [],
};
const EMPTY_VERIFY_AUTO_COMPLETE_EXECUTION: VerifyAutoCompleteExecutionState = {
  status: "idle",
  phase: "idle",
  executor: null,
  startedAt: null,
  finishedAt: null,
  streamOutput: "",
  finalOutput: "",
  summary: "",
  error: null,
  logs: [],
  validateSkipped: false,
};
const EMPTY_CONTINUE_AI_ENHANCEMENT_EXECUTION: ContinueAiEnhancementExecutionState = {
  status: "idle",
  phase: "idle",
  executor: null,
  startedAt: null,
  finishedAt: null,
  streamOutput: "",
  summary: "",
  finalOutput: "",
  error: null,
  logs: [],
};
const EMPTY_AUTO_COMBO_GUARD_EXECUTION: AutoComboGuardExecutionState = {
  status: "idle",
  phase: "idle",
  executor: null,
  startedAt: null,
  finishedAt: null,
  streamOutput: "",
  summary: "",
  changedFiles: [],
  tests: [],
  checks: [],
  completedTaskIndices: [],
  error: null,
  logs: [],
};

type FloatingPosition = {
  x: number;
  y: number;
};

type FloatingBounds = {
  width: number;
  height: number;
};

type ArchivedChangeGroup<T extends { id: string }> = {
  key: string;
  label: string;
  kind: "date" | "fallback";
  changes: T[];
};

function groupChangesByDatePrefix<T extends { id: string }>(
  changes: T[],
  fallbackLabel: string,
): ArchivedChangeGroup<T>[] {
  const byDatePrefix = new Map<string, T[]>();
  const fallbackItems: T[] = [];

  changes.forEach((change) => {
    const datePrefixMatch = change.id.match(ARCHIVED_CHANGE_DATE_PREFIX_PATTERN);
    if (!datePrefixMatch?.[1]) {
      fallbackItems.push(change);
      return;
    }
    const datePrefix = datePrefixMatch[1];
    const groupEntries = byDatePrefix.get(datePrefix);
    if (groupEntries) {
      groupEntries.push(change);
      return;
    }
    byDatePrefix.set(datePrefix, [change]);
  });

  const dateGroups = [...byDatePrefix.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([datePrefix, changes]) => ({
      key: `date:${datePrefix}`,
      label: datePrefix,
      kind: "date" as const,
      changes,
    }));

  if (fallbackItems.length === 0) {
    return dateGroups;
  }

  return [
    ...dateGroups,
    {
      key: "fallback:other",
      label: fallbackLabel,
      kind: "fallback",
      changes: fallbackItems,
    },
  ];
}

function getViewportFloatingBounds(): FloatingBounds {
  if (typeof window === "undefined") {
    return { width: 1280, height: 720 };
  }
  return {
    width: Math.max(window.innerWidth, APPLY_FEEDBACK_FLOATING_WIDTH + APPLY_FEEDBACK_FLOATING_MARGIN * 2),
    height: Math.max(window.innerHeight, 360),
  };
}

function clampFloatingPosition(position: FloatingPosition, bounds: FloatingBounds = getViewportFloatingBounds()) {
  const safeX = Number.isFinite(position.x) ? position.x : APPLY_FEEDBACK_FLOATING_MARGIN;
  const safeY = Number.isFinite(position.y) ? position.y : 108;
  const maxX = Math.max(
    APPLY_FEEDBACK_FLOATING_MARGIN,
    bounds.width - APPLY_FEEDBACK_FLOATING_WIDTH - APPLY_FEEDBACK_FLOATING_MARGIN,
  );
  const maxY = Math.max(APPLY_FEEDBACK_FLOATING_MARGIN, bounds.height - 72);
  return {
    x: Math.min(Math.max(safeX, APPLY_FEEDBACK_FLOATING_MARGIN), maxX),
    y: Math.min(Math.max(safeY, APPLY_FEEDBACK_FLOATING_MARGIN), maxY),
  };
}

function getInitialFloatingPosition(width = getViewportFloatingBounds().width) {
  const bounds = getViewportFloatingBounds();
  return {
    x: clampFloatingPosition(
      {
        x: Math.min(FEEDBACK_FLOATING_BASE_X, width - APPLY_FEEDBACK_FLOATING_WIDTH - APPLY_FEEDBACK_FLOATING_MARGIN),
        y: FEEDBACK_FLOATING_BASE_Y,
      },
      bounds,
    ).x,
    y: FEEDBACK_FLOATING_BASE_Y,
  };
}

function buildSequentialFloatingPositions(count: number, bounds: FloatingBounds = getViewportFloatingBounds()) {
  const panelCount = Math.max(1, Math.floor(count));
  const first = clampFloatingPosition(
    {
      x: FEEDBACK_FLOATING_BASE_X,
      y: FEEDBACK_FLOATING_BASE_Y,
    },
    bounds,
  );
  if (panelCount === 1) {
    return [first];
  }
  const maxX = Math.max(
    APPLY_FEEDBACK_FLOATING_MARGIN,
    bounds.width - APPLY_FEEDBACK_FLOATING_WIDTH - APPLY_FEEDBACK_FLOATING_MARGIN,
  );
  const span = panelCount - 1;
  const travel = Math.max(0, maxX - first.x);
  const maxGapNoOverlap = Math.floor(travel / span - APPLY_FEEDBACK_FLOATING_WIDTH);
  const step =
    maxGapNoOverlap >= FEEDBACK_FLOATING_MIN_GAP
      ? APPLY_FEEDBACK_FLOATING_WIDTH + Math.min(FEEDBACK_FLOATING_GAP, maxGapNoOverlap)
      : Math.max(FEEDBACK_FLOATING_MIN_STEP, Math.floor(travel / span));
  return Array.from({ length: panelCount }, (_, index) =>
    clampFloatingPosition(
      {
        x: first.x + step * index,
        y: first.y,
      },
      bounds,
    ),
  );
}

function isProjectAgent(value: string): value is ProjectAgent {
  return value === "codex" || value === "claude" || value === "opencode";
}

const STATUS_META: Record<
  SpecChangeStatus,
  {
    icon: ComponentType<{ className?: string; size?: number; "aria-hidden"?: boolean }>;
    className: string;
  }
> = {
  draft: { icon: FilePenLine, className: "is-draft" },
  ready: { icon: CheckCircle2, className: "is-ready" },
  implementing: { icon: Wrench, className: "is-implementing" },
  verified: { icon: ShieldCheck, className: "is-verified" },
  archived: { icon: Archive, className: "is-archived" },
  blocked: { icon: TriangleAlert, className: "is-blocked" },
};

const ACTION_ICON: Record<
  SpecHubActionKey,
  ComponentType<{ className?: string; size?: number; "aria-hidden"?: boolean }>
> = {
  continue: ArrowRightCircle,
  apply: CircleDashed,
  verify: BadgeCheck,
  archive: Archive,
  bootstrap: Wrench,
};

const SUPPORT_LABEL_KEY: Record<"full" | "minimal" | "none", string> = {
  full: "specHub.supportFull",
  minimal: "specHub.supportMinimal",
  none: "specHub.supportNone",
};

const RUNTIME_TEXT_KEYS: Record<string, string> = {
  "No workspace selected.": "specHub.runtime.noWorkspaceSelected",
  "Select a workspace first.": "specHub.runtime.selectWorkspaceFirst",
  "No supported spec provider detected.": "specHub.runtime.noSupportedProvider",
  "Open a workspace with OpenSpec or spec-kit structure.":
    "specHub.runtime.openSupportedWorkspace",
  "Install Node.js 18+ and make sure `node` is available in PATH.":
    "specHub.runtime.installNode",
  "Managed mode: install OpenSpec CLI, then click Refresh to re-run Doctor.":
    "specHub.runtime.managedInstallOpenSpec",
  "Fallback: switch to BYO mode to use your existing environment settings.":
    "specHub.runtime.fallbackByo",
  "BYO mode: expose `openspec` in PATH and verify `openspec --version` works.":
    "specHub.runtime.byoExposeOpenSpec",
  "Spec-Kit CLI is optional in minimal mode, but enabling it improves diagnostics.":
    "specHub.runtime.speckitOptional",
  "No supported spec workspace detected.": "specHub.runtime.noSupportedWorkspace",
  "Spec-Kit is currently in minimal compatibility mode.":
    "specHub.runtime.speckitMinimalMode",
  "No active changes found under openspec/changes.": "specHub.runtime.noActiveChanges",
  "This provider is running in minimal compatibility mode.":
    "specHub.runtime.providerMinimalMode",
  "Missing proposal.md": "specHub.runtime.missingProposal",
  "Missing design.md": "specHub.runtime.missingDesign",
  "Missing tasks.md": "specHub.runtime.missingTasks",
  "Missing specs delta": "specHub.runtime.missingSpecsDelta",
  "Run continue first to generate specs delta": "specHub.runtime.runContinueFirstForSpecs",
  "Unable to read tasks.md": "specHub.runtime.unableReadTasks",
  "tasks.md is required": "specHub.runtime.tasksRequired",
  "Core artifacts are incomplete": "specHub.runtime.coreArtifactsIncomplete",
  "Change must be verified first": "specHub.runtime.changeMustBeVerifiedFirst",
  "Strict verify must pass before archive": "specHub.runtime.strictVerifyBeforeArchive",
  "Change is already archived": "specHub.runtime.changeAlreadyArchived",
  "Required tasks are incomplete": "specHub.runtime.requiredTasksIncomplete",
  "Task checkbox not found": "specHub.runtime.taskCheckboxNotFound",
  "Doctor checks passed": "specHub.runtime.doctorChecksPassed",
  "Environment needs attention": "specHub.runtime.environmentNeedsAttention",
  "Select a change first": "specHub.runtime.selectChangeFirst",
  "Core artifacts ready": "specHub.runtime.coreArtifactsReady",
  "Core artifacts incomplete": "specHub.runtime.coreArtifactsIncomplete",
  "No strict verify run in this session": "specHub.runtime.noStrictVerify",
  "No strict verify evidence recorded": "specHub.runtime.noStrictVerify",
  "Latest strict verify passed": "specHub.runtime.latestStrictVerifyPassed",
  "Latest strict verify failed": "specHub.runtime.latestStrictVerifyFailed",
  "Open the target file and fix the requirement mismatch before re-running verify.":
    "specHub.runtime.validationFixHint",
  "Read command output and complete missing artifacts, then run verify again.":
    "specHub.runtime.validationReadOutputHint",
  "OpenSpec instructions captured.": "specHub.runtime.openspecInstructionsCaptured",
  "Continue brief attached to apply execution prompt.": "specHub.runtime.continueBriefAttached",
  "Guidance generated successfully.": "specHub.runtime.guidanceGeneratedSuccessfully",
  "Failed to generate guidance.": "specHub.runtime.failedGenerateGuidance",
  "Failed to generate apply instructions.": "specHub.runtime.failedGenerateApplyInstructions",
  "Timed out waiting for apply execution.": "specHub.runtime.timedOutWaitingApplyExecution",
  "Apply execution failed.": "specHub.runtime.applyExecutionFailed",
  "No thread id returned, fallback to sync execution.":
    "specHub.runtime.noThreadFallbackSyncExecution",
  "Agent execution finished.": "specHub.runtime.agentExecutionFinished",
  "Refreshing runtime state.": "specHub.runtime.refreshingRuntimeState",
  "Execution finished with no code changes.":
    "specHub.runtime.executionFinishedNoCodeChanges",
  "OpenSpec bootstrap failed": "specHub.runtime.openSpecBootstrapFailed",
  validation: "specHub.runtime.validationTarget",
  "not found": "specHub.runtime.notFound",
  "node not found": "specHub.runtime.nodeNotFound",
  "openspec not found": "specHub.runtime.openspecNotFound",
  "spec-kit not found": "specHub.runtime.speckitNotFound",
};

function translateProviderName(provider: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (provider === "openspec") {
    return "OpenSpec";
  }
  if (provider === "speckit") {
    return "Spec-Kit";
  }
  return t("specHub.providerUnknown");
}

function translateSupportLevel(
  level: "full" | "minimal" | "none",
  t: ReturnType<typeof useTranslation>["t"],
) {
  return t(SUPPORT_LABEL_KEY[level]);
}

function translateRuntimeText(text: string, t: ReturnType<typeof useTranslation>["t"]) {
  const mapped = RUNTIME_TEXT_KEYS[text];
  if (mapped) {
    return t(mapped);
  }

  const archivePreflightMatch = text.match(
    /^Archive preflight failed: delta ([A-Z/]+) requires existing (openspec[\\/]+specs[\\/]+.+)$/i,
  );
  if (archivePreflightMatch) {
    const [, operations, path] = archivePreflightMatch;
    return t("specHub.runtime.archivePreflightMissingTarget", {
      operations,
      path,
    });
  }

  const archiveRequirementMatch = text.match(
    /^Archive preflight failed: delta ([A-Z]+) requirement missing in (openspec[\\/]+specs[\\/]+.+?) -> (.+)$/i,
  );
  if (archiveRequirementMatch) {
    const [, operation, path, requirement] = archiveRequirementMatch;
    return t("specHub.runtime.archivePreflightMissingRequirement", {
      operation,
      path,
      requirement,
    });
  }

  const requiredMatch = text.match(/^(Node\.js|OpenSpec CLI|Spec-Kit CLI) is required for (\w+) workflow\.$/i);
  if (requiredMatch) {
    const [, rawTool, rawProvider] = requiredMatch;
    const tool =
      rawTool === "Node.js"
        ? t("specHub.check.node")
        : rawTool === "OpenSpec CLI"
          ? t("specHub.check.openspec")
          : t("specHub.check.speckit");
    return t("specHub.runtime.requiredForWorkflow", {
      tool,
      provider: translateProviderName(rawProvider.toLowerCase(), t),
    });
  }

  const providerMatch = text.match(/^(\w+)\s\((full|minimal|none)\)$/i);
  if (providerMatch) {
    const [, rawProvider, rawSupport] = providerMatch;
    return t("specHub.runtime.providerSupport", {
      provider: translateProviderName(rawProvider.toLowerCase(), t),
      support: translateSupportLevel(rawSupport.toLowerCase() as "full" | "minimal" | "none", t),
    });
  }

  const gitRefMatch = text.match(/^Detected related git ref: ([0-9a-f]{7,40})$/i);
  if (gitRefMatch) {
    return t("specHub.runtime.gitRefDetected", { ref: gitRefMatch[1] });
  }

  const truncatedMatch = text.match(
    /^Artifact evidence is truncated \((.+)\)\. Re-read before archive\.$/i,
  );
  if (truncatedMatch?.[1]) {
    return t("specHub.runtime.truncatedArtifactEvidence", {
      artifacts: truncatedMatch[1],
    });
  }

  const providerMismatchMatch = text.match(
    /^Provider mismatch: native action requires openspec, got (\w+)$/i,
  );
  if (providerMismatchMatch?.[1]) {
    return t("specHub.runtime.providerMismatchNativeAction", {
      provider: translateProviderName(providerMismatchMatch[1].toLowerCase(), t),
    });
  }

  const dispatchMatch = text.match(/^Dispatching execution to (\w+)\.$/i);
  if (dispatchMatch?.[1]) {
    return t("specHub.runtime.dispatchingExecution", {
      executor: dispatchMatch[1],
    });
  }

  const promotedThreadMatch = text.match(/^Bound promoted thread (.+)\.$/i);
  if (promotedThreadMatch?.[1]) {
    return t("specHub.runtime.boundPromotedThread", {
      threadId: promotedThreadMatch[1],
    });
  }

  const toolStartedMatch = text.match(/^Tool started: (.+)$/i);
  if (toolStartedMatch?.[1]) {
    return t("specHub.runtime.executionToolStarted", {
      tool: toolStartedMatch[1],
    });
  }

  const toolCompletedMatch = text.match(/^Tool completed: (.+)$/i);
  if (toolCompletedMatch?.[1]) {
    return t("specHub.runtime.executionToolCompleted", {
      tool: toolCompletedMatch[1],
    });
  }

  const heartbeatMatch = text.match(/^Execution heartbeat (\d+)s\.$/i);
  if (heartbeatMatch?.[1]) {
    return t("specHub.runtime.executionHeartbeat", {
      seconds: heartbeatMatch[1],
    });
  }

  const runningMatch = text.match(/^Execution running\.\.\. (\d+)s$/i);
  if (runningMatch?.[1]) {
    return t("specHub.runtime.executionRunningSync", {
      seconds: runningMatch[1],
    });
  }

  const executionThreadMatch = text.match(/^Execution thread created: (.+)$/i);
  if (executionThreadMatch?.[1]) {
    return t("specHub.runtime.executionThreadCreated", {
      threadId: executionThreadMatch[1],
    });
  }

  const skippedWithRefsMatch = text.match(
    /^Skipped unmatched task ids from execution output \(invalid indices: (\d+)\)\. invalid refs: (.+)\.$/i,
  );
  if (skippedWithRefsMatch?.[1] && skippedWithRefsMatch[2]) {
    return t("specHub.runtime.skippedUnmatchedTaskIdsWithRefs", {
      count: Number(skippedWithRefsMatch[1]),
      refs: skippedWithRefsMatch[2],
    });
  }

  const skippedMatch = text.match(
    /^Skipped unmatched task ids from execution output \(invalid indices: (\d+)\)\.$/i,
  );
  if (skippedMatch?.[1]) {
    return t("specHub.runtime.skippedUnmatchedTaskIds", {
      count: Number(skippedMatch[1]),
    });
  }

  const writingTasksMatch = text.match(/^Writing (\d+) completed task\(s\) to tasks\.md\.$/i);
  if (writingTasksMatch?.[1]) {
    return t("specHub.runtime.writingCompletedTasksToTasks", {
      count: Number(writingTasksMatch[1]),
    });
  }

  const applyStartMatch = text.match(/^apply (guidance|execute) started with (\w+)$/i);
  if (applyStartMatch?.[1] && applyStartMatch[2]) {
    return t("specHub.runtime.applyStartedWith", {
      mode: applyStartMatch[1],
      executor: applyStartMatch[2],
    });
  }

  const autoMarkedTasksMatch = text.match(/^Auto-marked (\d+) task\(s\) as completed\.$/i);
  if (autoMarkedTasksMatch?.[1]) {
    return t("specHub.runtime.autoMarkedTasks", {
      count: Number(autoMarkedTasksMatch[1]),
    });
  }

  const changedFilesMatch = text.match(/^Execution finished with (\d+) changed file\(s\)\.$/i);
  if (changedFilesMatch?.[1]) {
    return t("specHub.runtime.executionFinishedChangedFiles", {
      count: Number(changedFilesMatch[1]),
    });
  }

  const taskWritebackFailedMatch = text.match(/^Task write-back failed: (.+)$/i);
  if (taskWritebackFailedMatch?.[1]) {
    return t("specHub.runtime.taskWritebackFailed", {
      reason: taskWritebackFailedMatch[1],
    });
  }

  const nextStepsMatch = text.match(/^Next: (.+)$/i);
  if (nextStepsMatch?.[1]) {
    return t("specHub.runtime.nextSteps", {
      steps: nextStepsMatch[1],
    });
  }

  return text;
}

function translateRuntimeLogLine(line: string, t: ReturnType<typeof useTranslation>["t"]) {
  const prefixedMatch = line.match(/^(\[[^\]]+\]\s+\[[^\]]+\]\s+)([\s\S]+)$/);
  if (!prefixedMatch) {
    return translateRuntimeText(line, t);
  }
  return `${prefixedMatch[1]}${translateRuntimeText(prefixedMatch[2], t)}`;
}

function formatSpecFileLabel(path: string, index: number, t: ReturnType<typeof useTranslation>["t"]) {
  const segments = path.split("/").filter(Boolean);
  if (segments.length >= 2) {
    return segments[segments.length - 2] || t("specHub.specFileFallback", { index: index + 1 });
  }
  return segments[segments.length - 1] || t("specHub.specFileFallback", { index: index + 1 });
}

function inferProjectType(files: string[], provider: "openspec" | "speckit" | "unknown") {
  if (provider === "openspec") {
    return "legacy" as const;
  }
  return files.length > 25 ? ("legacy" as const) : ("new" as const);
}

function toSafeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeGeneratedProjectInfo(input: {
  payload: Record<string, unknown>;
  files: string[];
  provider: "openspec" | "speckit" | "unknown";
}): SpecProjectInfoInput {
  const payload = input.payload;
  const projectTypeRaw = toSafeText(payload.projectType).toLowerCase();
  const keyCommandsRaw = payload.keyCommands;
  const keyCommands = Array.isArray(keyCommandsRaw)
    ? keyCommandsRaw.map((entry) => toSafeText(entry)).filter(Boolean).join("\n")
    : toSafeText(keyCommandsRaw);
  return {
    projectType:
      projectTypeRaw === "new" || projectTypeRaw === "legacy"
        ? projectTypeRaw
        : inferProjectType(input.files, input.provider),
    domain: toSafeText(payload.domain),
    architecture: toSafeText(payload.architecture),
    constraints: toSafeText(payload.constraints),
    keyCommands,
    owners: toSafeText(payload.owners),
    summary: toSafeText(payload.summary) || "Generated by selected agent",
  };
}

function extractJsonObject(raw: string) {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildProjectInfoPrompt(input: {
  workspaceName: string | null;
  files: string[];
  directories: string[];
  provider: "openspec" | "speckit" | "unknown";
}) {
  const topDirs = [...new Set(input.directories.map((entry) => entry.split("/")[0] || entry))]
    .filter(Boolean)
    .slice(0, 16);
  const sampleFiles = input.files.slice(0, 40);
  const workspaceLabel = input.workspaceName?.trim() || "current-workspace";

  return [
    "You are generating OpenSpec project context.",
    "Return ONLY valid JSON with keys:",
    "projectType, domain, architecture, constraints, keyCommands, owners, summary",
    "Rules:",
    '- projectType must be "legacy" or "new".',
    "- keyCommands should be an array of shell command strings.",
    "- Keep content concise, practical, and repository-specific.",
    "",
    `Workspace: ${workspaceLabel}`,
    `Detected provider: ${input.provider}`,
    `Top-level directories: ${topDirs.join(", ") || "N/A"}`,
    `Sample files: ${sampleFiles.join(", ") || "N/A"}`,
  ].join("\n");
}

function engineDisplayName(engine: ProjectAgent) {
  if (engine === "claude") return "Claude Code";
  if (engine === "opencode") return "OpenCode";
  return "Codex";
}

const PROJECT_AGENT_OPTIONS: ProjectAgent[] = ["codex", "claude", "opencode"];
const ACTION_BLOCKERS_COLLAPSE_COUNT = 3;

function isSupportedProposalImagePath(path: string) {
  const normalized = path.trim().toLowerCase();
  return PROPOSAL_ALLOWED_IMAGE_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function readDataUrlMime(dataUrl: string) {
  const matched = dataUrl.match(/^data:([^;,]+)[;,]/i);
  return matched?.[1]?.toLowerCase() ?? "";
}

function estimateDataUrlBytes(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    return 0;
  }
  const base64 = dataUrl.slice(commaIndex + 1).trim();
  if (!base64) {
    return 0;
  }
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

function proposalAttachmentLabel(path: string, index: number) {
  if (path.startsWith("data:")) {
    return `pasted-image-${index + 1}`;
  }
  const normalized = path.replace(/\\/g, "/").trim();
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

function buildActionPreviewWithoutChange(actionKey: SpecHubActionKey) {
  switch (actionKey) {
    case "continue":
      return "openspec instructions specs --change '<change-id>'";
    case "apply":
      return "openspec instructions tasks --change '<change-id>'";
    case "verify":
      return "openspec validate '<change-id>' --strict";
    case "archive":
      return "openspec archive '<change-id>' --yes";
    default:
      return "openspec --help";
  }
}

function isAbsoluteSpecRootPath(path: string) {
  return isAbsoluteSpecRootInput(path);
}

function buildArchiveTakeoverPrompt(input: {
  workspaceName: string | null;
  changeId: string;
  specRoot: string;
  blockers: string[];
  latestArchiveOutput: string | null;
}) {
  const workspaceLabel = input.workspaceName?.trim() || "current-workspace";
  const blockerLines =
    input.blockers.length > 0 ? input.blockers.map((entry) => `- ${entry}`).join("\n") : "- none";
  const archiveOutput = input.latestArchiveOutput?.trim() || "(no archive output captured in timeline)";

  return [
    "You are an OpenSpec archive-unblock agent.",
    "Goal: make this change archivable by fixing spec delta compatibility only.",
    "",
    `Workspace: ${workspaceLabel}`,
    `Change: ${input.changeId}`,
    `Spec root: ${input.specRoot}`,
    "",
    "Observed blockers:",
    blockerLines,
    "",
    "Latest archive output:",
    archiveOutput,
    "",
    "Must-do steps:",
    "1) Inspect openspec/changes/<change>/specs/*.md versus openspec/specs/* targets.",
    "2) Resolve MODIFIED/RENAMED header mismatches by editing change deltas to valid operations (e.g., ADDED when target header is absent).",
    `3) Run: openspec validate ${input.changeId} --strict`,
    "4) Do NOT run archive command.",
    "",
    "Return:",
    "- changed files",
    "- why each change is needed",
    "- final validate result",
  ].join("\n");
}

function buildProposalExecutionPrompt(input: {
  mode: ProposalDraftMode;
  content: string;
  attachments: string[];
  targetChangeId: string | null;
  specRoot: string;
  workspaceName: string | null;
}) {
  const workspaceLabel = input.workspaceName?.trim() || "current-workspace";
  const scopeInstruction =
    input.mode === "create"
      ? [
          "Goal:",
          "- Create a new OpenSpec change under openspec/changes.",
          "- Create or update proposal/design/tasks artifacts as needed for this request.",
          "- Pick a clear, kebab-case change id.",
        ].join("\n")
      : [
          "Goal:",
          `- Append and refine proposal content for existing change: ${input.targetChangeId ?? "<missing-change-id>"}.`,
          "- Update proposal.md while preserving existing sections and intent.",
          "- If related tasks/spec updates are needed, update them in the same change.",
        ].join("\n");

  return [
    "You are an OpenSpec proposal assistant.",
    "",
    `Workspace: ${workspaceLabel}`,
    `Spec root: ${input.specRoot}`,
    `Mode: ${input.mode}`,
    scopeInstruction,
    "",
    "User request:",
    input.content.trim(),
    "",
    "Attachment context:",
    input.attachments.length > 0
      ? [
          `${input.attachments.length} image attachment(s) are included with this request.`,
          "Use uploaded images as additional context when drafting proposal updates.",
          ...input.attachments
            .slice(0, 6)
            .map((attachment, index) => `- image[${index + 1}]: ${proposalAttachmentLabel(attachment, index)}`),
        ].join("\n")
      : "No image attachments.",
    "",
    "Execution rules:",
    "- Use full-access tools and edit files directly in this workspace.",
    "- Keep structure clear and concise; avoid duplication.",
    "- Return JSON only, no markdown fence.",
    "",
    "Return schema:",
    "{",
    '  "summary": "one-line summary",',
    '  "change_id": "change-id-if-known",',
    '  "updated_files": ["relative/path.md"]',
    "}",
  ].join("\n");
}

function buildVerifyAutoCompletionPrompt(input: {
  workspaceName: string | null;
  changeId: string;
  specRoot: string;
}) {
  const workspaceLabel = input.workspaceName?.trim() || "current-workspace";
  const verificationPath = `openspec/changes/${input.changeId}/verification.md`;
  return [
    "You are an OpenSpec verification completion assistant.",
    "",
    `Workspace: ${workspaceLabel}`,
    `Change: ${input.changeId}`,
    `Spec root: ${input.specRoot}`,
    "",
    "Goal:",
    `- Create or update ${verificationPath} with verification evidence for this change before strict validate.`,
    "",
    "Must-do steps:",
    "1) Read proposal/design/tasks/specs under this change and gather current implementation evidence.",
    "2) Write verification.md with concise sections: Scope, Checks Run, Results, Risks/Follow-ups.",
    "3) Do NOT fabricate command output; if evidence is missing, mark TODO explicitly.",
    "4) Keep content factual and directly useful for reviewers.",
    "",
    "Return JSON only:",
    "{",
    '  "summary": "one-line summary",',
    `  "verification_path": "${verificationPath}"`,
    "}",
  ].join("\n");
}

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toTrimmedStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function normalizeRecommendedNextAction(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "apply" || normalized === "verify" || normalized === "archive" || normalized === "manual-review") {
    return normalized;
  }
  return null;
}

function buildContinueAiEnhancementPrompt(input: {
  workspaceName: string | null;
  changeId: string;
  specRoot: string;
  continueOutput: string;
}) {
  const workspaceLabel = input.workspaceName?.trim() || "current-workspace";
  return [
    "You are an OpenSpec planning assistant.",
    "This is a READ-ONLY analysis task.",
    "Do NOT edit files, do NOT update tasks, do NOT run write operations.",
    "",
    `Workspace: ${workspaceLabel}`,
    `Change: ${input.changeId}`,
    `Spec root: ${input.specRoot}`,
    "",
    "OpenSpec continue output:",
    input.continueOutput.trim() || "(empty)",
    "",
    "Return JSON only with this schema:",
    "{",
    '  "summary": "one-line summary",',
    '  "recommended_next_action": "apply|verify|archive|manual-review",',
    '  "suggested_scope": ["relative/path-or-artifact"],',
    '  "risks": ["risk item"],',
    '  "verification_plan": ["verification step"],',
    '  "execution_sequence": ["step 1", "step 2"]',
    "}",
  ].join("\n");
}

function parseContinueBriefOutput(
  rawOutput: string,
  context: { changeId: string; specRoot: string; generatedAt: number },
): ContinueBriefEntry {
  const payload = extractJsonObject(rawOutput);
  const summary = toTrimmedText(payload?.summary) || toTrimmedText(payload?.result) || toTrimmedText(payload?.message);
  const recommended = normalizeRecommendedNextAction(
    toTrimmedText(payload?.recommended_next_action) || toTrimmedText(payload?.recommendedNextAction),
  );
  const suggestedScope = toTrimmedStringArray(payload?.suggested_scope ?? payload?.suggestedScope);
  const risks = toTrimmedStringArray(payload?.risks);
  const verificationPlan = toTrimmedStringArray(payload?.verification_plan ?? payload?.verificationPlan);
  const executionSequence = toTrimmedStringArray(payload?.execution_sequence ?? payload?.executionSequence);

  return {
    summary: summary || "Continue guidance analyzed.",
    recommendedNextAction: recommended,
    suggestedScope,
    risks,
    verificationPlan,
    executionSequence,
    generatedAt: context.generatedAt,
    rawOutput: rawOutput.trim(),
    changeId: context.changeId,
    specRoot: context.specRoot,
  };
}

function buildActionNextStepHint(
  actionKey: SpecHubActionKey,
  blockers: string[],
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (actionKey === "apply" && blockers.some((entry) => entry.includes("Run continue first to generate specs delta"))) {
    return t("specHub.nextStep.runContinueFirst");
  }
  if (
    (actionKey === "verify" || actionKey === "archive") &&
    blockers.some((entry) =>
      ["Core artifacts are incomplete", "Missing design.md", "Missing tasks.md", "Missing specs delta"].includes(entry),
    )
  ) {
    return t("specHub.nextStep.runContinueThenApply");
  }
  return null;
}

function isAiTakeoverBlockerFixable(blocker: string) {
  return AI_TAKEOVER_BLOCKER_PREFIX.test(blocker.trim());
}

function isAiTakeoverFailureFixable(output: string) {
  const normalized = output.trim();
  if (!normalized) {
    return false;
  }

  if (AI_TAKEOVER_NON_FIXABLE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return AI_TAKEOVER_FIXABLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function formatDurationLabel(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function buildFeedbackLinkGeometry(input: {
  continuePosition: FloatingPosition;
  applyPosition: FloatingPosition;
}) {
  const startX = input.continuePosition.x + APPLY_FEEDBACK_FLOATING_WIDTH + 8;
  const startY = input.continuePosition.y + 92;
  const endX = input.applyPosition.x - 8;
  const endY = input.applyPosition.y + 92;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const length = Math.hypot(deltaX, deltaY);
  if (!Number.isFinite(length) || length < 24) {
    return null;
  }
  const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
  return {
    left: startX,
    top: startY,
    width: length,
    angle,
  };
}

async function inspectChangeArtifactsPresence(input: {
  workspaceId: string;
  changeId: string;
  customSpecRoot?: string | null;
}) {
  const normalizedSpecRoot = normalizeSpecRootInput(input.customSpecRoot ?? null);
  const snapshot = normalizedSpecRoot
    ? await listExternalSpecTree(input.workspaceId, normalizedSpecRoot)
    : await getWorkspaceFiles(input.workspaceId);
  const files = snapshot.files ?? [];
  const base = `openspec/changes/${input.changeId}`;
  const proposalPath = `${base}/proposal.md`;
  const designPath = `${base}/design.md`;
  const tasksPath = `${base}/tasks.md`;
  const verificationPath = `${base}/verification.md`;
  const specPaths = files
    .filter((entry) => entry.startsWith(`${base}/specs/`) && entry.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right));
  return {
    proposalPath,
    designPath,
    tasksPath,
    verificationPath,
    proposalExists: files.includes(proposalPath),
    designExists: files.includes(designPath),
    tasksExists: files.includes(tasksPath),
    verificationExists: files.includes(verificationPath),
    specPaths,
    specsExists: specPaths.length > 0,
  };
}

function isGuidanceActionKey(value: string): value is GuidanceActionKey {
  return value === "continue" || value === "apply";
}

function detectGuidanceNoSuggestion(output: string) {
  const normalized = output.trim();
  if (!normalized) {
    return true;
  }
  return GUIDANCE_NO_SUGGESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

type GuidanceSummary = {
  noSuggestion: boolean;
  highlights: string[];
  raw: string;
  isTemplate: boolean;
  artifactId: string | null;
  artifactChange: string | null;
  artifactSchema: string | null;
  taskText: string | null;
};

function extractXmlAttr(tag: string, name: string) {
  const pattern = new RegExp(`${name}="([^"]+)"`, "i");
  const matched = tag.match(pattern);
  return matched?.[1]?.trim() ?? null;
}

function normalizeFreeText(input: string) {
  return input
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(input: string, max = 180) {
  if (input.length <= max) {
    return input;
  }
  return `${input.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function sanitizeGuidanceRawOutput(output: string) {
  let text = output.trim();
  const removedTags: string[] = [];

  if (!text) {
    return {
      text: "",
      removedTags,
    };
  }

  for (const tag of GUIDANCE_RAW_COLLAPSE_TAGS) {
    const pattern = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "ig");
    if (pattern.test(text)) {
      removedTags.push(tag);
      pattern.lastIndex = 0;
      text = text.replace(pattern, `<${tag}>...collapsed in compact view...</${tag}>`);
    }
  }

  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return {
    text,
    removedTags,
  };
}

function summarizeGuidanceOutput(output: string) {
  const normalized = output.trim();
  if (!normalized) {
    return {
      noSuggestion: true,
      highlights: [],
      raw: "",
      isTemplate: false,
      artifactId: null,
      artifactChange: null,
      artifactSchema: null,
      taskText: null,
    };
  }

  const artifactTagMatch = normalized.match(/<artifact\b[^>]*>/i);
  const taskMatch = normalized.match(/<task>([\s\S]*?)<\/task>/i);
  if (artifactTagMatch) {
    const artifactTag = artifactTagMatch[0];
    const artifactId = extractXmlAttr(artifactTag, "id");
    const artifactChange = extractXmlAttr(artifactTag, "change");
    const artifactSchema = extractXmlAttr(artifactTag, "schema");
    const taskTextRaw = taskMatch ? normalizeFreeText(taskMatch[1] ?? "") : "";
    const taskText = taskTextRaw ? truncateText(taskTextRaw) : null;

    return {
      noSuggestion: false,
      highlights: [],
      raw: normalized,
      isTemplate: true,
      artifactId,
      artifactChange,
      artifactSchema,
      taskText,
    };
  }

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(openspec|specify)\b/i.test(line))
    .filter((line) => !/^task status:\s*/i.test(line))
    .filter((line) => !/^specs to update:\s*/i.test(line))
    .filter((line) => !/^<\?xml|^<!DOCTYPE|^<\/?[a-z0-9_-]+/i.test(line))
    .map((line) => normalizeFreeText(line))
    .filter(Boolean);
  const highlights = lines
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .map((line) => truncateText(line))
    .filter(Boolean)
    .slice(0, 4);

  return {
    noSuggestion: detectGuidanceNoSuggestion(normalized),
    highlights,
    raw: normalized,
    isTemplate: false,
    artifactId: null,
    artifactChange: null,
    artifactSchema: null,
    taskText: null,
  };
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

type TaskRenderLine =
  | { kind: "task"; key: string; item: SpecTaskChecklistItem }
  | { kind: "task-note"; key: string; text: string }
  | { kind: "heading"; key: string; text: string; level: number }
  | { kind: "text"; key: string; text: string }
  | { kind: "blank"; key: string };

function renderTaskInlineFragments(text: string) {
  const parts = text.split(/(`[^`]+`)/g).filter(Boolean);
  if (parts.length === 0) {
    return [text] as ReactNode[];
  }
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`task-code-${index}`}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={`task-text-${index}`}>{part}</span>;
  });
}

function buildTaskRenderLines(content: string, checklist: SpecTaskChecklistItem[]): TaskRenderLine[] {
  const lines = content.split(/\r?\n/);
  const checklistByLine = new Map<number, SpecTaskChecklistItem>();
  checklist.forEach((item) => {
    checklistByLine.set(item.lineNumber, item);
  });
  const rendered: TaskRenderLine[] = [];
  let previousWasTask = false;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index] ?? "";
    const checklistItem = checklistByLine.get(lineNumber);
    if (checklistItem) {
      rendered.push({
        kind: "task",
        key: `task-${lineNumber}`,
        item: checklistItem,
      });
      previousWasTask = true;
      continue;
    }

    const trimmed = rawLine.trim();
    if (!trimmed) {
      rendered.push({ kind: "blank", key: `blank-${lineNumber}` });
      previousWasTask = false;
      continue;
    }

    if (previousWasTask && /^\s{2,}\S/.test(rawLine)) {
      rendered.push({
        kind: "task-note",
        key: `task-note-${lineNumber}`,
        text: trimmed,
      });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch?.[2]) {
      rendered.push({
        kind: "heading",
        key: `heading-${lineNumber}`,
        level: headingMatch[1]?.length ?? 2,
        text: headingMatch[2].trim(),
      });
      previousWasTask = false;
      continue;
    }

    rendered.push({
      kind: "text",
      key: `text-${lineNumber}`,
      text: trimmed,
    });
    previousWasTask = false;
  }

  return rendered;
}

export function SpecHub({
  workspaceId,
  workspaceName,
  files,
  directories,
  onBackToChat,
}: SpecHubProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("proposal");
  const [controlTab, setControlTab] = useState<
    "actions" | "project" | "gate" | "timeline"
  >(
    "project",
  );
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>("all");
  const [expandedAllGroups, setExpandedAllGroups] = useState<Set<string>>(new Set());
  const [expandedArchivedGroups, setExpandedArchivedGroups] = useState<Set<string>>(new Set());
  const [isArtifactMaximized, setIsArtifactMaximized] = useState(false);
  const [isControlPanelCollapsed, setIsControlPanelCollapsed] = useState(false);
  const [selectedSpecPath, setSelectedSpecPath] = useState<string | null>(null);
  const [projectAgent, setProjectAgent] = useState<ProjectAgent>("codex");
  const [applyAgent, setApplyAgent] = useState<ProjectAgent>("codex");
  const [availableAgents, setAvailableAgents] = useState<ProjectAgent[]>(["codex"]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [isGeneratingProjectInfo, setIsGeneratingProjectInfo] = useState(false);
  const [projectGenerationError, setProjectGenerationError] = useState<string | null>(null);
  const [lastGeneratedProjectInfo, setLastGeneratedProjectInfo] = useState<SpecProjectInfoInput | null>(null);
  const [projectContextNotice, setProjectContextNotice] = useState<string | null>(null);
  const [specRootInput, setSpecRootInput] = useState("");
  const [isAiTakeoverRunning, setIsAiTakeoverRunning] = useState(false);
  const [aiTakeoverNotice, setAiTakeoverNotice] = useState<string | null>(null);
  const [aiTakeoverError, setAiTakeoverError] = useState<string | null>(null);
  const [aiTakeoverOutput, setAiTakeoverOutput] = useState<string | null>(null);
  const [aiTakeoverStreamText, setAiTakeoverStreamText] = useState("");
  const [aiTakeoverAutoArchive, setAiTakeoverAutoArchive] = useState(true);
  const [isAiTakeoverArchiving, setIsAiTakeoverArchiving] = useState(false);
  const [aiTakeoverStatus, setAiTakeoverStatus] = useState<AiTakeoverStatus>("idle");
  const [aiTakeoverPhase, setAiTakeoverPhase] = useState<AiTakeoverPhase>("kickoff");
  const [aiTakeoverRefreshState, setAiTakeoverRefreshState] = useState<AiTakeoverRefreshState>("idle");
  const [aiTakeoverLogs, setAiTakeoverLogs] = useState<AiTakeoverLogEntry[]>([]);
  const [aiTakeoverStartedAt, setAiTakeoverStartedAt] = useState<number | null>(null);
  const [aiTakeoverFinishedAt, setAiTakeoverFinishedAt] = useState<number | null>(null);
  const [aiTakeoverTicker, setAiTakeoverTicker] = useState(0);
  const [isAiTakeoverFeedbackClosed, setIsAiTakeoverFeedbackClosed] = useState(false);
  const [isAiTakeoverFeedbackCollapsed, setIsAiTakeoverFeedbackCollapsed] = useState(false);
  const [guidanceRunStartedAt, setGuidanceRunStartedAt] = useState<number | null>(null);
  const [guidanceRunTicker, setGuidanceRunTicker] = useState(0);
  const [guidanceRawExpanded, setGuidanceRawExpanded] = useState(false);
  const [guidanceShowFullRaw, setGuidanceShowFullRaw] = useState(false);
  const [expandedActionBlockers, setExpandedActionBlockers] = useState<Partial<Record<SpecHubActionKey, boolean>>>({});
  const [lastGuidanceAction, setLastGuidanceAction] = useState<GuidanceActionKey | null>(null);
  const [isApplyFeedbackClosed, setIsApplyFeedbackClosed] = useState(false);
  const [isApplyFeedbackCollapsed, setIsApplyFeedbackCollapsed] = useState(false);
  const [isApplyFeedbackDragging, setIsApplyFeedbackDragging] = useState(false);
  const [applyFloatingExecutionSnapshot, setApplyFloatingExecutionSnapshot] = useState(() => EMPTY_APPLY_EXECUTION_VIEW);
  const [applyFeedbackPosition, setApplyFeedbackPosition] = useState<FloatingPosition>(
    () => getInitialFloatingPosition(),
  );
  const [proposalDraftMode, setProposalDraftMode] = useState<ProposalDraftMode | null>(null);
  const [proposalDraftContent, setProposalDraftContent] = useState("");
  const [proposalDraftImages, setProposalDraftImages] = useState<string[]>([]);
  const [proposalTargetChangeId, setProposalTargetChangeId] = useState<string | null>(null);
  const [proposalDraftError, setProposalDraftError] = useState<string | null>(null);
  const [verifyAutoCompleteEnabled, setVerifyAutoCompleteEnabled] = useState(false);
  const [verifyAutoCompleteError, setVerifyAutoCompleteError] = useState<string | null>(null);
  const [isVerifyAutoCompleting, setIsVerifyAutoCompleting] = useState(false);
  const [continueAiEnhancementEnabled, setContinueAiEnhancementEnabled] = useState(false);
  const [isContinueAiEnhancing, setIsContinueAiEnhancing] = useState(false);
  const [continueBriefByScope, setContinueBriefByScope] = useState<Record<string, ContinueBriefEntry>>({});
  const [applyUseContinueBrief, setApplyUseContinueBrief] = useState(true);
  const [continueAiEnhancementExecution, setContinueAiEnhancementExecution] =
    useState<ContinueAiEnhancementExecutionState>(EMPTY_CONTINUE_AI_ENHANCEMENT_EXECUTION);
  const [isContinueAiEnhancementFeedbackClosed, setIsContinueAiEnhancementFeedbackClosed] = useState(false);
  const [isContinueAiEnhancementFeedbackCollapsed, setIsContinueAiEnhancementFeedbackCollapsed] = useState(false);
  const [isContinueAutoApplyFlow, setIsContinueAutoApplyFlow] = useState(false);
  const [autoComboGuardExecution, setAutoComboGuardExecution] =
    useState<AutoComboGuardExecutionState>(EMPTY_AUTO_COMBO_GUARD_EXECUTION);
  const [isAutoComboGuardFeedbackClosed, setIsAutoComboGuardFeedbackClosed] = useState(false);
  const [isAutoComboGuardFeedbackCollapsed, setIsAutoComboGuardFeedbackCollapsed] = useState(false);
  const [autoComboGuardPosition, setAutoComboGuardPosition] = useState<FloatingPosition>(
    () => buildSequentialFloatingPositions(3)[2] ?? getInitialFloatingPosition(),
  );
  const [isAutoComboGuardFeedbackDragging, setIsAutoComboGuardFeedbackDragging] = useState(false);
  const [verifyAutoCompleteExecution, setVerifyAutoCompleteExecution] = useState<VerifyAutoCompleteExecutionState>(
    EMPTY_VERIFY_AUTO_COMPLETE_EXECUTION,
  );
  const [isVerifyAutoCompleteFeedbackClosed, setIsVerifyAutoCompleteFeedbackClosed] = useState(false);
  const [isVerifyAutoCompleteFeedbackCollapsed, setIsVerifyAutoCompleteFeedbackCollapsed] = useState(false);
  const [proposalExecution, setProposalExecution] = useState<ProposalExecutionState>(EMPTY_PROPOSAL_EXECUTION);
  const [isProposalFeedbackClosed, setIsProposalFeedbackClosed] = useState(false);
  const [isProposalFeedbackCollapsed, setIsProposalFeedbackCollapsed] = useState(false);
  const [agentFeedbackPosition, setAgentFeedbackPosition] = useState<FloatingPosition>(() => getInitialFloatingPosition());
  const [isAgentFeedbackDragging, setIsAgentFeedbackDragging] = useState(false);
  const previousRunningActionRef = useRef<SpecHubActionKey | null>(null);
  const previousApplyExecutionStartRef = useRef<number | null>(null);
  const applyFeedbackDragCleanupRef = useRef<(() => void) | null>(null);
  const agentFeedbackDragCleanupRef = useRef<(() => void) | null>(null);
  const autoComboGuardDragCleanupRef = useRef<(() => void) | null>(null);
  const proposalStreamRef = useRef<HTMLElement | null>(null);
  const proposalLogsRef = useRef<HTMLElement | null>(null);
  const continueStreamRef = useRef<HTMLElement | null>(null);
  const continueLogsRef = useRef<HTMLElement | null>(null);
  const verifyStreamRef = useRef<HTMLElement | null>(null);
  const verifyLogsRef = useRef<HTMLElement | null>(null);
  const applyStreamRef = useRef<HTMLElement | null>(null);
  const applyLogsRef = useRef<HTMLElement | null>(null);
  const aiTakeoverStreamRef = useRef<HTMLElement | null>(null);
  const aiTakeoverLogsRef = useRef<HTMLElement | null>(null);
  const autoComboStreamRef = useRef<HTMLElement | null>(null);
  const autoComboLogsRef = useRef<HTMLElement | null>(null);

  const {
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
    setCustomSpecRoot,
    switchMode,
  } = useSpecHub({
    workspaceId,
    files,
    directories,
  });

  const providerLabel = useMemo(() => {
    return translateProviderName(snapshot.provider, t);
  }, [snapshot.provider, t]);

  const filteredChanges = useMemo(() => {
    if (changeFilter === "blocked") {
      return snapshot.changes.filter((entry) => entry.status === "blocked");
    }
    if (changeFilter === "archived") {
      return snapshot.changes.filter((entry) => entry.status === "archived");
    }
    if (changeFilter === "active") {
      return snapshot.changes.filter(
        (entry) => entry.status !== "archived" && entry.status !== "blocked",
      );
    }
    return snapshot.changes;
  }, [changeFilter, snapshot.changes]);
  const allChangeGroups = useMemo(() => {
    if (changeFilter !== "all") {
      return [];
    }
    return groupChangesByDatePrefix(filteredChanges, t("specHub.archivedGroups.other"));
  }, [changeFilter, filteredChanges, t]);
  const archivedChangeGroups = useMemo(() => {
    if (changeFilter !== "archived") {
      return [];
    }
    return groupChangesByDatePrefix(filteredChanges, t("specHub.archivedGroups.other"));
  }, [changeFilter, filteredChanges, t]);

  useEffect(() => {
    if (changeFilter !== "all") {
      return;
    }
    setExpandedAllGroups((previous) => {
      const currentKeys = allChangeGroups.map((group) => group.key);
      if (currentKeys.length === 0) {
        return new Set();
      }
      const hasPreviousSelection = previous.size > 0;
      const next = new Set<string>();
      currentKeys.forEach((key) => {
        if (!hasPreviousSelection || previous.has(key)) {
          next.add(key);
        }
      });
      return next;
    });
  }, [allChangeGroups, changeFilter]);

  useEffect(() => {
    if (changeFilter !== "archived") {
      return;
    }
    setExpandedArchivedGroups((previous) => {
      const currentKeys = archivedChangeGroups.map((group) => group.key);
      if (currentKeys.length === 0) {
        return new Set();
      }
      const hasPreviousSelection = previous.size > 0;
      const next = new Set<string>();
      currentKeys.forEach((key) => {
        if (!hasPreviousSelection || previous.has(key)) {
          next.add(key);
        }
      });
      return next;
    });
  }, [archivedChangeGroups, changeFilter]);
  const groupedChanges = changeFilter === "all" ? allChangeGroups : archivedChangeGroups;
  const expandedGroupedKeys = changeFilter === "all" ? expandedAllGroups : expandedArchivedGroups;
  const hasGroupedView = changeFilter === "all" || changeFilter === "archived";
  const areAllGroupsExpanded = groupedChanges.length > 0 && groupedChanges.every((group) => expandedGroupedKeys.has(group.key));
  const isExpandCollapseDisabled = groupedChanges.length === 0;

  const handleToggleSingleGroup = useCallback(
    (groupKey: string) => {
      if (changeFilter === "all") {
        setExpandedAllGroups((previous) => {
          const next = new Set(previous);
          if (next.has(groupKey)) {
            next.delete(groupKey);
          } else {
            next.add(groupKey);
          }
          return next;
        });
        return;
      }
      if (changeFilter === "archived") {
        setExpandedArchivedGroups((previous) => {
          const next = new Set(previous);
          if (next.has(groupKey)) {
            next.delete(groupKey);
          } else {
            next.add(groupKey);
          }
          return next;
        });
      }
    },
    [changeFilter],
  );

  const handleToggleAllGroups = useCallback(() => {
    if (!hasGroupedView || groupedChanges.length === 0) {
      return;
    }
    const next = areAllGroupsExpanded ? new Set<string>() : new Set(groupedChanges.map((group) => group.key));
    if (changeFilter === "all") {
      setExpandedAllGroups(next);
      return;
    }
    setExpandedArchivedGroups(next);
  }, [areAllGroupsExpanded, changeFilter, groupedChanges, hasGroupedView]);

  useEffect(() => {
    setExpandedActionBlockers({});
  }, [selectedChange?.id]);
  const appendableChanges = useMemo(
    () => snapshot.changes.filter((entry) => entry.status !== "archived"),
    [snapshot.changes],
  );

  const gateVariant = gate.status === "pass" ? "secondary" : "outline";
  const GateHeaderIcon = gate.status === "pass" ? ShieldCheck : gate.status === "warn" ? TriangleAlert : XCircle;
  const providerBadgeClass =
    snapshot.provider === "openspec"
      ? "spec-hub-badge-provider-openspec"
      : snapshot.provider === "speckit"
        ? "spec-hub-badge-provider-speckit"
        : "spec-hub-badge-provider-unknown";
  const supportBadgeClass =
    snapshot.supportLevel === "full"
      ? "spec-hub-badge-support-full"
      : snapshot.supportLevel === "minimal"
        ? "spec-hub-badge-support-minimal"
        : "spec-hub-badge-support-none";
  const specSources = useMemo(() => artifacts.specs.sources ?? [], [artifacts.specs.sources]);
  const taskChecklist = useMemo(() => artifacts.tasks.taskChecklist ?? [], [artifacts.tasks.taskChecklist]);
  const taskRenderLines = useMemo(
    () => buildTaskRenderLines(artifacts.tasks.content, taskChecklist),
    [artifacts.tasks.content, taskChecklist],
  );
  const selectedSpecSource = useMemo(() => {
    if (specSources.length === 0) {
      return null;
    }
    return specSources.find((entry) => entry.path === selectedSpecPath) ?? specSources[0] ?? null;
  }, [selectedSpecPath, specSources]);

  useEffect(() => {
    if (specSources.length === 0) {
      setSelectedSpecPath(null);
      return;
    }
    if (!selectedSpecPath || !specSources.some((entry) => entry.path === selectedSpecPath)) {
      setSelectedSpecPath(specSources[0]?.path ?? null);
    }
  }, [selectedSpecPath, specSources]);

  useEffect(() => {
    if (appendableChanges.length === 0) {
      setProposalTargetChangeId(null);
      return;
    }
    setProposalTargetChangeId((prev) => {
      if (prev && appendableChanges.some((entry) => entry.id === prev)) {
        return prev;
      }
      if (selectedChange?.id && appendableChanges.some((entry) => entry.id === selectedChange.id)) {
        return selectedChange.id;
      }
      return appendableChanges[0]?.id ?? null;
    });
  }, [appendableChanges, selectedChange?.id]);

  useEffect(() => {
    setVerifyAutoCompleteError(null);
    setIsVerifyAutoCompleting(false);
  }, [selectedChange?.id]);

  useEffect(() => {
    setControlTab("project");
    setProjectAgent("codex");
    setApplyAgent("codex");
    setAvailableAgents(["codex"]);
    setLastGeneratedProjectInfo(null);
    setProjectGenerationError(null);
    setProjectContextNotice(null);
    setAiTakeoverNotice(null);
    setAiTakeoverError(null);
    setAiTakeoverOutput(null);
    setAiTakeoverStreamText("");
    setAiTakeoverStatus("idle");
    setAiTakeoverPhase("kickoff");
    setAiTakeoverRefreshState("idle");
    setAiTakeoverLogs([]);
    setAiTakeoverStartedAt(null);
    setAiTakeoverFinishedAt(null);
    setAiTakeoverTicker(0);
    setAiTakeoverAutoArchive(true);
    setIsAiTakeoverArchiving(false);
    setIsAiTakeoverFeedbackClosed(false);
    setIsAiTakeoverFeedbackCollapsed(false);
    setIsApplyFeedbackClosed(false);
    setIsApplyFeedbackCollapsed(false);
    setIsApplyFeedbackDragging(false);
    setApplyFeedbackPosition(getInitialFloatingPosition());
    setProposalDraftMode(null);
    setProposalDraftContent("");
    setProposalDraftImages([]);
    setProposalTargetChangeId(null);
    setProposalDraftError(null);
    setVerifyAutoCompleteEnabled(false);
    setVerifyAutoCompleteError(null);
    setIsVerifyAutoCompleting(false);
    setContinueAiEnhancementEnabled(false);
    setIsContinueAiEnhancing(false);
    setContinueBriefByScope({});
    setApplyUseContinueBrief(true);
    setContinueAiEnhancementExecution(EMPTY_CONTINUE_AI_ENHANCEMENT_EXECUTION);
    setIsContinueAiEnhancementFeedbackClosed(false);
    setIsContinueAiEnhancementFeedbackCollapsed(false);
    setIsContinueAutoApplyFlow(false);
    setAutoComboGuardExecution(EMPTY_AUTO_COMBO_GUARD_EXECUTION);
    setIsAutoComboGuardFeedbackClosed(false);
    setIsAutoComboGuardFeedbackCollapsed(false);
    setIsAutoComboGuardFeedbackDragging(false);
    setAutoComboGuardPosition(buildSequentialFloatingPositions(3)[2] ?? getInitialFloatingPosition());
    setProposalExecution(EMPTY_PROPOSAL_EXECUTION);
    setIsProposalFeedbackClosed(false);
    setIsProposalFeedbackCollapsed(false);
    previousApplyExecutionStartRef.current = null;
  }, [workspaceId]);

  useEffect(() => {
    if (!isAiTakeoverRunning || !aiTakeoverStartedAt) {
      return;
    }
    const timer = window.setInterval(() => {
      setAiTakeoverTicker((value) => value + 1);
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [aiTakeoverStartedAt, isAiTakeoverRunning]);

  useEffect(() => {
    setSpecRootInput(customSpecRoot ?? "");
  }, [customSpecRoot]);

  const showBootstrapGuide = snapshot.provider === "unknown";
  const showProjectContextPanel = showBootstrapGuide || snapshot.provider === "openspec";
  const contextSubmitting =
    isGeneratingProjectInfo || (showBootstrapGuide ? isBootstrapping : isSavingProjectInfo);
  const contextError = projectGenerationError || (showBootstrapGuide ? bootstrapError : projectInfoError);
  const contextCommandPreview = showBootstrapGuide
    ? "openspec init --tools none [--force]"
    : "write openspec/project.md";
  const activeSpecRootDisplay = snapshot.specRoot?.path ?? "openspec";
  const isUsingCustomSpecRoot = snapshot.specRoot?.source === "custom";
  const isTaskUpdateRunning = isUpdatingTaskIndex !== null;

  const actionsForEmptySelection = useMemo(
    () => (["continue", "apply", "verify", "archive"] as const).map((key) => ({ key })),
    [],
  );
  const selectedChangeId = selectedChange?.id ?? null;
  const continueBriefScopeKey = selectedChangeId ? `${selectedChangeId}::${activeSpecRootDisplay}` : null;
  const currentContinueBrief = continueBriefScopeKey ? continueBriefByScope[continueBriefScopeKey] ?? null : null;
  const continueBriefGeneratedAt = currentContinueBrief?.generatedAt ?? null;
  const continueBriefAgeMs =
    continueBriefGeneratedAt === null ? null : Math.max(0, Date.now() - continueBriefGeneratedAt);
  const continueBriefStaleByAge = continueBriefAgeMs !== null && continueBriefAgeMs > CONTINUE_BRIEF_STALE_MS;
  const continueBriefStaleByChangeTime =
    continueBriefGeneratedAt !== null &&
    (selectedChange?.updatedAt ?? 0) > 0 &&
    (selectedChange?.updatedAt ?? 0) > continueBriefGeneratedAt + 1000;
  const isCurrentContinueBriefStale = continueBriefStaleByAge || continueBriefStaleByChangeTime;
  useEffect(() => {
    if (!continueBriefScopeKey) {
      setApplyUseContinueBrief(false);
      return;
    }
    setApplyUseContinueBrief(Boolean(continueBriefByScope[continueBriefScopeKey]));
  }, [continueBriefByScope, continueBriefScopeKey]);
  const runningGuidanceAction: GuidanceActionKey | null =
    isRunningAction && isGuidanceActionKey(isRunningAction) ? isRunningAction : null;
  const archiveAction = useMemo(
    () => actions.find((entry) => entry.key === "archive") ?? null,
    [actions],
  );
  const latestArchiveFailure = useMemo(() => {
    if (!selectedChangeId) {
      return null;
    }
    return (
      timeline.find(
        (entry) => entry.action === "archive" && entry.command.includes(selectedChangeId) && !entry.success,
      ) ?? null
    );
  }, [selectedChangeId, timeline]);
  const latestGuidanceEvent = useMemo(() => {
    if (!selectedChangeId) {
      return null;
    }
    return (
      timeline.find(
        (entry) =>
          entry.kind === "action" &&
          isGuidanceActionKey(entry.action) &&
          entry.command.includes(selectedChangeId),
      ) ?? null
    );
  }, [selectedChangeId, timeline]);
  const latestGuidanceAction = latestGuidanceEvent && isGuidanceActionKey(latestGuidanceEvent.action)
    ? latestGuidanceEvent.action
    : null;
  const activeGuidanceAction = runningGuidanceAction ?? latestGuidanceAction ?? lastGuidanceAction;
  const guidanceStatus: "idle" | "running" | "success" | "failed" = runningGuidanceAction
    ? "running"
    : latestGuidanceEvent
      ? latestGuidanceEvent.success
        ? "success"
        : "failed"
      : "idle";
  const guidanceOutput = latestGuidanceEvent?.output ?? "";
  const guidanceSummary: GuidanceSummary = useMemo(
    () => summarizeGuidanceOutput(guidanceOutput),
    [guidanceOutput],
  );
  const guidanceRawSanitized = useMemo(
    () => sanitizeGuidanceRawOutput(guidanceOutput),
    [guidanceOutput],
  );
  const guidanceRawText = guidanceShowFullRaw ? guidanceOutput : guidanceRawSanitized.text;
  const guidanceActionLabel = activeGuidanceAction ? t(`specHub.action.${activeGuidanceAction}`) : "--";
  const guidanceStatusLabel = t(`specHub.aiTakeover.status.${guidanceStatus}`);
  const guidanceTimeLabel = latestGuidanceEvent
    ? new Date(latestGuidanceEvent.at).toLocaleTimeString()
    : "--";
  const guidanceNextActionKey: SpecHubActionKey | null =
    activeGuidanceAction === "continue" ? "apply" : activeGuidanceAction === "apply" ? "verify" : null;
  const guidanceNextAction = useMemo(
    () => (guidanceNextActionKey ? actions.find((entry) => entry.key === guidanceNextActionKey) ?? null : null),
    [actions, guidanceNextActionKey],
  );
  const latestVerifyEventForSelected = useMemo(() => {
    if (!selectedChangeId) {
      return null;
    }
    return (
      timeline.find((entry) => entry.kind === "validate" && entry.command.includes(selectedChangeId)) ?? null
    );
  }, [selectedChangeId, timeline]);
  const verifyStateForSelected = useMemo(
    () =>
      latestVerifyEventForSelected
        ? {
            ran: true,
            success: latestVerifyEventForSelected.success,
          }
        : {
            ran: false,
            success: false,
          },
    [latestVerifyEventForSelected],
  );
  const aiTakeoverBlockers = useMemo(
    () => archiveAction?.blockers ?? [],
    [archiveAction],
  );
  const aiTakeoverRelevantBlockers = useMemo(
    () => aiTakeoverBlockers.filter((entry) => isAiTakeoverBlockerFixable(entry)),
    [aiTakeoverBlockers],
  );
  const latestArchiveFailureOutputForAi = useMemo(() => {
    const output = latestArchiveFailure?.output?.trim();
    if (!output) {
      return null;
    }
    return isAiTakeoverFailureFixable(output) ? output : null;
  }, [latestArchiveFailure]);
  const hasAiTakeoverProblem =
    aiTakeoverRelevantBlockers.length > 0 || Boolean(latestArchiveFailureOutputForAi);
  const showAiTakeoverPanel =
    snapshot.provider === "openspec" &&
    Boolean(selectedChangeId) &&
    selectedChange?.status !== "archived" &&
    verifyStateForSelected.ran &&
    hasAiTakeoverProblem;
  const aiTakeoverPhaseIndex = AI_TAKEOVER_PHASES.indexOf(aiTakeoverPhase);
  const aiTakeoverElapsedMs = useMemo(() => {
    if (!aiTakeoverStartedAt) {
      return null;
    }
    const endAt = aiTakeoverFinishedAt ?? (aiTakeoverStartedAt + aiTakeoverTicker * 1000);
    return Math.max(0, endAt - aiTakeoverStartedAt);
  }, [aiTakeoverFinishedAt, aiTakeoverStartedAt, aiTakeoverTicker]);
  const guidanceElapsedMs = useMemo(() => {
    if (guidanceStatus !== "running" || !guidanceRunStartedAt) {
      return null;
    }
    return Math.max(0, guidanceRunTicker * 1000);
  }, [guidanceRunStartedAt, guidanceRunTicker, guidanceStatus]);
  const guidanceElapsedLabel = guidanceElapsedMs === null ? null : formatDurationLabel(guidanceElapsedMs);
  const aiTakeoverElapsedLabel = aiTakeoverElapsedMs === null ? null : formatDurationLabel(aiTakeoverElapsedMs);
  const showApplyExecutionPanel = applyExecution.status !== "idle";
  const activeApplyExecution = showApplyExecutionPanel ? applyExecution : applyFloatingExecutionSnapshot;
  const hasActiveApplyExecution = activeApplyExecution.status !== "idle";
  const applyExecutionStatusLabel = t(`specHub.applyExecution.status.${activeApplyExecution.status}`);
  const applyExecutionPhaseLabel = t(`specHub.applyExecution.phase.${activeApplyExecution.phase}`);
  const showApplyExecutionFloating = hasActiveApplyExecution && !isApplyFeedbackClosed;
  const isProposalRunning = proposalExecution.status === "running";
  const isVerifyAutoCompleteBusy = isVerifyAutoCompleting || isRunningAction !== null || isProposalRunning;
  const isActionDispatchBusy = isVerifyAutoCompleteBusy || isContinueAiEnhancing;
  const showContinueAiEnhancementFloating =
    continueAiEnhancementExecution.status !== "idle" && !isContinueAiEnhancementFeedbackClosed;
  const continueAiEnhancementStatusLabel = t(
    `specHub.continueAiEnhancement.status.${continueAiEnhancementExecution.status}`,
  );
  const continueAiEnhancementPhaseLabel = t(
    `specHub.continueAiEnhancement.phase.${continueAiEnhancementExecution.phase}`,
  );
  const showAutoComboGuardFloating =
    autoComboGuardExecution.status !== "idle" && !isAutoComboGuardFeedbackClosed;
  const autoComboGuardStatusLabel = t(`specHub.autoCombo.status.${autoComboGuardExecution.status}`);
  const autoComboGuardPhaseLabel = t(`specHub.autoCombo.phase.${autoComboGuardExecution.phase}`);
  const showProposalExecutionFloating = proposalExecution.status !== "idle" && !isProposalFeedbackClosed;
  const proposalExecutionStatusLabel = t(`specHub.proposal.status.${proposalExecution.status}`);
  const proposalExecutionPhaseLabel = t(`specHub.proposal.phase.${proposalExecution.phase}`);
  const proposalModeLabel =
    proposalExecution.mode === "append" ? t("specHub.proposal.modeAppend") : t("specHub.proposal.modeCreate");
  const showVerifyAutoCompleteFloating =
    verifyAutoCompleteExecution.status !== "idle" && !isVerifyAutoCompleteFeedbackClosed;
  const verifyAutoCompleteStatusLabel = t(
    `specHub.verifyAutoComplete.status.${verifyAutoCompleteExecution.status}`,
  );
  const verifyAutoCompletePhaseLabel = t(
    `specHub.verifyAutoComplete.phase.${verifyAutoCompleteExecution.phase}`,
  );
  const applyDurationLabel = activeApplyExecution.startedAt
    ? formatDurationLabel(
        Math.max(
          0,
          (activeApplyExecution.finishedAt ?? Date.now()) - activeApplyExecution.startedAt,
        ),
      )
    : null;
  const proposalDurationLabel = proposalExecution.startedAt
    ? formatDurationLabel(
        Math.max(0, (proposalExecution.finishedAt ?? Date.now()) - proposalExecution.startedAt),
      )
    : null;
  const verifyDurationLabel = verifyAutoCompleteExecution.startedAt
    ? formatDurationLabel(
        Math.max(
          0,
          (verifyAutoCompleteExecution.finishedAt ?? Date.now()) - verifyAutoCompleteExecution.startedAt,
        ),
      )
    : null;
  const continueDurationLabel = continueAiEnhancementExecution.startedAt
    ? formatDurationLabel(
        Math.max(
          0,
          (continueAiEnhancementExecution.finishedAt ?? Date.now()) -
            continueAiEnhancementExecution.startedAt,
        ),
      )
    : null;
  const autoComboDurationLabel = autoComboGuardExecution.startedAt
    ? formatDurationLabel(
        Math.max(0, (autoComboGuardExecution.finishedAt ?? Date.now()) - autoComboGuardExecution.startedAt),
      )
    : null;
  const zeroFeedbackMetrics = useMemo(
    () => ({
      changedFiles: 0,
      tests: 0,
      checks: 0,
      completedTasks: 0,
    }),
    [],
  );
  const applyFeedbackMetrics = useMemo(
    () => ({
      changedFiles: activeApplyExecution.changedFiles.length,
      tests: activeApplyExecution.tests.length,
      checks: activeApplyExecution.checks.length,
      completedTasks: activeApplyExecution.completedTaskIndices.length,
    }),
    [
      activeApplyExecution.changedFiles.length,
      activeApplyExecution.tests.length,
      activeApplyExecution.checks.length,
      activeApplyExecution.completedTaskIndices.length,
    ],
  );
  const continueFeedbackMetrics = zeroFeedbackMetrics;
  const autoComboFeedbackMetrics = useMemo(
    () => ({
      changedFiles: autoComboGuardExecution.changedFiles.length,
      tests: autoComboGuardExecution.tests.length,
      checks: autoComboGuardExecution.checks.length,
      completedTasks: autoComboGuardExecution.completedTaskIndices.length,
    }),
    [
      autoComboGuardExecution.changedFiles.length,
      autoComboGuardExecution.tests.length,
      autoComboGuardExecution.checks.length,
      autoComboGuardExecution.completedTaskIndices.length,
    ],
  );
  const showContinueApplyLink =
    isContinueAutoApplyFlow && showContinueAiEnhancementFloating && showApplyExecutionFloating;
  const continueApplyLinkGeometry = useMemo(() => {
    if (!showContinueApplyLink) {
      return null;
    }
    return buildFeedbackLinkGeometry({
      continuePosition: agentFeedbackPosition,
      applyPosition: applyFeedbackPosition,
    });
  }, [agentFeedbackPosition, applyFeedbackPosition, showContinueApplyLink]);
  const applyComboLinkGeometry = useMemo(() => {
    if (!(showApplyExecutionFloating && showAutoComboGuardFloating)) {
      return null;
    }
    return buildFeedbackLinkGeometry({
      continuePosition: applyFeedbackPosition,
      applyPosition: autoComboGuardPosition,
    });
  }, [applyFeedbackPosition, autoComboGuardPosition, showApplyExecutionFloating, showAutoComboGuardFloating]);
  const renderFeedbackStatusValue = useCallback(
    (status: "idle" | "running" | "success" | "failed", label: string) => (
      <strong className={`is-${status} spec-hub-status-value`}>
        {status === "running" ? <RefreshCw size={12} aria-hidden className="spin" /> : null}
        <span>{label}</span>
      </strong>
    ),
    [],
  );
  const renderFeedbackMetricsLine = useCallback(
    (metrics: {
      changedFiles: number;
      tests: number;
      checks: number;
      completedTasks: number;
    }) => (
      <p className="spec-hub-feedback-metrics">
        {t("specHub.applyExecution.changedFiles", { count: metrics.changedFiles })}
        {" · "}
        {t("specHub.applyExecution.tests", { count: metrics.tests })}
        {" · "}
        {t("specHub.applyExecution.checks", { count: metrics.checks })}
        {" · "}
        {t("specHub.applyExecution.completedTasks", { count: metrics.completedTasks })}
      </p>
    ),
    [t],
  );
  const renderChangedFilesPreview = useCallback(
    (changedFiles: string[]) => (
      <div className="spec-hub-command-preview">
        <span>{t("specHub.applyExecution.changedFilesTitle")}</span>
        <code>
          {changedFiles.length > 0
            ? changedFiles.join("\n")
            : t("specHub.applyExecution.changedFilesEmpty")}
        </code>
      </div>
    ),
    [t],
  );
  const scrollCodeBlockToBottom = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, []);

  useEffect(() => {
    scrollCodeBlockToBottom(proposalStreamRef.current);
  }, [proposalExecution.streamOutput, scrollCodeBlockToBottom]);
  useEffect(() => {
    scrollCodeBlockToBottom(proposalLogsRef.current);
  }, [proposalExecution.logs, scrollCodeBlockToBottom]);
  useEffect(() => {
    scrollCodeBlockToBottom(continueStreamRef.current);
  }, [continueAiEnhancementExecution.streamOutput, scrollCodeBlockToBottom]);
  useEffect(() => {
    scrollCodeBlockToBottom(continueLogsRef.current);
  }, [continueAiEnhancementExecution.logs, scrollCodeBlockToBottom]);
  useEffect(() => {
    scrollCodeBlockToBottom(verifyStreamRef.current);
  }, [verifyAutoCompleteExecution.streamOutput, scrollCodeBlockToBottom]);
  useEffect(() => {
    scrollCodeBlockToBottom(verifyLogsRef.current);
  }, [verifyAutoCompleteExecution.logs, scrollCodeBlockToBottom]);
  useEffect(() => {
    scrollCodeBlockToBottom(applyStreamRef.current);
  }, [activeApplyExecution.executionOutput, scrollCodeBlockToBottom]);
  useEffect(() => {
    scrollCodeBlockToBottom(applyLogsRef.current);
  }, [activeApplyExecution.logs, scrollCodeBlockToBottom]);
  useEffect(() => {
    scrollCodeBlockToBottom(aiTakeoverStreamRef.current);
  }, [aiTakeoverStreamText, scrollCodeBlockToBottom]);
  useEffect(() => {
    scrollCodeBlockToBottom(aiTakeoverLogsRef.current);
  }, [aiTakeoverLogs, scrollCodeBlockToBottom]);
  useEffect(() => {
    scrollCodeBlockToBottom(autoComboStreamRef.current);
  }, [autoComboGuardExecution.streamOutput, scrollCodeBlockToBottom]);
  useEffect(() => {
    scrollCodeBlockToBottom(autoComboLogsRef.current);
  }, [autoComboGuardExecution.logs, scrollCodeBlockToBottom]);
  useEffect(() => {
    if (autoComboGuardExecution.status === "idle") {
      return;
    }
    if (autoComboGuardExecution.phase !== "remediate" && autoComboGuardExecution.phase !== "verify") {
      return;
    }
    setAutoComboGuardExecution((prev) => {
      if (prev.status === "idle") {
        return prev;
      }
      const changedFiles = activeApplyExecution.changedFiles;
      const tests = activeApplyExecution.tests;
      const checks = activeApplyExecution.checks;
      const completedTaskIndices = activeApplyExecution.completedTaskIndices;
      const streamOutput = activeApplyExecution.executionOutput || prev.streamOutput;
      const noChange =
        prev.streamOutput === streamOutput &&
        prev.changedFiles.length === changedFiles.length &&
        prev.tests.length === tests.length &&
        prev.checks.length === checks.length &&
        prev.completedTaskIndices.length === completedTaskIndices.length &&
        prev.changedFiles.every((entry, index) => entry === changedFiles[index]) &&
        prev.tests.every((entry, index) => entry === tests[index]) &&
        prev.checks.every((entry, index) => entry === checks[index]) &&
        prev.completedTaskIndices.every((entry, index) => entry === completedTaskIndices[index]);
      if (noChange) {
        return prev;
      }
      return {
        ...prev,
        streamOutput,
        changedFiles: [...changedFiles],
        tests: [...tests],
        checks: [...checks],
        completedTaskIndices: [...completedTaskIndices],
      };
    });
  }, [
    activeApplyExecution.changedFiles,
    activeApplyExecution.checks,
    activeApplyExecution.completedTaskIndices,
    activeApplyExecution.executionOutput,
    activeApplyExecution.tests,
    autoComboGuardExecution.phase,
    autoComboGuardExecution.status,
  ]);

  const aiTakeoverLogText = useMemo(() => {
    if (aiTakeoverLogs.length === 0) {
      return "";
    }
    return aiTakeoverLogs
      .map((entry) => {
        const timeLabel = new Date(entry.at).toLocaleTimeString();
        const phaseLabel = t(`specHub.aiTakeover.phase.${entry.phase}`);
        const levelLabel = t(`specHub.aiTakeover.logLevel.${entry.level}`);
        return `[${timeLabel}] [${levelLabel}] [${phaseLabel}] ${entry.message}`;
      })
      .join("\n");
  }, [aiTakeoverLogs, t]);
  const hasAiTakeoverHistory =
    aiTakeoverStatus !== "idle" ||
    Boolean(aiTakeoverStartedAt) ||
    Boolean(aiTakeoverFinishedAt) ||
    Boolean(aiTakeoverNotice) ||
    Boolean(aiTakeoverError) ||
    Boolean(aiTakeoverOutput) ||
    Boolean(aiTakeoverStreamText) ||
    aiTakeoverLogs.length > 0;
  const showAiTakeoverFloating = hasAiTakeoverHistory && !isAiTakeoverFeedbackClosed;
  const installedAgentSet = useMemo(() => {
    return new Set<ProjectAgent>(availableAgents);
  }, [availableAgents]);
  const actionEngineOptions = useMemo(() => {
    return PROJECT_AGENT_OPTIONS.map((engine) => {
      const installed = installedAgentSet.has(engine);
      const label = installed
        ? engineDisplayName(engine)
        : `${engineDisplayName(engine)} · ${t("specHub.environment.notInstalled")}`;
      return { engine, installed, label };
    });
  }, [installedAgentSet, t]);
  const projectEngineOptions = useMemo(() => {
    return PROJECT_AGENT_OPTIONS.map((engine) => {
      const installed = installedAgentSet.has(engine);
      const label = installed
        ? engineDisplayName(engine)
        : `${engineDisplayName(engine)} · ${t("specHub.environment.notInstalled")}`;
      return { engine, installed, label };
    });
  }, [installedAgentSet, t]);

  const resetApplyFeedbackPosition = useCallback(() => {
    const bounds = getViewportFloatingBounds();
    setApplyFeedbackPosition(clampFloatingPosition(getInitialFloatingPosition(bounds.width), bounds));
  }, []);

  const ensureApplyFeedbackVisible = useCallback(() => {
    const bounds = getViewportFloatingBounds();
    setApplyFeedbackPosition((prev) => clampFloatingPosition(prev, bounds));
  }, []);

  const resetAgentFeedbackPosition = useCallback(() => {
    const bounds = getViewportFloatingBounds();
    setAgentFeedbackPosition(clampFloatingPosition(getInitialFloatingPosition(bounds.width), bounds));
  }, []);

  const ensureAgentFeedbackVisible = useCallback(() => {
    const bounds = getViewportFloatingBounds();
    setAgentFeedbackPosition((prev) => clampFloatingPosition(prev, bounds));
  }, []);

  const ensureAutoComboGuardFeedbackVisible = useCallback(() => {
    const bounds = getViewportFloatingBounds();
    setAutoComboGuardPosition((prev) => clampFloatingPosition(prev, bounds));
  }, []);

  const alignComboFeedbackPositions = useCallback(() => {
    const [continuePosition, applyPosition, autoComboPosition] = buildSequentialFloatingPositions(3);
    const safeContinuePosition = continuePosition ?? getInitialFloatingPosition();
    const safeApplyPosition = applyPosition ?? safeContinuePosition;
    const safeAutoComboPosition = autoComboPosition ?? safeApplyPosition;
    setAgentFeedbackPosition(safeContinuePosition);
    setApplyFeedbackPosition(safeApplyPosition);
    setAutoComboGuardPosition(safeAutoComboPosition);
    return [safeContinuePosition, safeApplyPosition, safeAutoComboPosition] as const;
  }, []);

  useEffect(() => {
    if (!showApplyExecutionPanel) {
      previousApplyExecutionStartRef.current = null;
      return;
    }
    const nextStartedAt = applyExecution.startedAt ?? null;
    if (nextStartedAt && nextStartedAt !== previousApplyExecutionStartRef.current) {
      previousApplyExecutionStartRef.current = nextStartedAt;
      setIsApplyFeedbackClosed(false);
      setIsApplyFeedbackCollapsed(false);
      if (isContinueAutoApplyFlow) {
        ensureApplyFeedbackVisible();
      } else {
        resetApplyFeedbackPosition();
      }
    }
  }, [
    applyExecution.startedAt,
    ensureApplyFeedbackVisible,
    isContinueAutoApplyFlow,
    resetApplyFeedbackPosition,
    showApplyExecutionPanel,
  ]);

  useEffect(() => {
    if (applyExecution.status === "idle") {
      return;
    }
    setApplyFloatingExecutionSnapshot(applyExecution);
  }, [applyExecution]);

  useEffect(() => {
    const onResize = () => {
      ensureApplyFeedbackVisible();
      ensureAgentFeedbackVisible();
      ensureAutoComboGuardFeedbackVisible();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [ensureAgentFeedbackVisible, ensureApplyFeedbackVisible, ensureAutoComboGuardFeedbackVisible]);

  useEffect(() => {
    ensureApplyFeedbackVisible();
    ensureAgentFeedbackVisible();
    ensureAutoComboGuardFeedbackVisible();
  }, [
    ensureAutoComboGuardFeedbackVisible,
    ensureAgentFeedbackVisible,
    ensureApplyFeedbackVisible,
    isArtifactMaximized,
    isControlPanelCollapsed,
  ]);

  useEffect(() => {
    return () => {
      applyFeedbackDragCleanupRef.current?.();
      applyFeedbackDragCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      agentFeedbackDragCleanupRef.current?.();
      agentFeedbackDragCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      autoComboGuardDragCleanupRef.current?.();
      autoComboGuardDragCleanupRef.current = null;
    };
  }, []);

  const handleApplyFeedbackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) {
        return;
      }
      event.preventDefault();
      const dragOffsetX = event.clientX - applyFeedbackPosition.x;
      const dragOffsetY = event.clientY - applyFeedbackPosition.y;
      setIsApplyFeedbackDragging(true);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setApplyFeedbackPosition(
          clampFloatingPosition({
            x: moveEvent.clientX - dragOffsetX,
            y: moveEvent.clientY - dragOffsetY,
          }),
        );
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
      const handlePointerUp = () => {
        setIsApplyFeedbackDragging(false);
        cleanup();
        applyFeedbackDragCleanupRef.current = null;
      };

      applyFeedbackDragCleanupRef.current?.();
      applyFeedbackDragCleanupRef.current = cleanup;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [applyFeedbackPosition.x, applyFeedbackPosition.y],
  );

  const handleAgentFeedbackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) {
        return;
      }
      event.preventDefault();
      const dragOffsetX = event.clientX - agentFeedbackPosition.x;
      const dragOffsetY = event.clientY - agentFeedbackPosition.y;
      setIsAgentFeedbackDragging(true);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setAgentFeedbackPosition(
          clampFloatingPosition({
            x: moveEvent.clientX - dragOffsetX,
            y: moveEvent.clientY - dragOffsetY,
          }),
        );
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
      const handlePointerUp = () => {
        setIsAgentFeedbackDragging(false);
        cleanup();
        agentFeedbackDragCleanupRef.current = null;
      };

      agentFeedbackDragCleanupRef.current?.();
      agentFeedbackDragCleanupRef.current = cleanup;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [agentFeedbackPosition.x, agentFeedbackPosition.y],
  );

  const handleAutoComboGuardPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) {
        return;
      }
      event.preventDefault();
      const dragOffsetX = event.clientX - autoComboGuardPosition.x;
      const dragOffsetY = event.clientY - autoComboGuardPosition.y;
      setIsAutoComboGuardFeedbackDragging(true);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setAutoComboGuardPosition(
          clampFloatingPosition({
            x: moveEvent.clientX - dragOffsetX,
            y: moveEvent.clientY - dragOffsetY,
          }),
        );
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
      const handlePointerUp = () => {
        setIsAutoComboGuardFeedbackDragging(false);
        cleanup();
        autoComboGuardDragCleanupRef.current = null;
      };

      autoComboGuardDragCleanupRef.current?.();
      autoComboGuardDragCleanupRef.current = cleanup;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [autoComboGuardPosition.x, autoComboGuardPosition.y],
  );

  useEffect(() => {
    const previous = previousRunningActionRef.current;
    if (!previous && runningGuidanceAction) {
      setGuidanceRunStartedAt(Date.now());
      setGuidanceRunTicker(0);
      setLastGuidanceAction(runningGuidanceAction);
      setGuidanceRawExpanded(false);
      setGuidanceShowFullRaw(false);
    }
    if (previous && !runningGuidanceAction) {
      setGuidanceRunStartedAt(null);
      setGuidanceRunTicker(0);
    }
    previousRunningActionRef.current = isRunningAction;
  }, [isRunningAction, runningGuidanceAction]);

  useEffect(() => {
    if (guidanceStatus === "running") {
      const timer = window.setInterval(() => {
        setGuidanceRunTicker((value) => value + 1);
      }, 1000);
      return () => {
        window.clearInterval(timer);
      };
    }
    return undefined;
  }, [guidanceStatus]);

  useEffect(() => {
    setGuidanceShowFullRaw(false);
  }, [latestGuidanceEvent?.id]);
  const resolveAiPhaseState = (phase: AiTakeoverPhase) => {
    if (aiTakeoverStatus === "success") {
      return "done";
    }
    const phaseIndex = AI_TAKEOVER_PHASES.indexOf(phase);
    if (aiTakeoverStatus === "failed") {
      if (phaseIndex < aiTakeoverPhaseIndex) {
        return "done";
      }
      if (phaseIndex === aiTakeoverPhaseIndex) {
        return "failed";
      }
      return "pending";
    }
    if (aiTakeoverStatus === "running") {
      if (phaseIndex < aiTakeoverPhaseIndex) {
        return "done";
      }
      if (phaseIndex === aiTakeoverPhaseIndex) {
        return "current";
      }
      return "pending";
    }
    return "pending";
  };
  const appendAiTakeoverLog = (
    phase: AiTakeoverPhase,
    level: AiTakeoverLogLevel,
    message: string,
  ) => {
    setAiTakeoverLogs((entries) => [
      ...entries,
      {
        id: `ai-log-${Date.now()}-${entries.length}`,
        at: Date.now(),
        phase,
        level,
        message,
      },
    ]);
  };
  const evaluateArchiveReadiness = useCallback(async (changeId: string) => {
    if (!workspaceId) {
      return {
        archived: false,
        ready: false,
        blockers: [t("specHub.runtime.selectWorkspaceFirst")],
      };
    }
    let latestFiles = files;
    let latestDirectories = directories;
    try {
      const snapshot = await getWorkspaceFiles(workspaceId);
      latestFiles = snapshot.files;
      latestDirectories = snapshot.directories;
    } catch {
      // Fallback to latest rendered filesystem snapshot when rescan fails.
    }
    const latestSnapshot = await buildSpecWorkspaceSnapshot({
      workspaceId,
      files: latestFiles,
      directories: latestDirectories,
      mode: environmentMode,
      customSpecRoot,
    });
    const latestChange = latestSnapshot.changes.find((entry) => entry.id === changeId) ?? null;
    if (!latestChange) {
      return {
        archived: false,
        ready: false,
        blockers: [t("specHub.runtime.selectChangeFirst")],
      };
    }
    const latestArtifacts = await loadSpecArtifacts({
      workspaceId,
      change: latestChange,
      customSpecRoot,
    });
    const latestActions = buildSpecActions({
      change: latestChange,
      supportLevel: latestSnapshot.supportLevel,
      provider: latestSnapshot.provider,
      environment: latestSnapshot.environment,
      verifyState: verifyStateForSelected,
      taskProgress: latestArtifacts.tasks.taskProgress,
    });
    const latestArchiveAction = latestActions.find((entry) => entry.key === "archive");
    if (!latestArchiveAction) {
      return {
        archived: latestChange.status === "archived",
        ready: false,
        blockers: [t("specHub.aiTakeover.archiveActionMissing")],
      };
    }
    return {
      archived: latestChange.status === "archived",
      ready: latestArchiveAction.available,
      blockers: latestArchiveAction.blockers,
    };
  }, [
    customSpecRoot,
    directories,
    environmentMode,
    files,
    t,
    verifyStateForSelected,
    workspaceId,
  ]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    let cancelled = false;
    setIsLoadingAgents(true);
    void Promise.all([detectEngines(), getActiveEngine()])
      .then(([statuses, active]) => {
        if (cancelled) {
          return;
        }
        const installed: ProjectAgent[] = [];
        for (const status of statuses) {
          if (status.installed && isProjectAgent(status.engineType)) {
            installed.push(status.engineType);
          }
        }
        const nextAgents: ProjectAgent[] = installed.length > 0 ? installed : ["codex"];
        setAvailableAgents(nextAgents);
        if (isProjectAgent(active) && nextAgents.includes(active)) {
          setProjectAgent(active);
          setApplyAgent(active);
        } else {
          setProjectAgent(nextAgents[0] ?? "codex");
          setApplyAgent(nextAgents[0] ?? "codex");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableAgents(["codex"]);
          setProjectAgent("codex");
          setApplyAgent("codex");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingAgents(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const handleProjectContextSubmit = async () => {
    setProjectContextNotice(null);
    setProjectGenerationError(null);
    if (!workspaceId) {
      return;
    }
    setIsGeneratingProjectInfo(true);
    try {
      const prompt = buildProjectInfoPrompt({
        workspaceName,
        files,
        directories,
        provider: snapshot.provider,
      });
      const generated = await engineSendMessageSync(workspaceId, {
        text: prompt,
        engine: projectAgent as EngineType,
        accessMode: "read-only",
        continueSession: false,
      });
      const payload = extractJsonObject(generated.text);
      if (!payload) {
        throw new Error(t("specHub.bootstrap.invalidAgentResponse"));
      }
      const projectInfo = normalizeGeneratedProjectInfo({
        payload,
        files,
        provider: snapshot.provider,
      });
      setLastGeneratedProjectInfo(projectInfo);
      const ok = showBootstrapGuide
        ? await executeBootstrap(projectInfo)
        : await persistProjectInfo(projectInfo);
      if (ok) {
        setProjectContextNotice(
          showBootstrapGuide
            ? t("specHub.bootstrap.bootstrapSuccess")
            : t("specHub.bootstrap.projectInfoSaved"),
        );
      }
    } catch (error) {
      setProjectGenerationError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGeneratingProjectInfo(false);
    }
  };

  const appendProposalLog = useCallback((phase: ProposalExecutionPhase, message: string) => {
    setProposalExecution((prev) => ({
      ...prev,
      logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] [${phase}] ${message}`],
    }));
  }, []);

  const proposalAttachmentErrorMessage = useCallback(
    (reason: "count" | "type" | "size", value?: string) => {
      if (reason === "count") {
        return t("specHub.proposal.imageCountExceeded", { count: PROPOSAL_MAX_ATTACHMENTS });
      }
      if (reason === "size") {
        return t("specHub.proposal.imageTooLarge", {
          size: value ?? formatBytes(PROPOSAL_MAX_DATA_URL_BYTES),
        });
      }
      return t("specHub.proposal.imageUnsupported");
    },
    [t],
  );

  const validateProposalAttachment = useCallback(
    (path: string) => {
      const trimmed = path.trim();
      if (!trimmed) {
        return { ok: false, reason: "type" as const };
      }
      if (trimmed.startsWith("data:")) {
        const mime = readDataUrlMime(trimmed);
        if (!PROPOSAL_ALLOWED_IMAGE_MIME_PREFIXES.includes(mime)) {
          return { ok: false, reason: "type" as const };
        }
        const bytes = estimateDataUrlBytes(trimmed);
        if (bytes > PROPOSAL_MAX_DATA_URL_BYTES) {
          return { ok: false, reason: "size" as const, value: formatBytes(bytes) };
        }
        return { ok: true as const };
      }
      if (/^https?:\/\//i.test(trimmed)) {
        return { ok: true as const };
      }
      if (!isSupportedProposalImagePath(trimmed)) {
        return { ok: false, reason: "type" as const };
      }
      return { ok: true as const };
    },
    [],
  );

  const appendProposalDraftImages = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) {
        return;
      }
      const merged = [...proposalDraftImages];
      let nextError: string | null = null;
      for (const path of paths.map((entry) => entry.trim()).filter(Boolean)) {
        if (merged.includes(path)) {
          continue;
        }
        if (merged.length >= PROPOSAL_MAX_ATTACHMENTS) {
          nextError = proposalAttachmentErrorMessage("count");
          break;
        }
        const validation = validateProposalAttachment(path);
        if (!validation.ok) {
          nextError = proposalAttachmentErrorMessage(validation.reason, validation.value);
          continue;
        }
        merged.push(path);
      }
      setProposalDraftImages(merged);
      setProposalDraftError(nextError);
    },
    [proposalAttachmentErrorMessage, proposalDraftImages, validateProposalAttachment],
  );

  const removeProposalDraftImage = useCallback((path: string) => {
    setProposalDraftImages((prev) => prev.filter((entry) => entry !== path));
    setProposalDraftError(null);
  }, []);

  const pickProposalDraftImages = useCallback(async () => {
    const picked = await pickImageFiles();
    appendProposalDraftImages(picked);
  }, [appendProposalDraftImages]);

  const {
    dropTargetRef: proposalDraftDropTargetRef,
    isDragOver: isProposalDraftDragOver,
    handleDragOver: handleProposalDraftDragOver,
    handleDragEnter: handleProposalDraftDragEnter,
    handleDragLeave: handleProposalDraftDragLeave,
    handleDrop: handleProposalDraftDrop,
    handlePaste: handleProposalDraftPaste,
  } = useComposerImageDrop({
    disabled: !proposalDraftMode || isProposalRunning,
    onAttachImages: appendProposalDraftImages,
  });

  const runEnginePromptWithRealtime = useCallback(
    async (input: {
      prompt: string;
      engine: ProjectAgent;
      images?: string[];
      accessMode?: "read-only" | "full-access";
      onDelta: (delta: string) => void;
      onLog: (message: string) => void;
    }) => {
      if (!workspaceId) {
        throw new Error(t("specHub.runtime.selectWorkspaceFirst"));
      }

      const waitForTurnResult = (initialThreadId: string) =>
        new Promise<string>((resolve, reject) => {
          const trackedThreadIds = new Set<string>([initialThreadId]);
          let streamBuffer = "";
          let heartbeatCount = 0;
          let finished = false;
          const timeoutId = window.setTimeout(() => {
            if (finished) {
              return;
            }
            finished = true;
            unlisten();
            reject(new Error(t("specHub.proposal.turnTimeout")));
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

          const unlisten = subscribeAppServerEvents((payload) => {
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
                  input.onLog(t("specHub.proposal.logThreadBound", { threadId: promotedThreadId }));
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
              input.onDelta(delta);
              return;
            }

            if (method === "item/started") {
              const item = (params.item as Record<string, unknown> | undefined) ?? {};
              const toolName = String(item.tool ?? item.id ?? "").trim();
              if (toolName) {
                input.onLog(t("specHub.proposal.logToolStarted", { tool: toolName }));
              }
              return;
            }

            if (method === "item/completed") {
              const item = (params.item as Record<string, unknown> | undefined) ?? {};
              const toolName = String(item.tool ?? item.id ?? "").trim();
              if (toolName) {
                input.onLog(t("specHub.proposal.logToolCompleted", { tool: toolName }));
              }
              return;
            }

            if (method === "processing/heartbeat") {
              heartbeatCount += 1;
              if (heartbeatCount === 1 || heartbeatCount % 6 === 0) {
                input.onLog(t("specHub.proposal.logHeartbeat", { seconds: heartbeatCount }));
              }
              return;
            }

            if (method === "turn/error" || method === "error") {
              const errorValue =
                params.error && typeof params.error === "object"
                  ? String((params.error as Record<string, unknown>).message ?? "")
                  : String(params.error ?? "");
              finish(() => reject(new Error(errorValue.trim() || t("specHub.proposal.executionFailed"))));
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
            input.onLog(t("specHub.proposal.logSyncHeartbeat", { seconds: heartbeatCount }));
          }
        }, 1000);
        try {
          const generated = await engineSendMessageSync(workspaceId, {
            text: input.prompt,
            engine: input.engine as EngineType,
            accessMode: input.accessMode ?? "full-access",
            continueSession: false,
            images: input.images ?? null,
            customSpecRoot,
          });
          return generated?.text ?? "";
        } finally {
          window.clearInterval(timer);
        }
      };

      if (input.engine === "codex") {
        const threadStart = await startThread(workspaceId);
        const threadId = extractThreadIdFromRpc(threadStart);
        if (threadId) {
          input.onLog(t("specHub.proposal.logThreadBound", { threadId }));
          const waitPromise = waitForTurnResult(threadId);
          await sendUserMessage(workspaceId, threadId, input.prompt, {
            accessMode: input.accessMode ?? "full-access",
            images: input.images,
            customSpecRoot,
          });
          return waitPromise;
        }
        input.onLog(t("specHub.proposal.logFallbackSync"));
        return runSyncWithHeartbeat();
      }

      const trigger = await engineSendMessage(workspaceId, {
        text: input.prompt,
        engine: input.engine as EngineType,
        accessMode: input.accessMode ?? "full-access",
        continueSession: false,
        images: input.images ?? null,
        customSpecRoot,
      });
      const threadId = extractThreadIdFromRpc(trigger);
      if (threadId) {
        input.onLog(t("specHub.proposal.logThreadBound", { threadId }));
        return waitForTurnResult(threadId);
      }

      input.onLog(t("specHub.proposal.logFallbackSync"));
      return runSyncWithHeartbeat();
    },
    [customSpecRoot, t, workspaceId],
  );

  const openProposalDraft = useCallback(
    (mode: ProposalDraftMode) => {
      setProposalDraftError(null);
      setProposalDraftContent("");
      setProposalDraftImages([]);
      setProposalDraftMode(mode);
      if (mode === "append") {
        if (selectedChange?.id && appendableChanges.some((entry) => entry.id === selectedChange.id)) {
          setProposalTargetChangeId(selectedChange.id);
          return;
        }
        setProposalTargetChangeId(appendableChanges[0]?.id ?? null);
        return;
      }
      setProposalTargetChangeId(selectedChange?.id ?? appendableChanges[0]?.id ?? null);
    },
    [appendableChanges, selectedChange?.id],
  );

  const triggerApplyExecution = useCallback(
    (options?: {
      continueBriefOverride?: SpecContinueExecutionBrief | null;
      forceUseContinueBrief?: boolean;
      ignoreAvailability?: boolean;
      positionOverride?: FloatingPosition | null;
      skipPositionReset?: boolean;
    }) => {
      setIsApplyFeedbackClosed(false);
      setIsApplyFeedbackCollapsed(false);
      if (options?.positionOverride) {
        setApplyFeedbackPosition(clampFloatingPosition(options.positionOverride));
      } else if (!options?.skipPositionReset) {
        resetApplyFeedbackPosition();
      }
      return executeAction("apply", {
        applyMode: "execute",
        applyExecutor: applyAgent,
        applyContinueBrief: options?.continueBriefOverride ?? currentContinueBrief,
        applyUseContinueBrief: options?.forceUseContinueBrief ?? applyUseContinueBrief,
        ignoreAvailability: options?.ignoreAvailability ?? false,
      });
    },
    [
      applyAgent,
      applyUseContinueBrief,
      currentContinueBrief,
      executeAction,
      resetApplyFeedbackPosition,
      setApplyFeedbackPosition,
    ],
  );

  const triggerAction = useCallback(
    async (actionKey: SpecHubActionKey) => {
      if (actionKey === "continue") {
        setIsContinueAutoApplyFlow(false);
        const continueEvent = await executeAction(actionKey);
        if (
          !continueAiEnhancementEnabled ||
          !selectedChange ||
          !continueBriefScopeKey ||
          !continueEvent?.success
        ) {
          return continueEvent;
        }
        const activeWorkspaceId = workspaceId;
        const activeChange = selectedChange;
        if (!activeWorkspaceId || !activeChange) {
          return continueEvent;
        }

        const startedAt = Date.now();
        setIsContinueAiEnhancementFeedbackClosed(false);
        setIsContinueAiEnhancementFeedbackCollapsed(false);
        const [, applyPosition, autoComboPosition] = alignComboFeedbackPositions();
        setContinueAiEnhancementExecution({
          ...EMPTY_CONTINUE_AI_ENHANCEMENT_EXECUTION,
          status: "running",
          phase: "analysis-dispatch",
          executor: applyAgent,
          startedAt,
          logs: [
            `[${new Date().toLocaleTimeString()}] ${t("specHub.continueAiEnhancement.logDispatch", {
              engine: engineDisplayName(applyAgent),
            })}`,
          ],
        });
        setIsContinueAiEnhancing(true);
        try {
          setContinueAiEnhancementExecution((prev) => ({
            ...prev,
            phase: "analysis-execution",
          }));
          const output = await runEnginePromptWithRealtime({
            prompt: buildContinueAiEnhancementPrompt({
              workspaceName,
              changeId: activeChange.id,
              specRoot: activeSpecRootDisplay,
              continueOutput: continueEvent.output,
            }),
            engine: applyAgent,
            accessMode: "read-only",
            onDelta: (delta) => {
              setContinueAiEnhancementExecution((prev) => ({
                ...prev,
                streamOutput: `${prev.streamOutput}${delta}`,
              }));
            },
            onLog: (message) => {
              setContinueAiEnhancementExecution((prev) => ({
                ...prev,
                logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${message}`],
              }));
            },
          });
          const generatedAt = Date.now();
          const brief = parseContinueBriefOutput(output, {
            changeId: activeChange.id,
            specRoot: activeSpecRootDisplay,
            generatedAt,
          });
          setContinueBriefByScope((prev) => ({
            ...prev,
            [continueBriefScopeKey]: brief,
          }));
          setApplyUseContinueBrief(true);
          setContinueAiEnhancementExecution((prev) => ({
            ...prev,
            status: "running",
            phase: "analysis-finalize",
            summary: brief.summary,
            finalOutput: output,
            error: null,
            logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${t("specHub.continueAiEnhancement.logFinished")}`],
          }));
          setContinueAiEnhancementExecution((prev) => ({
            ...prev,
            phase: "apply-dispatch",
            logs: [
              ...prev.logs,
              `[${new Date().toLocaleTimeString()}] ${t("specHub.continueAiEnhancement.logAutoApplyDispatch", {
                engine: engineDisplayName(applyAgent),
              })}`,
            ],
          }));
          setIsContinueAutoApplyFlow(true);
          setContinueAiEnhancementExecution((prev) => ({
            ...prev,
            phase: "apply-execution",
          }));
          const applyEvent = await triggerApplyExecution({
            continueBriefOverride: brief,
            forceUseContinueBrief: true,
            ignoreAvailability: true,
            positionOverride: applyPosition ?? null,
            skipPositionReset: true,
          });
          const applySucceeded = Boolean(applyEvent?.success);
          setIsAutoComboGuardFeedbackClosed(false);
          setIsAutoComboGuardFeedbackCollapsed(false);
          if (autoComboPosition) {
            setAutoComboGuardPosition(clampFloatingPosition(autoComboPosition));
          }
          setAutoComboGuardExecution({
            ...EMPTY_AUTO_COMBO_GUARD_EXECUTION,
            status: "running",
            phase: "audit",
            executor: applyAgent,
            startedAt: Date.now(),
            logs: [
              `[${new Date().toLocaleTimeString()}] ${t("specHub.autoCombo.logDispatch")}`,
            ],
          });
          const appendAutoComboLog = (message: string) => {
            setAutoComboGuardExecution((prev) => ({
              ...prev,
              logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${message}`],
            }));
          };
          const appendAutoComboStream = (message: string) => {
            setAutoComboGuardExecution((prev) => ({
              ...prev,
              streamOutput: prev.streamOutput ? `${prev.streamOutput}\n${message}` : message,
            }));
          };
          try {
            const firstArtifacts = await inspectChangeArtifactsPresence({
              workspaceId: activeWorkspaceId,
              changeId: activeChange.id,
              customSpecRoot,
            });
            if (firstArtifacts.specsExists) {
              appendAutoComboLog(t("specHub.autoCombo.logAuditPassed"));
              appendAutoComboStream(t("specHub.autoCombo.logAuditPassed"));
              setAutoComboGuardExecution((prev) => ({
                ...prev,
                status: "success",
                phase: "audit",
                finishedAt: Date.now(),
                summary: t("specHub.autoCombo.summaryReady"),
                changedFiles: firstArtifacts.specPaths,
                error: null,
              }));
            } else {
              appendAutoComboLog(t("specHub.autoCombo.logAuditMissingSpecs"));
              appendAutoComboStream(t("specHub.autoCombo.logAuditMissingSpecs"));
              setAutoComboGuardExecution((prev) => ({
                ...prev,
                phase: "remediate",
                logs: [
                  ...prev.logs,
                  `[${new Date().toLocaleTimeString()}] ${t("specHub.autoCombo.logRemediateDispatch", {
                    engine: engineDisplayName(applyAgent),
                  })}`,
                ],
              }));
              const remediateBrief: SpecContinueExecutionBrief = {
                ...brief,
                summary: `${brief.summary} ${t("specHub.autoCombo.remediateHint")}`.trim(),
                risks: [...brief.risks, t("specHub.autoCombo.riskMissingSpecs")],
                verificationPlan: [
                  ...brief.verificationPlan,
                  t("specHub.autoCombo.verifyPlanEnsureSpecs"),
                ],
                executionSequence: [
                  ...brief.executionSequence,
                  t("specHub.autoCombo.sequenceFixSpecsFirst"),
                ],
              };
              const remediateEvent = await triggerApplyExecution({
                continueBriefOverride: remediateBrief,
                forceUseContinueBrief: true,
                ignoreAvailability: true,
                positionOverride: applyPosition ?? null,
                skipPositionReset: true,
              });
              if (remediateEvent?.output?.trim()) {
                appendAutoComboStream(remediateEvent.output.trim());
              }
              appendAutoComboLog(
                remediateEvent?.success
                  ? t("specHub.autoCombo.logRemediateFinished")
                  : t("specHub.autoCombo.logRemediateFailed"),
              );
              setAutoComboGuardExecution((prev) => ({
                ...prev,
                phase: "verify",
              }));
              const verifiedArtifacts = await inspectChangeArtifactsPresence({
                workspaceId: activeWorkspaceId,
                changeId: activeChange.id,
                customSpecRoot,
              });
              const specsRecovered = verifiedArtifacts.specsExists;
              const changedFiles = [
                ...verifiedArtifacts.specPaths,
                ...(verifiedArtifacts.tasksExists ? [verifiedArtifacts.tasksPath] : []),
              ].filter((value, index, array) => array.indexOf(value) === index);
              setAutoComboGuardExecution((prev) => ({
                ...prev,
                status: specsRecovered ? "success" : "failed",
                phase: "verify",
                finishedAt: Date.now(),
                summary: specsRecovered
                  ? t("specHub.autoCombo.summaryRecovered")
                  : t("specHub.autoCombo.summaryStillMissing"),
                changedFiles,
                error: specsRecovered ? null : t("specHub.autoCombo.errorStillMissing"),
              }));
            }
          } catch (guardError) {
            const reason = guardError instanceof Error ? guardError.message : String(guardError);
            setAutoComboGuardExecution((prev) => ({
              ...prev,
              status: "failed",
              phase: prev.phase === "idle" ? "audit" : prev.phase,
              finishedAt: Date.now(),
              summary: t("specHub.autoCombo.summaryFailed"),
              error: t("specHub.autoCombo.errorWithReason", { reason }),
            }));
          }
          setContinueAiEnhancementExecution((prev) => ({
            ...prev,
            status: applySucceeded ? "success" : "failed",
            phase: "apply-finalize",
            finishedAt: Date.now(),
            error: applySucceeded ? null : t("specHub.continueAiEnhancement.autoApplyFailed"),
            logs: [
              ...prev.logs,
              `[${new Date().toLocaleTimeString()}] ${
                applySucceeded
                  ? t("specHub.continueAiEnhancement.logAutoApplyFinished")
                  : t("specHub.continueAiEnhancement.logAutoApplySkipped")
              }`,
            ],
          }));
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          const message = t("specHub.continueAiEnhancement.failed", {
            reason,
          });
          setContinueAiEnhancementExecution((prev) => ({
            ...prev,
            status: "failed",
            finishedAt: Date.now(),
            summary: prev.summary,
            error: message,
            logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${message}`],
          }));
        } finally {
          setIsContinueAiEnhancing(false);
        }
        return continueEvent;
      }
      if (actionKey === "apply") {
        setIsContinueAutoApplyFlow(false);
        return triggerApplyExecution();
      }
      if (actionKey === "verify") {
        setVerifyAutoCompleteError(null);
        const hasVerificationArtifact = Boolean(artifacts.verification.exists);
        if (!verifyAutoCompleteEnabled || hasVerificationArtifact || !selectedChange) {
          return executeAction(actionKey);
        }
        const startedAt = Date.now();
        setIsVerifyAutoCompleteFeedbackClosed(false);
        setIsVerifyAutoCompleteFeedbackCollapsed(false);
        resetAgentFeedbackPosition();
        setVerifyAutoCompleteExecution({
          ...EMPTY_VERIFY_AUTO_COMPLETE_EXECUTION,
          status: "running",
          phase: "completion-dispatch",
          executor: applyAgent,
          startedAt,
          logs: [
            `[${new Date().toLocaleTimeString()}] [completion-dispatch] ${t("specHub.verifyAutoComplete.logDispatch", {
              engine: engineDisplayName(applyAgent),
            })}`,
          ],
        });
        setIsVerifyAutoCompleting(true);
        try {
          setVerifyAutoCompleteExecution((prev) => ({
            ...prev,
            phase: "completion-execution",
            logs: [
              ...prev.logs,
              `[${new Date().toLocaleTimeString()}] [completion-execution] ${t("specHub.verifyAutoComplete.logCompletionStarted")}`,
            ],
          }));
          const prompt = buildVerifyAutoCompletionPrompt({
            workspaceName,
            changeId: selectedChange.id,
            specRoot: activeSpecRootDisplay,
          });
          const output = await runEnginePromptWithRealtime({
            prompt,
            engine: applyAgent,
            onDelta: (delta) => {
              setVerifyAutoCompleteExecution((prev) => ({
                ...prev,
                streamOutput: `${prev.streamOutput}${delta}`,
              }));
            },
            onLog: (message) => {
              setVerifyAutoCompleteExecution((prev) => ({
                ...prev,
                logs: [
                  ...prev.logs,
                  `[${new Date().toLocaleTimeString()}] [completion-execution] ${message}`,
                ],
              }));
            },
          });
          setVerifyAutoCompleteExecution((prev) => ({
            ...prev,
            phase: "completion-finalize",
            finalOutput: output,
            summary: t("specHub.verifyAutoComplete.summaryCompletionFinished"),
            logs: [
              ...prev.logs,
              `[${new Date().toLocaleTimeString()}] [completion-finalize] ${t("specHub.verifyAutoComplete.logRefreshStarted")}`,
            ],
          }));
          await refresh({ force: true, rescanWorkspaceFiles: true });
          setVerifyAutoCompleteExecution((prev) => ({
            ...prev,
            phase: "verify-dispatch",
            logs: [
              ...prev.logs,
              `[${new Date().toLocaleTimeString()}] [verify-dispatch] ${t("specHub.verifyAutoComplete.logVerifyDispatch")}`,
            ],
          }));
          await executeAction(actionKey);
          setVerifyAutoCompleteExecution((prev) => ({
            ...prev,
            status: "success",
            phase: "verify-finalize",
            finishedAt: Date.now(),
            summary: prev.summary || t("specHub.verifyAutoComplete.summarySuccess"),
            error: null,
            validateSkipped: false,
            logs: [
              ...prev.logs,
              `[${new Date().toLocaleTimeString()}] [verify-finalize] ${t("specHub.verifyAutoComplete.logVerifyFinished")}`,
            ],
          }));
          return;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          const completionError = t("specHub.verifyAutoComplete.failed", { reason });
          setVerifyAutoCompleteError(completionError);
          setVerifyAutoCompleteExecution((prev) => ({
            ...prev,
            status: "failed",
            phase: prev.phase === "idle" ? "completion-finalize" : prev.phase,
            finishedAt: Date.now(),
            summary: t("specHub.verifyAutoComplete.validateSkipped"),
            error: completionError,
            validateSkipped: true,
            logs: [
              ...prev.logs,
              `[${new Date().toLocaleTimeString()}] [completion-finalize] ${completionError}`,
            ],
          }));
          return;
        } finally {
          setIsVerifyAutoCompleting(false);
        }
      }
      return executeAction(actionKey);
    },
    [
      activeSpecRootDisplay,
      applyAgent,
      applyUseContinueBrief,
      alignComboFeedbackPositions,
      artifacts.verification.exists,
      customSpecRoot,
      continueAiEnhancementEnabled,
      continueBriefScopeKey,
      currentContinueBrief,
      executeAction,
      refresh,
      resetAgentFeedbackPosition,
      runEnginePromptWithRealtime,
      selectedChange,
      t,
      triggerApplyExecution,
      verifyAutoCompleteEnabled,
      workspaceId,
      workspaceName,
    ],
  );

  const handleProposalSubmit = async () => {
    if (!workspaceId || !proposalDraftMode) {
      return;
    }
    const normalizedContent = proposalDraftContent.trim();
    if (!normalizedContent && proposalDraftImages.length === 0) {
      setProposalDraftError(t("specHub.proposal.emptyInputError"));
      return;
    }
    if (proposalDraftMode === "append" && !proposalTargetChangeId) {
      setProposalDraftError(t("specHub.proposal.targetRequired"));
      return;
    }
    for (const image of proposalDraftImages) {
      const validation = validateProposalAttachment(image);
      if (!validation.ok) {
        setProposalDraftError(proposalAttachmentErrorMessage(validation.reason, validation.value));
        return;
      }
    }

    const mode = proposalDraftMode;
    const targetChangeId = proposalTargetChangeId;
    const attachments = [...proposalDraftImages];
    const startedAt = Date.now();
    setProposalDraftMode(null);
    setProposalDraftError(null);
    setProposalDraftImages([]);
    setIsProposalFeedbackClosed(false);
    setIsProposalFeedbackCollapsed(false);
    resetAgentFeedbackPosition();
    setProposalExecution({
      ...EMPTY_PROPOSAL_EXECUTION,
      status: "running",
      phase: "dispatch",
      mode,
      targetChangeId,
      executor: applyAgent,
      startedAt,
      logs: [
        `[${new Date().toLocaleTimeString()}] [dispatch] ${t("specHub.proposal.logDispatch", {
          engine: engineDisplayName(applyAgent),
        })}`,
      ],
    });

    try {
      const prompt = buildProposalExecutionPrompt({
        mode,
        content: normalizedContent,
        attachments,
        targetChangeId,
        specRoot: activeSpecRootDisplay,
        workspaceName,
      });
      setProposalExecution((prev) => ({
        ...prev,
        phase: "execution",
      }));
      appendProposalLog("execution", t("specHub.proposal.logExecutionStarted"));

      const output = await runEnginePromptWithRealtime({
        prompt,
        engine: applyAgent,
        images: attachments,
        onDelta: (delta) => {
          setProposalExecution((prev) => ({
            ...prev,
            streamOutput: `${prev.streamOutput}${delta}`,
          }));
        },
        onLog: (message) => appendProposalLog("execution", message),
      });

      const payload = extractJsonObject(output);
      const parsedSummary =
        typeof payload?.summary === "string" && payload.summary.trim()
          ? payload.summary.trim()
          : "";
      const parsedChangeId =
        typeof payload?.change_id === "string" && payload.change_id.trim()
          ? payload.change_id.trim()
          : targetChangeId;

      setProposalExecution((prev) => ({
        ...prev,
        phase: "finalize",
        targetChangeId: parsedChangeId ?? prev.targetChangeId,
        finalOutput: output,
        summary: parsedSummary || t("specHub.proposal.summaryFallback"),
      }));
      appendProposalLog("finalize", t("specHub.proposal.logRefreshStarted"));
      await refresh({ force: true, rescanWorkspaceFiles: true });
      const effectiveChangeId = parsedChangeId ?? targetChangeId;
      if (effectiveChangeId) {
        await selectChange(effectiveChangeId);
        setProposalTargetChangeId(effectiveChangeId);
      }
      const fsSnapshot = await getWorkspaceFiles(workspaceId);
      const preflight =
        effectiveChangeId && fsSnapshot.files.length > 0
          ? await evaluateOpenSpecChangePreflight({
              workspaceId,
              changeId: effectiveChangeId,
              files: fsSnapshot.files,
              customSpecRoot,
            })
          : { blockers: [], hints: [], affectedSpecs: [] };
      appendProposalLog(
        "finalize",
        `stage=proposal_post change=${effectiveChangeId ?? "unknown"} blocker_count=${preflight.blockers.length}`,
      );
      setProposalExecution((prev) => ({
        ...prev,
        status: "success",
        phase: "finalize",
        finishedAt: Date.now(),
        finalOutput: output,
        summary:
          preflight.blockers.length > 0
            ? `${prev.summary || t("specHub.proposal.runSuccess")} · ${t("specHub.runtime.validationFixHint")}`
            : prev.summary || t("specHub.proposal.runSuccess"),
        error: null,
        preflightBlockers: preflight.blockers,
        preflightHints: preflight.hints,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProposalExecution((prev) => ({
        ...prev,
        status: "failed",
        phase: prev.phase === "idle" ? "dispatch" : prev.phase,
        finishedAt: Date.now(),
        error: message,
        logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] [${prev.phase}] ${message}`],
      }));
    }
  };

  const handleArchiveAiTakeover = async () => {
    if (!workspaceId || !selectedChange || isAiTakeoverRunning) {
      return;
    }
    const startedAt = Date.now();
    let currentPhase: AiTakeoverPhase = "kickoff";
    let heartbeatCount = 0;
    setAiTakeoverNotice(null);
    setAiTakeoverError(null);
    setAiTakeoverOutput(null);
    setAiTakeoverStreamText("");
    setAiTakeoverStatus("running");
    setAiTakeoverPhase("kickoff");
    setAiTakeoverRefreshState("idle");
    setAiTakeoverLogs([]);
    setAiTakeoverStartedAt(startedAt);
    setAiTakeoverFinishedAt(null);
    setAiTakeoverTicker(0);
    setIsAiTakeoverFeedbackClosed(false);
    setIsAiTakeoverFeedbackCollapsed(false);
    appendAiTakeoverLog("kickoff", "info", t("specHub.aiTakeover.logKickoffStarted"));
    setIsAiTakeoverRunning(true);
    try {
      const prompt = buildArchiveTakeoverPrompt({
        workspaceName,
        changeId: selectedChange.id,
        specRoot: activeSpecRootDisplay,
        blockers: aiTakeoverRelevantBlockers,
        latestArchiveOutput: latestArchiveFailureOutputForAi,
      });
      const waitForTurnResult = (initialThreadId: string) =>
        new Promise<string>((resolve, reject) => {
          const trackedThreadIds = new Set<string>([initialThreadId]);
          let streamBuffer = "";
          let finished = false;
          const timeoutId = window.setTimeout(() => {
            if (finished) {
              return;
            }
            finished = true;
            unlisten();
            reject(new Error(t("specHub.aiTakeover.turnTimeout")));
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

          const unlisten = subscribeAppServerEvents((payload) => {
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
                  appendAiTakeoverLog(
                    "agent",
                    "info",
                    t("specHub.aiTakeover.logThreadBound", {
                      threadId: promotedThreadId,
                    }),
                  );
                }
              }
              return;
            }

            if (!threadId || !trackedThreadIds.has(threadId)) {
              return;
            }

            if (method === "item/agentMessage/delta") {
              const delta = String(params.delta ?? "");
              if (delta) {
                streamBuffer += delta;
                setAiTakeoverStreamText((value) => value + delta);
              }
              return;
            }

            if (method === "item/started") {
              const item = (params.item as Record<string, unknown> | undefined) ?? {};
              const toolName = String(item.tool ?? item.id ?? "").trim();
              if (toolName) {
                appendAiTakeoverLog(
                  "agent",
                  "info",
                  t("specHub.aiTakeover.logToolStarted", { tool: toolName }),
                );
              }
              return;
            }

            if (method === "item/completed") {
              const item = (params.item as Record<string, unknown> | undefined) ?? {};
              const toolName = String(item.tool ?? item.id ?? "").trim();
              if (toolName) {
                appendAiTakeoverLog(
                  "agent",
                  "success",
                  t("specHub.aiTakeover.logToolCompleted", { tool: toolName }),
                );
              }
              return;
            }

            if (method === "processing/heartbeat") {
              heartbeatCount += 1;
              if (heartbeatCount === 1 || heartbeatCount % 6 === 0) {
                appendAiTakeoverLog(
                  "agent",
                  "info",
                  t("specHub.aiTakeover.logHeartbeat", {
                    seconds: heartbeatCount,
                  }),
                );
              }
              return;
            }

            if (method === "turn/error" || method === "error") {
              const errorValue =
                params.error && typeof params.error === "object"
                  ? String((params.error as Record<string, unknown>).message ?? "")
                  : String(params.error ?? "");
              const errorMessage = errorValue.trim() || t("specHub.aiTakeover.turnErrorFallback");
              finish(() => reject(new Error(errorMessage)));
              return;
            }

            if (method === "turn/completed") {
              const completedText = extractResultTextFromTurnCompleted(params);
              const finalText = streamBuffer.trim() || completedText.trim();
              finish(() => resolve(finalText));
            }
          });
        });
      appendAiTakeoverLog(
        "agent",
        "info",
        t("specHub.aiTakeover.logAgentStarted", {
          engine: engineDisplayName(applyAgent),
        }),
      );
      currentPhase = "agent";
      setAiTakeoverPhase("agent");
      let takeoverText = "";
      if (applyAgent === "codex") {
        const threadStart = await startThread(workspaceId);
        const threadId = extractThreadIdFromRpc(threadStart);
        if (!threadId) {
          throw new Error(t("specHub.aiTakeover.missingThreadId"));
        }
        appendAiTakeoverLog(
          "agent",
          "info",
          t("specHub.aiTakeover.logThreadBound", {
            threadId,
          }),
        );
        const waitPromise = waitForTurnResult(threadId);
        await sendUserMessage(workspaceId, threadId, prompt, {
          accessMode: "full-access",
          customSpecRoot,
        });
        takeoverText = await waitPromise;
      } else {
        const trigger = await engineSendMessage(workspaceId, {
          text: prompt,
          engine: applyAgent as EngineType,
          accessMode: "full-access",
          continueSession: false,
          customSpecRoot,
        });
        const threadId = extractThreadIdFromRpc(trigger);
        if (!threadId) {
          const generated = await engineSendMessageSync(workspaceId, {
            text: prompt,
            engine: applyAgent as EngineType,
            accessMode: "full-access",
            continueSession: false,
            customSpecRoot,
          });
          takeoverText = generated.text;
        } else {
          appendAiTakeoverLog(
            "agent",
            "info",
            t("specHub.aiTakeover.logThreadBound", {
              threadId,
            }),
          );
          takeoverText = await waitForTurnResult(threadId);
        }
      }
      setAiTakeoverOutput(takeoverText);
      appendAiTakeoverLog("agent", "success", t("specHub.aiTakeover.logAgentFinished"));
      appendAiTakeoverLog("refresh", "info", t("specHub.aiTakeover.logRefreshStarted"));
      currentPhase = "refresh";
      setAiTakeoverPhase("refresh");
      try {
        await refresh({ force: true, rescanWorkspaceFiles: true });
        setAiTakeoverRefreshState("refreshed");
        appendAiTakeoverLog("refresh", "success", t("specHub.aiTakeover.logRefreshFinished"));
        const archiveReadiness = await evaluateArchiveReadiness(selectedChange.id);
        if (archiveReadiness.ready) {
          setAiTakeoverNotice(
            t("specHub.aiTakeover.success", {
              engine: engineDisplayName(applyAgent),
            }),
          );
          appendAiTakeoverLog("refresh", "success", t("specHub.aiTakeover.logArchiveReady"));
          if (aiTakeoverAutoArchive) {
            appendAiTakeoverLog("refresh", "info", t("specHub.aiTakeover.logArchiveStarted"));
            setIsAiTakeoverArchiving(true);
            try {
              const archiveEvent = await runSpecAction({
                workspaceId,
                changeId: selectedChange.id,
                action: "archive",
                provider: snapshot.provider,
                customSpecRoot,
              });
              if (!archiveEvent.success) {
                const archiveFailure =
                  archiveEvent.output.trim() || t("specHub.aiTakeover.archiveUnknownFailure");
                appendAiTakeoverLog(
                  "refresh",
                  "error",
                  t("specHub.aiTakeover.logArchiveFailed", { reason: archiveFailure }),
                );
                setAiTakeoverError(
                  t("specHub.aiTakeover.archiveFailed", { reason: archiveFailure }),
                );
                setAiTakeoverStatus("failed");
                return;
              }

              await refresh({ force: true, rescanWorkspaceFiles: true });
              const archivePostCheck = await evaluateArchiveReadiness(selectedChange.id);
              if (archivePostCheck.archived) {
                appendAiTakeoverLog("refresh", "success", t("specHub.aiTakeover.logArchiveFinished"));
                setAiTakeoverNotice(t("specHub.aiTakeover.successArchived"));
                setAiTakeoverStatus("success");
              } else {
                const archiveFailure =
                  translateRuntimeText(
                    archivePostCheck.blockers[0] ?? t("specHub.aiTakeover.archiveUnknownFailure"),
                    t,
                  );
                appendAiTakeoverLog(
                  "refresh",
                  "error",
                  t("specHub.aiTakeover.logArchiveFailed", { reason: archiveFailure }),
                );
                setAiTakeoverError(
                  t("specHub.aiTakeover.archiveFailed", { reason: archiveFailure }),
                );
                setAiTakeoverStatus("failed");
              }
            } catch (archiveError) {
              const archiveErrorMessage =
                archiveError instanceof Error ? archiveError.message : String(archiveError);
              appendAiTakeoverLog(
                "refresh",
                "error",
                t("specHub.aiTakeover.logArchiveFailed", { reason: archiveErrorMessage }),
              );
              setAiTakeoverError(
                t("specHub.aiTakeover.archiveFailed", { reason: archiveErrorMessage }),
              );
              setAiTakeoverStatus("failed");
            } finally {
              setIsAiTakeoverArchiving(false);
            }
          } else {
            setAiTakeoverStatus("success");
          }
        } else {
          const blocker = archiveReadiness.blockers[0] ?? t("specHub.runtime.requiredTasksIncomplete");
          const translatedBlocker = translateRuntimeText(blocker, t);
          setAiTakeoverStatus("failed");
          setAiTakeoverError(
            t("specHub.aiTakeover.stillBlocked", {
              reason: translatedBlocker,
            }),
          );
          appendAiTakeoverLog(
            "refresh",
            "error",
            t("specHub.aiTakeover.logStillBlocked", {
              reason: translatedBlocker,
            }),
          );
        }
      } catch (refreshError) {
        const refreshMessage =
          refreshError instanceof Error ? refreshError.message : String(refreshError);
        setAiTakeoverRefreshState("refresh-failed");
        setAiTakeoverStatus("failed");
        setAiTakeoverError(
          t("specHub.aiTakeover.refreshFailed", {
            reason: refreshMessage,
          }),
        );
        appendAiTakeoverLog(
          "refresh",
          "error",
          t("specHub.aiTakeover.logRefreshFailed", {
            reason: refreshMessage,
          }),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAiTakeoverStatus("failed");
      setAiTakeoverError(message);
      appendAiTakeoverLog(
        currentPhase,
        "error",
        t("specHub.aiTakeover.logRunFailed", {
          reason: message,
        }),
      );
    } finally {
      setAiTakeoverFinishedAt(Date.now());
      setIsAiTakeoverRunning(false);
    }
  };

  const handleSaveSpecRoot = async () => {
    const candidate = normalizeSpecRootInput(specRootInput);
    if (!candidate) {
      await setCustomSpecRoot(null);
      setProjectContextNotice(t("specHub.bootstrap.specRootSavedDefault"));
      return;
    }
    if (!isAbsoluteSpecRootPath(candidate)) {
      setProjectGenerationError(t("specHub.bootstrap.specRootMustBeAbsolute"));
      return;
    }
    setProjectGenerationError(null);
    setProjectContextNotice(null);
    await setCustomSpecRoot(candidate);
    setProjectContextNotice(
      t("specHub.bootstrap.specRootSavedCustom", {
        path: candidate,
      }),
    );
  };

  const handleResetSpecRoot = async () => {
    setProjectGenerationError(null);
    setProjectContextNotice(null);
    setSpecRootInput("");
    await setCustomSpecRoot(null);
    setProjectContextNotice(t("specHub.bootstrap.specRootSavedDefault"));
  };

  const handleJumpFromValidation = (path: string | null) => {
    if (!path) {
      return;
    }
    if (path.includes("tasks")) {
      setActiveTab("tasks");
      return;
    }
    if (path.includes("design")) {
      setActiveTab("design");
      return;
    }
    if (path.includes("proposal")) {
      setActiveTab("proposal");
      return;
    }
    if (path.includes("spec")) {
      setActiveTab("specs");
      return;
    }
    if (path.includes("verification")) {
      setActiveTab("verification");
    }
  };
  const controlPanelToggleLabel = isControlPanelCollapsed
    ? t("specHub.expandControlCenter")
    : t("specHub.collapseControlCenter");

  return (
    <section className={`spec-hub ${isArtifactMaximized ? "is-artifact-maximized" : ""}`}>
      <header className="spec-hub-header">
        <div className="spec-hub-title-wrap">
          <h2>{t("specHub.title")}</h2>
          <p>
            {workspaceName
              ? t("specHub.subtitleWithWorkspace", { workspace: workspaceName })
              : t("specHub.subtitle")}
          </p>
        </div>
        <div className="spec-hub-header-side">
          <div className="spec-hub-header-badges">
            <Badge variant="outline" className={`spec-hub-badge ${providerBadgeClass}`}>
              <span className="spec-hub-badge-dot" aria-hidden />
              {providerLabel}
            </Badge>
            <Badge
              variant={snapshot.supportLevel === "full" ? "secondary" : "outline"}
              className={`spec-hub-badge ${supportBadgeClass}`}
            >
              {snapshot.supportLevel === "full"
                ? t("specHub.supportFull")
                : snapshot.supportLevel === "minimal"
                  ? t("specHub.supportMinimal")
                  : t("specHub.supportNone")}
            </Badge>
            <Badge
              variant={gateVariant}
              className={`spec-hub-badge spec-hub-badge-gate is-${gate.status}`}
              title={t(`specHub.gateMeaning.${gate.status}`)}
            >
              <GateHeaderIcon size={12} aria-hidden />
              {t(`specHub.gateHeader.${gate.status}`)}
            </Badge>
          </div>
          <div className="spec-hub-header-ops">
            <button
              type="button"
              className="spec-hub-header-icon-action is-control"
              onClick={() => {
                setIsControlPanelCollapsed((prev) => !prev);
              }}
              title={controlPanelToggleLabel}
              aria-label={controlPanelToggleLabel}
            >
              {isControlPanelCollapsed ? (
                <PanelRightOpen size={15} aria-hidden />
              ) : (
                <PanelRightClose size={15} aria-hidden />
              )}
            </button>
            <button
              type="button"
              className="spec-hub-header-icon-action is-refresh"
              onClick={() => {
                void refresh();
              }}
              disabled={isLoading}
              title={t("specHub.refresh")}
              aria-label={t("specHub.refresh")}
            >
              <RefreshCw size={15} aria-hidden className={isLoading ? "spin" : undefined} />
            </button>
            <button
              type="button"
              className="spec-hub-header-icon-action is-chat"
              onClick={onBackToChat}
              title={t("specHub.backToChat")}
              aria-label={t("specHub.backToChat")}
            >
              <MessageCircle size={15} aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`spec-hub-grid${isArtifactMaximized ? " is-artifact-maximized" : ""}${
          isControlPanelCollapsed ? " is-control-collapsed" : ""
        }`}
      >
        <aside className="spec-hub-changes">
          <div className="spec-hub-panel-header">
            <div className="spec-hub-panel-title">
              <GitPullRequestArrow size={14} aria-hidden />
              <span>{t("specHub.changes")}</span>
            </div>
          </div>

          <div className="spec-hub-change-filters">
            <button
              type="button"
              className="spec-hub-group-toggle-all"
              onClick={handleToggleAllGroups}
              disabled={isExpandCollapseDisabled}
              aria-label={areAllGroupsExpanded ? t("specHub.groupControls.collapseAll") : t("specHub.groupControls.expandAll")}
            >
              <ChevronsUpDown size={13} aria-hidden />
            </button>
            <div className="spec-hub-filter-group" role="group" aria-label={t("specHub.filterTitle")}>
              {(["all", "active", "blocked", "archived"] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={`spec-hub-filter-chip ${changeFilter === entry ? "is-active" : ""}`}
                  aria-pressed={changeFilter === entry}
                  onClick={() => setChangeFilter(entry)}
                >
                  {t(`specHub.filter.${entry}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="spec-hub-change-list">
            {filteredChanges.length === 0 && (
              <div className="spec-hub-empty-state">
                <FileSearch size={18} aria-hidden />
                <p className="spec-hub-empty-state-title">{t("specHub.noChanges")}</p>
                <p className="spec-hub-empty-state-desc">{t("specHub.noChangesHint")}</p>
              </div>
            )}
            {hasGroupedView
              ? groupedChanges.map((group) => {
                  const isExpanded = expandedGroupedKeys.has(group.key);
                  const GroupIcon = group.kind === "date" ? CalendarDays : FolderTree;
                  return (
                    <section key={group.key} className="spec-hub-change-group" aria-label={group.label}>
                      <button
                        type="button"
                        className="spec-hub-change-group-toggle"
                        aria-expanded={isExpanded}
                        onClick={() => handleToggleSingleGroup(group.key)}
                      >
                        <GroupIcon size={13} aria-hidden className="spec-hub-change-group-icon" />
                        <ChevronRight
                          size={14}
                          aria-hidden
                          className={`spec-hub-change-group-chevron ${isExpanded ? "is-expanded" : ""}`}
                        />
                        <span className="spec-hub-change-group-label">{group.label}</span>
                        <span className="spec-hub-change-group-count">{group.changes.length}</span>
                      </button>
                      {isExpanded ? (
                        <div className="spec-hub-change-group-items">
                          {group.changes.map((change) => {
                            const meta = STATUS_META[change.status];
                            const StatusIcon = meta.icon;
                            const isActive = selectedChange?.id === change.id;
                            return (
                              <button
                                key={change.id}
                                type="button"
                                className={`spec-hub-change-item ${isActive ? "is-active" : ""}`}
                                onClick={() => {
                                  void selectChange(change.id);
                                }}
                              >
                                <StatusIcon
                                  aria-hidden
                                  size={16}
                                  className={`spec-hub-status-icon ${meta.className}`}
                                />
                                <div className="spec-hub-change-meta">
                                  <span className="spec-hub-change-id">{change.id}</span>
                                  <span className="spec-hub-change-status">
                                    <StatusIcon
                                      aria-hidden
                                      size={12}
                                      className={`spec-hub-change-status-accent ${meta.className}`}
                                    />
                                    {t(`specHub.status.${change.status}`)}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </section>
                  );
                })
              : filteredChanges.map((change) => {
                  const meta = STATUS_META[change.status];
                  const StatusIcon = meta.icon;
                  const isActive = selectedChange?.id === change.id;
                  return (
                    <button
                      key={change.id}
                      type="button"
                      className={`spec-hub-change-item ${isActive ? "is-active" : ""}`}
                      onClick={() => {
                        void selectChange(change.id);
                      }}
                    >
                      <StatusIcon
                        aria-hidden
                        size={16}
                        className={`spec-hub-status-icon ${meta.className}`}
                      />
                      <div className="spec-hub-change-meta">
                        <span className="spec-hub-change-id">{change.id}</span>
                        <span className="spec-hub-change-status">
                          <StatusIcon
                            aria-hidden
                            size={12}
                            className={`spec-hub-change-status-accent ${meta.className}`}
                          />
                          {t(`specHub.status.${change.status}`)}
                        </span>
                      </div>
                    </button>
                  );
                })}
          </div>
        </aside>

        <section className="spec-hub-artifacts">
          <div className="spec-hub-panel-header">
            <div className="spec-hub-panel-title">
              <FileCode2 size={14} aria-hidden />
              <span>{t("specHub.artifacts")}</span>
            </div>
            <button
              type="button"
              className="ghost spec-hub-panel-compact-action"
              onClick={() => {
                setIsArtifactMaximized((prev) => !prev);
              }}
              title={
                isArtifactMaximized
                  ? t("specHub.restoreArtifacts")
                  : t("specHub.maximizeArtifacts")
              }
            >
              {isArtifactMaximized ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
              <span>
                {isArtifactMaximized
                  ? t("specHub.restoreArtifacts")
                  : t("specHub.maximizeArtifacts")}
              </span>
            </button>
          </div>
          {selectedChange ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="spec-hub-tabs">
              <TabsList>
                <TabsTrigger value="proposal">{t("specHub.tab.proposal")}</TabsTrigger>
                <TabsTrigger value="design">{t("specHub.tab.design")}</TabsTrigger>
                <TabsTrigger value="specs">{t("specHub.tab.specs")}</TabsTrigger>
                <TabsTrigger value="tasks">{t("specHub.tab.tasks")}</TabsTrigger>
                <TabsTrigger value="verification">{t("specHub.tab.verification")}</TabsTrigger>
              </TabsList>
              {(["proposal", "design", "specs", "tasks", "verification"] as const).map((tab) => (
                <TabsContent key={tab} value={tab} className="spec-hub-artifact-content">
                  {tab === "specs" && specSources.length > 1 ? (
                    <div className="spec-hub-spec-file-switcher">
                      <span className="spec-hub-spec-file-count">
                        {t("specHub.specFileCount", { count: specSources.length })}
                      </span>
                      <div className="spec-hub-spec-file-list">
                        {specSources.map((source, index) => (
                          <button
                            key={source.path}
                            type="button"
                            className={`spec-hub-spec-file-chip ${
                              selectedSpecSource?.path === source.path ? "is-active" : ""
                            }`}
                            onClick={() => {
                              setSelectedSpecPath(source.path);
                            }}
                            title={source.path}
                          >
                            <span>{formatSpecFileLabel(source.path, index, t)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="spec-hub-artifact-meta">
                    <span
                      className="spec-hub-artifact-path"
                      title={
                        tab === "specs"
                          ? (selectedSpecSource?.path ?? artifacts[tab].path ?? undefined)
                          : (artifacts[tab].path ?? undefined)
                      }
                    >
                      {tab === "specs"
                        ? (selectedSpecSource?.path ?? artifacts[tab].path ?? t("specHub.missingFile"))
                        : (artifacts[tab].path ?? t("specHub.missingFile"))}
                    </span>
                    {(tab === "specs"
                      ? Boolean(selectedSpecSource?.truncated)
                      : Boolean(artifacts[tab].truncated)) ? (
                      <Badge variant="outline">{t("specHub.truncated")}</Badge>
                    ) : null}
                    {tab === "tasks" && (artifacts.tasks.taskProgress?.total ?? 0) > 0 ? (
                      <Badge variant="info">
                        {t("specHub.taskProgress", {
                          checked: artifacts.tasks.taskProgress?.checked ?? 0,
                          total: artifacts.tasks.taskProgress?.total ?? 0,
                        })}
                      </Badge>
                    ) : null}
                    {tab === "tasks" && (artifacts.tasks.taskProgress?.requiredTotal ?? 0) > 0 ? (
                      <Badge variant="info">
                        {t("specHub.taskProgressRequired", {
                          checked: artifacts.tasks.taskProgress?.requiredChecked ?? 0,
                          total: artifacts.tasks.taskProgress?.requiredTotal ?? 0,
                        })}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="spec-hub-artifact-body">
                    {(tab === "specs"
                      ? (selectedSpecSource?.content ?? artifacts[tab].content)
                      : artifacts[tab].content) ? (
                      tab === "tasks" && taskChecklist.length > 0 ? (
                        <div className="spec-hub-markdown markdown spec-hub-task-list">
                          <p className="spec-hub-task-rule">{t("specHub.tasksEditableRule")}</p>
                          {isRunningAction ? (
                            <p className="spec-hub-task-readonly-hint">
                              {t("specHub.tasksReadonlyDuringAction")}
                            </p>
                          ) : null}
                          {isTaskUpdateRunning ? (
                            <p className="spec-hub-task-readonly-hint">{t("specHub.tasksUpdating")}</p>
                          ) : null}
                          {taskRenderLines.map((line) => {
                            if (line.kind === "blank") {
                              return <div key={line.key} className="spec-hub-task-blank" aria-hidden />;
                            }
                            if (line.kind === "heading") {
                              return (
                                <p
                                  key={line.key}
                                  className={`spec-hub-task-heading level-${Math.min(line.level, 4)}`}
                                >
                                  {line.text}
                                </p>
                              );
                            }
                            if (line.kind === "task") {
                              const disabled = isTaskUpdateRunning || isRunningAction !== null;
                              return (
                                <label
                                  key={line.key}
                                  className={`spec-hub-task-row ${disabled ? "is-disabled" : ""}`}
                                >
                                  <input
                                    type="checkbox"
                                    className={`spec-hub-task-checkbox ${
                                      line.item.index === isUpdatingTaskIndex ? "is-updating" : ""
                                    }`}
                                    checked={line.item.checked}
                                    disabled={disabled}
                                    onChange={() => {
                                      void updateTaskChecklistItem(line.item.index, !line.item.checked);
                                    }}
                                  />
                                  <span className="spec-hub-task-text">
                                    {renderTaskInlineFragments(line.item.text)}
                                  </span>
                                </label>
                              );
                            }
                            if (line.kind === "task-note") {
                              return (
                                <p key={line.key} className="spec-hub-task-note">
                                  {renderTaskInlineFragments(line.text)}
                                </p>
                              );
                            }
                            return (
                              <p key={line.key} className="spec-hub-task-raw">
                                {renderTaskInlineFragments(line.text)}
                              </p>
                            );
                          })}
                          {taskUpdateError ? (
                            <p className="spec-hub-action-error">
                              <XCircle size={14} aria-hidden />
                              <span>{translateRuntimeText(taskUpdateError, t)}</span>
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <Markdown
                          value={
                            tab === "specs"
                              ? (selectedSpecSource?.content ?? artifacts[tab].content)
                              : artifacts[tab].content
                          }
                          className="spec-hub-markdown markdown"
                          codeBlockStyle="message"
                        />
                      )
                    ) : (
                      <div className="spec-hub-empty-state">
                        <FileSearch size={18} aria-hidden />
                        <p className="spec-hub-empty-state-title">{t("specHub.emptyArtifact")}</p>
                        <p className="spec-hub-empty-state-desc">{t("specHub.emptyArtifactHint")}</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="spec-hub-empty-state is-panel">
              <FileSearch size={18} aria-hidden />
              <p className="spec-hub-empty-state-title">{t("specHub.selectChange")}</p>
              <p className="spec-hub-empty-state-desc">{t("specHub.selectChangeHint")}</p>
            </div>
          )}
        </section>

        <aside className="spec-hub-control">
          <div className="spec-hub-panel-header">
            <div className="spec-hub-panel-title">
              <ListChecks size={14} aria-hidden />
              <span>{t("specHub.controlCenter")}</span>
            </div>
          </div>
          <Tabs
            value={controlTab}
            onValueChange={(value) => {
              setControlTab(value as "actions" | "project" | "gate" | "timeline");
            }}
            className="spec-hub-control-tabs"
          >
            <TabsList>
              <TabsTrigger value="project" title={t("specHub.project")} aria-label={t("specHub.project")}>
                <Wrench size={13} aria-hidden />
                <span>{t("specHub.project")}</span>
              </TabsTrigger>
              <TabsTrigger value="actions" title={t("specHub.actions")} aria-label={t("specHub.actions")}>
                <ListChecks size={13} aria-hidden />
                <span>{t("specHub.actions")}</span>
              </TabsTrigger>
              <TabsTrigger value="gate" title={t("specHub.gateTitle")} aria-label={t("specHub.gateTitle")}>
                <ShieldCheck size={13} aria-hidden />
                <span>{t("specHub.gateTitle")}</span>
              </TabsTrigger>
              <TabsTrigger value="timeline" title={t("specHub.timeline")} aria-label={t("specHub.timeline")}>
                <Clock3 size={13} aria-hidden />
                <span>{t("specHub.timeline")}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="actions" className="spec-hub-control-content">
              <div className="spec-hub-action-stack">
                <section className="spec-hub-action-orchestrator">
                  <header className="spec-hub-action-orchestrator-head">
                    <span className="spec-hub-action-orchestrator-head-icon" aria-hidden>
                      <ListChecks size={14} />
                    </span>
                    <div className="spec-hub-action-orchestrator-head-copy">
                      <h4>{t("specHub.actionCenterTitle")}</h4>
                      <p className="spec-hub-action-orchestrator-head-hint">{t("specHub.actionCenterHint")}</p>
                    </div>
                  </header>
                  <div className="spec-hub-shared-engine">
                    <div className="spec-hub-action-orchestrator-row">
                      <div className="spec-hub-shared-engine-select-wrap">
                        <span className="spec-hub-shared-engine-icon" aria-hidden>
                          <EngineIcon engine={applyAgent as EngineType} size={15} />
                        </span>
                        <select
                          id="spec-hub-shared-agent"
                          aria-label={t("specHub.sharedExecutor.label")}
                          value={applyAgent}
                          disabled={isVerifyAutoCompleteBusy || isLoadingAgents}
                          onChange={(event) => {
                            const next = event.target.value;
                            if (isProjectAgent(next)) {
                              setApplyAgent(next);
                            }
                          }}
                        >
                          {actionEngineOptions.map((entry) => (
                            <option key={`shared-agent-${entry.engine}`} value={entry.engine} disabled={!entry.installed}>
                              {entry.label}
                            </option>
                          ))}
                        </select>
                        <span className="spec-hub-shared-engine-chevron" aria-hidden>
                          <ChevronsUpDown size={14} />
                        </span>
                      </div>
                      <div className="spec-hub-action-icon-group" role="group" aria-label={t("specHub.actionCenterTitle")}>
                        <button
                          type="button"
                          className="spec-hub-action-icon-button"
                          disabled={isVerifyAutoCompleteBusy || isAiTakeoverRunning}
                          onClick={() => openProposalDraft("create")}
                          aria-label={t("specHub.proposal.createAction")}
                          title={t("specHub.proposal.createAction")}
                        >
                          <Plus size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="spec-hub-action-icon-button"
                          disabled={
                            appendableChanges.length === 0 ||
                            selectedChange?.status === "archived" ||
                            isVerifyAutoCompleteBusy ||
                            isAiTakeoverRunning
                          }
                          onClick={() => openProposalDraft("append")}
                          aria-label={t("specHub.proposal.appendAction")}
                          title={t("specHub.proposal.appendAction")}
                        >
                          <FilePenLine size={16} aria-hidden />
                        </button>
                      </div>
                    </div>
                    <p className="spec-hub-shared-engine-hint">{t("specHub.sharedExecutor.hint")}</p>
                  </div>
                </section>
                {selectedChange && actions.length > 0 ? (
                  <div className="spec-hub-action-list">
                    {actions.map((action) => {
                      const ActionIcon = ACTION_ICON[action.key];
                      const shouldCollapseBlockers = action.blockers.length > ACTION_BLOCKERS_COLLAPSE_COUNT;
                      const isCollapsedBlockersView = shouldCollapseBlockers && expandedActionBlockers[action.key] !== true;
                      const blockersExpanded = expandedActionBlockers[action.key] === true;
                      const visibleBlockers = isCollapsedBlockersView
                        ? action.blockers.slice(0, ACTION_BLOCKERS_COLLAPSED_VISIBLE_COUNT)
                        : action.blockers;
                      const hiddenBlockerCount = action.blockers.length - visibleBlockers.length;
                      const nextStepHint = buildActionNextStepHint(action.key, action.blockers, t);
                      return (
                        <div key={action.key} className="spec-hub-action-item">
                          <button
                            type="button"
                            className="spec-hub-action-button"
                            disabled={!action.available || isActionDispatchBusy}
                            onClick={() => {
                              void triggerAction(action.key);
                            }}
                            title={action.kind === "passthrough" ? t("specHub.passthroughHint") : undefined}
                          >
                            <ActionIcon size={16} aria-hidden />
                            <span>{t(`specHub.action.${action.key}`, { defaultValue: action.label })}</span>
                          </button>
                          <code>{action.commandPreview}</code>
                          {action.key === "continue" ? (
                            <>
                              <label
                                className={`spec-hub-action-inline-toggle ${
                                  isActionDispatchBusy ? "is-disabled" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={continueAiEnhancementEnabled}
                                  disabled={isActionDispatchBusy}
                                  onChange={(event) => {
                                    setContinueAiEnhancementEnabled(event.target.checked);
                                    setContinueAiEnhancementExecution((prev) => ({ ...prev, error: null }));
                                  }}
                                  aria-label={t("specHub.continueAiEnhancement.label")}
                                />
                                <span>{t("specHub.continueAiEnhancement.label")}</span>
                              </label>
                              {continueAiEnhancementEnabled ? (
                                <p className="spec-hub-action-inline-hint">
                                  {t("specHub.continueAiEnhancement.hint")}
                                </p>
                              ) : null}
                            </>
                          ) : null}
                          {action.key === "apply" ? (
                            currentContinueBrief ? (
                              <>
                                <label
                                  className={`spec-hub-action-inline-toggle ${
                                    isActionDispatchBusy ? "is-disabled" : ""
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={applyUseContinueBrief}
                                    disabled={isActionDispatchBusy}
                                    onChange={(event) => {
                                      setApplyUseContinueBrief(event.target.checked);
                                    }}
                                    aria-label={t("specHub.applyContinueBrief.label")}
                                  />
                                  <span>{t("specHub.applyContinueBrief.label")}</span>
                                </label>
                                <p className="spec-hub-action-inline-hint">
                                  {t("specHub.applyContinueBrief.summary", {
                                    summary: currentContinueBrief.summary,
                                  })}
                                </p>
                                {isCurrentContinueBriefStale ? (
                                  <p className="spec-hub-action-next-step">
                                    <TriangleAlert size={13} aria-hidden />
                                    <span>{t("specHub.applyContinueBrief.stale")}</span>
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <p className="spec-hub-action-inline-hint">
                                {t("specHub.applyContinueBrief.missing")}
                              </p>
                            )
                          ) : null}
                          {action.key === "verify" ? (
                            <label
                              className={`spec-hub-verify-auto-complete ${
                                isActionDispatchBusy ? "is-disabled" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={verifyAutoCompleteEnabled}
                                disabled={isActionDispatchBusy}
                                onChange={(event) => {
                                  setVerifyAutoCompleteEnabled(event.target.checked);
                                  setVerifyAutoCompleteError(null);
                                }}
                                aria-label={t("specHub.verifyAutoComplete.label")}
                              />
                              <span>{t("specHub.verifyAutoComplete.label")}</span>
                            </label>
                          ) : null}
                          {action.key === "verify" && verifyAutoCompleteEnabled ? (
                            <p className="spec-hub-verify-auto-complete-hint">
                              {t("specHub.verifyAutoComplete.hint")}
                            </p>
                          ) : null}
                          {action.key === "verify" && isVerifyAutoCompleting && !showVerifyAutoCompleteFloating ? (
                            <p className="spec-hub-running">{t("specHub.verifyAutoComplete.running")}</p>
                          ) : null}
                          {action.key === "verify" && verifyAutoCompleteError && !showVerifyAutoCompleteFloating ? (
                            <p className="spec-hub-action-error">
                              <XCircle size={14} aria-hidden />
                              <span>{verifyAutoCompleteError}</span>
                            </p>
                          ) : null}
                          {action.blockers.length > 0 ? (
                            <div className="spec-hub-action-blockers">
                              {visibleBlockers.map((blocker) => (
                                <p
                                  key={`${action.key}-${blocker}`}
                                  className={isCollapsedBlockersView ? "is-collapsed" : undefined}
                                >
                                  <TriangleAlert size={13} aria-hidden />
                                  <span className="spec-hub-action-blocker-text">
                                    {translateRuntimeText(blocker, t)}
                                  </span>
                                </p>
                              ))}
                              {shouldCollapseBlockers ? (
                                <button
                                  type="button"
                                  className="ghost spec-hub-action-blockers-toggle"
                                  onClick={() => {
                                    setExpandedActionBlockers((prev) => ({
                                      ...prev,
                                      [action.key]: !blockersExpanded,
                                    }));
                                  }}
                                >
                                  {blockersExpanded
                                    ? t("specHub.blockers.collapse")
                                    : t("specHub.blockers.expand", { count: hiddenBlockerCount })}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                          {nextStepHint ? (
                            <p className="spec-hub-action-next-step">
                              <ArrowRightCircle size={13} aria-hidden />
                              <span>{nextStepHint}</span>
                            </p>
                          ) : null}
                        </div>
                      );
                    })}

                    {snapshot.provider === "speckit" ? (
                      <div className="spec-hub-passthrough">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            void openUrl("https://github.com/github/spec-kit");
                          }}
                        >
                          <ExternalLink size={14} aria-hidden />
                          <span>{t("specHub.openSpecKitDocs")}</span>
                        </button>
                        <code>specify --help</code>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="spec-hub-action-list">
                    {actionsForEmptySelection.map(({ key }) => {
                      const ActionIcon = ACTION_ICON[key];
                      return (
                        <div key={key} className="spec-hub-action-item">
                          <button type="button" className="spec-hub-action-button" disabled>
                            <ActionIcon size={16} aria-hidden />
                            <span>{t(`specHub.action.${key}`)}</span>
                          </button>
                          <code>{buildActionPreviewWithoutChange(key)}</code>
                          <div className="spec-hub-action-blockers">
                            <p>
                              <TriangleAlert size={13} aria-hidden />
                              <span>{t("specHub.runtime.selectChangeFirst")}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedChange && activeGuidanceAction ? (
                  <section className="spec-hub-guidance-result">
                    <div className="spec-hub-panel-title">
                      <CircleDashed size={14} aria-hidden />
                      <span>{t("specHub.guidance.title")}</span>
                    </div>
                    <div className="spec-hub-guidance-grid">
                      <article className="spec-hub-guidance-field">
                        <span>{t("specHub.guidance.fieldAction")}</span>
                        <strong>{guidanceActionLabel}</strong>
                      </article>
                      <article className="spec-hub-guidance-field">
                        <span>{t("specHub.guidance.fieldStatus")}</span>
                        <strong className={`is-${guidanceStatus}`}>{guidanceStatusLabel}</strong>
                      </article>
                      <article className="spec-hub-guidance-field">
                        <span>{t("specHub.guidance.fieldTime")}</span>
                        <strong>
                          {guidanceTimeLabel}
                          {guidanceStatus === "running" && guidanceElapsedLabel
                            ? ` · ${t("specHub.aiTakeover.elapsed", { duration: guidanceElapsedLabel })}`
                            : ""}
                        </strong>
                      </article>
                    </div>
                    {guidanceStatus === "running" ? (
                      <p className="spec-hub-running">{t("specHub.guidance.runningHint")}</p>
                    ) : guidanceStatus === "success" ? (
                      guidanceSummary.noSuggestion ? (
                        <p className="spec-hub-context-notice">{t("specHub.guidance.noSuggestion")}</p>
                      ) : (
                        <>
                          {guidanceSummary.isTemplate ? (
                            <div className="spec-hub-guidance-template">
                              <span>{t("specHub.guidance.templateTitle")}</span>
                              <ul>
                                {guidanceSummary.artifactId ? (
                                  <li>
                                    {t("specHub.guidance.templateArtifact", {
                                      value: guidanceSummary.artifactId,
                                    })}
                                  </li>
                                ) : null}
                                {guidanceSummary.artifactChange ? (
                                  <li>
                                    {t("specHub.guidance.templateChange", {
                                      value: guidanceSummary.artifactChange,
                                    })}
                                  </li>
                                ) : null}
                                {guidanceSummary.artifactSchema ? (
                                  <li>
                                    {t("specHub.guidance.templateSchema", {
                                      value: guidanceSummary.artifactSchema,
                                    })}
                                  </li>
                                ) : null}
                                {guidanceSummary.taskText ? (
                                  <li>
                                    {t("specHub.guidance.templateTask", {
                                      value: guidanceSummary.taskText,
                                    })}
                                  </li>
                                ) : null}
                              </ul>
                            </div>
                          ) : (
                            <div className="spec-hub-guidance-highlights">
                              <span>{t("specHub.guidance.summaryTitle")}</span>
                              <ul>
                                {guidanceSummary.highlights.map((line, index) => (
                                  <li key={`guidance-highlight-${index}`}>{line}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )
                    ) : guidanceStatus === "failed" ? (
                      <p className="spec-hub-action-error">
                        <XCircle size={14} aria-hidden />
                        <span>{t("specHub.guidance.failedHint")}</span>
                      </p>
                    ) : (
                      <p className="spec-hub-running">{t("specHub.guidance.idleHint")}</p>
                    )}

                    {(guidanceStatus === "success" || guidanceStatus === "failed") && guidanceNextAction ? (
                      <div className="spec-hub-guidance-next">
                        <span>{t("specHub.guidance.nextTitle")}</span>
                        <button
                          type="button"
                          className="spec-hub-action-button"
                          disabled={!guidanceNextAction.available || isRunningAction !== null}
                          onClick={() => {
                            void triggerAction(guidanceNextAction.key);
                          }}
                        >
                          <ArrowRightCircle size={16} aria-hidden />
                          <span>{t("specHub.guidance.nextAction", { action: t(`specHub.action.${guidanceNextAction.key}`) })}</span>
                        </button>
                        {!guidanceNextAction.available && guidanceNextAction.blockers.length > 0 ? (
                          <div className="spec-hub-action-blockers">
                            <p>
                              <TriangleAlert size={13} aria-hidden />
                              <span>{translateRuntimeText(guidanceNextAction.blockers[0] ?? "", t)}</span>
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {(guidanceStatus === "success" || guidanceStatus === "failed") && guidanceOutput ? (
                      <div className="spec-hub-guidance-controls">
                        {activeGuidanceAction ? (
                          <button
                            type="button"
                            className="ghost"
                            disabled={isRunningAction !== null}
                            onClick={() => {
                              void triggerAction(activeGuidanceAction);
                            }}
                          >
                            {t("specHub.guidance.retry")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setGuidanceRawExpanded((value) => !value)}
                        >
                          {guidanceRawExpanded ? t("specHub.guidance.hideRaw") : t("specHub.guidance.showRaw")}
                        </button>
                        {guidanceRawExpanded && guidanceRawSanitized.removedTags.length > 0 ? (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => setGuidanceShowFullRaw((value) => !value)}
                          >
                            {guidanceShowFullRaw
                              ? t("specHub.guidance.useCompactRaw")
                              : t("specHub.guidance.showFullRaw")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {guidanceRawExpanded && guidanceOutput ? (
                      <div className="spec-hub-command-preview spec-hub-guidance-raw">
                        <span>
                          {t("specHub.guidance.rawOutputTitle")}
                          {guidanceShowFullRaw
                            ? ` · ${t("specHub.guidance.rawModeFull")}`
                            : ` · ${t("specHub.guidance.rawModeCompact")}`}
                        </span>
                        <code>{guidanceRawText}</code>
                        {!guidanceShowFullRaw && guidanceRawSanitized.removedTags.length > 0 ? (
                          <p className="spec-hub-guidance-raw-hint">
                            {t("specHub.guidance.rawCollapsedHint", {
                              sections: guidanceRawSanitized.removedTags.join(", "),
                            })}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {showAiTakeoverPanel ? (
                  <section className="spec-hub-ai-takeover">
                    <div className="spec-hub-panel-title">
                      <Wrench size={14} aria-hidden />
                      <span>{t("specHub.aiTakeover.title")}</span>
                    </div>
                    <p className="spec-hub-bootstrap-desc">{t("specHub.aiTakeover.description")}</p>
                    <div className="spec-hub-command-preview">
                      <span>{t("specHub.aiTakeover.agentLabel")}</span>
                      <code>{engineDisplayName(applyAgent)}</code>
                    </div>
                    <label className="spec-hub-ai-takeover-auto-archive">
                      <input
                        type="checkbox"
                        checked={aiTakeoverAutoArchive}
                        disabled={isAiTakeoverRunning || isAiTakeoverArchiving}
                        onChange={(event) => setAiTakeoverAutoArchive(event.target.checked)}
                      />
                      <span>{t("specHub.aiTakeover.autoArchiveLabel")}</span>
                    </label>
                    {latestArchiveFailureOutputForAi ? (
                      <div className="spec-hub-command-preview">
                        <span>{t("specHub.aiTakeover.latestArchiveOutput")}</span>
                        <code>{latestArchiveFailureOutputForAi}</code>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="spec-hub-action-button"
                      disabled={
                        isAiTakeoverRunning ||
                        isRunningAction !== null ||
                        isAiTakeoverArchiving ||
                        isProposalRunning
                      }
                      onClick={() => {
                        void handleArchiveAiTakeover();
                      }}
                    >
                      <Wrench size={16} aria-hidden />
                      <span>
                        {isAiTakeoverRunning || isAiTakeoverArchiving
                          ? t("specHub.aiTakeover.running")
                          : t("specHub.aiTakeover.action")}
                      </span>
                    </button>
                  </section>
                ) : null}

              </div>
              {isRunningAction ? (
                <p className="spec-hub-running">{t("specHub.runningAction")}</p>
              ) : null}
              {actionError ? (
                <p className="spec-hub-action-error">
                  <XCircle size={14} aria-hidden />
                  <span>{translateRuntimeText(actionError, t)}</span>
                </p>
              ) : null}
            </TabsContent>

            <TabsContent value="project" className="spec-hub-control-content">
              {showProjectContextPanel ? (
                <div className="spec-hub-project-stack">
                  <section className="spec-hub-bootstrap-panel spec-hub-project-card">
                    <header className="spec-hub-bootstrap-card-head">
                      <div className="spec-hub-bootstrap-card-title">
                        <Wrench size={14} aria-hidden />
                        <span>{t("specHub.bootstrap.specRootTitle")}</span>
                      </div>
                      <p className="spec-hub-bootstrap-desc">{t("specHub.bootstrap.specRootDescription")}</p>
                    </header>
                    <div className="spec-hub-form-field">
                      <label htmlFor="spec-hub-spec-root-input">{t("specHub.bootstrap.specRootLabel")}</label>
                      <input
                        id="spec-hub-spec-root-input"
                        type="text"
                        value={specRootInput}
                        onChange={(event) => setSpecRootInput(event.target.value)}
                        placeholder={t("specHub.bootstrap.specRootPlaceholder")}
                        disabled={contextSubmitting}
                      />
                    </div>
                    <p className="spec-hub-bootstrap-root-current">
                      {t("specHub.bootstrap.specRootCurrent", {
                        path: activeSpecRootDisplay,
                        source: isUsingCustomSpecRoot
                          ? t("specHub.bootstrap.specRootSourceCustom")
                          : t("specHub.bootstrap.specRootSourceDefault"),
                      })}
                    </p>
                    <div className="spec-hub-bootstrap-root-actions">
                      <button
                        type="button"
                        className="ghost spec-hub-bootstrap-inline-action"
                        onClick={() => {
                          void handleSaveSpecRoot();
                        }}
                        disabled={contextSubmitting}
                      >
                        {t("specHub.bootstrap.specRootSave")}
                      </button>
                      <button
                        type="button"
                        className="ghost spec-hub-bootstrap-inline-action"
                        onClick={() => {
                          void handleResetSpecRoot();
                        }}
                        disabled={contextSubmitting}
                      >
                        {t("specHub.bootstrap.specRootReset")}
                      </button>
                    </div>
                  </section>
                  <section className="spec-hub-bootstrap-panel spec-hub-project-card is-context">
                    <header className="spec-hub-bootstrap-card-head">
                      <div className="spec-hub-bootstrap-card-title">
                        <Wrench size={14} aria-hidden />
                        <span>
                          {showBootstrapGuide
                            ? t("specHub.bootstrap.title")
                            : t("specHub.bootstrap.projectInfoTitle")}
                        </span>
                      </div>
                      <p className="spec-hub-bootstrap-desc">
                        {showBootstrapGuide
                          ? t("specHub.bootstrap.description")
                          : t("specHub.bootstrap.projectInfoDescription")}
                      </p>
                    </header>
                    <div className="spec-hub-auto-profile">
                      <label htmlFor="spec-hub-profile-select">
                        {t("specHub.bootstrap.agentLabel")}
                      </label>
                      <div className="spec-hub-auto-profile-select-wrap">
                        <span className="spec-hub-auto-profile-select-icon" aria-hidden>
                          <EngineIcon engine={projectAgent as EngineType} size={15} />
                        </span>
                        <select
                          id="spec-hub-profile-select"
                          value={projectAgent}
                          onChange={(event) => setProjectAgent(event.target.value as ProjectAgent)}
                          disabled={contextSubmitting || isLoadingAgents || isProposalRunning}
                        >
                          {projectEngineOptions.map((agent) => (
                            <option key={agent.engine} value={agent.engine} disabled={!agent.installed}>
                              {agent.label}
                            </option>
                          ))}
                        </select>
                        <span className="spec-hub-auto-profile-select-chevron" aria-hidden>
                          <ChevronsUpDown size={14} />
                        </span>
                      </div>
                      <p className="spec-hub-bootstrap-inline-hint">{t("specHub.bootstrap.agentHint")}</p>
                    </div>
                    <div className="spec-hub-auto-preview">
                      {lastGeneratedProjectInfo ? (
                        <>
                          <p>{t("specHub.bootstrap.previewTitle")}</p>
                          <ul>
                            <li>
                              {t("specHub.bootstrap.previewType", {
                                type: t(`specHub.bootstrap.typeValue.${lastGeneratedProjectInfo.projectType}`),
                              })}
                            </li>
                            <li>
                              {t("specHub.bootstrap.previewDomain", { value: lastGeneratedProjectInfo.domain })}
                            </li>
                            <li>
                              {t("specHub.bootstrap.previewArchitecture", {
                                value: lastGeneratedProjectInfo.architecture,
                              })}
                            </li>
                            <li>
                              {t("specHub.bootstrap.previewConstraints", {
                                value: lastGeneratedProjectInfo.constraints,
                              })}
                            </li>
                            <li>
                              {t("specHub.bootstrap.previewOwners", { value: lastGeneratedProjectInfo.owners })}
                            </li>
                          </ul>
                        </>
                      ) : (
                        <p>{t("specHub.bootstrap.previewPending")}</p>
                      )}
                    </div>
                    <div className="spec-hub-command-preview spec-hub-command-preview-compact">
                      <span>
                        {showBootstrapGuide
                          ? t("specHub.bootstrap.bootstrapCommand")
                          : t("specHub.bootstrap.projectInfoCommand")}
                      </span>
                      <code>{contextCommandPreview}</code>
                    </div>
                    <button
                      type="button"
                      className="spec-hub-action-button"
                      onClick={() => {
                        void handleProjectContextSubmit();
                      }}
                      disabled={contextSubmitting || isProposalRunning}
                    >
                      <Wrench size={16} aria-hidden />
                      <span>
                        {contextSubmitting
                          ? t("specHub.bootstrap.generatingByAgent")
                          : showBootstrapGuide
                            ? t("specHub.bootstrap.generateAndBootstrapAction")
                            : t("specHub.bootstrap.generateAndSaveAction")}
                      </span>
                    </button>
                    {contextError ? (
                      <p className="spec-hub-action-error">
                        <XCircle size={14} aria-hidden />
                        <span>{translateRuntimeText(contextError, t)}</span>
                      </p>
                    ) : null}
                    {projectContextNotice ? (
                      <p className="spec-hub-running spec-hub-context-notice">{projectContextNotice}</p>
                    ) : null}
                  </section>
                  <section className="spec-hub-bootstrap-panel spec-hub-project-card">
                    <header className="spec-hub-bootstrap-card-head spec-hub-doctor-card-head">
                      <div className="spec-hub-bootstrap-card-title">
                        <HeartPulse size={14} aria-hidden />
                        <span>{t("specHub.doctorTitle")}</span>
                      </div>
                      <div className="spec-hub-mode-switch" role="group" aria-label={t("specHub.modeTitle")}>
                        <button
                          type="button"
                          className={`ghost ${environmentMode === "managed" ? "is-active" : ""}`}
                          onClick={() => switchMode("managed")}
                        >
                          {t("specHub.modeManaged")}
                        </button>
                        <button
                          type="button"
                          className={`ghost ${environmentMode === "byo" ? "is-active" : ""}`}
                          onClick={() => switchMode("byo")}
                        >
                          {t("specHub.modeByo")}
                        </button>
                      </div>
                    </header>
                    <div className="spec-hub-doctor-content">
                      <div className="spec-hub-doctor-checks">
                        {snapshot.environment.checks.map((check) => (
                          <article key={check.key} className={`spec-hub-check-item ${check.ok ? "ok" : "fail"}`}>
                            <div className="spec-hub-check-row">
                              <span className="spec-hub-check-label">
                                {t(`specHub.check.${check.key}`, { defaultValue: check.label })}
                              </span>
                              <code title={translateRuntimeText(check.detail, t)}>
                                {translateRuntimeText(check.detail, t)}
                              </code>
                              <Badge variant={check.ok ? "secondary" : "warning"}>
                                {check.ok ? t("specHub.healthOk") : t("specHub.healthMissing")}
                              </Badge>
                            </div>
                          </article>
                        ))}
                      </div>
                      {(snapshot.environment.blockers.length > 0 || snapshot.environment.hints.length > 0) && (
                        <div className="spec-hub-doctor-hints">
                          {snapshot.environment.blockers.map((entry) => (
                            <p key={entry}>
                              <ShieldAlert size={13} aria-hidden />
                              <span>{translateRuntimeText(entry, t)}</span>
                            </p>
                          ))}
                          {snapshot.environment.hints.map((entry) => (
                            <p key={entry} className="is-hint">
                              <TriangleAlert size={13} aria-hidden />
                              <span>{translateRuntimeText(entry, t)}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="spec-hub-empty-state is-panel">
                  <FileSearch size={18} aria-hidden />
                  <p className="spec-hub-empty-state-title">{t("specHub.bootstrap.projectInfoTitle")}</p>
                  <p className="spec-hub-empty-state-desc">{t("specHub.bootstrap.unsupported")}</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="gate" className="spec-hub-control-content">
              {validationIssues.length > 0 ? (
                <div className="spec-hub-validation-panel">
                  <div className="spec-hub-panel-title">
                    <ShieldAlert size={14} aria-hidden />
                    <span>{t("specHub.validationPanel")}</span>
                  </div>
                  <div className="spec-hub-validation-list">
                    {validationIssues.map((issue, index) => (
                      <button
                        key={`${issue.target}-${index}`}
                        type="button"
                        className="spec-hub-validation-item"
                        onClick={() => handleJumpFromValidation(issue.path)}
                      >
                        <strong>{translateRuntimeText(issue.target, t)}</strong>
                        <span>{issue.reason}</span>
                        <small>{translateRuntimeText(issue.hint, t)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
                <div className="spec-hub-gate-panel">
                  <div className="spec-hub-gate-checks">
                    {gate.checks.map((check) => (
                      <article key={check.key} className={`spec-hub-gate-check ${check.status}`}>
                        <header>
                          <span>{t(`specHub.gateCheck.${check.key}`, { defaultValue: check.label })}</span>
                          <Badge
                            variant={
                              check.status === "pass"
                                ? "secondary"
                                : check.status === "warn"
                                  ? "warning"
                                  : "destructive"
                            }
                          >
                            {t(`specHub.gate.${check.status}`)}
                          </Badge>
                        </header>
                        <p>{translateRuntimeText(check.message, t)}</p>
                      </article>
                  ))}
                </div>
              </div>
              {snapshot.blockers.length > 0 ? (
                <div className="spec-hub-blockers">
                  {snapshot.blockers.map((entry) => (
                    <div key={entry} className="spec-hub-blocker-item">
                      <TriangleAlert size={14} aria-hidden />
                      <span>{translateRuntimeText(entry, t)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="timeline" className="spec-hub-control-content">
              {timeline.length === 0 ? (
                <div className="spec-hub-empty-state is-panel">
                  <FileSearch size={18} aria-hidden />
                  <p className="spec-hub-empty-state-title">{t("specHub.noTimeline")}</p>
                  <p className="spec-hub-empty-state-desc">{t("specHub.noTimelineHint")}</p>
                </div>
              ) : (
                <div className="spec-hub-timeline-list">
                  {timeline.map((entry) => (
                    <article key={entry.id} className="spec-hub-timeline-item">
                      <header>
                        <span className={`spec-hub-timeline-status ${entry.success ? "ok" : "fail"}`}>
                          {entry.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                          <strong>{t(`specHub.timelineKind.${entry.kind}`)}</strong>
                        </span>
                        <time>{new Date(entry.at).toLocaleTimeString()}</time>
                      </header>
                      <code>{entry.command}</code>
                      {entry.gitRefs.length > 0 ? (
                        <p className="spec-hub-git-refs">
                          <GitBranch size={12} aria-hidden />
                          <span>{entry.gitRefs.join(", ")}</span>
                        </p>
                      ) : null}
                      <pre>{entry.output || t("specHub.emptyOutput")}</pre>
                    </article>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </aside>
      </div>
      {proposalDraftMode && typeof document !== "undefined"
        ? createPortal(
            <div className="spec-hub-proposal-dialog-backdrop" role="presentation">
              <section className="spec-hub-proposal-dialog" role="dialog" aria-label={t("specHub.proposal.dialogTitle")}>
                <header className="spec-hub-proposal-dialog-header">
                  <div className="spec-hub-panel-title">
                    <FilePenLine size={14} aria-hidden />
                    <span>
                      {proposalDraftMode === "create"
                        ? t("specHub.proposal.dialogTitleCreate")
                        : t("specHub.proposal.dialogTitleAppend")}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setProposalDraftMode(null);
                      setProposalDraftError(null);
                      setProposalDraftImages([]);
                    }}
                    aria-label={t("specHub.proposal.closeDialog")}
                    title={t("specHub.proposal.closeDialog")}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </header>
                <div className="spec-hub-proposal-dialog-body">
                  <p className="spec-hub-bootstrap-desc">
                    {proposalDraftMode === "create"
                      ? t("specHub.proposal.dialogDescriptionCreate")
                      : t("specHub.proposal.dialogDescriptionAppend")}
                  </p>
                  {proposalDraftMode === "append" ? (
                    <div className="spec-hub-auto-profile">
                      <label htmlFor="spec-hub-proposal-target">{t("specHub.proposal.targetChangeLabel")}</label>
                      <select
                        id="spec-hub-proposal-target"
                        value={proposalTargetChangeId ?? ""}
                        onChange={(event) => {
                          setProposalTargetChangeId(event.target.value || null);
                        }}
                      >
                        {appendableChanges.map((change) => (
                          <option key={`proposal-target-${change.id}`} value={change.id}>
                            {change.id}
                          </option>
                        ))}
                      </select>
                      <p>{t("specHub.proposal.targetChangeHint")}</p>
                    </div>
                  ) : null}
                  <div className="spec-hub-form-field">
                    <div className="spec-hub-proposal-composer-header">
                      <span>{t("specHub.proposal.contentLabel")}</span>
                      <button
                        type="button"
                        className="ghost spec-hub-proposal-attach-button"
                        onClick={() => {
                          void pickProposalDraftImages();
                        }}
                        disabled={isProposalRunning}
                        aria-label={t("specHub.proposal.addImageAction")}
                        title={t("specHub.proposal.addImageAction")}
                      >
                        <ImagePlus size={14} aria-hidden />
                        <span>{t("specHub.proposal.addImageAction")}</span>
                      </button>
                    </div>
                    <div
                      ref={proposalDraftDropTargetRef}
                      className={`spec-hub-proposal-composer${isProposalDraftDragOver ? " is-drag-over" : ""}`}
                      onDragOver={handleProposalDraftDragOver}
                      onDragEnter={handleProposalDraftDragEnter}
                      onDragLeave={handleProposalDraftDragLeave}
                      onDrop={(event) => {
                        void handleProposalDraftDrop(event);
                      }}
                    >
                      <textarea
                        value={proposalDraftContent}
                        onChange={(event) => setProposalDraftContent(event.target.value)}
                        onPaste={(event) => {
                          void handleProposalDraftPaste(event);
                        }}
                        placeholder={
                          proposalDraftMode === "create"
                            ? t("specHub.proposal.contentPlaceholderCreate")
                            : t("specHub.proposal.contentPlaceholderAppend")
                        }
                        rows={9}
                      />
                    </div>
                    <p className="spec-hub-proposal-attachment-hint">
                      {t("specHub.proposal.attachmentHint", { count: PROPOSAL_MAX_ATTACHMENTS })}
                    </p>
                    <ComposerAttachments
                      attachments={proposalDraftImages}
                      disabled={isProposalRunning}
                      onRemoveAttachment={removeProposalDraftImage}
                    />
                  </div>
                  {proposalDraftError ? (
                    <p className="spec-hub-action-error">
                      <XCircle size={14} aria-hidden />
                      <span>{proposalDraftError}</span>
                    </p>
                  ) : null}
                </div>
                <footer className="spec-hub-proposal-dialog-footer">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setProposalDraftMode(null);
                      setProposalDraftError(null);
                      setProposalDraftImages([]);
                    }}
                  >
                    {t("specHub.proposal.cancelAction")}
                  </button>
                  <button
                    type="button"
                    className="spec-hub-action-button"
                    onClick={() => {
                      void handleProposalSubmit();
                    }}
                  >
                    <FilePenLine size={16} aria-hidden />
                    <span>
                      {proposalDraftMode === "create"
                        ? t("specHub.proposal.submitCreateAction")
                        : t("specHub.proposal.submitAppendAction")}
                    </span>
                  </button>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
      {continueApplyLinkGeometry && typeof document !== "undefined"
        ? createPortal(
            <div
              className="spec-hub-feedback-link"
              aria-hidden
              style={{
                left: `${continueApplyLinkGeometry.left}px`,
                top: `${continueApplyLinkGeometry.top}px`,
                width: `${continueApplyLinkGeometry.width}px`,
                transform: `rotate(${continueApplyLinkGeometry.angle}deg)`,
              }}
            >
              <span>{t("specHub.autoCombo.linkLabel")}</span>
            </div>,
            document.body,
          )
        : null}
      {applyComboLinkGeometry && typeof document !== "undefined"
        ? createPortal(
            <div
              className="spec-hub-feedback-link"
              aria-hidden
              style={{
                left: `${applyComboLinkGeometry.left}px`,
                top: `${applyComboLinkGeometry.top}px`,
                width: `${applyComboLinkGeometry.width}px`,
                transform: `rotate(${applyComboLinkGeometry.angle}deg)`,
              }}
            >
              <span>{t("specHub.autoCombo.linkLabel")}</span>
            </div>,
            document.body,
          )
        : null}
      {showProposalExecutionFloating && typeof document !== "undefined"
        ? createPortal(
            <section
              className={`spec-hub-apply-floating spec-hub-proposal-floating${
                isProposalFeedbackCollapsed ? " is-collapsed" : ""
              }${isAgentFeedbackDragging ? " is-dragging" : ""}`}
              style={{
                left: `${agentFeedbackPosition.x}px`,
                top: `${agentFeedbackPosition.y}px`,
              }}
              role="dialog"
              aria-label={t("specHub.proposal.title")}
            >
              <header className="spec-hub-apply-floating-header" onPointerDown={handleAgentFeedbackPointerDown}>
                <div className="spec-hub-panel-title">
                  <FilePenLine size={14} aria-hidden />
                  <span>{t("specHub.proposal.title")}</span>
                </div>
                <div className="spec-hub-apply-floating-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIsProposalFeedbackCollapsed((prev) => !prev);
                    }}
                    aria-label={
                      isProposalFeedbackCollapsed
                        ? t("specHub.proposal.expandPanel")
                        : t("specHub.proposal.collapsePanel")
                    }
                    title={
                      isProposalFeedbackCollapsed
                        ? t("specHub.proposal.expandPanel")
                        : t("specHub.proposal.collapsePanel")
                    }
                  >
                    {isProposalFeedbackCollapsed ? <Maximize2 size={14} aria-hidden /> : <Minimize2 size={14} aria-hidden />}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIsProposalFeedbackClosed(true);
                      resetAgentFeedbackPosition();
                    }}
                    aria-label={t("specHub.proposal.closePanel")}
                    title={t("specHub.proposal.closePanel")}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              </header>
              {!isProposalFeedbackCollapsed ? (
                <div className="spec-hub-apply-floating-body">
                  <div className="spec-hub-guidance-grid">
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.proposal.fieldStatus")}</span>
                      {renderFeedbackStatusValue(proposalExecution.status, proposalExecutionStatusLabel)}
                    </article>
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.proposal.fieldPhase")}</span>
                      <strong>{proposalExecutionPhaseLabel}</strong>
                    </article>
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.proposal.fieldEngine")}</span>
                      <strong>{proposalExecution.executor ? engineDisplayName(proposalExecution.executor) : "--"}</strong>
                    </article>
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.proposal.fieldMode")}</span>
                      <strong>{proposalModeLabel}</strong>
                    </article>
                  </div>
                  {proposalExecution.startedAt ? (
                    <p className="spec-hub-bootstrap-desc">
                      {t("specHub.proposal.startedAt", {
                        time: new Date(proposalExecution.startedAt).toLocaleTimeString(),
                      })}
                      {proposalExecution.finishedAt
                        ? ` · ${t("specHub.proposal.finishedAt", {
                            time: new Date(proposalExecution.finishedAt).toLocaleTimeString(),
                          })}`
                        : ""}
                      {proposalDurationLabel
                        ? ` · ${t("specHub.feedbackElapsed", { duration: proposalDurationLabel })}`
                        : ""}
                    </p>
                  ) : null}
                  {proposalExecution.targetChangeId ? (
                    <p className="spec-hub-bootstrap-desc">
                      {t("specHub.proposal.fieldTarget")}: {proposalExecution.targetChangeId}
                    </p>
                  ) : null}
                  {proposalExecution.summary ? (
                    <p className="spec-hub-context-notice">{proposalExecution.summary}</p>
                  ) : null}
                  {proposalExecution.error ? (
                    <p className="spec-hub-action-error">
                      <XCircle size={14} aria-hidden />
                      <span>{proposalExecution.error}</span>
                    </p>
                  ) : null}
                  {proposalExecution.preflightBlockers.length > 0 ? (
                    <div className="spec-hub-action-error">
                      <TriangleAlert size={14} aria-hidden />
                      <span>{t("specHub.runtime.validationFixHint")}</span>
                    </div>
                  ) : null}
                  {proposalExecution.preflightBlockers.length > 0 ? (
                    <div className="spec-hub-command-preview">
                      <span>Preflight blockers</span>
                      <code>
                        {proposalExecution.preflightBlockers
                          .map((entry) => `- ${translateRuntimeText(entry, t)}`)
                          .join("\n")}
                      </code>
                    </div>
                  ) : null}
                  {proposalExecution.preflightHints.length > 0 ? (
                    <div className="spec-hub-command-preview">
                      <span>Preflight hints</span>
                      <code>{proposalExecution.preflightHints.map((entry) => `- ${entry}`).join("\n")}</code>
                    </div>
                  ) : null}
                  {renderFeedbackMetricsLine(zeroFeedbackMetrics)}
                  {renderChangedFilesPreview([])}
                  {proposalExecution.streamOutput ? (
                    <div className="spec-hub-command-preview">
                      <span>{t("specHub.proposal.streamTitle")}</span>
                      <code ref={proposalStreamRef}>{proposalExecution.streamOutput}</code>
                    </div>
                  ) : null}
                  {proposalExecution.logs.length > 0 ? (
                    <div className="spec-hub-command-preview">
                      <span>{t("specHub.proposal.logsTitle")}</span>
                      <code ref={proposalLogsRef}>{proposalExecution.logs.join("\n")}</code>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>,
            document.body,
          )
        : null}
      {showContinueAiEnhancementFloating && typeof document !== "undefined"
        ? createPortal(
            <section
              className={`spec-hub-apply-floating spec-hub-continue-floating${
                isContinueAiEnhancementFeedbackCollapsed ? " is-collapsed" : ""
              }${isAgentFeedbackDragging ? " is-dragging" : ""}`}
              style={{
                left: `${agentFeedbackPosition.x}px`,
                top: `${agentFeedbackPosition.y}px`,
              }}
              role="dialog"
              aria-label={t("specHub.continueAiEnhancement.title")}
            >
              <header className="spec-hub-apply-floating-header" onPointerDown={handleAgentFeedbackPointerDown}>
                <div className="spec-hub-panel-title">
                  <ArrowRightCircle size={14} aria-hidden />
                  <span>{t("specHub.continueAiEnhancement.title")}</span>
                </div>
                <div className="spec-hub-apply-floating-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIsContinueAiEnhancementFeedbackCollapsed((prev) => !prev);
                    }}
                    aria-label={
                      isContinueAiEnhancementFeedbackCollapsed
                        ? t("specHub.continueAiEnhancement.expandPanel")
                        : t("specHub.continueAiEnhancement.collapsePanel")
                    }
                    title={
                      isContinueAiEnhancementFeedbackCollapsed
                        ? t("specHub.continueAiEnhancement.expandPanel")
                        : t("specHub.continueAiEnhancement.collapsePanel")
                    }
                  >
                    {isContinueAiEnhancementFeedbackCollapsed ? (
                      <Maximize2 size={14} aria-hidden />
                    ) : (
                      <Minimize2 size={14} aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIsContinueAiEnhancementFeedbackClosed(true);
                      resetAgentFeedbackPosition();
                    }}
                    aria-label={t("specHub.continueAiEnhancement.closePanel")}
                    title={t("specHub.continueAiEnhancement.closePanel")}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              </header>
              {!isContinueAiEnhancementFeedbackCollapsed ? (
                <div className="spec-hub-apply-floating-body">
                  <div className="spec-hub-guidance-grid">
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.continueAiEnhancement.fieldStatus")}</span>
                      {renderFeedbackStatusValue(
                        continueAiEnhancementExecution.status,
                        continueAiEnhancementStatusLabel,
                      )}
                    </article>
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.continueAiEnhancement.fieldPhase")}</span>
                      <strong>{continueAiEnhancementPhaseLabel}</strong>
                    </article>
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.continueAiEnhancement.fieldEngine")}</span>
                      <strong>
                        {continueAiEnhancementExecution.executor
                          ? engineDisplayName(continueAiEnhancementExecution.executor)
                          : "--"}
                      </strong>
                    </article>
                  </div>
                  {continueAiEnhancementExecution.startedAt ? (
                    <p className="spec-hub-bootstrap-desc">
                      {t("specHub.continueAiEnhancement.startedAt", {
                        time: new Date(continueAiEnhancementExecution.startedAt).toLocaleTimeString(),
                      })}
                      {continueAiEnhancementExecution.finishedAt
                        ? ` · ${t("specHub.continueAiEnhancement.finishedAt", {
                            time: new Date(continueAiEnhancementExecution.finishedAt).toLocaleTimeString(),
                          })}`
                        : ""}
                      {continueDurationLabel
                        ? ` · ${t("specHub.feedbackElapsed", { duration: continueDurationLabel })}`
                        : ""}
                    </p>
                  ) : null}
                  {continueAiEnhancementExecution.summary ? (
                    <p className="spec-hub-context-notice">{continueAiEnhancementExecution.summary}</p>
                  ) : null}
                  {continueAiEnhancementExecution.error ? (
                    <p className="spec-hub-action-error">
                      <XCircle size={14} aria-hidden />
                      <span>{continueAiEnhancementExecution.error}</span>
                    </p>
                  ) : null}
                  {renderFeedbackMetricsLine(continueFeedbackMetrics)}
                  {renderChangedFilesPreview([])}
                  {continueAiEnhancementExecution.streamOutput ? (
                    <div className="spec-hub-command-preview">
                      <span>{t("specHub.continueAiEnhancement.streamTitle")}</span>
                      <code ref={continueStreamRef}>{continueAiEnhancementExecution.streamOutput}</code>
                    </div>
                  ) : null}
                  {continueAiEnhancementExecution.logs.length > 0 ? (
                    <div className="spec-hub-command-preview">
                      <span>{t("specHub.continueAiEnhancement.logsTitle")}</span>
                      <code ref={continueLogsRef}>{continueAiEnhancementExecution.logs.join("\n")}</code>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>,
            document.body,
          )
        : null}
      {showVerifyAutoCompleteFloating && typeof document !== "undefined"
        ? createPortal(
            <section
              className={`spec-hub-apply-floating spec-hub-verify-floating${
                isVerifyAutoCompleteFeedbackCollapsed ? " is-collapsed" : ""
              }${isAgentFeedbackDragging ? " is-dragging" : ""}`}
              style={{
                left: `${agentFeedbackPosition.x}px`,
                top: `${agentFeedbackPosition.y}px`,
              }}
              role="dialog"
              aria-label={t("specHub.verifyAutoComplete.title")}
            >
              <header className="spec-hub-apply-floating-header" onPointerDown={handleAgentFeedbackPointerDown}>
                <div className="spec-hub-panel-title">
                  <BadgeCheck size={14} aria-hidden />
                  <span>{t("specHub.verifyAutoComplete.title")}</span>
                </div>
                <div className="spec-hub-apply-floating-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIsVerifyAutoCompleteFeedbackCollapsed((prev) => !prev);
                    }}
                    aria-label={
                      isVerifyAutoCompleteFeedbackCollapsed
                        ? t("specHub.verifyAutoComplete.expandPanel")
                        : t("specHub.verifyAutoComplete.collapsePanel")
                    }
                    title={
                      isVerifyAutoCompleteFeedbackCollapsed
                        ? t("specHub.verifyAutoComplete.expandPanel")
                        : t("specHub.verifyAutoComplete.collapsePanel")
                    }
                  >
                    {isVerifyAutoCompleteFeedbackCollapsed ? (
                      <Maximize2 size={14} aria-hidden />
                    ) : (
                      <Minimize2 size={14} aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIsVerifyAutoCompleteFeedbackClosed(true);
                      resetAgentFeedbackPosition();
                    }}
                    aria-label={t("specHub.verifyAutoComplete.closePanel")}
                    title={t("specHub.verifyAutoComplete.closePanel")}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              </header>
              {!isVerifyAutoCompleteFeedbackCollapsed ? (
                <div className="spec-hub-apply-floating-body">
                  <div className="spec-hub-guidance-grid">
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.verifyAutoComplete.fieldStatus")}</span>
                      {renderFeedbackStatusValue(
                        verifyAutoCompleteExecution.status,
                        verifyAutoCompleteStatusLabel,
                      )}
                    </article>
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.verifyAutoComplete.fieldPhase")}</span>
                      <strong>{verifyAutoCompletePhaseLabel}</strong>
                    </article>
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.verifyAutoComplete.fieldEngine")}</span>
                      <strong>
                        {verifyAutoCompleteExecution.executor
                          ? engineDisplayName(verifyAutoCompleteExecution.executor)
                          : "--"}
                      </strong>
                    </article>
                  </div>
                  {verifyAutoCompleteExecution.startedAt ? (
                    <p className="spec-hub-bootstrap-desc">
                      {t("specHub.verifyAutoComplete.startedAt", {
                        time: new Date(verifyAutoCompleteExecution.startedAt).toLocaleTimeString(),
                      })}
                      {verifyAutoCompleteExecution.finishedAt
                        ? ` · ${t("specHub.verifyAutoComplete.finishedAt", {
                            time: new Date(verifyAutoCompleteExecution.finishedAt).toLocaleTimeString(),
                          })}`
                        : ""}
                      {verifyDurationLabel
                        ? ` · ${t("specHub.feedbackElapsed", { duration: verifyDurationLabel })}`
                        : ""}
                    </p>
                  ) : null}
                  {verifyAutoCompleteExecution.summary ? (
                    <p className="spec-hub-context-notice">{verifyAutoCompleteExecution.summary}</p>
                  ) : null}
                  {verifyAutoCompleteExecution.validateSkipped ? (
                    <p className="spec-hub-action-error">
                      <XCircle size={14} aria-hidden />
                      <span>{t("specHub.verifyAutoComplete.validateSkipped")}</span>
                    </p>
                  ) : null}
                  {verifyAutoCompleteExecution.error ? (
                    <p className="spec-hub-action-error">
                      <XCircle size={14} aria-hidden />
                      <span>{verifyAutoCompleteExecution.error}</span>
                    </p>
                  ) : null}
                  {renderFeedbackMetricsLine(zeroFeedbackMetrics)}
                  {renderChangedFilesPreview([])}
                  {verifyAutoCompleteExecution.streamOutput ? (
                    <div className="spec-hub-command-preview">
                      <span>{t("specHub.verifyAutoComplete.streamTitle")}</span>
                      <code ref={verifyStreamRef}>{verifyAutoCompleteExecution.streamOutput}</code>
                    </div>
                  ) : null}
                  {verifyAutoCompleteExecution.logs.length > 0 ? (
                    <div className="spec-hub-command-preview">
                      <span>{t("specHub.verifyAutoComplete.logsTitle")}</span>
                      <code ref={verifyLogsRef}>{verifyAutoCompleteExecution.logs.join("\n")}</code>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>,
            document.body,
          )
        : null}
      {showAiTakeoverFloating && typeof document !== "undefined"
        ? createPortal(
            <section
              className={`spec-hub-apply-floating spec-hub-ai-takeover-floating${
                isAiTakeoverFeedbackCollapsed ? " is-collapsed" : ""
              }${isAgentFeedbackDragging ? " is-dragging" : ""}`}
              style={{
                left: `${agentFeedbackPosition.x}px`,
                top: `${agentFeedbackPosition.y}px`,
              }}
              role="dialog"
              aria-label={t("specHub.aiTakeover.title")}
            >
              <header className="spec-hub-apply-floating-header" onPointerDown={handleAgentFeedbackPointerDown}>
                <div className="spec-hub-panel-title">
                  <Wrench size={14} aria-hidden />
                  <span>{t("specHub.aiTakeover.title")}</span>
                </div>
                <div className="spec-hub-apply-floating-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIsAiTakeoverFeedbackCollapsed((prev) => !prev);
                    }}
                    aria-label={
                      isAiTakeoverFeedbackCollapsed
                        ? t("specHub.aiTakeover.expandPanel")
                        : t("specHub.aiTakeover.collapsePanel")
                    }
                    title={
                      isAiTakeoverFeedbackCollapsed
                        ? t("specHub.aiTakeover.expandPanel")
                        : t("specHub.aiTakeover.collapsePanel")
                    }
                  >
                    {isAiTakeoverFeedbackCollapsed ? (
                      <Maximize2 size={14} aria-hidden />
                    ) : (
                      <Minimize2 size={14} aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIsAiTakeoverFeedbackClosed(true);
                      resetAgentFeedbackPosition();
                    }}
                    aria-label={t("specHub.aiTakeover.closePanel")}
                    title={t("specHub.aiTakeover.closePanel")}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              </header>
              {!isAiTakeoverFeedbackCollapsed ? (
                <div className="spec-hub-apply-floating-body">
                  <div className="spec-hub-guidance-grid">
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.aiTakeover.statusLabel")}</span>
                      {renderFeedbackStatusValue(
                        aiTakeoverStatus,
                        t(`specHub.aiTakeover.status.${aiTakeoverStatus}`),
                      )}
                    </article>
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.aiTakeover.phase.agent")}</span>
                      <strong>{t(`specHub.aiTakeover.phase.${aiTakeoverPhase}`)}</strong>
                    </article>
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.aiTakeover.agentLabel")}</span>
                      <strong>{engineDisplayName(applyAgent)}</strong>
                    </article>
                  </div>
                  {aiTakeoverStartedAt ? (
                    <p className="spec-hub-bootstrap-desc">
                      {t("specHub.aiTakeover.startedAt", {
                        time: new Date(aiTakeoverStartedAt).toLocaleTimeString(),
                      })}
                      {aiTakeoverFinishedAt
                        ? ` · ${t("specHub.aiTakeover.finishedAt", {
                            time: new Date(aiTakeoverFinishedAt).toLocaleTimeString(),
                          })}`
                        : ""}
                      {aiTakeoverElapsedLabel
                        ? ` · ${t("specHub.aiTakeover.elapsed", { duration: aiTakeoverElapsedLabel })}`
                        : ""}
                    </p>
                  ) : null}
                  {aiTakeoverRefreshState !== "idle" ? (
                    <p className={`spec-hub-ai-takeover-refresh is-${aiTakeoverRefreshState}`}>
                      {t(`specHub.aiTakeover.refreshState.${aiTakeoverRefreshState}`)}
                    </p>
                  ) : null}
                  <div className="spec-hub-ai-takeover-phases">
                    {AI_TAKEOVER_PHASES.map((phase) => {
                      const phaseState = resolveAiPhaseState(phase);
                      return (
                        <p key={`ai-floating-phase-${phase}`} className={`is-${phaseState}`}>
                          <span>{t(`specHub.aiTakeover.phase.${phase}`)}</span>
                          <strong>{t(`specHub.aiTakeover.phaseState.${phaseState}`)}</strong>
                        </p>
                      );
                    })}
                  </div>
                  {aiTakeoverNotice ? (
                    <p className="spec-hub-context-notice">{aiTakeoverNotice}</p>
                  ) : null}
                  {aiTakeoverError ? (
                    <p className="spec-hub-action-error">
                      <XCircle size={14} aria-hidden />
                      <span>{aiTakeoverError}</span>
                    </p>
                  ) : null}
                  {renderFeedbackMetricsLine(zeroFeedbackMetrics)}
                  {renderChangedFilesPreview([])}
                  {isAiTakeoverRunning || aiTakeoverStreamText ? (
                    <div className="spec-hub-command-preview spec-hub-ai-takeover-stream">
                      <span>{t("specHub.aiTakeover.streamTitle")}</span>
                      <code ref={aiTakeoverStreamRef}>
                        {aiTakeoverStreamText || t("specHub.aiTakeover.streamEmpty")}
                      </code>
                    </div>
                  ) : null}
                  {aiTakeoverOutput ? (
                    <div className="spec-hub-command-preview">
                      <span>{t("specHub.aiTakeover.outputTitle")}</span>
                      <code>{aiTakeoverOutput}</code>
                    </div>
                  ) : null}
                  <div className="spec-hub-command-preview spec-hub-ai-takeover-logs">
                    <span>{t("specHub.aiTakeover.logsTitle")}</span>
                    <code ref={aiTakeoverLogsRef}>{aiTakeoverLogText || t("specHub.aiTakeover.noLogs")}</code>
                  </div>
                </div>
              ) : null}
            </section>,
            document.body,
          )
        : null}
      {showApplyExecutionFloating && typeof document !== "undefined"
        ? createPortal(
            <section
              className={`spec-hub-apply-floating${isApplyFeedbackCollapsed ? " is-collapsed" : ""}${
                isApplyFeedbackDragging ? " is-dragging" : ""
              }`}
              style={{
                left: `${applyFeedbackPosition.x}px`,
                top: `${applyFeedbackPosition.y}px`,
              }}
              role="dialog"
              aria-label={t("specHub.applyExecution.title")}
            >
              <header className="spec-hub-apply-floating-header" onPointerDown={handleApplyFeedbackPointerDown}>
                <div className="spec-hub-panel-title">
                  <CircleDashed size={14} aria-hidden />
                  <span>{t("specHub.applyExecution.title")}</span>
                </div>
                <div className="spec-hub-apply-floating-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIsApplyFeedbackCollapsed((prev) => !prev);
                    }}
                    aria-label={
                      isApplyFeedbackCollapsed
                        ? t("specHub.applyExecution.expandPanel")
                        : t("specHub.applyExecution.collapsePanel")
                    }
                    title={
                      isApplyFeedbackCollapsed
                        ? t("specHub.applyExecution.expandPanel")
                        : t("specHub.applyExecution.collapsePanel")
                    }
                  >
                    {isApplyFeedbackCollapsed ? <Maximize2 size={14} aria-hidden /> : <Minimize2 size={14} aria-hidden />}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIsApplyFeedbackClosed(true);
                    }}
                    aria-label={t("specHub.applyExecution.closePanel")}
                    title={t("specHub.applyExecution.closePanel")}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              </header>
              {!isApplyFeedbackCollapsed ? (
                <div className="spec-hub-apply-floating-body">
              <div className="spec-hub-guidance-grid">
                <article className="spec-hub-guidance-field">
                  <span>{t("specHub.applyExecution.fieldStatus")}</span>
                  {renderFeedbackStatusValue(activeApplyExecution.status, applyExecutionStatusLabel)}
                </article>
                <article className="spec-hub-guidance-field">
                  <span>{t("specHub.applyExecution.fieldPhase")}</span>
                  <strong>{applyExecutionPhaseLabel}</strong>
                </article>
                <article className="spec-hub-guidance-field">
                  <span>{t("specHub.applyExecution.fieldExecutor")}</span>
                  <strong>{activeApplyExecution.executor ? engineDisplayName(activeApplyExecution.executor) : "--"}</strong>
                </article>
              </div>
              {activeApplyExecution.startedAt ? (
                <p className="spec-hub-bootstrap-desc">
                  {t("specHub.applyExecution.startedAt", {
                    time: new Date(activeApplyExecution.startedAt).toLocaleTimeString(),
                  })}
                  {activeApplyExecution.finishedAt
                    ? ` · ${t("specHub.applyExecution.finishedAt", {
                        time: new Date(activeApplyExecution.finishedAt).toLocaleTimeString(),
                      })}`
                    : ""}
                  {applyDurationLabel
                    ? ` · ${t("specHub.feedbackElapsed", { duration: applyDurationLabel })}`
                    : ""}
                </p>
              ) : null}
              {activeApplyExecution.summary ? (
                <p className="spec-hub-context-notice">
                  {translateRuntimeText(activeApplyExecution.summary, t)}
                </p>
              ) : null}
              {activeApplyExecution.status === "success" && activeApplyExecution.noChanges ? (
                <p className="spec-hub-running">{t("specHub.applyExecution.noChanges")}</p>
              ) : null}
              {activeApplyExecution.error ? (
                <p className="spec-hub-action-error">
                  <XCircle size={14} aria-hidden />
                  <span>{translateRuntimeText(activeApplyExecution.error, t)}</span>
                </p>
              ) : null}
              {renderFeedbackMetricsLine(applyFeedbackMetrics)}
              {renderChangedFilesPreview(activeApplyExecution.changedFiles)}
              {activeApplyExecution.tests.length > 0 ? (
                <div className="spec-hub-command-preview">
                  <span>{t("specHub.applyExecution.testsTitle")}</span>
                  <code>{activeApplyExecution.tests.join("\n")}</code>
                </div>
              ) : null}
              {activeApplyExecution.checks.length > 0 ? (
                <div className="spec-hub-command-preview">
                  <span>{t("specHub.applyExecution.checksTitle")}</span>
                  <code>{activeApplyExecution.checks.join("\n")}</code>
                </div>
              ) : null}
              {activeApplyExecution.executionOutput ? (
                <div className="spec-hub-command-preview">
                  <span>{t("specHub.applyExecution.streamTitle")}</span>
                  <code ref={applyStreamRef}>{activeApplyExecution.executionOutput}</code>
                </div>
              ) : null}
              {activeApplyExecution.logs.length > 0 ? (
                <div className="spec-hub-command-preview">
                  <span>{t("specHub.applyExecution.logsTitle")}</span>
                  <code ref={applyLogsRef}>
                    {activeApplyExecution.logs
                      .map((entry) => translateRuntimeLogLine(entry, t))
                      .join("\n")}
                  </code>
                </div>
              ) : null}
                </div>
              ) : null}
            </section>,
            document.body,
          )
        : null}
      {showAutoComboGuardFloating && typeof document !== "undefined"
        ? createPortal(
            <section
              className={`spec-hub-apply-floating spec-hub-auto-combo-floating${
                isAutoComboGuardFeedbackCollapsed ? " is-collapsed" : ""
              }${isAutoComboGuardFeedbackDragging ? " is-dragging" : ""}`}
              style={{
                left: `${autoComboGuardPosition.x}px`,
                top: `${autoComboGuardPosition.y}px`,
              }}
              role="dialog"
              aria-label={t("specHub.autoCombo.title")}
            >
              <header className="spec-hub-apply-floating-header" onPointerDown={handleAutoComboGuardPointerDown}>
                <div className="spec-hub-panel-title">
                  <ArrowRightCircle size={14} aria-hidden />
                  <span>{t("specHub.autoCombo.title")}</span>
                </div>
                <div className="spec-hub-apply-floating-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIsAutoComboGuardFeedbackCollapsed((prev) => !prev);
                    }}
                    aria-label={
                      isAutoComboGuardFeedbackCollapsed
                        ? t("specHub.autoCombo.expandPanel")
                        : t("specHub.autoCombo.collapsePanel")
                    }
                    title={
                      isAutoComboGuardFeedbackCollapsed
                        ? t("specHub.autoCombo.expandPanel")
                        : t("specHub.autoCombo.collapsePanel")
                    }
                  >
                    {isAutoComboGuardFeedbackCollapsed ? (
                      <Maximize2 size={14} aria-hidden />
                    ) : (
                      <Minimize2 size={14} aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIsAutoComboGuardFeedbackClosed(true);
                      setIsAutoComboGuardFeedbackDragging(false);
                      autoComboGuardDragCleanupRef.current?.();
                      autoComboGuardDragCleanupRef.current = null;
                    }}
                    aria-label={t("specHub.autoCombo.closePanel")}
                    title={t("specHub.autoCombo.closePanel")}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              </header>
              {!isAutoComboGuardFeedbackCollapsed ? (
                <div className="spec-hub-apply-floating-body">
                  <div className="spec-hub-guidance-grid">
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.autoCombo.fieldStatus")}</span>
                      {renderFeedbackStatusValue(autoComboGuardExecution.status, autoComboGuardStatusLabel)}
                    </article>
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.autoCombo.fieldPhase")}</span>
                      <strong>{autoComboGuardPhaseLabel}</strong>
                    </article>
                    <article className="spec-hub-guidance-field">
                      <span>{t("specHub.autoCombo.fieldEngine")}</span>
                      <strong>
                        {autoComboGuardExecution.executor
                          ? engineDisplayName(autoComboGuardExecution.executor)
                          : "--"}
                      </strong>
                    </article>
                  </div>
                  {autoComboGuardExecution.startedAt ? (
                    <p className="spec-hub-bootstrap-desc">
                      {t("specHub.autoCombo.startedAt", {
                        time: new Date(autoComboGuardExecution.startedAt).toLocaleTimeString(),
                      })}
                      {autoComboGuardExecution.finishedAt
                        ? ` · ${t("specHub.autoCombo.finishedAt", {
                            time: new Date(autoComboGuardExecution.finishedAt).toLocaleTimeString(),
                          })}`
                        : ""}
                      {autoComboDurationLabel
                        ? ` · ${t("specHub.feedbackElapsed", { duration: autoComboDurationLabel })}`
                        : ""}
                    </p>
                  ) : null}
                  {autoComboGuardExecution.summary ? (
                    <p className="spec-hub-context-notice">{autoComboGuardExecution.summary}</p>
                  ) : null}
                  {autoComboGuardExecution.error ? (
                    <p className="spec-hub-action-error">
                      <XCircle size={14} aria-hidden />
                      <span>{autoComboGuardExecution.error}</span>
                    </p>
                  ) : null}
                  {renderFeedbackMetricsLine(autoComboFeedbackMetrics)}
                  {renderChangedFilesPreview(autoComboGuardExecution.changedFiles)}
                  {autoComboGuardExecution.streamOutput ? (
                    <div className="spec-hub-command-preview">
                      <span>{t("specHub.applyExecution.streamTitle")}</span>
                      <code ref={autoComboStreamRef}>{autoComboGuardExecution.streamOutput}</code>
                    </div>
                  ) : null}
                  {autoComboGuardExecution.logs.length > 0 ? (
                    <div className="spec-hub-command-preview">
                      <span>{t("specHub.autoCombo.logsTitle")}</span>
                      <code ref={autoComboLogsRef}>{autoComboGuardExecution.logs.join("\n")}</code>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>,
            document.body,
          )
        : null}
    </section>
  );
}
