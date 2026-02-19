/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHistoryPanel, buildFileTreeItems, getDefaultColumnWidths } from "./GitHistoryPanel";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => {
    const visibleCount = Math.min(count, 120);
    const virtualItems = Array.from({ length: visibleCount }, (_, index) => ({
      index,
      key: index,
      size: 56,
      start: index * 56,
      end: index * 56 + 56,
      lane: 0,
    }));
    return {
      getVirtualItems: () => virtualItems,
      getTotalSize: () => count * 56,
      scrollToIndex: vi.fn(),
      measure: vi.fn(),
      measureElement: vi.fn(),
    };
  },
}));

const mockTranslate = (key: string, options?: Record<string, unknown>) => {
  if (!options) {
    return key;
  }
  if (typeof options.count === "number") {
    return `${key}:${options.count}`;
  }
  if (typeof options.operation === "string") {
    return `${key}:${options.operation}`;
  }
  return key;
};

const mockI18n = {
  language: "en",
  changeLanguage: vi.fn(),
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: mockTranslate,
    i18n: mockI18n,
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(async () => true),
}));

vi.mock("./GitHistoryWorktreePanel", () => ({
  GitHistoryWorktreePanel: () => <div data-testid="worktree-panel">worktree</div>,
}));

vi.mock("../../git/components/GitDiffViewer", () => ({
  GitDiffViewer: () => <div data-testid="git-diff-viewer">diff-viewer</div>,
}));

vi.mock("../../../services/clientStorage", () => ({
  getClientStoreSync: vi.fn(),
  writeClientStoreValue: vi.fn(),
}));

vi.mock("../../../services/tauri", () => ({
  checkoutGitBranch: vi.fn(async () => undefined),
  cherryPickCommit: vi.fn(async () => undefined),
  createGitBranchFromBranch: vi.fn(async () => undefined),
  createGitBranchFromCommit: vi.fn(async () => undefined),
  deleteGitBranch: vi.fn(async () => undefined),
  fetchGit: vi.fn(async () => undefined),
  getGitStatus: vi.fn(async () => ({
    files: [],
    totalAdditions: 0,
    totalDeletions: 0,
  })),
  getGitCommitDetails: vi.fn(async () => ({
    sha: "a".repeat(40),
    summary: "feat: one",
    message: "message one",
    author: "tester",
    authorEmail: "tester@example.com",
    committer: "tester",
    committerEmail: "tester@example.com",
    authorTime: 1739300000,
    commitTime: 1739300000,
    parents: [],
    files: [
      {
        path: "src/main/java/com/demo/App.java",
        status: "M",
        additions: 4,
        deletions: 1,
        diff: "diff --git a/src/main/java/com/demo/App.java b/src/main/java/com/demo/App.java\n@@ -1 +1 @@\n-old\n+new\n",
        lineCount: 4,
        truncated: false,
      },
    ],
    totalAdditions: 4,
    totalDeletions: 1,
  })),
  getGitCommitHistory: vi.fn(async () => ({
    snapshotId: "snap-1",
    total: 1,
    offset: 0,
    limit: 100,
    hasMore: false,
    commits: [
      {
        sha: "a".repeat(40),
        shortSha: "aaaaaaa",
        summary: "feat: one",
        message: "message one",
        author: "tester",
        authorEmail: "tester@example.com",
        timestamp: 1739300000,
        parents: [],
        refs: [],
      },
    ],
  })),
  listGitRoots: vi.fn(async () => []),
  listGitBranches: vi.fn(async () => ({
    branches: [],
    localBranches: [
      {
        name: "main",
        isCurrent: true,
        isRemote: false,
        remote: null,
        lastCommit: 1739300000,
        ahead: 0,
        behind: 0,
      },
    ],
    remoteBranches: [],
    currentBranch: "main",
  })),
  mergeGitBranch: vi.fn(async () => undefined),
  pullGit: vi.fn(async () => undefined),
  pushGit: vi.fn(async () => undefined),
  renameGitBranch: vi.fn(async () => undefined),
  resolveGitCommitRef: vi.fn(async () => "a".repeat(40)),
  revertCommit: vi.fn(async () => undefined),
  syncGit: vi.fn(async () => undefined),
}));

