// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpecHub } from "./SpecHub";
import { useSpecHub } from "../hooks/useSpecHub";
import { detectEngines, engineSendMessageSync, pickImageFiles } from "../../../services/tauri";

vi.mock("../hooks/useSpecHub", () => ({
  useSpecHub: vi.fn(),
}));

function renderMarkdownInline(text: string) {
  const parts = text.split(/(`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) =>
    part.startsWith("`") && part.endsWith("`") ? (
      <code key={`code-${index}`}>{part.slice(1, -1)}</code>
    ) : (
      <span key={`text-${index}`}>{part}</span>
    ),
  );
}

function renderMarkdownMock(content: string) {
  const lines = content.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    nodes.push(<ul key={`list-${nodes.length}`}>{listItems}</ul>);
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const HeadingTag = `h${headingMatch[1].length}` as
        | "h1"
        | "h2"
        | "h3"
        | "h4"
        | "h5"
        | "h6";
      nodes.push(<HeadingTag key={`heading-${index}`}>{renderMarkdownInline(headingMatch[2])}</HeadingTag>);
      return;
    }
    const listMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      listItems.push(<li key={`li-${index}`}>{renderMarkdownInline(listMatch[1])}</li>);
      return;
    }
    flushList();
    nodes.push(<p key={`p-${index}`}>{renderMarkdownInline(trimmed)}</p>);
  });
  flushList();

  return <div className="spec-hub-markdown">{nodes}</div>;
}

vi.mock("../../messages/components/Markdown", () => ({
  Markdown: ({
    content,
    value,
  }: {
    content?: string;
    value?: string;
  }) => renderMarkdownMock(content ?? value ?? ""),
}));

vi.mock("../../engine/components/EngineIcon", () => ({
  EngineIcon: ({ engine }: { engine: string }) => <span data-testid="engine-icon">{engine}</span>,
}));

vi.mock("../../../components/ui/tabs", async () => {
  const React = await import("react");

  type TabsContextValue = {
    value: string;
    onValueChange: (value: string) => void;
  };

  const TabsContext = React.createContext<TabsContextValue | null>(null);

  const Tabs = ({
    value,
    onValueChange,
    children,
    className,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
    className?: string;
  }) => (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );

  const TabsList = ({ children }: { children: ReactNode }) => <div role="tablist">{children}</div>;

  const TabsTrigger = ({
    value,
    children,
    ...rest
  }: {
    value: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => {
    const context = React.useContext(TabsContext);
    if (!context) {
      throw new Error("TabsTrigger must be used within Tabs");
    }
    return (
      <button
        type="button"
        role="tab"
        aria-selected={context.value === value}
        onClick={() => context.onValueChange(value)}
        {...rest}
      >
        {children}
      </button>
    );
  };

  const TabsContent = ({
    value,
    children,
    ...rest
  }: {
    value: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => {
    const context = React.useContext(TabsContext);
    if (!context) {
      throw new Error("TabsContent must be used within Tabs");
    }
    if (context.value !== value) {
      return null;
    }
    return (
      <div role="tabpanel" {...rest}>
        {children}
      </div>
    );
  };

  return {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
  };
});

vi.mock("react-i18next", () => {
  const t = (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
        "specHub.actions": "Actions",
        "specHub.project": "Project",
        "specHub.sharedExecutor.label": "Execution engine",
        "specHub.proposal.createAction": "New Proposal",
        "specHub.proposal.appendAction": "Append Proposal",
        "specHub.proposal.dialogTitleCreate": "Create New Proposal",
        "specHub.proposal.dialogTitleAppend": "Append Existing Proposal",
        "specHub.proposal.addImageAction": "Attach image",
        "specHub.environment.notInstalled": "Not installed",
        "specHub.proposal.cancelAction": "Cancel",
        "specHub.proposal.submitCreateAction": "Submit Create",
        "specHub.proposal.submitAppendAction": "Submit Append",
        "specHub.proposal.emptyInputError": "Enter proposal content or attach at least one image.",
        "specHub.proposal.imageUnsupported": "Unsupported image format. Use png/jpg/jpeg/gif/webp/bmp/tiff.",
        "specHub.proposal.imageCountExceeded": `You can attach up to ${params?.count ?? 6} images.`,
        "specHub.proposal.imageTooLarge": `Image is too large (${params?.size ?? ""}). Max 8 MB per pasted image.`,
        "specHub.proposal.attachmentHint": `Supports upload/paste/drag images (up to ${params?.count ?? 6} attachments).`,
        "specHub.verifyAutoComplete.label": "Auto-complete",
        "specHub.verifyAutoComplete.title": "Verify Auto-Completion Feedback",
        "specHub.verifyAutoComplete.hint":
          "When enabled, missing verification artifact will be generated by AI before strict verify.",
        "specHub.verifyAutoComplete.running": "Generating verification artifact...",
        "specHub.verifyAutoComplete.failed": `Auto-completion failed: ${params?.reason ?? ""}`,
        "specHub.verifyAutoComplete.collapsePanel": "Collapse verify auto-completion feedback",
        "specHub.verifyAutoComplete.expandPanel": "Expand verify auto-completion feedback",
        "specHub.verifyAutoComplete.closePanel": "Close verify auto-completion feedback",
        "specHub.verifyAutoComplete.fieldStatus": "Status",
        "specHub.verifyAutoComplete.fieldPhase": "Phase",
        "specHub.verifyAutoComplete.fieldEngine": "Engine",
        "specHub.verifyAutoComplete.startedAt": `Started at: ${params?.time ?? ""}`,
        "specHub.verifyAutoComplete.finishedAt": `Finished at: ${params?.time ?? ""}`,
        "specHub.verifyAutoComplete.streamTitle": "Live output",
        "specHub.verifyAutoComplete.outputTitle": "Final output",
        "specHub.verifyAutoComplete.logsTitle": "Execution logs",
        "specHub.verifyAutoComplete.validateSkipped":
          "Auto-completion failed and strict validate was skipped for this run.",
        "specHub.verifyAutoComplete.summaryCompletionFinished":
          "Verification artifact completed. Running strict verify.",
        "specHub.verifyAutoComplete.summarySuccess": "Auto-completion and verify flow finished.",
        "specHub.verifyAutoComplete.status.idle": "Idle",
        "specHub.verifyAutoComplete.status.running": "Running",
        "specHub.verifyAutoComplete.status.success": "Success",
        "specHub.verifyAutoComplete.status.failed": "Failed",
        "specHub.verifyAutoComplete.phase.idle": "Idle",
        "specHub.verifyAutoComplete.phase.completion-dispatch": "Completion dispatch",
        "specHub.verifyAutoComplete.phase.completion-execution": "Completion execution",
        "specHub.verifyAutoComplete.phase.completion-finalize": "Completion finalize",
        "specHub.verifyAutoComplete.phase.verify-dispatch": "Verify dispatch",
        "specHub.verifyAutoComplete.phase.verify-finalize": "Verify finalize",
        "specHub.verifyAutoComplete.logDispatch": `Verification completion dispatched with ${
          params?.engine ?? ""
        }.`,
        "specHub.verifyAutoComplete.logCompletionStarted": "Verification completion started.",
        "specHub.verifyAutoComplete.logRefreshStarted": "Completion finished. Refreshing Spec Hub state.",
        "specHub.verifyAutoComplete.logVerifyDispatch": "Running strict validate.",
        "specHub.verifyAutoComplete.logVerifyFinished": "Strict validate finished.",
        "specHub.continueAiEnhancement.label": "AI Enhancement",
        "specHub.continueAiEnhancement.title": "Continue AI Enhancement Feedback",
        "specHub.continueAiEnhancement.hint": "Continue AI hint",
        "specHub.continueAiEnhancement.running": "Generating continue AI brief...",
        "specHub.continueAiEnhancement.failed": `Continue AI enhancement failed: ${params?.reason ?? ""}`,
        "specHub.continueAiEnhancement.latestSummary": `Latest summary: ${params?.summary ?? ""}`,
        "specHub.continueAiEnhancement.collapsePanel": "Collapse continue AI enhancement feedback",
        "specHub.continueAiEnhancement.expandPanel": "Expand continue AI enhancement feedback",
        "specHub.continueAiEnhancement.closePanel": "Close continue AI enhancement feedback",
        "specHub.continueAiEnhancement.fieldStatus": "Status",
        "specHub.continueAiEnhancement.fieldPhase": "Phase",
        "specHub.continueAiEnhancement.fieldEngine": "Engine",
        "specHub.continueAiEnhancement.startedAt": `Started at: ${params?.time ?? ""}`,
        "specHub.continueAiEnhancement.finishedAt": `Finished at: ${params?.time ?? ""}`,
        "specHub.continueAiEnhancement.streamTitle": "Live output",
        "specHub.continueAiEnhancement.outputTitle": "Final output",
        "specHub.continueAiEnhancement.logsTitle": "Execution logs",
        "specHub.continueAiEnhancement.logDispatch": `Continue AI enhancement dispatched with ${
          params?.engine ?? ""
        }.`,
        "specHub.continueAiEnhancement.logFinished": "Continue AI enhancement finished.",
        "specHub.continueAiEnhancement.logAutoApplyDispatch":
          `Continue AI enhancement finished. Auto-running Apply with ${params?.engine ?? ""}.`,
        "specHub.continueAiEnhancement.logAutoApplyFinished": "Auto-run apply finished.",
        "specHub.continueAiEnhancement.logAutoApplySkipped":
          "Auto-run apply did not complete. Run Apply manually.",
        "specHub.continueAiEnhancement.autoApplyFailed":
          "Auto-run apply failed. Check Apply execution feedback.",
        "specHub.continueAiEnhancement.status.idle": "Idle",
        "specHub.continueAiEnhancement.status.running": "Running",
        "specHub.continueAiEnhancement.status.success": "Success",
        "specHub.continueAiEnhancement.status.failed": "Failed",
        "specHub.continueAiEnhancement.phase.idle": "Idle",
        "specHub.continueAiEnhancement.phase.analysis-dispatch": "Analysis dispatch",
        "specHub.continueAiEnhancement.phase.analysis-execution": "Analysis execution",
        "specHub.continueAiEnhancement.phase.analysis-finalize": "Analysis finalize",
        "specHub.continueAiEnhancement.phase.apply-dispatch": "Apply dispatch",
        "specHub.continueAiEnhancement.phase.apply-execution": "Apply execution",
        "specHub.continueAiEnhancement.phase.apply-finalize": "Apply finalize",
        "specHub.applyContinueBrief.label": "Use Continue brief",
        "specHub.applyContinueBrief.summary": `Brief: ${params?.summary ?? ""}`,
        "specHub.applyContinueBrief.stale": "Continue brief may be stale.",
        "specHub.applyContinueBrief.missing": "No Continue brief yet.",
        "specHub.nextStep.runContinueFirst": "Run continue first.",
        "specHub.nextStep.runContinueThenApply": "Run continue then apply.",
        "specHub.gateTitle": "Gate",
        "specHub.timeline": "Timeline",
        "specHub.doctorTitle": "Doctor",
        "specHub.modeManaged": "Managed",
        "specHub.modeByo": "BYO",
        "specHub.runtime.noStrictVerify": "NO_VERIFY_EVIDENCE",
        "specHub.runtime.truncatedArtifactEvidence": `TRUNCATED ${params?.artifacts ?? ""}`,
        "specHub.runtime.runContinueFirstForSpecs": "Run continue first.",
        "specHub.runtime.continueBriefAttached": "Continue brief attached.",
        "specHub.gate.warn": "Warn",
        "specHub.placeholder.notAvailable": "N/A",
        "specHub.filter.all": "All",
        "specHub.filter.active": "Active",
        "specHub.filter.backlog": "Backlog",
        "specHub.filter.blocked": "Blocked",
        "specHub.filter.archived": "Archived",
        "specHub.filterTitle": "Filter changes",
        "specHub.archivedGroups.other": "Other",
        "specHub.groupControls.expandAll": "Expand all",
        "specHub.groupControls.collapseAll": "Collapse all",
        "specHub.changes": "Changes",
        "specHub.status.draft": "Draft",
        "specHub.status.ready": "Ready",
        "specHub.status.implementing": "Implementing",
        "specHub.status.verified": "Verified",
        "specHub.status.archived": "Archived",
        "specHub.status.blocked": "Blocked",
        "specHub.noChanges": "No changes",
        "specHub.noChangesHint": "No visible changes in this view.",
        "specHub.noBacklogChanges": "No backlog changes",
        "specHub.noBacklogChangesHint": "Move deferred proposals here from the change list.",
        "specHub.changeBacklogBadge": "Backlog",
        "specHub.changeBacklogHint": "This change is currently in backlog.",
        "specHub.changeRowAriaLabelBacklog": `${params?.id ?? ""} ${params?.status ?? ""} ${
          params?.action ?? ""
        }`,
        "specHub.changeAction.menuLabel": "Change actions",
        "specHub.changeAction.moveToBacklog": "Move to backlog",
        "specHub.changeAction.removeFromBacklog": "Remove from backlog",
        "specHub.openInWindow": "Open in Window",
        "specHub.changePane.collapse": "Collapse changes pane",
        "specHub.changePane.expand": "Expand changes pane",
        "specHub.changePane.resize": "Resize changes pane",
        "specHub.readerOutline.title": "Reader Outline",
        "specHub.readerOutline.empty": "No structure",
        "specHub.readerOutline.linkedSpecs": "Linked Specs",
        "specHub.readerOutline.expand": "Expand reader outline",
        "specHub.readerOutline.collapse": "Collapse reader outline",
        "specHub.detached.unavailableTitle": "Unavailable",
        "specHub.detached.unavailableBody": "Body",
        "specHub.expandControlCenter": "Expand control center",
        "specHub.collapseControlCenter": "Collapse control center",
        "specHub.applyExecution.title": "Apply Execution Feedback",
        "specHub.applyExecution.executorLabel": "Apply executor",
        "specHub.applyExecution.executorHint": "Apply executor hint",
        "specHub.applyExecution.collapsePanel": "Collapse feedback panel",
        "specHub.applyExecution.expandPanel": "Expand feedback panel",
        "specHub.applyExecution.closePanel": "Close feedback panel",
        "specHub.applyExecution.fieldStatus": "Status",
        "specHub.applyExecution.fieldPhase": "Phase",
        "specHub.applyExecution.fieldExecutor": "Executor",
        "specHub.applyExecution.status.idle": "Idle",
        "specHub.applyExecution.status.running": "Running",
        "specHub.applyExecution.status.success": "Success",
        "specHub.applyExecution.status.failed": "Failed",
        "specHub.applyExecution.phase.idle": "Idle",
        "specHub.applyExecution.phase.preflight": "Preflight",
        "specHub.applyExecution.phase.instructions": "Instructions",
        "specHub.applyExecution.phase.execution": "Execution",
        "specHub.applyExecution.phase.task-writeback": "Task write-back",
        "specHub.applyExecution.phase.finalize": "Finalize",
        "specHub.applyExecution.startedAt": `Started at: ${params?.time ?? ""}`,
        "specHub.applyExecution.finishedAt": `Finished at: ${params?.time ?? ""}`,
        "specHub.applyExecution.noChanges": "Execution finished without code changes.",
        "specHub.applyExecution.changedFiles": `Changed files: ${params?.count ?? 0}`,
        "specHub.applyExecution.tests": `Tests: ${params?.count ?? 0}`,
        "specHub.applyExecution.checks": `Checks: ${params?.count ?? 0}`,
        "specHub.applyExecution.completedTasks": `Auto-completed tasks: ${params?.count ?? 0}`,
        "specHub.applyExecution.changedFilesTitle": "Changed files",
        "specHub.applyExecution.changedFilesEmpty": "(none)",
        "specHub.applyExecution.testsTitle": "Tests",
        "specHub.applyExecution.checksTitle": "Checks",
        "specHub.applyExecution.streamTitle": "Live output",
        "specHub.applyExecution.logsTitle": "Execution logs",
        "specHub.feedbackElapsed": `Elapsed ${params?.duration ?? ""}`,
        "specHub.autoCombo.linkLabel": "Combo",
        "specHub.autoCombo.title": "Combo Recovery Feedback",
        "specHub.autoCombo.collapsePanel": "Collapse combo recovery feedback",
        "specHub.autoCombo.expandPanel": "Expand combo recovery feedback",
        "specHub.autoCombo.closePanel": "Close combo recovery feedback",
        "specHub.autoCombo.fieldStatus": "Status",
        "specHub.autoCombo.fieldPhase": "Phase",
        "specHub.autoCombo.fieldEngine": "Engine",
        "specHub.autoCombo.startedAt": `Started at: ${params?.time ?? ""}`,
        "specHub.autoCombo.finishedAt": `Finished at: ${params?.time ?? ""}`,
        "specHub.autoCombo.logsTitle": "Execution logs",
        "specHub.autoCombo.remediateHint":
          "Missing specs delta MUST be created before any task polish.",
        "specHub.autoCombo.riskMissingSpecs":
          "Specs delta is missing and must be recovered first.",
        "specHub.autoCombo.verifyPlanEnsureSpecs":
          "Confirm specs/**/*.md exists under this change.",
        "specHub.autoCombo.sequenceFixSpecsFirst":
          "Recover specs delta first, then polish tasks.",
        "specHub.autoCombo.summaryReady":
          "Core artifact audit passed. Specs delta already exists.",
        "specHub.autoCombo.summaryRecovered":
          "Missing specs delta was recovered automatically.",
        "specHub.autoCombo.summaryStillMissing":
          "Specs delta is still missing after auto-recovery. Run Continue + Apply again.",
        "specHub.autoCombo.summaryFailed": "Combo recovery failed.",
        "specHub.autoCombo.errorStillMissing": "Specs delta is still missing.",
        "specHub.autoCombo.errorWithReason":
          `Combo recovery failed: ${params?.reason ?? ""}`,
        "specHub.autoCombo.logDispatch": "Combo recovery audit started.",
        "specHub.autoCombo.logAuditPassed": "Audit passed: specs delta exists.",
        "specHub.autoCombo.logAuditMissingSpecs":
          "Audit found missing specs delta. Starting auto-recovery.",
        "specHub.autoCombo.logRemediateDispatch":
          `Dispatching auto-recovery apply with ${params?.engine ?? ""}.`,
        "specHub.autoCombo.logRemediateFinished": "Auto-recovery apply finished.",
        "specHub.autoCombo.logRemediateFailed":
          "Auto-recovery apply did not succeed. Verifying artifacts anyway.",
        "specHub.autoCombo.status.idle": "Idle",
        "specHub.autoCombo.status.running": "Running",
        "specHub.autoCombo.status.success": "Success",
        "specHub.autoCombo.status.failed": "Failed",
        "specHub.autoCombo.phase.idle": "Idle",
        "specHub.autoCombo.phase.audit": "Artifact audit",
        "specHub.autoCombo.phase.remediate": "Auto recovery",
        "specHub.autoCombo.phase.verify": "Recovery verify",
        "specHub.autoCombo.phase.finalize": "Finalize",
    };
    if (typeof translations[key] === "string") {
      return translations[key];
    }
    if (typeof params?.defaultValue === "string") {
      return params.defaultValue;
    }
    return key;
  };

  const i18n = { language: "en", changeLanguage: vi.fn() };
  const translationValue = { t, i18n };

  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: () => translationValue,
  };
});

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("../../../services/events", () => ({
  subscribeAppServerEvents: vi.fn(() => () => {}),
}));

const openOrFocusDetachedSpecHubMock = vi.fn(async () => "created");

vi.mock("../detachedSpecHub", async (importOriginal) => {
  const original = await importOriginal<typeof import("../detachedSpecHub")>();
  return {
    ...original,
    openOrFocusDetachedSpecHub: (...args: any[]) => (openOrFocusDetachedSpecHubMock as any)(...args),
    writeDetachedSpecHubSessionSnapshot: vi.fn(),
  };
});

vi.mock("../../../services/tauri", () => ({
  detectEngines: vi.fn(async () => [
    { engineType: "codex", installed: true },
    { engineType: "claude", installed: true },
    { engineType: "opencode", installed: true },
  ]),
  engineSendMessage: vi.fn(async () => ({ result: { turn: { id: "turn-1" } } })),
  engineSendMessageSync: vi.fn(async () => ({ engine: "codex", text: "" })),
  getWorkspaceFiles: vi.fn(async () => ({ files: [], directories: [], gitignored_files: [], gitignored_directories: [] })),
  getActiveEngine: vi.fn(async () => "codex"),
  pickImageFiles: vi.fn(async () => []),
  sendUserMessage: vi.fn(async () => ({ result: { turn: { id: "turn-2" } } })),
  startThread: vi.fn(async () => ({})),
}));

const mockUseSpecHub = vi.mocked(useSpecHub);
const mockDetectEngines = vi.mocked(detectEngines);
const mockEngineSendMessageSync = vi.mocked(engineSendMessageSync);
const mockPickImageFiles = vi.mocked(pickImageFiles);
const originalConsoleError = console.error;

function isReactActWarning(args: unknown[]): boolean {
  return args.some(
    (value) => typeof value === "string" && value.includes("not wrapped in act"),
  );
}

function getChangeGroupToggle(label: RegExp | string) {
  const matches = screen
    .getAllByRole("button")
    .filter((button) => button.classList.contains("spec-hub-change-group-toggle"))
    .filter((button) => {
      const text = button.textContent ?? "";
      return typeof label === "string" ? text.includes(label) : label.test(text);
    });
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one group toggle for label ${String(label)}, got ${matches.length}.`);
  }
  return matches[0] as HTMLButtonElement;
}

