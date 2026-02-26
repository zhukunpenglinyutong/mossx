// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSpecHub } from "./useSpecHub";
import type {
  SpecArtifactEntry,
  SpecHubAction,
  SpecTimelineEvent,
  SpecWorkspaceSnapshot,
} from "../../../lib/spec-core/types";
import {
  buildSpecActions,
  buildSpecGateState,
  buildSpecWorkspaceSnapshot,
  evaluateOpenSpecChangePreflight,
  loadSpecArtifacts,
  runSpecAction,
  updateSpecTaskChecklist,
} from "../../../lib/spec-core/runtime";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";
import { engineSendMessage, engineSendMessageSync, getWorkspaceFiles } from "../../../services/tauri";

vi.mock("../../../lib/spec-core/runtime", () => ({
  buildSpecActions: vi.fn(),
  buildSpecGateState: vi.fn(),
  buildSpecWorkspaceSnapshot: vi.fn(),
  evaluateOpenSpecChangePreflight: vi.fn(),
  initializeOpenSpecWorkspace: vi.fn(),
  loadSpecProjectInfo: vi.fn(),
  loadSpecArtifacts: vi.fn(),
  runSpecAction: vi.fn(),
  saveSpecProjectInfo: vi.fn(),
  updateSpecTaskChecklist: vi.fn(),
}));

vi.mock("../../../services/clientStorage", () => ({
  getClientStoreSync: vi.fn(),
  writeClientStoreValue: vi.fn(),
}));

vi.mock("../../../services/tauri", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../services/tauri")>();
  return {
    ...original,
    engineSendMessage: vi.fn(),
    engineSendMessageSync: vi.fn(),
    getWorkspaceFiles: vi.fn(),
    sendUserMessage: vi.fn(),
    startThread: vi.fn(async () => ({})),
  };
});

const mockBuildSpecActions = vi.mocked(buildSpecActions);
const mockBuildSpecGateState = vi.mocked(buildSpecGateState);
const mockBuildSpecWorkspaceSnapshot = vi.mocked(buildSpecWorkspaceSnapshot);
const mockEvaluateOpenSpecChangePreflight = vi.mocked(evaluateOpenSpecChangePreflight);
const mockLoadSpecArtifacts = vi.mocked(loadSpecArtifacts);
const mockRunSpecAction = vi.mocked(runSpecAction);
const mockUpdateSpecTaskChecklist = vi.mocked(updateSpecTaskChecklist);
const mockGetClientStoreSync = vi.mocked(getClientStoreSync);
const mockWriteClientStoreValue = vi.mocked(writeClientStoreValue);
const mockEngineSendMessage = vi.mocked(engineSendMessage);
const mockEngineSendMessageSync = vi.mocked(engineSendMessageSync);
const mockGetWorkspaceFiles = vi.mocked(getWorkspaceFiles);

const snapshot: SpecWorkspaceSnapshot = {
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
        specPaths: ["openspec/changes/change-1/specs/spec-hub/spec.md"],
      },
      blockers: [],
    },
  ],
  blockers: [],
};

const artifacts: Record<SpecArtifactEntry["type"], SpecArtifactEntry> = {
  proposal: {
    type: "proposal",
    path: "openspec/changes/change-1/proposal.md",
    exists: true,
    content: "# proposal",
    truncated: false,
  },
  design: {
    type: "design",
    path: "openspec/changes/change-1/design.md",
    exists: true,
    content: "# design",
    truncated: false,
  },
  tasks: {
    type: "tasks",
    path: "openspec/changes/change-1/tasks.md",
    exists: true,
    content: "## Tasks\n- [x] done\n",
    truncated: false,
    taskChecklist: [],
    taskProgress: {
      total: 1,
      checked: 1,
      requiredTotal: 1,
      requiredChecked: 1,
    },
  },
  verification: {
    type: "verification",
    path: null,
    exists: false,
    content: "",
    truncated: false,
  },
  specs: {
    type: "specs",
    path: "openspec/changes/change-1/specs/spec-hub/spec.md",
    exists: true,
    content: "# spec",
    truncated: false,
    sources: [],
  },
};

