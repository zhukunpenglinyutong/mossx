/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useGitCommitController } from "./useGitCommitController";

const mockCommitGit = vi.fn<(workspaceId: string, message: string) => Promise<void>>();
const mockGenerateCommitMessageWithEngine = vi.fn<
  (workspaceId: string, language?: "zh" | "en", engine?: "codex" | "claude" | "gemini" | "opencode") => Promise<string>
>();
const mockPushGit = vi.fn<(workspaceId: string) => Promise<void>>();
const mockSyncGit = vi.fn<(workspaceId: string) => Promise<void>>();
const mockStageGitFile = vi.fn<(workspaceId: string, path: string) => Promise<void>>();
const mockUnstageGitFile = vi.fn<(workspaceId: string, path: string) => Promise<void>>();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../services/tauri", () => ({
  commitGit: (workspaceId: string, message: string) => mockCommitGit(workspaceId, message),
  generateCommitMessageWithEngine: (
    workspaceId: string,
    language?: "zh" | "en",
    engine?: "codex" | "claude" | "gemini" | "opencode",
  ) => mockGenerateCommitMessageWithEngine(workspaceId, language, engine),
  pushGit: (workspaceId: string) => mockPushGit(workspaceId),
  syncGit: (workspaceId: string) => mockSyncGit(workspaceId),
  stageGitFile: (workspaceId: string, path: string) => mockStageGitFile(workspaceId, path),
  unstageGitFile: (workspaceId: string, path: string) => mockUnstageGitFile(workspaceId, path),
}));

vi.mock("../../git/hooks/useGitStatus", () => ({
  useGitStatus: vi.fn(),
}));

type MockGitStatus = {
  stagedFiles: Array<{ path: string; status: string; additions: number; deletions: number }>;
  unstagedFiles: Array<{ path: string; status: string; additions: number; deletions: number }>;
};

function createController(status: MockGitStatus) {
  const refreshGitStatus = vi.fn();
  const refreshGitLog = vi.fn();
  const hook = renderHook(() =>
    useGitCommitController({
      activeWorkspace: {
        id: "ws-1",
        name: "workspace",
        path: "/tmp/workspace",
        connected: true,
        settings: {
          sidebarCollapsed: false,
        },
      } as WorkspaceInfo,
      activeWorkspaceId: "ws-1",
      activeWorkspaceIdRef: { current: "ws-1" },
      gitStatus: status as never,
      refreshGitStatus,
      refreshGitLog,
    }),
  );

  return { ...hook, refreshGitStatus, refreshGitLog };
}