function createUseSpecHubState(gateMessage: string, overrides?: Record<string, unknown>) {
  const baseState: ReturnType<typeof useSpecHub> = {
    snapshot: {
      provider: "openspec",
      supportLevel: "full",
      specRoot: { source: "default", path: "openspec" },
      environment: {
        mode: "managed",
        status: "healthy",
        checks: [],
        blockers: [],
        hints: [],
      },
      changes: [
        {
          id: "change-1",
          status: "ready",
          updatedAt: 1,
          artifacts: {
            proposalPath: "openspec/changes/change-1/proposal.md",
            designPath: "openspec/changes/change-1/design.md",
            tasksPath: "openspec/changes/change-1/tasks.md",
            verificationPath: null,
            specPaths: ["openspec/changes/change-1/specs/spec-hub-workbench-ui/spec.md"],
          },
          blockers: [],
          archiveBlockers: [],
        },
      ],
      blockers: [],
    },
    selectedChange: {
      id: "change-1",
      status: "ready",
      updatedAt: 1,
      artifacts: {
        proposalPath: "openspec/changes/change-1/proposal.md",
        designPath: "openspec/changes/change-1/design.md",
        tasksPath: "openspec/changes/change-1/tasks.md",
        verificationPath: null,
        specPaths: ["openspec/changes/change-1/specs/spec-hub-workbench-ui/spec.md"],
      },
      blockers: [],
      archiveBlockers: [],
    },
    artifacts: {
      proposal: {
        type: "proposal",
        path: "openspec/changes/change-1/proposal.md",
        exists: true,
        content: "# Proposal\n\n## Capabilities\n\n- `spec-hub-workbench-ui`\n\n## Details\n\nContent",
      },
      design: { type: "design", path: "openspec/changes/change-1/design.md", exists: true, content: "# d" },
      specs: {
        type: "specs",
        path: "openspec/changes/change-1/specs/spec-hub-workbench-ui/spec.md",
        exists: true,
        content: "### Requirement: Current\n\n#### Scenario: Existing",
        truncated: false,
        sources: [
          {
            path: "openspec/changes/change-1/specs/spec-hub-workbench-ui/spec.md",
            content: "### Requirement: Current\n\n#### Scenario: Existing",
            truncated: false,
          },
        ],
      },
      tasks: {
        type: "tasks",
        path: "openspec/changes/change-1/tasks.md",
        exists: true,
        content: "## Tasks",
        truncated: false,
        taskChecklist: [],
        taskProgress: { total: 1, checked: 1, requiredTotal: 1, requiredChecked: 1 },
      },
      verification: { type: "verification", path: null, exists: false, content: "" },
    },
    actions: [],
    timeline: [],
    gate: {
      status: "warn",
      checks: [
        {
          key: "validation",
          label: "Validation",
          status: "warn",
          message: gateMessage,
        },
      ],
    },
    validationIssues: [],
    environmentMode: "managed",
    isLoading: false,
    isRunningAction: null,
    actionError: null,
    applyExecution: {
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
    },
    isBootstrapping: false,
    bootstrapError: null,
    isSavingProjectInfo: false,
    projectInfoError: null,
    isUpdatingTaskIndex: null,
    taskUpdateError: null,
    customSpecRoot: null,
    isControlCenterCollapsed: false,
    setControlCenterCollapsed: vi.fn(),
    backlogChangeIds: [],
    moveChangeToBacklog: vi.fn(),
    removeChangeFromBacklog: vi.fn(),
    refresh: vi.fn(),
    selectChange: vi.fn(),
    executeAction: vi.fn(),
    executeBootstrap: vi.fn(),
    persistProjectInfo: vi.fn(),
    updateTaskChecklistItem: vi.fn(),
    loadProjectInfo: vi.fn(),
    setCustomSpecRoot: vi.fn(),
    switchMode: vi.fn(),
  };
  return {
    ...baseState,
    ...overrides,
  } as ReturnType<typeof useSpecHub>;
}

