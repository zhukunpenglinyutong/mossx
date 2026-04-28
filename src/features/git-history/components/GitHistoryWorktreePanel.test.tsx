/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHistoryWorktreePanel } from "./GitHistoryWorktreePanel";

const mockGetGitStatus = vi.fn<(workspaceId: string) => Promise<unknown>>();
const mockCommitGit = vi.fn<(workspaceId: string, message: string) => Promise<void>>();
const mockGenerateCommitMessage = vi.fn<
  (workspaceId: string, language?: "zh" | "en", engine?: "codex" | "claude" | "gemini" | "opencode") => Promise<string>
>();
const mockStageGitFile = vi.fn<(workspaceId: string, path: string) => Promise<void>>();
const mockStageGitAll = vi.fn<(workspaceId: string) => Promise<void>>();
const mockMenuPopup = vi.fn<
  (items: Array<{ text: string; action?: () => Promise<void> | void }>) => Promise<void>
>();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "git.staged": "Staged",
        "git.unstaged": "Unstaged",
        "git.commit": "Commit",
        "git.committing": "Committing...",
        "git.commitMessage": "Commit message",
        "git.enterCommitMessage": "Enter commit message",
        "git.noChangesToCommit": "No changes to commit",
        "git.selectFilesToCommit": "Select files to commit first",
        "git.selectedFilesForCommit": "{{count}} file selected for commit",
        "git.selectedFilesForCommit_other": "{{count}} files selected for commit",
        "git.fileActions": "File actions",
        "git.noChangesDetected": "No changes",
        "git.stageFile": "Stage file",
        "git.unstageFile": "Unstage file",
        "git.discardFile": "Discard file",
        "git.stageAllChangesAction": "Stage all",
        "git.unstageAllChangesAction": "Unstage all",
        "git.discardAllChangesAction": "Discard all",
        "git.generateCommitMessage": "Generate commit message",
        "git.generateCommitMessageChinese": "Generate Chinese commit message",
        "git.generateCommitMessageEnglish": "Generate English commit message",
        "git.generateCommitMessageEngineCodex": "Use Codex engine",
        "git.generateCommitMessageEngineClaude": "Use Claude engine",
        "git.generateCommitMessageEngineGemini": "Use Gemini engine",
        "git.generateCommitMessageEngineOpenCode": "Use OpenCode engine",
      };
      const template = translations[key] ?? key;
      if (!options) {
        return template;
      }
      return template.replace(/\{\{(\w+)\}\}/g, (_, token: string) => String(options[token] ?? ""));
    },
    i18n: {
      language: "en",
      changeLanguage: vi.fn(),
    },
  }),
}));

