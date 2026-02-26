export type SpecProvider = "openspec" | "speckit" | "unknown";

export type SpecSupportLevel = "full" | "minimal" | "none";

export type SpecEnvironmentMode = "managed" | "byo";
export type SpecBootstrapProjectType = "legacy" | "new";

export type SpecChangeStatus =
  | "draft"
  | "ready"
  | "implementing"
  | "verified"
  | "archived"
  | "blocked";

export type SpecArtifactType =
  | "proposal"
  | "design"
  | "specs"
  | "tasks"
  | "verification";

export type SpecArtifactSource = {
  path: string;
  content: string;
  truncated: boolean;
};

export type SpecTaskPriority = "p0" | "p1" | "p2" | null;

export type SpecTaskChecklistItem = {
  index: number;
  lineNumber: number;
  indent: number;
  checked: boolean;
  text: string;
  priority: SpecTaskPriority;
};

export type SpecArtifactEntry = {
  type: SpecArtifactType;
  path: string | null;
  exists: boolean;
  content: string;
  truncated?: boolean;
  sources?: SpecArtifactSource[];
  taskChecklist?: SpecTaskChecklistItem[];
  taskProgress?: {
    total: number;
    checked: number;
    requiredTotal: number;
    requiredChecked: number;
  };
};

export type SpecChangeSummary = {
  id: string;
  status: SpecChangeStatus;
  updatedAt: number;
  artifacts: {
    proposalPath: string | null;
    designPath: string | null;
    tasksPath: string | null;
    verificationPath: string | null;
    specPaths: string[];
  };
  blockers: string[];
  archiveBlockers?: string[];
};

export type SpecChangePreflightResult = {
  blockers: string[];
  hints: string[];
  affectedSpecs: string[];
};

export type SpecWorkspaceSnapshot = {
  provider: SpecProvider;
  supportLevel: SpecSupportLevel;
  specRoot?: {
    source: "default" | "custom";
    path: string;
  };
  environment: SpecEnvironmentHealth;
  changes: SpecChangeSummary[];
  blockers: string[];
};

export type SpecHubActionKey = "continue" | "apply" | "verify" | "archive" | "bootstrap";

export type SpecHubAction = {
  key: SpecHubActionKey;
  label: string;
  commandPreview: string;
  available: boolean;
  blockers: string[];
  kind: "native" | "passthrough";
};

export type SpecVerifyState = {
  ran: boolean;
  success: boolean;
};

export type SpecApplyExecutor = "codex" | "claude" | "opencode";

export type SpecApplyExecutionPhase =
  | "idle"
  | "preflight"
  | "instructions"
  | "execution"
  | "task-writeback"
  | "finalize";

export type SpecApplyExecutionStatus = "idle" | "running" | "success" | "failed";

export type SpecApplyExecutionState = {
  status: SpecApplyExecutionStatus;
  phase: SpecApplyExecutionPhase;
  executor: SpecApplyExecutor | null;
  startedAt: number | null;
  finishedAt: number | null;
  instructionsOutput: string;
  executionOutput: string;
  summary: string;
  changedFiles: string[];
  tests: string[];
  checks: string[];
  completedTaskIndices: number[];
  noChanges: boolean;
  error: string | null;
  logs: string[];
};

export type SpecProjectInfoInput = {
  projectType: SpecBootstrapProjectType;
  domain: string;
  architecture: string;
  constraints: string;
  keyCommands: string;
  owners: string;
  summary?: string;
};

export type SpecValidationIssue = {
  target: string;
  reason: string;
  hint: string;
  path: string | null;
};

export type SpecTimelineEvent = {
  id: string;
  at: number;
  kind: "action" | "validate" | "git-link" | "task-update";
  action: SpecHubActionKey;
  command: string;
  success: boolean;
  output: string;
  validationIssues: SpecValidationIssue[];
  gitRefs: string[];
};

export type SpecDoctorCheck = {
  key: "node" | "openspec" | "speckit";
  label: string;
  ok: boolean;
  value: string;
  detail: string;
  required: boolean;
};

export type SpecEnvironmentHealth = {
  mode: SpecEnvironmentMode;
  status: "healthy" | "degraded" | "blocked";
  checks: SpecDoctorCheck[];
  blockers: string[];
  hints: string[];
};

export type SpecGateCheck = {
  key: "provider" | "health" | "artifacts" | "validation";
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
};

export type SpecGateState = {
  status: "pass" | "warn" | "fail";
  checks: SpecGateCheck[];
};