describe("useGitCommitController", () => {
  beforeEach(() => {
    mockCommitGit.mockReset();
    mockGenerateCommitMessageWithEngine.mockReset();
    mockPushGit.mockReset();
    mockSyncGit.mockReset();
    mockStageGitFile.mockReset();
    mockUnstageGitFile.mockReset();
    mockCommitGit.mockResolvedValue(undefined);
    mockGenerateCommitMessageWithEngine.mockResolvedValue("feat: generated");
    mockPushGit.mockResolvedValue(undefined);
    mockSyncGit.mockResolvedValue(undefined);
    mockStageGitFile.mockResolvedValue(undefined);
    mockUnstageGitFile.mockResolvedValue(undefined);
  });

  it("blocks commit, commit-and-push, and commit-and-sync when there are only unstaged files", async () => {
    const { result } = createController({
      stagedFiles: [],
      unstagedFiles: [{ path: "src/file.ts", status: "M", additions: 1, deletions: 0 }],
    });

    act(() => {
      result.current.onCommitMessageChange("feat: selective commit");
    });

    await act(async () => {
      await result.current.onCommit();
      await result.current.onCommitAndPush();
      await result.current.onCommitAndSync();
    });

    expect(mockCommitGit).not.toHaveBeenCalled();
    expect(mockPushGit).not.toHaveBeenCalled();
    expect(mockSyncGit).not.toHaveBeenCalled();
  });

  it("commits staged changes and refreshes git state", async () => {
    const { result, refreshGitLog, refreshGitStatus } = createController({
      stagedFiles: [{ path: "src/file.ts", status: "M", additions: 1, deletions: 0 }],
      unstagedFiles: [],
    });

    act(() => {
      result.current.onCommitMessageChange("feat: selective commit");
    });

    await act(async () => {
      await result.current.onCommit();
    });

    expect(mockCommitGit).toHaveBeenCalledWith("ws-1", "feat: selective commit");
    expect(refreshGitStatus).toHaveBeenCalledTimes(1);
    expect(refreshGitLog).toHaveBeenCalledTimes(1);
    expect(result.current.commitMessage).toBe("");
  });

  it("allows commit-and-push and commit-and-sync only when staged files exist", async () => {
    const { result, refreshGitLog, refreshGitStatus } = createController({
      stagedFiles: [{ path: "src/file.ts", status: "M", additions: 1, deletions: 0 }],
      unstagedFiles: [{ path: "src/other.ts", status: "M", additions: 2, deletions: 0 }],
    });

    act(() => {
      result.current.onCommitMessageChange("feat: selective commit");
    });

    await act(async () => {
      await result.current.onCommitAndPush();
    });

    expect(mockCommitGit).toHaveBeenCalledWith("ws-1", "feat: selective commit");
    expect(mockPushGit).toHaveBeenCalledWith("ws-1");
    expect(refreshGitStatus).toHaveBeenCalledTimes(1);
    expect(refreshGitLog).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.onCommitMessageChange("feat: sync selective commit");
    });

    await act(async () => {
      await result.current.onCommitAndSync();
    });

    expect(mockSyncGit).toHaveBeenCalledWith("ws-1");
    expect(mockCommitGit).toHaveBeenLastCalledWith("ws-1", "feat: sync selective commit");
  });

  it("temporarily stages selected unstaged files and restores excluded staged files after commit", async () => {
    const { result, refreshGitLog, refreshGitStatus } = createController({
      stagedFiles: [{ path: "src/staged.ts", status: "M", additions: 1, deletions: 0 }],
      unstagedFiles: [{ path: "src/unstaged.ts", status: "M", additions: 2, deletions: 0 }],
    });

    act(() => {
      result.current.onCommitMessageChange("feat: scoped commit");
    });

    await act(async () => {
      await result.current.onCommit(["src/unstaged.ts"]);
    });

    expect(mockUnstageGitFile).toHaveBeenCalledWith("ws-1", "src/staged.ts");
    expect(mockStageGitFile).toHaveBeenNthCalledWith(1, "ws-1", "src/unstaged.ts");
    expect(mockCommitGit).toHaveBeenCalledWith("ws-1", "feat: scoped commit");
    expect(mockStageGitFile).toHaveBeenNthCalledWith(2, "ws-1", "src/staged.ts");
    expect(refreshGitStatus).toHaveBeenCalledTimes(1);
    expect(refreshGitLog).toHaveBeenCalledTimes(1);
  });

  it("rolls back temporary staging when scoped commit fails", async () => {
    mockCommitGit.mockRejectedValueOnce(new Error("commit failed"));
    const { result, refreshGitLog, refreshGitStatus } = createController({
      stagedFiles: [{ path: "src/staged.ts", status: "M", additions: 1, deletions: 0 }],
      unstagedFiles: [{ path: "src/unstaged.ts", status: "M", additions: 2, deletions: 0 }],
    });

    act(() => {
      result.current.onCommitMessageChange("feat: scoped commit");
    });

    await act(async () => {
      await result.current.onCommit(["src/unstaged.ts"]);
    });

    expect(mockUnstageGitFile).toHaveBeenCalledWith("ws-1", "src/staged.ts");
    expect(mockStageGitFile).toHaveBeenNthCalledWith(1, "ws-1", "src/unstaged.ts");
    expect(mockStageGitFile).toHaveBeenNthCalledWith(2, "ws-1", "src/staged.ts");
    expect(mockUnstageGitFile).toHaveBeenNthCalledWith(2, "ws-1", "src/unstaged.ts");
    expect(refreshGitStatus).not.toHaveBeenCalled();
    expect(refreshGitLog).not.toHaveBeenCalled();
    expect(result.current.commitError).toBe("commit failed");
  });

  it("keeps partially staged files committed via the existing index even when selected paths omit them", async () => {
    const { result } = createController({
      stagedFiles: [{ path: "src/hybrid.ts", status: "M", additions: 1, deletions: 0 }],
      unstagedFiles: [{ path: "src/hybrid.ts", status: "M", additions: 2, deletions: 1 }],
    });

    act(() => {
      result.current.onCommitMessageChange("feat: keep hybrid");
    });

    await act(async () => {
      await result.current.onCommit([]);
    });

    expect(mockCommitGit).toHaveBeenCalledWith("ws-1", "feat: keep hybrid");
    expect(mockStageGitFile).not.toHaveBeenCalled();
    expect(mockUnstageGitFile).not.toHaveBeenCalled();
  });
});
