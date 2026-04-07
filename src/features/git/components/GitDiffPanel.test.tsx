/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitLogEntry } from "../../../types";

const mockMenuPopup = vi.fn<
  (items: Array<{ text: string; action?: () => Promise<void> | void }>) => Promise<void>
>();

// Mock react-i18next
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "git.commit": "Commit",
        "git.committing": "Committing...",
        "git.commitMessage": "Commit message...",
        "git.staged": "Staged",
        "git.unstaged": "Unstaged",
        "git.commitStagedChanges": "Commit staged changes",
        "git.commitAllChanges": "Commit all unstaged changes",
        "git.generateCommitMessage": "Generate commit message",
        "git.generateCommitMessageChinese": "Generate Chinese commit message",
        "git.generateCommitMessageEnglish": "Generate English commit message",
        "git.generateCommitMessageEngineCodex": "Use Codex engine",
        "git.generateCommitMessageEngineClaude": "Use Claude engine",
        "git.generateCommitMessageEngineGemini": "Use Gemini engine",
        "git.generateCommitMessageEngineOpenCode": "Use OpenCode engine",
        "git.listFlat": "Flat",
        "git.listTree": "Tree",
        "git.listView": "List view",
        "git.toggleCommitSection": "Toggle commit section",
        "git.panelView": "Git panel view",
        "git.diffMode": "Diff",
        "git.diffModeDescription": "Inspect file changes",
        "git.logMode": "Git",
        "git.logModeDescription": "Browse commits and history",
        "git.issuesMode": "Issues",
        "git.issuesModeDescription": "Track repository issues",
        "git.prsMode": "PRs",
        "git.prsModeDescription": "Review pull requests",
        "git.fileActions": "File actions",
        "git.stageFile": "Stage file",
        "git.stageChanges": "Stage changes",
        "git.path": "Path:",
        "git.change": "Switch",
        "git.statusUnavailable": "Git status unavailable",
        "git.noRepositoriesFound": "No repositories found.",
        "git.historyQuickAction": "Hub",
        "menu.maximize": "Maximize",
        "common.restore": "Restore",
        "common.close": "Close",
      };
      return translations[key] ?? key;
    },
    i18n: {
      language: "en",
      changeLanguage: vi.fn(),
    },
  }),
}));

vi.mock("./GitDiffViewer", () => ({
  GitDiffViewer: () => <div data-testid="git-diff-viewer" />,
}));

import { GitDiffPanel } from "./GitDiffPanel";
import { buildDiffTree } from "./GitDiffPanel";

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
  getCurrentWindow: () => ({ scaleFactor: () => 1 }),
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

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(async () => true),
}));

const logEntries: GitLogEntry[] = [];

const baseProps = {
  mode: "diff" as const,
  onModeChange: vi.fn(),
  filePanelMode: "git" as const,
  onFilePanelModeChange: vi.fn(),
  branchName: "main",
  totalAdditions: 0,
  totalDeletions: 0,
  fileStatus: "1 file changed",
  logEntries,
  stagedFiles: [],
  unstagedFiles: [],
};

afterEach(() => {
  cleanup();
  mockMenuPopup.mockReset();
});