describe("useSpecHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockBuildSpecWorkspaceSnapshot.mockResolvedValue(snapshot);
    mockEvaluateOpenSpecChangePreflight.mockResolvedValue({
      blockers: [],
      hints: [],
      affectedSpecs: [],
    });
    mockLoadSpecArtifacts.mockResolvedValue(artifacts);
    mockBuildSpecGateState.mockReturnValue({
      status: "warn",
      checks: [],
    });

    mockGetClientStoreSync.mockImplementation((_store, key) => {
      if (key === "specHub.mode.ws-1") {
        return "managed";
      }
      if (key === "specHub.specRoot.ws-1") {
        return null;
      }
      return undefined;
    });
    mockGetWorkspaceFiles.mockResolvedValue({
      files: [],
      directories: [],
    });
  });

  it("uses persisted verify evidence when timeline has no verify event", async () => {
    mockGetClientStoreSync.mockImplementation((_store, key) => {
      if (key === "specHub.mode.ws-1") {
        return "managed";
      }
      if (key === "specHub.specRoot.ws-1") {
        return null;
      }
      if (key === "specHub.verify.ws-1:openspec.change-1") {
        return { success: true };
      }
      return undefined;
    });

    mockBuildSpecActions.mockImplementation((input): SpecHubAction[] => [
      {
        key: "archive",
        label: "Archive",
        commandPreview: "openspec archive change-1 --yes",
        available: Boolean(input.verifyState?.success),
        blockers: [],
        kind: "native",
      },
    ]);

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await waitFor(() => {
      const archive = result.current.actions.find((entry) => entry.key === "archive");
      expect(archive?.available).toBe(true);
    });
  });

  it("persists verify result when verify action succeeds", async () => {
    mockBuildSpecActions.mockImplementation((input): SpecHubAction[] => [
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
        available: Boolean(input.verifyState?.success),
        blockers: [],
        kind: "native",
      },
    ]);

    const verifyEvent: SpecTimelineEvent = {
      id: "evt-1",
      at: Date.now(),
      kind: "validate",
      action: "verify",
      command: "openspec validate change-1 --strict",
      success: true,
      output: "ok",
      validationIssues: [],
      gitRefs: [],
    };
    mockRunSpecAction.mockResolvedValue(verifyEvent);

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("verify");
    });

    expect(mockWriteClientStoreValue).toHaveBeenCalledWith(
      "app",
      "specHub.verify.ws-1:openspec.change-1",
      expect.objectContaining({
        success: true,
      }),
    );
  });

  it("persists verify failure and keeps verify evidence as failed", async () => {
    mockBuildSpecActions.mockImplementation((input): SpecHubAction[] => [
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
        available: Boolean(input.verifyState?.success),
        blockers: [],
        kind: "native",
      },
    ]);

    const verifyFailedEvent: SpecTimelineEvent = {
      id: "evt-verify-failed",
      at: Date.now(),
      kind: "validate",
      action: "verify",
      command: "openspec validate change-1 --strict",
      success: false,
      output: "strict validation failed",
      validationIssues: [],
      gitRefs: [],
    };
    mockRunSpecAction.mockResolvedValue(verifyFailedEvent);

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("verify");
    });

    expect(mockWriteClientStoreValue).toHaveBeenCalledWith(
      "app",
      "specHub.verify.ws-1:openspec.change-1",
      expect.objectContaining({
        success: false,
      }),
    );

    await waitFor(() => {
      const archive = result.current.actions.find((entry) => entry.key === "archive");
      expect(archive?.available).toBe(false);
    });
  });

  it("blocks verify when preflight detects delta blockers", async () => {
    mockBuildSpecActions.mockReturnValue([
      {
        key: "verify",
        label: "Verify",
        commandPreview: "openspec validate change-1 --strict",
        available: true,
        blockers: [],
        kind: "native",
      },
    ]);
    mockGetWorkspaceFiles.mockResolvedValue({
      files: ["openspec/changes/change-1/specs/spec-hub/spec.md"],
      directories: ["openspec/changes/change-1/specs/spec-hub"],
    });
    mockEvaluateOpenSpecChangePreflight.mockResolvedValue({
      blockers: [
        "Archive preflight failed: delta MODIFIED requirement missing in openspec/specs/spec-hub/spec.md -> Missing",
      ],
      hints: ["If target requirement does not exist, change operation to ADDED."],
      affectedSpecs: ["openspec/specs/spec-hub/spec.md"],
    });

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("verify");
    });

    expect(mockRunSpecAction).not.toHaveBeenCalled();
    expect(result.current.actionError).toContain("Archive preflight failed");
  });

  it("stops verify state transition when verify action throws", async () => {
    mockBuildSpecActions.mockReturnValue([
      {
        key: "verify",
        label: "Verify",
        commandPreview: "openspec validate change-1 --strict",
        available: true,
        blockers: [],
        kind: "native",
      },
    ]);
    mockRunSpecAction.mockRejectedValue(new Error("verify execution crashed"));

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("verify");
    });

    expect(mockWriteClientStoreValue).not.toHaveBeenCalledWith(
      "app",
      "specHub.verify.ws-1:openspec.change-1",
      expect.anything(),
    );
    expect(result.current.actionError).toContain("verify execution crashed");
    expect(result.current.timeline).toEqual([]);
  });

  it("keeps verify skipped semantics when verify action is unavailable", async () => {
    mockBuildSpecActions.mockReturnValue([
      {
        key: "verify",
        label: "Verify",
        commandPreview: "openspec validate change-1 --strict",
        available: false,
        blockers: ["verification evidence missing"],
        kind: "native",
      },
    ]);

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("verify");
    });

    expect(mockRunSpecAction).not.toHaveBeenCalled();
    expect(result.current.timeline).toEqual([]);
    expect(mockWriteClientStoreValue).not.toHaveBeenCalledWith(
      "app",
      "specHub.verify.ws-1:openspec.change-1",
      expect.anything(),
    );
  });

  it("runs apply in execute mode, routes by selected executor, and auto-writebacks tasks", async () => {
    mockBuildSpecActions.mockReturnValue([
      {
        key: "apply",
        label: "Apply",
        commandPreview: "openspec instructions tasks --change change-1",
        available: true,
        blockers: [],
        kind: "native",
      },
    ]);

    const tasksWithChecklist: Record<SpecArtifactEntry["type"], SpecArtifactEntry> = {
      ...artifacts,
      tasks: {
        ...artifacts.tasks,
        content: "## Tasks\n- [ ] 4.1 Implement A\n- [ ] 4.2 Implement B\n",
        taskChecklist: [
          { index: 0, lineNumber: 2, indent: 0, checked: false, text: "4.1 Implement A", priority: "p1" },
          { index: 1, lineNumber: 3, indent: 0, checked: false, text: "4.2 Implement B", priority: "p1" },
        ],
        taskProgress: {
          total: 2,
          checked: 0,
          requiredTotal: 2,
          requiredChecked: 0,
        },
      },
    };
    mockLoadSpecArtifacts.mockResolvedValue(tasksWithChecklist);

    const applyEvent: SpecTimelineEvent = {
      id: "evt-apply",
      at: Date.now(),
      kind: "action",
      action: "apply",
      command: "openspec instructions tasks --change change-1",
      success: true,
      output: "instruction output",
      validationIssues: [],
      gitRefs: [],
    };
    mockRunSpecAction.mockResolvedValue(applyEvent);
    mockEngineSendMessageSync.mockResolvedValue({
      engine: "codex",
      text: JSON.stringify({
        summary: "implemented",
        changed_files: ["src/a.ts"],
        completed_task_indices: [0],
        no_changes: false,
      }),
    });
    mockUpdateSpecTaskChecklist.mockResolvedValue({
      path: "openspec/changes/change-1/tasks.md",
      content: "## Tasks\n- [x] 4.1 Implement A\n- [ ] 4.2 Implement B\n",
      taskChecklist: [
        { index: 0, lineNumber: 2, indent: 0, checked: true, text: "4.1 Implement A", priority: "p1" },
        { index: 1, lineNumber: 3, indent: 0, checked: false, text: "4.2 Implement B", priority: "p1" },
      ],
      taskProgress: {
        total: 2,
        checked: 1,
        requiredTotal: 2,
        requiredChecked: 1,
      },
    });

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("apply", {
        applyMode: "execute",
        applyExecutor: "codex",
      });
    });

    expect(mockEngineSendMessageSync).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        engine: "codex",
        accessMode: "full-access",
      }),
    );
    const applyPrompt = mockEngineSendMessageSync.mock.calls[0]?.[1]?.text ?? "";
    expect(applyPrompt).toContain("completed_task_indices must be a subset of: [0, 1]");
    expect(applyPrompt).toContain("completed_task_refs must be a subset of: [4.1, 4.2]");
    expect(mockUpdateSpecTaskChecklist).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        taskIndex: 0,
        checked: true,
      }),
    );
    expect(result.current.applyExecution.status).toBe("success");
    expect(result.current.applyExecution.changedFiles).toEqual(["src/a.ts"]);
    expect(result.current.applyExecution.completedTaskIndices).toEqual([0]);
  });

  it("maps line-number task indices from execution output to checklist indices", async () => {
    mockBuildSpecActions.mockReturnValue([
      {
        key: "apply",
        label: "Apply",
        commandPreview: "openspec instructions tasks --change change-1",
        available: true,
        blockers: [],
        kind: "native",
      },
    ]);
    mockLoadSpecArtifacts.mockResolvedValue({
      ...artifacts,
      tasks: {
        ...artifacts.tasks,
        content: "## Tasks\n- [ ] 1.1 Implement A\n- [ ] 1.2 Implement B\n",
        taskChecklist: [
          { index: 0, lineNumber: 73, indent: 0, checked: false, text: "1.1 Implement A", priority: "p1" },
          { index: 1, lineNumber: 74, indent: 0, checked: false, text: "1.2 Implement B", priority: "p1" },
        ],
        taskProgress: {
          total: 2,
          checked: 0,
          requiredTotal: 2,
          requiredChecked: 0,
        },
      },
    });
    mockRunSpecAction.mockResolvedValue({
      id: "evt-apply",
      at: Date.now(),
      kind: "action",
      action: "apply",
      command: "openspec instructions tasks --change change-1",
      success: true,
      output: "instruction output",
      validationIssues: [],
      gitRefs: [],
    });
    mockEngineSendMessageSync.mockResolvedValue({
      engine: "codex",
      text: JSON.stringify({
        summary: "implemented",
        changed_files: ["src/a.ts"],
        completed_task_indices: [73],
        no_changes: false,
      }),
    });
    mockUpdateSpecTaskChecklist.mockResolvedValue({
      path: "openspec/changes/change-1/tasks.md",
      content: "## Tasks\n- [x] 1.1 Implement A\n- [ ] 1.2 Implement B\n",
      taskChecklist: [
        { index: 0, lineNumber: 73, indent: 0, checked: true, text: "1.1 Implement A", priority: "p1" },
        { index: 1, lineNumber: 74, indent: 0, checked: false, text: "1.2 Implement B", priority: "p1" },
      ],
      taskProgress: {
        total: 2,
        checked: 1,
        requiredTotal: 2,
        requiredChecked: 1,
      },
    });

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("apply", {
        applyMode: "execute",
        applyExecutor: "codex",
      });
    });

    expect(result.current.applyExecution.status).toBe("success");
    expect(result.current.applyExecution.completedTaskIndices).toEqual([0]);
    expect(mockUpdateSpecTaskChecklist).toHaveBeenCalledWith(
      expect.objectContaining({
        taskIndex: 0,
        checked: true,
      }),
    );
  });

  it("injects continue brief into apply prompt when applyUseContinueBrief is enabled", async () => {
    mockBuildSpecActions.mockReturnValue([
      {
        key: "apply",
        label: "Apply",
        commandPreview: "openspec instructions tasks --change change-1",
        available: true,
        blockers: [],
        kind: "native",
      },
    ]);
    mockRunSpecAction.mockResolvedValue({
      id: "evt-apply-brief",
      at: Date.now(),
      kind: "action",
      action: "apply",
      command: "openspec instructions tasks --change change-1",
      success: true,
      output: "instruction output",
      validationIssues: [],
      gitRefs: [],
    });
    mockEngineSendMessageSync.mockResolvedValue({
      engine: "codex",
      text: JSON.stringify({
        summary: "done",
        changed_files: ["src/a.ts"],
        completed_task_indices: [],
        no_changes: false,
      }),
    });

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("apply", {
        applyMode: "execute",
        applyExecutor: "codex",
        applyContinueBrief: {
          summary: "continue says implement adapters first",
          recommendedNextAction: "apply",
          suggestedScope: ["src/features/spec"],
          risks: ["missing regression coverage"],
          verificationPlan: ["run spec runtime tests"],
          executionSequence: ["update runtime", "run tests"],
          generatedAt: Date.now(),
        },
        applyUseContinueBrief: true,
      });
    });

    const applyPrompt = mockEngineSendMessageSync.mock.calls[0]?.[1]?.text ?? "";
    expect(applyPrompt).toContain("Latest Continue AI brief (read-only planning context):");
    expect(applyPrompt).toContain("continue says implement adapters first");
    expect(applyPrompt).toContain("recommended_next_action: apply");
    expect(result.current.applyExecution.logs.join("\n")).toContain(
      "Continue brief attached to apply execution prompt.",
    );
  });

  it("skips writeback and records a log when execution returns unmatched task ids", async () => {
    mockBuildSpecActions.mockReturnValue([
      {
        key: "apply",
        label: "Apply",
        commandPreview: "openspec instructions tasks --change change-1",
        available: true,
        blockers: [],
        kind: "native",
      },
    ]);
    mockLoadSpecArtifacts.mockResolvedValue({
      ...artifacts,
      tasks: {
        ...artifacts.tasks,
        content: "## Tasks\n- [ ] 1.1 Implement A\n- [ ] 1.2 Implement B\n",
        taskChecklist: [
          { index: 0, lineNumber: 2, indent: 0, checked: false, text: "1.1 Implement A", priority: "p1" },
          { index: 1, lineNumber: 3, indent: 0, checked: false, text: "1.2 Implement B", priority: "p1" },
        ],
        taskProgress: {
          total: 2,
          checked: 0,
          requiredTotal: 2,
          requiredChecked: 0,
        },
      },
    });
    mockRunSpecAction.mockResolvedValue({
      id: "evt-apply",
      at: Date.now(),
      kind: "action",
      action: "apply",
      command: "openspec instructions tasks --change change-1",
      success: true,
      output: "instruction output",
      validationIssues: [],
      gitRefs: [],
    });
    mockEngineSendMessageSync.mockResolvedValue({
      engine: "codex",
      text: JSON.stringify({
        summary: "implemented",
        changed_files: ["src/a.ts"],
        completed_task_indices: [73],
        completed_task_refs: ["10.1"],
        no_changes: false,
      }),
    });

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("apply", {
        applyMode: "execute",
        applyExecutor: "codex",
      });
    });

    expect(result.current.applyExecution.status).toBe("success");
    expect(result.current.applyExecution.completedTaskIndices).toEqual([]);
    expect(result.current.applyExecution.logs.join("\n")).toContain(
      "Skipped unmatched task ids from execution output",
    );
    expect(mockUpdateSpecTaskChecklist).not.toHaveBeenCalled();
  });

  it("marks apply as success with no changes when execution returns no_changes", async () => {
    mockBuildSpecActions.mockReturnValue([
      {
        key: "apply",
        label: "Apply",
        commandPreview: "openspec instructions tasks --change change-1",
        available: true,
        blockers: [],
        kind: "native",
      },
    ]);
    mockRunSpecAction.mockResolvedValue({
      id: "evt-apply",
      at: Date.now(),
      kind: "action",
      action: "apply",
      command: "openspec instructions tasks --change change-1",
      success: true,
      output: "instruction output",
      validationIssues: [],
      gitRefs: [],
    });
    mockEngineSendMessage.mockResolvedValue({});
    mockEngineSendMessageSync.mockResolvedValue({
      engine: "claude",
      text: JSON.stringify({
        summary: "nothing to change",
        changed_files: [],
        no_changes: true,
        tests: ["vitest run"],
        checks: ["typecheck"],
      }),
    });

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("apply", {
        applyMode: "execute",
        applyExecutor: "claude",
      });
    });

    expect(result.current.applyExecution.status).toBe("success");
    expect(result.current.applyExecution.noChanges).toBe(true);
    expect(result.current.applyExecution.changedFiles).toEqual([]);
    expect(result.current.applyExecution.tests).toEqual(["vitest run"]);
    expect(result.current.applyExecution.checks).toEqual(["typecheck"]);
  });

  it("reads changed files from nested apply result payload", async () => {
    mockBuildSpecActions.mockReturnValue([
      {
        key: "apply",
        label: "Apply",
        commandPreview: "openspec instructions tasks --change change-1",
        available: true,
        blockers: [],
        kind: "native",
      },
    ]);
    mockRunSpecAction.mockResolvedValue({
      id: "evt-apply",
      at: Date.now(),
      kind: "action",
      action: "apply",
      command: "openspec instructions tasks --change change-1",
      success: true,
      output: "instruction output",
      validationIssues: [],
      gitRefs: [],
    });
    mockEngineSendMessageSync.mockResolvedValue({
      engine: "codex",
      text: JSON.stringify({
        result: {
          summary: "nested output",
          changed_files: ["src/nested-a.ts", "src/nested-b.ts"],
          no_changes: false,
        },
      }),
    });

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("apply", {
        applyMode: "execute",
        applyExecutor: "codex",
      });
    });

    expect(result.current.applyExecution.status).toBe("success");
    expect(result.current.applyExecution.changedFiles).toEqual([
      "src/nested-a.ts",
      "src/nested-b.ts",
    ]);
  });

  it.each(["claude", "opencode"] as const)(
    "routes apply execute to %s trigger before sync fallback",
    async (executor) => {
      mockBuildSpecActions.mockReturnValue([
        {
          key: "apply",
          label: "Apply",
          commandPreview: "openspec instructions tasks --change change-1",
          available: true,
          blockers: [],
          kind: "native",
        },
      ]);
      mockRunSpecAction.mockResolvedValue({
        id: `evt-apply-${executor}`,
        at: Date.now(),
        kind: "action",
        action: "apply",
        command: "openspec instructions tasks --change change-1",
        success: true,
        output: "instruction output",
        validationIssues: [],
        gitRefs: [],
      });
      mockEngineSendMessage.mockResolvedValue({});
      mockEngineSendMessageSync.mockResolvedValue({
        engine: executor,
        text: JSON.stringify({
          summary: "no changes",
          no_changes: true,
        }),
      });

      const { result } = renderHook(() =>
        useSpecHub({
          workspaceId: "ws-1",
          files: [],
          directories: [],
        }),
      );

      await waitFor(() => {
        expect(result.current.selectedChange?.id).toBe("change-1");
      });

      await act(async () => {
        await result.current.executeAction("apply", {
          applyMode: "execute",
          applyExecutor: executor,
        });
      });

      expect(mockEngineSendMessage).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          engine: executor,
          accessMode: "full-access",
        }),
      );
      expect(result.current.applyExecution.status).toBe("success");
      expect(result.current.applyExecution.noChanges).toBe(true);
    },
  );

  it("fails apply when instructions generation fails", async () => {
    mockBuildSpecActions.mockReturnValue([
      {
        key: "apply",
        label: "Apply",
        commandPreview: "openspec instructions tasks --change change-1",
        available: true,
        blockers: [],
        kind: "native",
      },
    ]);
    mockRunSpecAction.mockResolvedValue({
      id: "evt-apply",
      at: Date.now(),
      kind: "action",
      action: "apply",
      command: "openspec instructions tasks --change change-1",
      success: false,
      output: "instructions failed",
      validationIssues: [],
      gitRefs: [],
    });

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("apply", {
        applyMode: "execute",
        applyExecutor: "codex",
      });
    });

    expect(result.current.applyExecution.status).toBe("failed");
    expect(result.current.applyExecution.error).toContain("instructions failed");
  });

  it("rolls back optimistic task writeback state when auto-writeback fails", async () => {
    mockBuildSpecActions.mockReturnValue([
      {
        key: "apply",
        label: "Apply",
        commandPreview: "openspec instructions tasks --change change-1",
        available: true,
        blockers: [],
        kind: "native",
      },
    ]);

    const tasksWithChecklist: Record<SpecArtifactEntry["type"], SpecArtifactEntry> = {
      ...artifacts,
      tasks: {
        ...artifacts.tasks,
        content: "## Tasks\n- [ ] 4.1 Implement A\n- [ ] 4.2 Implement B\n",
        taskChecklist: [
          { index: 0, lineNumber: 2, indent: 0, checked: false, text: "4.1 Implement A", priority: "p1" },
          { index: 1, lineNumber: 3, indent: 0, checked: false, text: "4.2 Implement B", priority: "p1" },
        ],
        taskProgress: {
          total: 2,
          checked: 0,
          requiredTotal: 2,
          requiredChecked: 0,
        },
      },
    };
    mockLoadSpecArtifacts.mockResolvedValue(tasksWithChecklist);
    mockRunSpecAction.mockResolvedValue({
      id: "evt-apply",
      at: Date.now(),
      kind: "action",
      action: "apply",
      command: "openspec instructions tasks --change change-1",
      success: true,
      output: "instruction output",
      validationIssues: [],
      gitRefs: [],
    });
    mockEngineSendMessageSync.mockResolvedValue({
      engine: "codex",
      text: JSON.stringify({
        summary: "implemented",
        changed_files: ["src/a.ts"],
        completed_task_indices: [0, 1],
        no_changes: false,
      }),
    });
    mockUpdateSpecTaskChecklist.mockImplementation(async ({ taskIndex, checked }) => {
      if (taskIndex === 0 && checked) {
        return {
          path: "openspec/changes/change-1/tasks.md",
          content: "## Tasks\n- [x] 4.1 Implement A\n- [ ] 4.2 Implement B\n",
          taskChecklist: [
            { index: 0, lineNumber: 2, indent: 0, checked: true, text: "4.1 Implement A", priority: "p1" },
            { index: 1, lineNumber: 3, indent: 0, checked: false, text: "4.2 Implement B", priority: "p1" },
          ],
          taskProgress: {
            total: 2,
            checked: 1,
            requiredTotal: 2,
            requiredChecked: 1,
          },
        };
      }
      if (taskIndex === 1 && checked) {
        throw new Error("disk full");
      }
      return {
        path: "openspec/changes/change-1/tasks.md",
        content: "## Tasks\n- [ ] 4.1 Implement A\n- [ ] 4.2 Implement B\n",
        taskChecklist: [
          { index: 0, lineNumber: 2, indent: 0, checked: false, text: "4.1 Implement A", priority: "p1" },
          { index: 1, lineNumber: 3, indent: 0, checked: false, text: "4.2 Implement B", priority: "p1" },
        ],
        taskProgress: {
          total: 2,
          checked: 0,
          requiredTotal: 2,
          requiredChecked: 0,
        },
      };
    });

    const { result } = renderHook(() =>
      useSpecHub({
        workspaceId: "ws-1",
        files: [],
        directories: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("apply", {
        applyMode: "execute",
        applyExecutor: "codex",
      });
    });

    expect(result.current.applyExecution.status).toBe("failed");
    expect(result.current.applyExecution.error).toContain("Task write-back failed");
    expect(mockUpdateSpecTaskChecklist).toHaveBeenCalledWith(
      expect.objectContaining({
        taskIndex: 0,
        checked: false,
      }),
    );
  });

  it("isolates timeline and apply run state by provider scope", async () => {
    const speckitSnapshot: SpecWorkspaceSnapshot = {
      provider: "speckit",
      supportLevel: "minimal",
      environment: snapshot.environment,
      changes: [
        {
          id: "spec-kit-workspace",
          status: "blocked",
          updatedAt: 1,
          artifacts: {
            proposalPath: "specify.md",
            designPath: null,
            tasksPath: null,
            verificationPath: null,
            specPaths: [],
          },
          blockers: ["minimal mode"],
        },
      ],
      blockers: [],
    };

    mockBuildSpecWorkspaceSnapshot.mockImplementation(async ({ directories }) => {
      if (directories.includes(".specify")) {
        return speckitSnapshot;
      }
      return snapshot;
    });
    mockBuildSpecActions.mockImplementation((input): SpecHubAction[] => [
      {
        key: "apply",
        label: "Apply",
        commandPreview: "openspec instructions tasks --change change-1",
        available: input.provider === "openspec",
        blockers: [],
        kind: "native",
      },
    ]);
    mockRunSpecAction.mockResolvedValue({
      id: "evt-apply-scope",
      at: Date.now(),
      kind: "action",
      action: "apply",
      command: "openspec instructions tasks --change change-1",
      success: true,
      output: "instruction output",
      validationIssues: [],
      gitRefs: [],
    });

    const { result, rerender } = renderHook(
      ({ files, directories }: { files: string[]; directories: string[] }) =>
        useSpecHub({
          workspaceId: "ws-1",
          files,
          directories,
        }),
      {
        initialProps: {
          files: ["openspec/changes/change-1/tasks.md"],
          directories: ["openspec", "openspec/changes", "openspec/changes/change-1"],
        },
      },
    );

    await waitFor(() => {
      expect(result.current.snapshot.provider).toBe("openspec");
      expect(result.current.selectedChange?.id).toBe("change-1");
    });

    await act(async () => {
      await result.current.executeAction("apply", {
        applyMode: "guidance",
        applyExecutor: "codex",
      });
    });

    expect(result.current.timeline.length).toBeGreaterThan(0);
    expect(result.current.applyExecution.status).toBe("success");

    rerender({
      files: ["specify.md"],
      directories: [".specify"],
    });
    await act(async () => {
      await result.current.refresh({ force: true });
    });

    await waitFor(() => {
      expect(result.current.snapshot.provider).toBe("speckit");
    });
    expect(result.current.timeline).toEqual([]);
    expect(result.current.applyExecution.status).toBe("idle");

    rerender({
      files: ["openspec/changes/change-1/tasks.md"],
      directories: ["openspec", "openspec/changes", "openspec/changes/change-1"],
    });
    await act(async () => {
      await result.current.refresh({ force: true });
    });

    await waitFor(() => {
      expect(result.current.snapshot.provider).toBe("openspec");
    });
    expect(result.current.timeline.length).toBeGreaterThan(0);
    expect(result.current.applyExecution.status).toBe("success");
  });
});