describe("SpecHub", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

  afterEach(() => {
    cleanup();
    consoleErrorSpy?.mockRestore();
    consoleErrorSpy = null;
    vi.clearAllMocks();
    openOrFocusDetachedSpecHubMock.mockClear();
  });

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
      if (isReactActWarning(args)) {
        return;
      }
      originalConsoleError(...args);
    });
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded") as ReturnType<typeof useSpecHub>,
    );
  });

  it("maps no verify evidence gate message to i18n key", () => {
    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Gate" }));

    expect(screen.getByText("NO_VERIFY_EVIDENCE")).toBeTruthy();
  });

  it("maps truncated artifact gate message with interpolation", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("Artifact evidence is truncated (tasks.md, specs). Re-read before archive.") as ReturnType<
        typeof useSpecHub
      >,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Gate" }));

    expect(screen.getByText("TRUNCATED tasks.md, specs")).toBeTruthy();
  });

  it("defaults to project tab and switches to actions on demand", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        actions: [
          {
            key: "verify",
            label: "Verify",
            commandPreview: "openspec validate change-1 --strict",
            available: true,
            blockers: [],
            kind: "native",
          },
        ],
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: "Verify" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    expect(screen.getByRole("button", { name: "Verify" })).toBeTruthy();
  });

  it("renders actions with availability and blockers", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        actions: [
          {
            key: "verify",
            label: "Verify",
            commandPreview: "openspec validate change-1 --strict",
            available: true,
            blockers: [],
            kind: "native",
          },
          {
            key: "archive",
            label: "Archive",
            commandPreview: "openspec archive change-1 --yes",
            available: false,
            blockers: ["No strict verify evidence recorded"],
            kind: "native",
          },
        ],
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));

    const verifyButton = screen.getByRole("button", { name: "Verify" });
    const archiveButton = screen.getByRole("button", { name: "Archive" });

    expect(verifyButton.getAttribute("disabled")).toBeNull();
    expect(archiveButton.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText("NO_VERIFY_EVIDENCE")).toBeTruthy();
  });

  it("keeps verify behavior unchanged when auto-complete toggle is off", () => {
    const executeAction = vi.fn();
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        actions: [
          {
            key: "verify",
            label: "Verify",
            commandPreview: "openspec validate change-1 --strict",
            available: true,
            blockers: [],
            kind: "native",
          },
        ],
        executeAction,
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    const toggle = screen.getByRole("checkbox", { name: "Auto-complete" }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(executeAction).toHaveBeenCalledWith("verify");
    expect(mockEngineSendMessageSync).not.toHaveBeenCalled();
  });

  it("runs auto-completion before verify when toggle is enabled and verification is missing", async () => {
    const executeAction = vi.fn();
    const refresh = vi.fn(async () => {});
    mockEngineSendMessageSync.mockResolvedValueOnce({
      engine: "codex",
      text: JSON.stringify({
        summary: "verification generated",
        verification_path: "openspec/changes/change-1/verification.md",
      }),
    });
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        actions: [
          {
            key: "verify",
            label: "Verify",
            commandPreview: "openspec validate change-1 --strict",
            available: true,
            blockers: [],
            kind: "native",
          },
        ],
        artifacts: {
          proposal: {
            type: "proposal",
            path: "openspec/changes/change-1/proposal.md",
            exists: true,
            content: "# p",
          },
          design: {
            type: "design",
            path: "openspec/changes/change-1/design.md",
            exists: true,
            content: "# d",
          },
          specs: {
            type: "specs",
            path: "openspec/changes/change-1/specs/spec-hub/spec.md",
            exists: true,
            content: "# s",
            truncated: false,
            sources: [],
          },
          tasks: {
            type: "tasks",
            path: "openspec/changes/change-1/tasks.md",
            exists: true,
            content: "## Tasks",
            truncated: false,
            taskChecklist: [],
            taskProgress: { total: 1, checked: 1, requiredTotal: 1, requiredChecked: 1 },
          },
          verification: {
            type: "verification",
            path: null,
            exists: false,
            content: "",
          },
        },
        executeAction,
        refresh,
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto-complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(mockEngineSendMessageSync).toHaveBeenCalled();
    });
    expect(refresh).toHaveBeenCalled();
    expect(executeAction).toHaveBeenCalledWith("verify");
    expect(screen.getByRole("dialog", { name: "Verify Auto-Completion Feedback" })).toBeTruthy();
  });

  it("skips auto-completion when verification artifact already exists", () => {
    const executeAction = vi.fn();
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        actions: [
          {
            key: "verify",
            label: "Verify",
            commandPreview: "openspec validate change-1 --strict",
            available: true,
            blockers: [],
            kind: "native",
          },
        ],
        artifacts: {
          proposal: {
            type: "proposal",
            path: "openspec/changes/change-1/proposal.md",
            exists: true,
            content: "# p",
          },
          design: {
            type: "design",
            path: "openspec/changes/change-1/design.md",
            exists: true,
            content: "# d",
          },
          specs: {
            type: "specs",
            path: "openspec/changes/change-1/specs/spec-hub/spec.md",
            exists: true,
            content: "# s",
            truncated: false,
            sources: [],
          },
          tasks: {
            type: "tasks",
            path: "openspec/changes/change-1/tasks.md",
            exists: true,
            content: "## Tasks",
            truncated: false,
            taskChecklist: [],
            taskProgress: { total: 1, checked: 1, requiredTotal: 1, requiredChecked: 1 },
          },
          verification: {
            type: "verification",
            path: "openspec/changes/change-1/verification.md",
            exists: true,
            content: "# verification",
          },
        },
        executeAction,
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto-complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(mockEngineSendMessageSync).not.toHaveBeenCalled();
    expect(executeAction).toHaveBeenCalledWith("verify");
  });

  it("still runs auto-completion when verification path is present but file is missing", async () => {
    const executeAction = vi.fn();
    mockEngineSendMessageSync.mockRejectedValueOnce(new Error("verification missing"));
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        actions: [
          {
            key: "verify",
            label: "Verify",
            commandPreview: "openspec validate change-1 --strict",
            available: true,
            blockers: [],
            kind: "native",
          },
        ],
        artifacts: {
          proposal: {
            type: "proposal",
            path: "openspec/changes/change-1/proposal.md",
            exists: true,
            content: "# p",
          },
          design: {
            type: "design",
            path: "openspec/changes/change-1/design.md",
            exists: true,
            content: "# d",
          },
          specs: {
            type: "specs",
            path: "openspec/changes/change-1/specs/spec-hub/spec.md",
            exists: true,
            content: "# s",
            truncated: false,
            sources: [],
          },
          tasks: {
            type: "tasks",
            path: "openspec/changes/change-1/tasks.md",
            exists: true,
            content: "## Tasks",
            truncated: false,
            taskChecklist: [],
            taskProgress: { total: 1, checked: 1, requiredTotal: 1, requiredChecked: 1 },
          },
          verification: {
            type: "verification",
            path: "openspec/changes/change-1/verification.md",
            exists: false,
            content: "",
          },
        },
        executeAction,
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto-complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(mockEngineSendMessageSync).toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Verify Auto-Completion Feedback" })).toBeTruthy();
    });
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("aborts verify when auto-completion fails and surfaces error", async () => {
    const executeAction = vi.fn();
    mockEngineSendMessageSync.mockRejectedValueOnce(new Error("network unavailable"));
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        actions: [
          {
            key: "verify",
            label: "Verify",
            commandPreview: "openspec validate change-1 --strict",
            available: true,
            blockers: [],
            kind: "native",
          },
        ],
        executeAction,
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto-complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(screen.getByText("Auto-completion failed: network unavailable")).toBeTruthy();
      expect(
        screen.getAllByText("Auto-completion failed and strict validate was skipped for this run.").length,
      ).toBeGreaterThan(0);
    });
    expect(screen.getByRole("dialog", { name: "Verify Auto-Completion Feedback" })).toBeTruthy();
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("shows continue ai enhancement feedback in floating dialog", async () => {
    const executeAction = vi.fn(async () => ({
      id: "evt-continue",
      at: Date.now(),
      kind: "action",
      action: "continue",
      command: "openspec instructions specs --change change-1",
      success: true,
      output: "continue output",
      validationIssues: [],
      gitRefs: [],
    }));
    mockEngineSendMessageSync.mockResolvedValueOnce({
      engine: "codex",
      text: JSON.stringify({
        summary: "ready for apply",
        recommended_next_action: "apply",
        suggested_scope: ["src/features/spec"],
      }),
    });
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        actions: [
          {
            key: "continue",
            label: "Continue",
            commandPreview: "openspec instructions specs --change change-1",
            available: true,
            blockers: [],
            kind: "native",
          },
        ],
        executeAction,
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "AI Enhancement" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Continue AI Enhancement Feedback" })).toBeTruthy();
    });
    expect(executeAction).toHaveBeenCalledWith("continue");
    expect(executeAction).toHaveBeenCalledWith(
      "apply",
      expect.objectContaining({
        applyMode: "execute",
        applyExecutor: "codex",
        applyUseContinueBrief: true,
        ignoreAvailability: true,
      }),
    );
    expect(mockEngineSendMessageSync).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        accessMode: "read-only",
      }),
    );
  });

  it("supports dragging verify auto-completion feedback and resets position after close", async () => {
    const executeAction = vi.fn(async () => {});
    mockEngineSendMessageSync.mockRejectedValueOnce(new Error("drag-check"));
    mockEngineSendMessageSync.mockRejectedValueOnce(new Error("drag-check-2"));
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        actions: [
          {
            key: "verify",
            label: "Verify",
            commandPreview: "openspec validate change-1 --strict",
            available: true,
            blockers: [],
            kind: "native",
          },
        ],
        executeAction,
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto-complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    const dialog = await screen.findByRole("dialog", { name: "Verify Auto-Completion Feedback" });
    const initialLeft = dialog.getAttribute("style") ?? "";
    const header = dialog.querySelector(".spec-hub-apply-floating-header") as HTMLElement;
    fireEvent.pointerDown(header, { button: 0, clientX: 24, clientY: 24 });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 180 });
    fireEvent.pointerUp(window);
    const movedStyle = dialog.getAttribute("style") ?? "";
    expect(movedStyle).not.toBe(initialLeft);

    fireEvent.click(screen.getByRole("button", { name: "Close verify auto-completion feedback" }));
    expect(screen.queryByRole("dialog", { name: "Verify Auto-Completion Feedback" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    const reopenedDialog = await screen.findByRole("dialog", { name: "Verify Auto-Completion Feedback" });
    expect(reopenedDialog.getAttribute("style") ?? "").toBe(initialLeft);
  });

  it("hides ai takeover panel before verify runs even when archive blockers exist", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        actions: [
          {
            key: "archive",
            label: "Archive",
            commandPreview: "openspec archive change-1 --yes",
            available: false,
            blockers: ["Archive preflight failed: delta MODIFIED requires existing openspec/specs/demo/spec.md"],
            kind: "native",
          },
        ],
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    expect(screen.queryByText("specHub.aiTakeover.title")).toBeNull();
  });

  it("shows ai takeover panel after verify runs when archive blockers exist", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        actions: [
          {
            key: "archive",
            label: "Archive",
            commandPreview: "openspec archive change-1 --yes",
            available: false,
            blockers: ["Archive preflight failed: delta MODIFIED requires existing openspec/specs/demo/spec.md"],
            kind: "native",
          },
        ],
        timeline: [
          {
            id: "verify-1",
            at: Date.UTC(2026, 1, 25, 3, 0, 0),
            kind: "validate",
            action: "verify",
            command: "openspec validate change-1 --strict",
            success: true,
            output: "strict validation passed",
            validationIssues: [],
            gitRefs: [],
          },
        ],
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    expect(screen.getByText("specHub.aiTakeover.title")).toBeTruthy();
  });

  it("renders doctor checks and hints", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        snapshot: {
          provider: "openspec",
          supportLevel: "full",
          specRoot: { source: "default", path: "openspec" },
          environment: {
            mode: "managed",
            status: "degraded",
            checks: [
              {
                key: "cli",
                label: "OpenSpec CLI",
                ok: false,
                value: "missing",
                detail: "Install openspec CLI",
              },
            ],
            blockers: ["OpenSpec CLI missing"],
            hints: ["Run npm i -g openspec"],
          },
          changes: [
            {
              id: "change-1",
              status: "ready",
              updatedAt: 1,
              artifacts: {
                proposalPath: "openspec/changes/change-1/proposal.md",
                designPath: "openspec/changes/change-1/design.md",
                tasksPath: "openspec/changes/change-1/tasks.md",
                verificationPath: null,
                specPaths: ["openspec/changes/change-1/specs/spec-hub/spec.md"],
              },
              blockers: [],
              archiveBlockers: [],
            },
          ],
          blockers: [],
        },
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    expect(screen.queryByRole("tab", { name: "Doctor" })).toBeNull();
    expect(screen.getByRole("button", { name: "Managed" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "BYO" })).toBeTruthy();
    expect(screen.getByText("OpenSpec CLI")).toBeTruthy();
    expect(screen.getByText("Install openspec CLI")).toBeTruthy();
    expect(screen.getByText("OpenSpec CLI missing")).toBeTruthy();
    expect(screen.getByText("Run npm i -g openspec")).toBeTruthy();
  });

  it("renders timeline entries with command and output", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        timeline: [
          {
            id: "evt-1",
            at: Date.UTC(2026, 1, 25, 2, 0, 0),
            kind: "validate",
            action: "verify",
            command: "openspec validate change-1 --strict",
            success: true,
            output: "strict validation passed",
            validationIssues: [],
            gitRefs: [],
          },
        ],
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));

    expect(screen.getByText("openspec validate change-1 --strict")).toBeTruthy();
    expect(screen.getByText("strict validation passed")).toBeTruthy();
  });

  it("routes apply action with selected executor in execute mode", async () => {
    const executeAction = vi.fn();
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        actions: [
          {
            key: "apply",
            label: "Apply",
            commandPreview: "openspec instructions tasks --change change-1",
            available: true,
            blockers: [],
            kind: "native",
          },
        ],
        executeAction,
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Claude Code/ })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Execution engine"), {
      target: { value: "claude" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(executeAction).toHaveBeenCalledWith(
      "apply",
      expect.objectContaining({
        applyMode: "execute",
        applyExecutor: "claude",
      }),
    );
  });

  it("disables apply executor selector while action is running", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        isRunningAction: "apply",
        actions: [
          {
            key: "apply",
            label: "Apply",
            commandPreview: "openspec instructions tasks --change change-1",
            available: true,
            blockers: [],
            kind: "native",
          },
        ],
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    expect(screen.getByLabelText("Execution engine").getAttribute("disabled")).not.toBeNull();
  });

  it("routes apply action with OpenCode executor", async () => {
    const executeAction = vi.fn();
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        actions: [
          {
            key: "apply",
            label: "Apply",
            commandPreview: "openspec instructions tasks --change change-1",
            available: true,
            blockers: [],
            kind: "native",
          },
        ],
        executeAction,
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /OpenCode/ })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Execution engine"), {
      target: { value: "opencode" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(executeAction).toHaveBeenCalledWith(
      "apply",
      expect.objectContaining({
        applyMode: "execute",
        applyExecutor: "opencode",
      }),
    );
  });

  it("renders shared engine and icon-only proposal triggers in one row", () => {
    const view = render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));

    const row = view.container.querySelector(".spec-hub-action-orchestrator-row");
    expect(row).toBeTruthy();
    expect(row?.querySelectorAll("select, button").length).toBe(3);
    expect(screen.getByRole("button", { name: "New Proposal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Append Proposal" })).toBeTruthy();
    expect(screen.queryByText("New Proposal")).toBeNull();
    expect(screen.queryByText("Append Proposal")).toBeNull();
    expect(screen.getByTestId("engine-icon").textContent).toBe("codex");
    expect(screen.getByRole("option", { name: /Codex/ })).toBeTruthy();
  });

  it("keeps OpenCode visible in selector when engine is unavailable", async () => {
    mockDetectEngines.mockResolvedValueOnce([
      {
        engineType: "codex",
        installed: true,
        version: "1.0.0",
        binPath: "/tmp/codex",
        features: {
          streaming: true,
          reasoning: true,
          toolUse: true,
          imageInput: true,
          sessionContinuation: true,
        },
        models: [],
        error: null,
      },
      {
        engineType: "claude",
        installed: true,
        version: "1.0.0",
        binPath: "/tmp/claude",
        features: {
          streaming: true,
          reasoning: true,
          toolUse: true,
          imageInput: true,
          sessionContinuation: true,
        },
        models: [],
        error: null,
      },
      {
        engineType: "opencode",
        installed: false,
        version: null,
        binPath: null,
        features: {
          streaming: false,
          reasoning: false,
          toolUse: false,
          imageInput: false,
          sessionContinuation: false,
        },
        models: [],
        error: "not installed",
      },
    ]);

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /OpenCode/ })).toBeTruthy();
    });
    expect((screen.getByRole("option", { name: /OpenCode/ }) as HTMLOptionElement).disabled).toBe(true);
  });

  it("disables append proposal trigger when all changes are archived", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        snapshot: {
          provider: "openspec",
          supportLevel: "full",
          specRoot: { source: "default", path: "openspec" },
          environment: {
            mode: "managed",
            status: "healthy",
            checks: [],
            blockers: [],
            hints: [],
          },
          changes: [
            {
              id: "change-archived",
              status: "archived",
              updatedAt: 1,
              artifacts: {
                proposalPath: "openspec/changes/change-archived/proposal.md",
                designPath: "openspec/changes/change-archived/design.md",
                tasksPath: "openspec/changes/change-archived/tasks.md",
                verificationPath: null,
                specPaths: ["openspec/changes/change-archived/specs/spec-hub/spec.md"],
              },
              blockers: [],
              archiveBlockers: [],
            },
          ],
          blockers: [],
        },
        selectedChange: {
          id: "change-archived",
          status: "archived",
          updatedAt: 1,
          artifacts: {
            proposalPath: "openspec/changes/change-archived/proposal.md",
            designPath: "openspec/changes/change-archived/design.md",
            tasksPath: "openspec/changes/change-archived/tasks.md",
            verificationPath: null,
            specPaths: ["openspec/changes/change-archived/specs/spec-hub/spec.md"],
          },
          blockers: [],
          archiveBlockers: [],
        },
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    expect((screen.getByRole("button", { name: "Append Proposal" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables append proposal trigger when selected change is archived", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        snapshot: {
          provider: "openspec",
          supportLevel: "full",
          specRoot: { source: "default", path: "openspec" },
          environment: {
            mode: "managed",
            status: "healthy",
            checks: [],
            blockers: [],
            hints: [],
          },
          changes: [
            {
              id: "change-ready",
              status: "ready",
              updatedAt: 1,
              artifacts: {
                proposalPath: "openspec/changes/change-ready/proposal.md",
                designPath: "openspec/changes/change-ready/design.md",
                tasksPath: "openspec/changes/change-ready/tasks.md",
                verificationPath: null,
                specPaths: ["openspec/changes/change-ready/specs/spec-hub/spec.md"],
              },
              blockers: [],
              archiveBlockers: [],
            },
            {
              id: "change-archived",
              status: "archived",
              updatedAt: 2,
              artifacts: {
                proposalPath: "openspec/changes/change-archived/proposal.md",
                designPath: "openspec/changes/change-archived/design.md",
                tasksPath: "openspec/changes/change-archived/tasks.md",
                verificationPath: null,
                specPaths: ["openspec/changes/change-archived/specs/spec-hub/spec.md"],
              },
              blockers: [],
              archiveBlockers: [],
            },
          ],
          blockers: [],
        },
        selectedChange: {
          id: "change-archived",
          status: "archived",
          updatedAt: 2,
          artifacts: {
            proposalPath: "openspec/changes/change-archived/proposal.md",
            designPath: "openspec/changes/change-archived/design.md",
            tasksPath: "openspec/changes/change-archived/tasks.md",
            verificationPath: null,
            specPaths: ["openspec/changes/change-archived/specs/spec-hub/spec.md"],
          },
          blockers: [],
          archiveBlockers: [],
        },
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    expect((screen.getByRole("button", { name: "Append Proposal" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("hides archived changes from append proposal target select", async () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        snapshot: {
          provider: "openspec",
          supportLevel: "full",
          specRoot: { source: "default", path: "openspec" },
          environment: {
            mode: "managed",
            status: "healthy",
            checks: [],
            blockers: [],
            hints: [],
          },
          changes: [
            {
              id: "change-ready-a",
              status: "ready",
              updatedAt: 1,
              artifacts: {
                proposalPath: "openspec/changes/change-ready-a/proposal.md",
                designPath: "openspec/changes/change-ready-a/design.md",
                tasksPath: "openspec/changes/change-ready-a/tasks.md",
                verificationPath: null,
                specPaths: ["openspec/changes/change-ready-a/specs/spec-hub/spec.md"],
              },
              blockers: [],
              archiveBlockers: [],
            },
            {
              id: "change-archived",
              status: "archived",
              updatedAt: 2,
              artifacts: {
                proposalPath: "openspec/changes/change-archived/proposal.md",
                designPath: "openspec/changes/change-archived/design.md",
                tasksPath: "openspec/changes/change-archived/tasks.md",
                verificationPath: null,
                specPaths: ["openspec/changes/change-archived/specs/spec-hub/spec.md"],
              },
              blockers: [],
              archiveBlockers: [],
            },
            {
              id: "change-ready-b",
              status: "ready",
              updatedAt: 3,
              artifacts: {
                proposalPath: "openspec/changes/change-ready-b/proposal.md",
                designPath: "openspec/changes/change-ready-b/design.md",
                tasksPath: "openspec/changes/change-ready-b/tasks.md",
                verificationPath: null,
                specPaths: ["openspec/changes/change-ready-b/specs/spec-hub/spec.md"],
              },
              blockers: [],
              archiveBlockers: [],
            },
          ],
          blockers: [],
        },
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Append Proposal" }));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "change-ready-a" })).toBeTruthy();
    });
    expect(screen.getByRole("option", { name: "change-ready-b" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "change-archived" })).toBeNull();
  });

  it("blocks proposal submit when content and images are both empty", () => {
    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    fireEvent.click(screen.getByRole("button", { name: "New Proposal" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Create" }));

    expect(screen.getByText("Enter proposal content or attach at least one image.")).toBeTruthy();
  });

  it("attaches proposal images and forwards them to proposal execution", async () => {
    mockPickImageFiles.mockResolvedValueOnce(["/tmp/mock.png"]);
    mockEngineSendMessageSync.mockResolvedValueOnce({
      engine: "codex",
      text: JSON.stringify({
        summary: "proposal updated",
        change_id: "change-1",
      }),
    });

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    fireEvent.click(screen.getByRole("button", { name: "New Proposal" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach image" }));

    await waitFor(() => {
      expect(screen.getByText("mock.png")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit Create" }));

    await waitFor(() => {
      expect(mockEngineSendMessageSync).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          images: ["/tmp/mock.png"],
          accessMode: "full-access",
        }),
      );
    });

    const lastCall = mockEngineSendMessageSync.mock.calls[mockEngineSendMessageSync.mock.calls.length - 1];
    const prompt = lastCall?.[1]?.text ?? "";
    expect(prompt).toContain("1 image attachment(s) are included");
  });

  it("shows validation error for unsupported proposal attachment", async () => {
    mockPickImageFiles.mockResolvedValueOnce(["/tmp/not-image.txt"]);

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    fireEvent.click(screen.getByRole("button", { name: "New Proposal" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach image" }));

    await waitFor(() => {
      expect(screen.getByText("Unsupported image format. Use png/jpg/jpeg/gif/webp/bmp/tiff.")).toBeTruthy();
    });
  });

  it("renders apply execution feedback summary", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        applyExecution: {
          status: "success",
          phase: "finalize",
          executor: "codex",
          startedAt: Date.UTC(2026, 1, 25, 2, 0, 0),
          finishedAt: Date.UTC(2026, 1, 25, 2, 1, 0),
          instructionsOutput: "instructions",
          executionOutput: "done",
          summary: "Execution finished.",
          changedFiles: ["src/a.ts"],
          tests: ["vitest run src/features/spec"],
          checks: ["npm run typecheck"],
          completedTaskIndices: [0],
          noChanges: false,
          error: null,
          logs: ["phase log"],
        },
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    expect(screen.getByText("Apply Execution Feedback")).toBeTruthy();
    expect(screen.getByText("Execution finished.")).toBeTruthy();
    expect(screen.getByText((text) => text.includes("Changed files: 1"))).toBeTruthy();
    expect(screen.getByText((text) => text.includes("Tests: 1"))).toBeTruthy();
    expect(screen.getByText((text) => text.includes("Checks: 1"))).toBeTruthy();
    expect(screen.getByText((text) => text.includes("Auto-completed tasks: 1"))).toBeTruthy();
    expect(screen.getByText("src/a.ts")).toBeTruthy();
    expect(screen.getByText("vitest run src/features/spec")).toBeTruthy();
    expect(screen.getByText("npm run typecheck")).toBeTruthy();
  });

  it("supports collapsing and closing apply execution floating panel", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        applyExecution: {
          status: "running",
          phase: "execution",
          executor: "claude",
          startedAt: Date.UTC(2026, 1, 25, 2, 0, 0),
          finishedAt: null,
          instructionsOutput: "",
          executionOutput: "log output",
          summary: "Execution in progress.",
          changedFiles: [],
          tests: [],
          checks: [],
          completedTaskIndices: [],
          noChanges: false,
          error: null,
          logs: ["running log"],
        },
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    expect(screen.getByText("Apply Execution Feedback")).toBeTruthy();
    expect(screen.getByText("Execution in progress.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse feedback panel" }));
    expect(screen.queryByText("Execution in progress.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand feedback panel" }));
    expect(screen.getByText("Execution in progress.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close feedback panel" }));
    expect(screen.queryByText("Apply Execution Feedback")).toBeNull();
  });

  it("keeps floating feedback visible after workspace switch", () => {
    let currentState = createUseSpecHubState("No strict verify evidence recorded", {
      applyExecution: {
        status: "running",
        phase: "execution",
        executor: "claude",
        startedAt: Date.UTC(2026, 1, 25, 2, 0, 0),
        finishedAt: null,
        instructionsOutput: "",
        executionOutput: "log output",
        summary: "Execution in progress.",
        changedFiles: [],
        tests: [],
        checks: [],
        completedTaskIndices: [],
        noChanges: false,
        error: null,
        logs: ["running log"],
      },
    }) as ReturnType<typeof useSpecHub>;

    mockUseSpecHub.mockImplementation(() => currentState);

    const view = render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    expect(screen.getByText("Apply Execution Feedback")).toBeTruthy();
    expect(screen.getByText("Execution in progress.")).toBeTruthy();

    currentState = createUseSpecHubState("No strict verify evidence recorded", {
      selectedChange: null,
      actions: [],
      applyExecution: {
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
      },
    }) as ReturnType<typeof useSpecHub>;

    view.rerender(
      <SpecHub
        workspaceId="ws-2"
        workspaceName="Workspace 2"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    expect(screen.getByText("Apply Execution Feedback")).toBeTruthy();
    expect(screen.getByText("Execution in progress.")).toBeTruthy();
  });

  it("renders apply failure hint", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        applyExecution: {
          status: "failed",
          phase: "execution",
          executor: "claude",
          startedAt: Date.UTC(2026, 1, 25, 2, 0, 0),
          finishedAt: Date.UTC(2026, 1, 25, 2, 0, 20),
          instructionsOutput: "instructions",
          executionOutput: "",
          summary: "",
          changedFiles: [],
          tests: [],
          checks: [],
          completedTaskIndices: [],
          noChanges: true,
          error: "Execution failed unexpectedly.",
          logs: [],
        },
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    expect(screen.getByText("Execution failed unexpectedly.")).toBeTruthy();
  });

  it("renders apply no-change hint on successful execution", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        applyExecution: {
          status: "success",
          phase: "finalize",
          executor: "claude",
          startedAt: Date.UTC(2026, 1, 25, 2, 0, 0),
          finishedAt: Date.UTC(2026, 1, 25, 2, 0, 20),
          instructionsOutput: "instructions",
          executionOutput: "",
          summary: "No updates required.",
          changedFiles: [],
          tests: [],
          checks: [],
          completedTaskIndices: [],
          noChanges: true,
          error: null,
          logs: [],
        },
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    expect(screen.getByText("Execution finished without code changes.")).toBeTruthy();
  });

  it("groups archived changes by date prefix and keeps fallback bucket", () => {
    const selectChange = vi.fn();
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        snapshot: {
          provider: "openspec",
          supportLevel: "full",
          specRoot: { source: "default", path: "openspec" },
          environment: {
            mode: "managed",
            status: "healthy",
            checks: [],
            blockers: [],
            hints: [],
          },
          changes: [
            {
              id: "2026-02-26-alpha-fix",
              status: "archived",
              updatedAt: 3,
              artifacts: {
                proposalPath: "openspec/changes/archive/2026-02-26-alpha-fix/proposal.md",
                designPath: "openspec/changes/archive/2026-02-26-alpha-fix/design.md",
                tasksPath: "openspec/changes/archive/2026-02-26-alpha-fix/tasks.md",
                verificationPath: null,
                specPaths: [],
              },
              blockers: [],
              archiveBlockers: [],
            },
            {
              id: "legacy-change",
              status: "archived",
              updatedAt: 2,
              artifacts: {
                proposalPath: "openspec/changes/archive/legacy-change/proposal.md",
                designPath: "openspec/changes/archive/legacy-change/design.md",
                tasksPath: "openspec/changes/archive/legacy-change/tasks.md",
                verificationPath: null,
                specPaths: [],
              },
              blockers: [],
              archiveBlockers: [],
            },
            {
              id: "2026-02-26-beta-fix",
              status: "archived",
              updatedAt: 1,
              artifacts: {
                proposalPath: "openspec/changes/archive/2026-02-26-beta-fix/proposal.md",
                designPath: "openspec/changes/archive/2026-02-26-beta-fix/design.md",
                tasksPath: "openspec/changes/archive/2026-02-26-beta-fix/tasks.md",
                verificationPath: null,
                specPaths: [],
              },
              blockers: [],
              archiveBlockers: [],
            },
          ],
          blockers: [],
        },
        selectedChange: null,
        selectChange,
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archived" }));

    expect(getChangeGroupToggle(/2026-02-26/i)).toBeTruthy();
    expect(getChangeGroupToggle(/Other/i)).toBeTruthy();
    expect(screen.getByText("2026-02-26-alpha-fix")).toBeTruthy();
    expect(screen.getByText("2026-02-26-beta-fix")).toBeTruthy();
    expect(screen.getByText("legacy-change")).toBeTruthy();

    fireEvent.click(screen.getByText("legacy-change"));
    expect(selectChange).toHaveBeenCalledWith("legacy-change");
  });

  it("toggles archived date group collapse and expand", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        snapshot: {
          provider: "openspec",
          supportLevel: "full",
          specRoot: { source: "default", path: "openspec" },
          environment: {
            mode: "managed",
            status: "healthy",
            checks: [],
            blockers: [],
            hints: [],
          },
          changes: [
            {
              id: "2026-02-26-collapse-a",
              status: "archived",
              updatedAt: 2,
              artifacts: {
                proposalPath: "openspec/changes/archive/2026-02-26-collapse-a/proposal.md",
                designPath: "openspec/changes/archive/2026-02-26-collapse-a/design.md",
                tasksPath: "openspec/changes/archive/2026-02-26-collapse-a/tasks.md",
                verificationPath: null,
                specPaths: [],
              },
              blockers: [],
              archiveBlockers: [],
            },
            {
              id: "2026-02-26-collapse-b",
              status: "archived",
              updatedAt: 1,
              artifacts: {
                proposalPath: "openspec/changes/archive/2026-02-26-collapse-b/proposal.md",
                designPath: "openspec/changes/archive/2026-02-26-collapse-b/design.md",
                tasksPath: "openspec/changes/archive/2026-02-26-collapse-b/tasks.md",
                verificationPath: null,
                specPaths: [],
              },
              blockers: [],
              archiveBlockers: [],
            },
          ],
          blockers: [],
        },
        selectedChange: null,
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archived" }));

    const groupToggle = getChangeGroupToggle(/2026-02-26/i);
    expect(groupToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("2026-02-26-collapse-a")).toBeTruthy();

    fireEvent.click(groupToggle);
    expect(groupToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("2026-02-26-collapse-a")).toBeNull();

    fireEvent.click(groupToggle);
    expect(groupToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("2026-02-26-collapse-a")).toBeTruthy();
  });

  it("groups date-prefixed changes in all view with fallback bucket", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        snapshot: {
          provider: "openspec",
          supportLevel: "full",
          specRoot: { source: "default", path: "openspec" },
          environment: {
            mode: "managed",
            status: "healthy",
            checks: [],
            blockers: [],
            hints: [],
          },
          changes: [
            {
              id: "2026-02-26-active-a",
              status: "ready",
              updatedAt: 3,
              artifacts: {
                proposalPath: "openspec/changes/2026-02-26-active-a/proposal.md",
                designPath: "openspec/changes/2026-02-26-active-a/design.md",
                tasksPath: "openspec/changes/2026-02-26-active-a/tasks.md",
                verificationPath: null,
                specPaths: [],
              },
              blockers: [],
              archiveBlockers: [],
            },
            {
              id: "2026-02-26-archived-b",
              status: "archived",
              updatedAt: 2,
              artifacts: {
                proposalPath: "openspec/changes/archive/2026-02-26-archived-b/proposal.md",
                designPath: "openspec/changes/archive/2026-02-26-archived-b/design.md",
                tasksPath: "openspec/changes/archive/2026-02-26-archived-b/tasks.md",
                verificationPath: null,
                specPaths: [],
              },
              blockers: [],
              archiveBlockers: [],
            },
            {
              id: "legacy-active-change",
              status: "implementing",
              updatedAt: 1,
              artifacts: {
                proposalPath: "openspec/changes/legacy-active-change/proposal.md",
                designPath: "openspec/changes/legacy-active-change/design.md",
                tasksPath: "openspec/changes/legacy-active-change/tasks.md",
                verificationPath: null,
                specPaths: [],
              },
              blockers: [],
              archiveBlockers: [],
            },
          ],
          blockers: [],
        },
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    expect(getChangeGroupToggle(/2026-02-26/i)).toBeTruthy();
    expect(getChangeGroupToggle(/Other/i)).toBeTruthy();
    expect(screen.getByText("2026-02-26-active-a")).toBeTruthy();
    expect(screen.getByText("2026-02-26-archived-b")).toBeTruthy();
    expect(screen.getByText("legacy-active-change")).toBeTruthy();
  });

  it("shows backlog empty state when no deferred changes exist", () => {
    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Backlog" }));

    expect(screen.getByText("No backlog changes")).toBeTruthy();
    expect(screen.getByText("Move deferred proposals here from the change list.")).toBeTruthy();
  });

  it("keeps backlog members out of active view and marks them in backlog view", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        snapshot: {
          provider: "openspec",
          supportLevel: "full",
          specRoot: { source: "default", path: "openspec" },
          environment: {
            mode: "managed",
            status: "healthy",
            checks: [],
            blockers: [],
            hints: [],
          },
          changes: [
            {
              id: "change-1",
              status: "ready",
              updatedAt: 2,
              artifacts: {
                proposalPath: "openspec/changes/change-1/proposal.md",
                designPath: "openspec/changes/change-1/design.md",
                tasksPath: "openspec/changes/change-1/tasks.md",
                verificationPath: null,
                specPaths: [],
              },
              blockers: [],
              archiveBlockers: [],
            },
            {
              id: "change-2",
              status: "implementing",
              updatedAt: 1,
              artifacts: {
                proposalPath: "openspec/changes/change-2/proposal.md",
                designPath: "openspec/changes/change-2/design.md",
                tasksPath: "openspec/changes/change-2/tasks.md",
                verificationPath: null,
                specPaths: [],
              },
              blockers: [],
              archiveBlockers: [],
            },
          ],
          blockers: [],
        },
        selectedChange: {
          id: "change-1",
          status: "ready",
          updatedAt: 2,
          artifacts: {
            proposalPath: "openspec/changes/change-1/proposal.md",
            designPath: "openspec/changes/change-1/design.md",
            tasksPath: "openspec/changes/change-1/tasks.md",
            verificationPath: null,
            specPaths: [],
          },
          blockers: [],
          archiveBlockers: [],
        },
        backlogChangeIds: ["change-2"],
      }),
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    const backlogRow = document.querySelector(".spec-hub-change-item.is-backlog");
    expect(backlogRow?.textContent).toContain("change-2");

    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(screen.getByText("change-1")).toBeTruthy();
    expect(screen.queryByText("change-2")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Backlog" }));
    expect(screen.getByText("change-2")).toBeTruthy();
    expect(screen.getAllByText("Backlog").length).toBeGreaterThan(0);
  });

  it("moves a change into backlog from the context menu", () => {
    const moveChangeToBacklog = vi.fn();
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        moveChangeToBacklog,
      }),
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: /change-1/i }), {
      clientX: 120,
      clientY: 140,
    });

    fireEvent.click(screen.getByRole("menuitem", { name: "Move to backlog" }));

    expect(moveChangeToBacklog).toHaveBeenCalledWith("change-1");
  });

  it("removes a change from backlog from the keyboard context-menu flow", () => {
    const removeChangeFromBacklog = vi.fn();
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        backlogChangeIds: ["change-1"],
        removeChangeFromBacklog,
      }),
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /change-1/i }), {
      key: "F10",
      shiftKey: true,
    });

    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from backlog" }));

    expect(removeChangeFromBacklog).toHaveBeenCalledWith("change-1");
  });

  it("reflects collapsed control-center state and forwards toggle intent", () => {
    const setControlCenterCollapsed = vi.fn();
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        isControlCenterCollapsed: true,
        setControlCenterCollapsed,
      }),
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    expect(document.querySelector(".spec-hub-grid")?.classList.contains("is-control-collapsed")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Expand control center" }));

    expect(setControlCenterCollapsed).toHaveBeenCalledWith(expect.any(Function));
    const updater = setControlCenterCollapsed.mock.calls[0]?.[0] as (previous: boolean) => boolean;
    expect(updater(true)).toBe(false);
  });

  it("keeps expand-collapse-all state isolated per filter view", () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded", {
        snapshot: {
          provider: "openspec",
          supportLevel: "full",
          specRoot: { source: "default", path: "openspec" },
          environment: {
            mode: "managed",
            status: "healthy",
            checks: [],
            blockers: [],
            hints: [],
          },
          changes: [
            {
              id: "2026-02-26-active-collapse",
              status: "ready",
              updatedAt: 3,
              artifacts: {
                proposalPath: "openspec/changes/2026-02-26-active-collapse/proposal.md",
                designPath: "openspec/changes/2026-02-26-active-collapse/design.md",
                tasksPath: "openspec/changes/2026-02-26-active-collapse/tasks.md",
                verificationPath: null,
                specPaths: [],
              },
              blockers: [],
              archiveBlockers: [],
            },
            {
              id: "legacy-active-collapse",
              status: "implementing",
              updatedAt: 2,
              artifacts: {
                proposalPath: "openspec/changes/legacy-active-collapse/proposal.md",
                designPath: "openspec/changes/legacy-active-collapse/design.md",
                tasksPath: "openspec/changes/legacy-active-collapse/tasks.md",
                verificationPath: null,
                specPaths: [],
              },
              blockers: [],
              archiveBlockers: [],
            },
            {
              id: "2026-02-26-archived-collapse",
              status: "archived",
              updatedAt: 1,
              artifacts: {
                proposalPath: "openspec/changes/archive/2026-02-26-archived-collapse/proposal.md",
                designPath: "openspec/changes/archive/2026-02-26-archived-collapse/design.md",
                tasksPath: "openspec/changes/archive/2026-02-26-archived-collapse/tasks.md",
                verificationPath: null,
                specPaths: [],
              },
              blockers: [],
              archiveBlockers: [],
            },
          ],
          blockers: [],
        },
      }) as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace"
        files={[]}
        directories={[]}
        onBackToChat={() => {}}
      />,
    );

    const allGroupToggle = getChangeGroupToggle(/2026-02-26/i);
    expect(allGroupToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("2026-02-26-active-collapse")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(allGroupToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("2026-02-26-active-collapse")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Archived" }));
    const archivedGroupToggle = getChangeGroupToggle(/2026-02-26/i);
    expect(archivedGroupToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("2026-02-26-archived-collapse")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    const allGroupToggleAfterSwitch = getChangeGroupToggle(/2026-02-26/i);
    expect(allGroupToggleAfterSwitch.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(allGroupToggleAfterSwitch.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("2026-02-26-active-collapse")).toBeTruthy();
  });

  it("renders reader outline and opens the current reader context in a detached window", async () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded") as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace One"
        files={["openspec/changes/change-1/proposal.md"]}
        directories={["openspec"]}
        onBackToChat={() => {}}
      />,
    );

    expect(screen.queryByText("Reader Outline")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Expand reader outline" }));
    expect(await screen.findByText("Reader Outline")).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Open in Window" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "spec-hub-workbench-ui" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open in Window" }));

    await waitFor(() => {
      expect(openOrFocusDetachedSpecHubMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          workspaceName: "Workspace One",
          files: ["openspec/changes/change-1/proposal.md"],
          directories: ["openspec"],
          changeId: "change-1",
          artifactType: "proposal",
        }),
      );
    });
  });

  it("supports collapsing and resizing the changes pane", async () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded") as ReturnType<typeof useSpecHub>,
    );

    const { container } = render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace One"
        files={["openspec/changes/change-1/proposal.md"]}
        directories={["openspec"]}
        onBackToChat={() => {}}
      />,
    );

    const surface = container.querySelector(".spec-hub-surface") as HTMLElement;
    const grid = container.querySelector(".spec-hub-grid") as HTMLElement;
    Object.defineProperty(grid, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        width: 1280,
        height: 720,
        top: 0,
        left: 0,
        right: 1280,
        bottom: 720,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Collapse changes pane" }));
    expect(surface.classList.contains("is-changes-collapsed")).toBe(true);

    const expandChangesButton = screen.getByRole("button", { name: "Expand changes pane" });
    expect(expandChangesButton.querySelector("svg")).not.toBeNull();

    fireEvent.click(expandChangesButton);
    expect(surface.classList.contains("is-changes-collapsed")).toBe(false);

    const resizer = screen.getByRole("separator", { name: "Resize changes pane" });
    fireEvent.pointerDown(resizer, { button: 0, clientX: 248 });
    fireEvent.pointerMove(window, { clientX: 328 });
    fireEvent.pointerUp(window);

    expect(surface.style.getPropertyValue("--spec-hub-changes-width")).toBe("328px");
  });

  it("keeps detached reader navigation collapsible without rendering the detach action again", async () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded") as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace One"
        files={["openspec/changes/change-1/proposal.md"]}
        directories={["openspec"]}
        onBackToChat={() => {}}
        surfaceMode="detached"
        detachedReaderSession={{
          workspaceId: "ws-1",
          workspaceName: "Workspace One",
          files: ["openspec/changes/change-1/proposal.md"],
          directories: ["openspec"],
          changeId: "change-1",
          artifactType: "proposal",
          specSourcePath: null,
          updatedAt: 1,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Expand reader outline" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Open in Window" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand reader outline" }));
    expect(await screen.findByText("Reader Outline")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Collapse reader outline" }));
    await waitFor(() => {
      expect(screen.queryByText("Reader Outline")).toBeNull();
    });
  });

  it("jumps from proposal capability to the matching spec source", async () => {
    mockUseSpecHub.mockReturnValue(
      createUseSpecHubState("No strict verify evidence recorded") as ReturnType<typeof useSpecHub>,
    );

    render(
      <SpecHub
        workspaceId="ws-1"
        workspaceName="Workspace One"
        files={["openspec/changes/change-1/proposal.md"]}
        directories={["openspec"]}
        onBackToChat={() => {}}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "spec-hub-workbench-ui" }));

    await waitFor(() => {
      expect(
        screen.getByText("openspec/changes/change-1/specs/spec-hub-workbench-ui/spec.md"),
      ).not.toBeNull();
    });
  });
});
