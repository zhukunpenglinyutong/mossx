// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useWorktreePrompt } from "./useWorktreePrompt";

const listGitBranchesMock = vi.fn();

vi.mock("../../../services/tauri", () => ({
  listGitBranches: (...args: unknown[]) => listGitBranchesMock(...args),
}));

function interpolate(template: string, vars?: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars?.[key] ?? ""));
}

const mockTranslate = (key: string, vars?: Record<string, unknown>) => {
  const dict: Record<string, string> = {
    "workspace.baseBranchPlaceholderError":
      "Please choose a base branch from the dropdown first.",
    "workspace.baseBranchInvalid": "Base branch is invalid or unavailable.",
    "workspace.nonGitRepositoryError":
      "This project is not a Git repository yet. Initialize Git first (`git init`) before creating a worktree.",
    "workspace.worktreeCreateResultTitle": "Worktree Creation Result",
    "workspace.worktreeCreateSuccess": "Worktree created locally: {{branch}}",
    "workspace.worktreePublishStatusCreatedTracking":
      "Remote publish succeeded. Tracking set to {{tracking}}.",
    "workspace.worktreePublishStatusCreatedNoTracking":
      "Remote publish succeeded, but no tracking branch was returned.",
    "workspace.worktreePublishStatusSkipped":
      "Remote publish was skipped by your current setting.",
    "workspace.worktreePublishStatusSkippedTracking":
      "Remote publish skipped. Existing tracking branch: {{tracking}}.",
    "workspace.worktreePublishFailedRecoverable":
      "Local worktree was created, but remote publish failed: {{reason}}. You can retry with the command below.",
    "workspace.worktreePublishFailedReasonUnknown": "Unknown reason",
    "workspace.worktreeCreateErrorBaseRef":
      "Cannot create worktree: base branch is unavailable or no longer resolvable. Please re-select a valid base branch.",
    "workspace.worktreeCreateErrorPathConflict":
      "Cannot create worktree: target path conflict detected ({{path}}). Change branch name or target folder, then retry.",
    "workspace.worktreeCreateErrorBranchInvalid":
      "Cannot create worktree: branch name is invalid by Git rules ({{branch}}). Please rename and retry.",
    "workspace.worktreeCreateErrorBranchRequired":
      "Cannot create worktree: branch name is required.",
  };
  const template = dict[key];
  return template ? interpolate(template, vars) : key;
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: mockTranslate,
  }),
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "main-workspace",
  path: "/tmp/repo",
  connected: true,
  kind: "main",
  settings: {
    sidebarCollapsed: false,
    worktreeSetupScript: null,
  },
};