import * as tauriService from "../../../services/tauri";
import * as clientStorage from "../../../services/clientStorage";

const workspace = {
  id: "w1",
  name: "demo",
  path: "/tmp/demo",
  connected: true,
  settings: {},
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.mocked(clientStorage.getClientStoreSync).mockReturnValue(undefined);
});

describe("GitHistoryPanel helpers", () => {
  it("collapses single-child directory chain in changed file tree", () => {
    const items = buildFileTreeItems(
      [
        {
          path: "a/b/c/d.txt",
          status: "M",
          additions: 1,
          deletions: 0,
          diff: "",
          lineCount: 0,
          truncated: false,
        },
      ],
      new Set(["a/b/c"]),
    );
    expect(items[0]?.type).toBe("dir");
    if (items[0]?.type === "dir") {
      expect(items[0].label).toBe("a.b.c");
    }
  });

  it("returns sane default widths for 3:2:3:2 layout", () => {
    const widths = getDefaultColumnWidths(1600);
    expect(widths.overviewWidth).toBeGreaterThan(0);
    expect(widths.branchesWidth).toBeGreaterThan(0);
    expect(widths.commitsWidth).toBeGreaterThan(0);
  });
});

describe("GitHistoryPanel interactions", () => {
  it("supports select commit -> click file -> open diff modal -> cherry-pick", async () => {
    render(<GitHistoryPanel workspace={workspace as never} />);

    await waitFor(() => {
      expect(screen.getByText("feat: one")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("feat: one"));

    await waitFor(() => {
      expect(screen.getByText("App.java")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("App.java"));

    await waitFor(() => {
      expect(screen.getByTestId("git-diff-viewer")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("git.historyCherryPick"));
    await waitFor(() => {
      expect(tauriService.cherryPickCommit).toHaveBeenCalledTimes(1);
    });
  });

  it("restores persisted query and commit selection state", async () => {
    vi.mocked(clientStorage.getClientStoreSync).mockImplementation((store, key) => {
      if (store === "layout" && String(key).startsWith("gitHistoryPanel:")) {
        return {
          selectedBranch: "all",
          commitQuery: "aaaa",
          selectedCommitSha: "a".repeat(40),
          diffStyle: "split",
        } as never;
      }
      return undefined;
    });

    render(<GitHistoryPanel workspace={workspace as never} />);

    await waitFor(() => {
      const input = screen.getByPlaceholderText("git.historySearchCommits") as HTMLInputElement;
      expect(input.value).toBe("aaaa");
    });

    expect(clientStorage.writeClientStoreValue).toHaveBeenCalled();
  });

  it("does not refetch history in a loop after snapshot update", async () => {
    render(<GitHistoryPanel workspace={workspace as never} />);

    await waitFor(() => {
      expect(screen.getByText("feat: one")).toBeTruthy();
    });

    await waitFor(
      () => {
        expect(tauriService.getGitCommitHistory).toHaveBeenCalledTimes(1);
      },
      { timeout: 400 },
    );
  });

  it("keeps rendered commit rows bounded with large history payload", async () => {
    const largeCommits = Array.from({ length: 10_000 }, (_, index) => ({
      sha: `sha-${index}`,
      shortSha: `s${index}`,
      summary: `commit-${index}`,
      message: `message-${index}`,
      author: "tester",
      authorEmail: "tester@example.com",
      timestamp: 1739300000 - index,
      parents: [],
      refs: [],
    }));
    vi.mocked(tauriService.getGitCommitHistory).mockImplementation(async () => ({
      snapshotId: "snap-large",
      total: 10_000,
      offset: 0,
      limit: 10_000,
      hasMore: false,
      commits: largeCommits,
    }));

    render(<GitHistoryPanel workspace={workspace as never} />);

    await waitFor(() => {
      expect(screen.getByText("commit-0")).toBeTruthy();
    });

    const renderedRows = document.querySelectorAll(".git-history-commit-row");
    expect(renderedRows.length).toBeLessThan(300);
  });
});
