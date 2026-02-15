// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useGitPanelController } from "./useGitPanelController";

const useGitDiffsMock = vi.fn();
const useGitStatusMock = vi.fn();
const useGitLogMock = vi.fn();
const useGitCommitDiffsMock = vi.fn();

vi.mock("../../git/hooks/useGitDiffs", () => ({
  useGitDiffs: (...args: unknown[]) => useGitDiffsMock(...args),
}));

vi.mock("../../git/hooks/useGitStatus", () => ({
  useGitStatus: (...args: unknown[]) => useGitStatusMock(...args),
}));

vi.mock("../../git/hooks/useGitLog", () => ({
  useGitLog: (...args: unknown[]) => useGitLogMock(...args),
}));

vi.mock("../../git/hooks/useGitCommitDiffs", () => ({
  useGitCommitDiffs: (...args: unknown[]) => useGitCommitDiffsMock(...args),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodeMoss",
  path: "/tmp/codemoss",
  connected: true,
  settings: { sidebarCollapsed: false },
};

function makeProps(overrides?: Partial<Parameters<typeof useGitPanelController>[0]>) {
  return {
    activeWorkspace: workspace,
    gitDiffPreloadEnabled: false,
    isCompact: false,
    isTablet: false,
    activeTab: "codex" as const,
    tabletTab: "codex" as const,
    setActiveTab: vi.fn(),
    prDiffs: [],
    prDiffsLoading: false,
    prDiffsError: null,
    ...overrides,
  };
}

function getLastEnabledArg() {
  const { calls } = useGitDiffsMock.mock;
  if (calls.length === 0) {
    return undefined;
  }
  return calls[calls.length - 1]?.[2];
}

beforeEach(() => {
  useGitStatusMock.mockReturnValue({
    status: {
      branchName: "main",
      files: [],
      stagedFiles: [],
      unstagedFiles: [],
      totalAdditions: 0,
      totalDeletions: 0,
    },
    refresh: vi.fn(),
  });
  useGitDiffsMock.mockReturnValue({
    diffs: [],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  });
  useGitLogMock.mockReturnValue({
    entries: [],
    total: 0,
    ahead: 0,
    behind: 0,
    aheadEntries: [],
    behindEntries: [],
    upstream: null,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  });
  useGitCommitDiffsMock.mockReturnValue({
    diffs: [],
    isLoading: false,
    error: null,
  });
  useGitDiffsMock.mockClear();
});

describe("useGitPanelController preload behavior", () => {
  it("does not preload diffs when disabled and panel is hidden", () => {
    const { result } = renderHook(() => useGitPanelController(makeProps()));

    const initialEnabled = getLastEnabledArg();
    expect(initialEnabled).toBe(true);

    act(() => {
      result.current.setGitPanelMode("issues");
    });

    const lastEnabled = getLastEnabledArg();
    expect(lastEnabled).toBe(false);
  });

  it("loads diffs when the panel becomes visible even if preload is disabled", () => {
    const { result } = renderHook(() => useGitPanelController(makeProps()));

    act(() => {
      result.current.setGitPanelMode("issues");
    });

    const hiddenEnabled = getLastEnabledArg();
    expect(hiddenEnabled).toBe(false);

    act(() => {
      result.current.setGitPanelMode("diff");
    });

    const visibleEnabled = getLastEnabledArg();
    expect(visibleEnabled).toBe(true);
  });
});

describe("useGitPanelController editor tabs", () => {
  it("opens multiple files as tabs instead of replacing current file", () => {
    const { result } = renderHook(() => useGitPanelController(makeProps()));

    act(() => {
      result.current.handleOpenFile("src/App.tsx");
      result.current.handleOpenFile("src/main.tsx");
    });

    expect(result.current.openFileTabs).toEqual(["src/App.tsx", "src/main.tsx"]);
    expect(result.current.activeEditorFilePath).toBe("src/main.tsx");
    expect(result.current.centerMode).toBe("editor");
  });

  it("re-activates existing tab without creating duplicates", () => {
    const { result } = renderHook(() => useGitPanelController(makeProps()));

    act(() => {
      result.current.handleOpenFile("src/App.tsx");
      result.current.handleOpenFile("src/main.tsx");
      result.current.handleOpenFile("src/App.tsx");
    });

    expect(result.current.openFileTabs).toEqual(["src/App.tsx", "src/main.tsx"]);
    expect(result.current.activeEditorFilePath).toBe("src/App.tsx");
  });

  it("closes active tab and falls back to adjacent tab", () => {
    const { result } = renderHook(() => useGitPanelController(makeProps()));

    act(() => {
      result.current.handleOpenFile("src/App.tsx");
      result.current.handleOpenFile("src/main.tsx");
      result.current.handleOpenFile("src/types.ts");
    });

    act(() => {
      result.current.handleCloseFileTab("src/main.tsx");
    });

    expect(result.current.openFileTabs).toEqual(["src/App.tsx", "src/types.ts"]);
    expect(result.current.activeEditorFilePath).toBe("src/types.ts");
  });

  it("returns to chat mode after closing the last tab", () => {
    const { result } = renderHook(() => useGitPanelController(makeProps()));

    act(() => {
      result.current.handleOpenFile("src/App.tsx");
    });

    act(() => {
      result.current.handleCloseFileTab("src/App.tsx");
    });

    expect(result.current.openFileTabs).toEqual([]);
    expect(result.current.activeEditorFilePath).toBeNull();
    expect(result.current.centerMode).toBe("chat");
  });
});
