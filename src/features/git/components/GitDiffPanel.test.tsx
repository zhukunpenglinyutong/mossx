/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitLogEntry } from "../../../types";

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
        "git.listFlat": "Flat",
        "git.listTree": "Tree",
        "git.listView": "List view",
        "git.fileActions": "File actions",
        "git.stageFile": "Stage file",
        "git.stageChanges": "Stage changes",
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
  Menu: { new: vi.fn(async () => ({ popup: vi.fn() })) },
  MenuItem: { new: vi.fn(async () => ({})) },
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

    const textarea = screen.getAllByPlaceholderText("Commit message...")[0];
    textarea.focus();
    fireEvent.keyDown(textarea, { key: "V", altKey: true, shiftKey: true });
    expect(onGitDiffListViewChange).not.toHaveBeenCalled();
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
});
