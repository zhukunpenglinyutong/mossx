/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHistoryWorktreePanel } from "./GitHistoryWorktreePanel";

const mockGetGitStatus = vi.fn<(workspaceId: string) => Promise<unknown>>();
const mockStageGitFile = vi.fn<(workspaceId: string, path: string) => Promise<void>>();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "git.staged": "Staged",
        "git.unstaged": "Unstaged",
        "git.commit": "Commit",
        "git.committing": "Committing...",
        "git.commitMessage": "Commit message",
        "git.fileActions": "File actions",
        "git.noChangesDetected": "No changes",
        "git.stageFile": "Stage file",
        "git.unstageFile": "Unstage file",
        "git.discardFile": "Discard file",
        "git.stageAllChangesAction": "Stage all",
        "git.unstageAllChangesAction": "Unstage all",
        "git.discardAllChangesAction": "Discard all",
        "git.generateCommitMessage": "Generate commit message",
      };
      return translations[key] ?? key;
    },
    i18n: {
      language: "en",
      changeLanguage: vi.fn(),
    },
  }),
}));

vi.mock("../../../services/tauri", () => ({
  commitGit: vi.fn(async () => undefined),
  generateCommitMessage: vi.fn(async () => "Generated commit message"),
  getGitStatus: (workspaceId: string) => mockGetGitStatus(workspaceId),
  revertGitAll: vi.fn(async () => undefined),
  revertGitFile: vi.fn(async () => undefined),
  stageGitAll: vi.fn(async () => undefined),
  stageGitFile: (workspaceId: string, path: string) => mockStageGitFile(workspaceId, path),
  unstageGitFile: vi.fn(async () => undefined),
}));

describe("GitHistoryWorktreePanel", () => {
  beforeEach(() => {
    mockGetGitStatus.mockReset();
    mockStageGitFile.mockReset();
    mockStageGitFile.mockResolvedValue(undefined);
    mockGetGitStatus.mockResolvedValue({
      branchName: "main",
      files: [
        { path: "src/staged.ts", status: "M", additions: 2, deletions: 1 },
        { path: "src/feature/unstaged.ts", status: "M", additions: 3, deletions: 1 },
      ],
      stagedFiles: [{ path: "src/staged.ts", status: "M", additions: 2, deletions: 1 }],
      unstagedFiles: [{ path: "src/feature/unstaged.ts", status: "M", additions: 3, deletions: 1 }],
      totalAdditions: 5,
      totalDeletions: 2,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders unified file-tree semantic classes in tree mode", async () => {
    render(<GitHistoryWorktreePanel workspaceId="w1" listView="tree" />);

    await waitFor(() => {
      expect(screen.getByText("Staged (1)")).toBeTruthy();
      expect(screen.getByText("Unstaged (1)")).toBeTruthy();
    });

    expect(document.querySelector(".git-history-worktree-section.git-filetree-section")).toBeTruthy();
    expect(document.querySelector(".git-history-worktree-section-header.git-filetree-section-header")).toBeTruthy();
    expect(document.querySelector(".git-history-worktree-folder-row.git-filetree-folder-row")).toBeTruthy();
    expect(document.querySelector(".git-history-worktree-file-row.git-filetree-row")).toBeTruthy();
    expect(document.querySelector(".git-history-worktree-file-stats.git-filetree-badge")).toBeTruthy();
  });

  it("keeps stage-file behavior unchanged", async () => {
    render(<GitHistoryWorktreePanel workspaceId="w1" listView="tree" />);

    const stageButton = await screen.findByRole("button", { name: "Stage file" });
    fireEvent.click(stageButton);

    await waitFor(() => {
      expect(mockStageGitFile).toHaveBeenCalledWith("w1", "src/feature/unstaged.ts");
    });
  });

  it("hides empty sections when there are no files in that section", async () => {
    mockGetGitStatus.mockResolvedValue({
      branchName: "main",
      files: [{ path: "src/staged.ts", status: "M", additions: 2, deletions: 1 }],
      stagedFiles: [{ path: "src/staged.ts", status: "M", additions: 2, deletions: 1 }],
      unstagedFiles: [],
      totalAdditions: 2,
      totalDeletions: 1,
    });

    render(<GitHistoryWorktreePanel workspaceId="w1" listView="tree" />);

    await waitFor(() => {
      expect(screen.getByText("Staged (1)")).toBeTruthy();
    });

    expect(screen.queryByText("Unstaged (0)")).toBeNull();
    expect(screen.queryByText("No changes")).toBeNull();
  });

  it("hides commit box when commit section is collapsed", async () => {
    render(<GitHistoryWorktreePanel workspaceId="w1" listView="tree" commitSectionCollapsed />);

    await waitFor(() => {
      expect(screen.getByText("Staged (1)")).toBeTruthy();
    });

    expect(screen.queryByPlaceholderText("Commit message")).toBeNull();
    expect(screen.queryByRole("button", { name: "Commit" })).toBeNull();
  });

  it("shows empty-state text when both staged and unstaged sections are empty", async () => {
    mockGetGitStatus.mockResolvedValue({
      branchName: "main",
      files: [],
      stagedFiles: [],
      unstagedFiles: [],
      totalAdditions: 0,
      totalDeletions: 0,
    });

    render(<GitHistoryWorktreePanel workspaceId="w1" listView="tree" commitSectionCollapsed />);

    await waitFor(() => {
      expect(screen.getByText("No changes")).toBeTruthy();
    });
  });
});