vi.mock("../../../services/tauri", () => ({
  commitGit: (workspaceId: string, message: string) => mockCommitGit(workspaceId, message),
  generateCommitMessageWithEngine: (
    workspaceId: string,
    language?: "zh" | "en",
    engine?: "codex" | "claude" | "gemini" | "opencode",
  ) => mockGenerateCommitMessage(workspaceId, language, engine),
  getGitStatus: (workspaceId: string) => mockGetGitStatus(workspaceId),
  revertGitAll: vi.fn(async () => undefined),
  revertGitFile: vi.fn(async () => undefined),
  stageGitAll: (workspaceId: string) => mockStageGitAll(workspaceId),
  stageGitFile: (workspaceId: string, path: string) => mockStageGitFile(workspaceId, path),
  unstageGitFile: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: {
    new: vi.fn(async ({ items }: { items: Array<{ text: string; action?: () => Promise<void> | void }> }) => ({
      popup: vi.fn(async () => {
        await mockMenuPopup(items);
      }),
    })),
  },
  MenuItem: { new: vi.fn(async (options: Record<string, unknown>) => options) },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({}),
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: class LogicalPosition {
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
}));

describe("GitHistoryWorktreePanel", () => {
  beforeEach(() => {
    mockGetGitStatus.mockReset();
    mockCommitGit.mockReset();
    mockGenerateCommitMessage.mockReset();
    mockStageGitFile.mockReset();
    mockStageGitAll.mockReset();
    mockMenuPopup.mockReset();
    mockCommitGit.mockResolvedValue(undefined);
    mockGenerateCommitMessage.mockResolvedValue("Generated commit message");
    mockStageGitFile.mockResolvedValue(undefined);
    mockStageGitAll.mockResolvedValue(undefined);
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
      expect(screen.getByLabelText("Staged (1)")).toBeTruthy();
      expect(screen.getByLabelText("Unstaged (1)")).toBeTruthy();
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

  it("renders Windows-style file paths with correct leaf names", async () => {
    mockGetGitStatus.mockResolvedValue({
      branchName: "main",
      files: [
        { path: "src\\staged.ts", status: "M", additions: 2, deletions: 1 },
        { path: "src\\feature\\unstaged.ts", status: "M", additions: 3, deletions: 1 },
      ],
      stagedFiles: [{ path: "src\\staged.ts", status: "M", additions: 2, deletions: 1 }],
      unstagedFiles: [{ path: "src\\feature\\unstaged.ts", status: "M", additions: 3, deletions: 1 }],
      totalAdditions: 5,
      totalDeletions: 2,
    });

    render(<GitHistoryWorktreePanel workspaceId="w1" listView="tree" />);

    await waitFor(() => {
      expect(screen.getByText("unstaged.ts", { selector: "strong" })).toBeTruthy();
    });
  });

  it("generates English commit message after menu selection", async () => {
    mockMenuPopup
      .mockImplementationOnce(async (items) => {
        const codexItem = items.find((item) => item.text === "Use Codex engine");
        await codexItem?.action?.();
      })
      .mockImplementationOnce(async (items) => {
        const englishItem = items.find((item) => item.text === "Generate English commit message");
        await englishItem?.action?.();
      });

    render(<GitHistoryWorktreePanel workspaceId="w1" listView="tree" />);

    const generateButton = await screen.findByRole("button", { name: "Generate commit message" });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(mockGenerateCommitMessage).toHaveBeenCalledWith("w1", "en", "codex");
    });
  });

  it("renders engine icon in generate button", async () => {
    render(<GitHistoryWorktreePanel workspaceId="w1" listView="tree" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate commit message" })).toBeTruthy();
    });

    expect(document.querySelector(".git-history-worktree-engine-icon")).toBeTruthy();
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
      expect(screen.getAllByLabelText("Staged (1)").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("Unstaged (0)")).toBeNull();
    expect(screen.queryByText("No changes")).toBeNull();
  });

  it("renders compact summary bar when only one section is visible", async () => {
    mockGetGitStatus.mockResolvedValue({
      branchName: "main",
      files: [{ path: "src/staged.ts", status: "M", additions: 2, deletions: 1 }],
      stagedFiles: [{ path: "src/staged.ts", status: "M", additions: 2, deletions: 1 }],
      unstagedFiles: [],
      totalAdditions: 2,
      totalDeletions: 1,
    });

    render(<GitHistoryWorktreePanel workspaceId="w1" listView="tree" commitSectionCollapsed />);

    await waitFor(() => {
      expect(document.querySelector(".git-history-worktree-summary-bar")).toBeTruthy();
    });

    expect(screen.getByText("main")).toBeTruthy();
    expect(screen.getAllByLabelText("Staged (1)").length).toBeGreaterThan(0);
  });

  it("hides commit box when commit section is collapsed", async () => {
    render(<GitHistoryWorktreePanel workspaceId="w1" listView="tree" commitSectionCollapsed />);

    await waitFor(() => {
      expect(screen.getByLabelText("Staged (1)")).toBeTruthy();
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

  it("disables commit and avoids auto-stage-all when only unstaged files exist", async () => {
    mockGetGitStatus.mockResolvedValue({
      branchName: "main",
      files: [{ path: "src/only-unstaged.ts", status: "M", additions: 1, deletions: 0 }],
      stagedFiles: [],
      unstagedFiles: [{ path: "src/only-unstaged.ts", status: "M", additions: 1, deletions: 0 }],
      totalAdditions: 1,
      totalDeletions: 0,
    });

    render(<GitHistoryWorktreePanel workspaceId="w1" listView="tree" />);

    const commitButton = await screen.findByRole("button", { name: "Commit" });
    expect((commitButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Select files to commit first")).toBeTruthy();

    fireEvent.click(commitButton);
    expect(mockStageGitAll).not.toHaveBeenCalled();
    expect(mockCommitGit).not.toHaveBeenCalled();
  });
});