describe("useWorktreePrompt", () => {
  beforeEach(() => {
    listGitBranchesMock.mockReset();
  });

  it("loads base refs and passes baseRef/publishToOrigin when creating", async () => {
    listGitBranchesMock.mockResolvedValueOnce({
      currentBranch: "feature/current",
      localBranches: [{ name: "feature/current", headSha: "aaaaaaaa" }],
      remoteBranches: [
        { name: "origin/main", remote: "origin", headSha: "bbbbbbbb" },
        { name: "upstream/main", remote: "upstream", headSha: "cccccccc" },
      ],
    });
    const addWorktreeAgent = vi.fn().mockResolvedValue({
      ...workspace,
      id: "wt-1",
      kind: "worktree",
      parentId: workspace.id,
      worktree: {
        branch: "feat/demo",
        baseRef: "upstream/main",
        baseCommit: "cccccccc",
        tracking: "origin/feat/demo",
      },
    });
    const updateWorkspaceSettings = vi.fn().mockResolvedValue(workspace);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        updateWorkspaceSettings,
        connectWorkspace,
        onSelectWorkspace,
      }),
    );

    act(() => {
      result.current.openPrompt(workspace);
    });

    await waitFor(() => {
      expect(result.current.worktreePrompt?.baseRefOptions.length).toBe(3);
    });
    expect(result.current.worktreePrompt?.baseRef).toBe("");

    act(() => {
      result.current.updateBaseRef("upstream/main");
    });

    const branch = result.current.worktreePrompt?.branch ?? "";
    await act(async () => {
      await result.current.confirmPrompt();
    });

    expect(addWorktreeAgent).toHaveBeenCalledWith(
      workspace,
      branch,
      expect.objectContaining({
        baseRef: "upstream/main",
        publishToOrigin: true,
      }),
    );
    expect(result.current.worktreeCreateResult?.kind).toBe("info");
    expect(result.current.worktreeCreateResult?.createdMessage).toBe(
      "Worktree created locally: feat/demo",
    );
    expect(result.current.worktreeCreateResult?.statusMessage).toBe(
      "Remote publish succeeded. Tracking set to origin/feat/demo.",
    );
  });

  it("blocks create when base ref is not selected", async () => {
    listGitBranchesMock.mockResolvedValueOnce({
      currentBranch: "main",
      localBranches: [{ name: "main", headSha: "11111111" }],
      remoteBranches: [],
    });
    const addWorktreeAgent = vi.fn();
    const updateWorkspaceSettings = vi.fn().mockResolvedValue(workspace);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        updateWorkspaceSettings,
        connectWorkspace,
        onSelectWorkspace,
      }),
    );

    act(() => {
      result.current.openPrompt(workspace);
    });

    await waitFor(() => {
      expect(result.current.worktreePrompt?.baseRef).toBe("");
    });

    await act(async () => {
      await result.current.confirmPrompt();
    });

    expect(addWorktreeAgent).not.toHaveBeenCalled();
    expect(result.current.worktreePrompt?.error).toBe(
      "Please choose a base branch from the dropdown first.",
    );
  });

  it("maps non-git repository error to friendly i18n message", async () => {
    listGitBranchesMock.mockRejectedValueOnce(
      new Error(
        "could not find repository at '/tmp/repo'; class=Repository (6); code=NotFound (-3)",
      ),
    );
    const addWorktreeAgent = vi.fn();
    const updateWorkspaceSettings = vi.fn().mockResolvedValue(workspace);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        updateWorkspaceSettings,
        connectWorkspace,
        onSelectWorkspace,
      }),
    );

    act(() => {
      result.current.openPrompt(workspace);
    });

    await waitFor(() => {
      expect(result.current.worktreePrompt?.isLoadingBaseRefs).toBe(false);
    });

    expect(result.current.worktreePrompt?.isNonGitRepository).toBe(true);
    expect(result.current.worktreePrompt?.error).toBe(
      "This project is not a Git repository yet. Initialize Git first (`git init`) before creating a worktree.",
    );
  });

  it("maps validation path conflict to dedicated error message", async () => {
    listGitBranchesMock.mockResolvedValueOnce({
      currentBranch: "main",
      localBranches: [{ name: "main", headSha: "11111111" }],
      remoteBranches: [],
    });
    const addWorktreeAgent = vi.fn().mockRejectedValue(
      new Error("VALIDATION_ERROR: Worktree path conflict: /tmp/repo/.worktrees/demo"),
    );
    const updateWorkspaceSettings = vi.fn().mockResolvedValue(workspace);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        updateWorkspaceSettings,
        connectWorkspace,
        onSelectWorkspace,
      }),
    );

    act(() => {
      result.current.openPrompt(workspace);
    });

    await waitFor(() => {
      expect(result.current.worktreePrompt?.baseRefOptions.length).toBeGreaterThan(0);
    });

    act(() => {
      result.current.updateBaseRef("main");
    });

    await act(async () => {
      await result.current.confirmPrompt();
    });

    expect(result.current.worktreePrompt?.error).toBe(
      "Cannot create worktree: target path conflict detected (/tmp/repo/.worktrees/demo). Change branch name or target folder, then retry.",
    );
    expect(result.current.worktreePrompt?.errorRetryCommand).toBeNull();
  });

  it("exposes retry command when local create succeeds but publish fails", async () => {
    listGitBranchesMock.mockResolvedValueOnce({
      currentBranch: "main",
      localBranches: [{ name: "main", headSha: "11111111" }],
      remoteBranches: [],
    });
    const addWorktreeAgent = vi.fn().mockResolvedValue({
      ...workspace,
      id: "wt-push-failed",
      kind: "worktree",
      parentId: workspace.id,
      worktree: {
        branch: "feat/demo",
        baseRef: "main",
        baseCommit: "11111111",
        tracking: null,
        publishError: "authentication failed",
        publishRetryCommand: "git -C /tmp/repo push -u origin feat/demo",
      },
    });
    const updateWorkspaceSettings = vi.fn().mockResolvedValue(workspace);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        updateWorkspaceSettings,
        connectWorkspace,
        onSelectWorkspace,
      }),
    );

    act(() => {
      result.current.openPrompt(workspace);
    });

    await waitFor(() => {
      expect(result.current.worktreePrompt?.baseRefOptions.length).toBeGreaterThan(0);
    });

    act(() => {
      result.current.updateBaseRef("main");
    });

    await act(async () => {
      await result.current.confirmPrompt();
    });

    expect(onSelectWorkspace).toHaveBeenCalledWith("wt-push-failed");
    expect(result.current.worktreeCreateResult?.kind).toBe("warning");
    expect(result.current.worktreeCreateResult?.errorMessage).toContain(
      "Local worktree was created, but remote publish failed",
    );
    expect(result.current.worktreeCreateResult?.retryCommand).toBe(
      "git -C /tmp/repo push -u origin feat/demo",
    );
    expect(result.current.worktreePrompt).toBeNull();
  });

  it("parses retry command when legacy backend still throws push-failed error", async () => {
    listGitBranchesMock.mockResolvedValueOnce({
      currentBranch: "main",
      localBranches: [{ name: "main", headSha: "11111111" }],
      remoteBranches: [],
    });
    const addWorktreeAgent = vi.fn().mockRejectedValue(
      new Error(
        "Worktree created locally, but push failed: authentication failed\nRetry with: git -C /tmp/repo push -u origin feat/demo",
      ),
    );
    const updateWorkspaceSettings = vi.fn().mockResolvedValue(workspace);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        updateWorkspaceSettings,
        connectWorkspace,
        onSelectWorkspace,
      }),
    );

    act(() => {
      result.current.openPrompt(workspace);
    });

    await waitFor(() => {
      expect(result.current.worktreePrompt?.baseRefOptions.length).toBeGreaterThan(0);
    });

    act(() => {
      result.current.updateBaseRef("main");
    });

    await act(async () => {
      await result.current.confirmPrompt();
    });

    expect(result.current.worktreePrompt?.error).toBe(
      "Local worktree was created, but remote publish failed: authentication failed. You can retry with the command below.",
    );
    expect(result.current.worktreePrompt?.errorRetryCommand).toBe(
      "git -C /tmp/repo push -u origin feat/demo",
    );
    expect(result.current.worktreeCreateResult).toBeNull();
  });
});