describe("GitDiffPanel", () => {
  it("enables commit when message exists and only unstaged changes", () => {
    const onCommit = vi.fn();
    render(
      <GitDiffPanel
        {...baseProps}
        commitMessage="feat: add thing"
        onCommit={onCommit}
        onGenerateCommitMessage={vi.fn()}
        unstagedFiles={[
          { path: "file.txt", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle commit section" }));
    const commitButton = screen.getByRole("button", { name: "Commit" });
    expect((commitButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(commitButton);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("builds a nested tree from file paths", () => {
    const tree = buildDiffTree(
      [
        { path: "src/app/main.tsx", status: "M", additions: 1, deletions: 0 },
        { path: "src/git/GitDiffPanel.tsx", status: "A", additions: 2, deletions: 0 },
        { path: "README.md", status: "M", additions: 1, deletions: 1 },
      ],
      "unstaged",
    );

    expect(tree.folders.has("src")).toBe(true);
    expect(tree.files.map((entry) => entry.path)).toEqual(["README.md"]);
    const srcNode = tree.folders.get("src");
    expect(srcNode?.folders.has("app")).toBe(true);
    expect(srcNode?.folders.has("git")).toBe(true);
  });

  it("builds a nested tree from Windows-style file paths", () => {
    const tree = buildDiffTree(
      [
        { path: "src\\app\\main.tsx", status: "M", additions: 1, deletions: 0 },
        { path: "README.md", status: "M", additions: 1, deletions: 1 },
      ],
      "unstaged",
    );

    expect(tree.folders.has("src")).toBe(true);
    const srcNode = tree.folders.get("src");
    expect(srcNode?.folders.has("app")).toBe(true);
    expect(tree.files.map((entry) => entry.path)).toEqual(["README.md"]);
  });

  it("supports tree keyboard navigation and Enter-to-open", () => {
    const onSelectFile = vi.fn();
    render(
      <GitDiffPanel
        {...baseProps}
        gitDiffListView="tree"
        unstagedFiles={[
          { path: "a.ts", status: "M", additions: 1, deletions: 0 },
          { path: "b.ts", status: "M", additions: 1, deletions: 0 },
        ]}
        onSelectFile={onSelectFile}
      />,
    );

    const firstRow = document.querySelector<HTMLElement>('.diff-row[data-path="a.ts"]');
    const secondRow = document.querySelector<HTMLElement>('.diff-row[data-path="b.ts"]');
    expect(firstRow).toBeTruthy();
    expect(secondRow).toBeTruthy();
    firstRow?.focus();
    fireEvent.keyDown(firstRow as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(secondRow);
    fireEvent.keyDown(secondRow as HTMLElement, { key: "Enter" });
    expect(onSelectFile).toHaveBeenCalledWith("b.ts");
  });

  it("opens engine menu then language menu before generating commit message", async () => {
    mockMenuPopup
      .mockImplementationOnce(async (items) => {
        const codexItem = items.find((item) => item.text === "Use Codex engine");
        await codexItem?.action?.();
      })
      .mockImplementationOnce(async (items) => {
        const englishItem = items.find((item) => item.text === "Generate English commit message");
        await englishItem?.action?.();
      });
    const onGenerateCommitMessage = vi.fn();

    render(
      <GitDiffPanel
        {...baseProps}
        onGenerateCommitMessage={onGenerateCommitMessage}
        unstagedFiles={[{ path: "file.txt", status: "M", additions: 1, deletions: 0 }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle commit section" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate commit message" }));

    await waitFor(() => {
      expect(onGenerateCommitMessage).toHaveBeenCalledWith("en", "codex");
    });
  });

  it("shows spinning engine icon while generating commit message", () => {
    render(
      <GitDiffPanel
        {...baseProps}
        commitMessageLoading
        onGenerateCommitMessage={vi.fn()}
        unstagedFiles={[{ path: "file.txt", status: "M", additions: 1, deletions: 0 }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle commit section" }));
    expect(document.querySelector(".commit-message-engine-icon--spinning")).toBeTruthy();
  });

  it("applies unified file-tree semantic classes", () => {
    render(
      <GitDiffPanel
        {...baseProps}
        gitDiffListView="tree"
        stagedFiles={[
          { path: "src/core/a.ts", status: "M", additions: 2, deletions: 1 },
        ]}
      />,
    );

    const section = document.querySelector(".diff-section.git-filetree-section");
    const folderRow = document.querySelector(".diff-tree-folder-row.git-filetree-folder-row");
    const fileRow = document.querySelector(".diff-row.git-filetree-row");
    const badge = document.querySelector(".diff-counts-inline.git-filetree-badge");

    expect(section).toBeTruthy();
    expect(folderRow).toBeTruthy();
    expect(fileRow).toBeTruthy();
    expect(badge).toBeTruthy();
  });

  it("renders compact tree summary in single-section tree mode", () => {
    render(
      <GitDiffPanel
        {...baseProps}
        gitDiffListView="tree"
        gitRoot="/repo/src"
        totalAdditions={1}
        totalDeletions={1}
        unstagedFiles={[{ path: "src/main.css", status: "M", additions: 1, deletions: 1 }]}
      />,
    );

    expect(document.querySelector(".git-filetree-section-header.is-compact")).toBeTruthy();
    expect(screen.getAllByText("src").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Unstaged (1)")).toBeTruthy();
  });

  it("keeps staged and unstaged tree sections visually consistent", () => {
    render(
      <GitDiffPanel
        {...baseProps}
        gitDiffListView="tree"
        gitRoot="/repo/codex-2026-03-12-v0.2.7"
        totalAdditions={12}
        totalDeletions={3}
        stagedFiles={[{ path: "src/staged.ts", status: "M", additions: 8, deletions: 1 }]}
        unstagedFiles={[{ path: "src/unstaged.ts", status: "M", additions: 4, deletions: 2 }]}
      />,
    );

    expect(document.querySelectorAll(".git-filetree-section-header.is-compact")).toHaveLength(2);
    expect(screen.getAllByText("codex-2026-03-12-v0.2.7").length).toBeGreaterThan(1);
  });

  it("renders compact flat summary in single-section flat mode", () => {
    render(
      <GitDiffPanel
        {...baseProps}
        gitDiffListView="flat"
        totalAdditions={302}
        totalDeletions={10}
        stagedFiles={[{ path: "src/main.css", status: "M", additions: 302, deletions: 10 }]}
      />,
    );

    expect(document.querySelector(".git-filetree-section-header.is-compact")).toBeTruthy();
    expect(screen.queryByText("1 file changed")).toBeNull();
    expect(screen.getByLabelText("Staged (1)")).toBeTruthy();
  });

  it("toggles list view via shortcut when panel is focused", () => {
    const onGitDiffListViewChange = vi.fn();
    render(
      <GitDiffPanel
        {...baseProps}
        gitDiffListView="flat"
        onGitDiffListViewChange={onGitDiffListViewChange}
        unstagedFiles={[
          { path: "file.txt", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    const flatButton = screen.getAllByRole("button", { name: "Flat" })[0];
    if (!flatButton) {
      throw new Error("Flat button not found");
    }
    flatButton.focus();
    fireEvent.keyDown(window, { key: "V", altKey: true, shiftKey: true });
    expect(onGitDiffListViewChange).toHaveBeenCalledWith("tree");
  });

  it("does not toggle list view shortcut while editing textarea", () => {
    const onGitDiffListViewChange = vi.fn();
    render(
      <GitDiffPanel
        {...baseProps}
        gitDiffListView="flat"
        onGitDiffListViewChange={onGitDiffListViewChange}
        commitMessage="chore: test"
        onGenerateCommitMessage={vi.fn()}
        unstagedFiles={[
          { path: "file.txt", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle commit section" }));
    const textarea = screen.getAllByPlaceholderText("Commit message...")[0];
    if (!textarea) {
      throw new Error("Commit textarea not found");
    }
    textarea.focus();
    fireEvent.keyDown(textarea, { key: "V", altKey: true, shiftKey: true });
    expect(onGitDiffListViewChange).not.toHaveBeenCalled();
  });

  it("opens git history panel from Hub button", () => {
    const onOpenGitHistoryPanel = vi.fn();
    render(
      <GitDiffPanel
        {...baseProps}
        onOpenGitHistoryPanel={onOpenGitHistoryPanel}
        unstagedFiles={[
          { path: "file.txt", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hub" }));
    expect(onOpenGitHistoryPanel).toHaveBeenCalledTimes(1);
  });

  it("switches git panel mode from custom dropdown menu", () => {
    const onModeChange = vi.fn();
    render(
      <GitDiffPanel
        {...baseProps}
        onModeChange={onModeChange}
        unstagedFiles={[
          { path: "file.txt", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Git panel view" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Issues/i }));
    expect(onModeChange).toHaveBeenCalledWith("issues");
  });

  it("keeps flat mode stage action behavior", () => {
    const onStageFile = vi.fn();
    render(
      <GitDiffPanel
        {...baseProps}
        gitDiffListView="flat"
        onStageFile={onStageFile}
        unstagedFiles={[
          { path: "file.txt", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    const stageButton = screen.getByRole("button", { name: "Stage file" });
    fireEvent.click(stageButton);
    expect(onStageFile).toHaveBeenCalledWith("file.txt");
  });

  it("toggles preview modal maximize state", () => {
    render(
      <GitDiffPanel
        {...baseProps}
        gitDiffListView="flat"
        unstagedFiles={[
          { path: "file.txt", status: "M", additions: 1, deletions: 0 },
        ]}
        diffEntries={[
          {
            path: "file.txt",
            status: "M",
            diff: "diff --git a/file.txt b/file.txt\n@@ -1 +1 @@\n-old\n+new\n",
          },
        ]}
      />,
    );

    const fileRow = screen.getByLabelText("file.txt");
    fireEvent.doubleClick(fileRow);

    const modal = document.querySelector(".git-history-diff-modal");
    expect(modal).toBeTruthy();
    expect(modal?.classList.contains("is-maximized")).toBe(false);

    const maximizeButton = screen.getByRole("button", { name: "Maximize" });
    fireEvent.click(maximizeButton);
    expect(modal?.classList.contains("is-maximized")).toBe(true);

    const restoreButton = screen.getByRole("button", { name: "Restore" });
    fireEvent.click(restoreButton);
    expect(modal?.classList.contains("is-maximized")).toBe(false);
  });

  it("keeps root summary visible and in first content row for non-git workspace path", () => {
    render(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/non-git-workspace"
        gitRoot={null}
        onScanGitRoots={vi.fn()}
      />,
    );

    const rootPath = screen.getByText("/tmp/non-git-workspace");
    expect(rootPath).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch" })).toBeTruthy();

    const rootRow = document.querySelector(".git-root-current");
    const statusRow = document.querySelector(".diff-status");
    expect(rootRow).toBeTruthy();
    expect(statusRow).toBeTruthy();
    if (!rootRow || !statusRow) {
      throw new Error("Expected root/status rows to exist");
    }
    expect(Boolean(rootRow.compareDocumentPosition(statusRow) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("toggles git root panel by clicking change icon button", () => {
    render(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/non-git-workspace"
        error="not a git repository"
        gitRoot={null}
        onScanGitRoots={vi.fn()}
      />,
    );

    const toggleButton = screen.getByRole("button", { name: "Switch" });
    expect(screen.getByText("git.chooseRepo")).toBeTruthy();

    fireEvent.click(toggleButton);
    expect(screen.queryByText("git.chooseRepo")).toBeNull();

    fireEvent.click(toggleButton);
    expect(screen.getByText("git.chooseRepo")).toBeTruthy();
  });

  it("renders compact red alert on root row and hides raw git error", () => {
    render(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/non-git-workspace"
        error="could not find repository at '/tmp/non-git-workspace'; class=Repository (6); code=NotFound (-3)"
        gitRoot={null}
        onScanGitRoots={vi.fn()}
      />,
    );

    expect(screen.getByText("No repositories found.")).toBeTruthy();
    expect(screen.queryByText(/could not find repository/i)).toBeNull();
    expect(screen.queryByText("Git status unavailable")).toBeNull();
    expect(screen.queryByText("main")).toBeNull();
  });

  it("auto-collapses git root panel after selecting a repository", () => {
    const onSelectGitRoot = vi.fn();
    render(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/non-git-workspace"
        gitRoot={null}
        gitRootCandidates={["/tmp/non-git-workspace/repo-a"]}
        onScanGitRoots={vi.fn()}
        onSelectGitRoot={onSelectGitRoot}
      />,
    );

    const repoOption = screen.getByRole("button", { name: "/tmp/non-git-workspace/repo-a" });
    fireEvent.click(repoOption);
    expect(onSelectGitRoot).toHaveBeenCalledWith("/tmp/non-git-workspace/repo-a");
    expect(screen.queryByText("git.chooseRepo")).toBeNull();
  });

  it("auto-collapses git root panel when scan finishes with no repositories", () => {
    const { rerender } = render(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/non-git-workspace"
        gitRoot={null}
        gitRootScanLoading={true}
        onScanGitRoots={vi.fn()}
      />,
    );

    expect(screen.getByText("git.chooseRepo")).toBeTruthy();

    rerender(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/non-git-workspace"
        gitRoot={null}
        gitRootScanLoading={false}
        gitRootScanHasScanned={true}
        gitRootCandidates={[]}
        gitRootScanError={null}
        onScanGitRoots={vi.fn()}
      />,
    );

    expect(screen.queryByText("git.chooseRepo")).toBeNull();
  });

  it("hides pick-folder action in root panel", () => {
    render(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/non-git-workspace"
        gitRoot={null}
        gitRootScanLoading={true}
        onScanGitRoots={vi.fn()}
        onPickGitRoot={vi.fn()}
      />,
    );

    expect(screen.queryByText("git.pickFolder")).toBeNull();
  });
});
