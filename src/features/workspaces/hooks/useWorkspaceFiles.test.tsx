// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { getWorkspaceFiles } from "../../../services/tauri";
import { useWorkspaceFiles } from "./useWorkspaceFiles";

vi.mock("../../../services/tauri", () => ({
  getWorkspaceFiles: vi.fn(),
}));

const workspaceA: WorkspaceInfo = {
  id: "workspace-a",
  name: "Workspace A",
  path: "/tmp/workspace-a",
  connected: true,
  settings: {
    sidebarCollapsed: false,
  },
};

const workspaceB: WorkspaceInfo = {
  id: "workspace-b",
  name: "Workspace B",
  path: "/tmp/workspace-b",
  connected: true,
  settings: {
    sidebarCollapsed: false,
  },
};

function flushAsyncWork() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("useWorkspaceFiles", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("retries the initial load once after a failure and recovers file state", async () => {
    const getWorkspaceFilesMock = vi.mocked(getWorkspaceFiles);
    getWorkspaceFilesMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        files: ["src/app.tsx"],
        directories: ["src"],
        gitignored_files: [],
        gitignored_directories: [],
      });

    const { result, unmount } = renderHook(() =>
      useWorkspaceFiles({
        activeWorkspace: workspaceA,
        pollingEnabled: false,
      }),
    );

    await flushAsyncWork();

    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(1);
    expect(result.current.files).toEqual([]);
    expect(result.current.loadError).toBe("network down");

    await act(async () => {
      vi.advanceTimersByTime(1_500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(2);
    expect(result.current.files).toEqual(["src/app.tsx"]);
    expect(result.current.directories).toEqual(["src"]);
    expect(result.current.loadError).toBeNull();

    unmount();
  });

  it("starts in a pending loading state for the first connected workspace snapshot", async () => {
    const firstSnapshot = createDeferred<{
      files: string[];
      directories: string[];
      gitignored_files: string[];
      gitignored_directories: string[];
    }>();
    const getWorkspaceFilesMock = vi.mocked(getWorkspaceFiles);
    getWorkspaceFilesMock.mockReturnValue(firstSnapshot.promise);

    const { result, unmount } = renderHook(() =>
      useWorkspaceFiles({
        activeWorkspace: workspaceA,
        pollingEnabled: false,
      }),
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.files).toEqual([]);
    expect(result.current.directories).toEqual([]);

    await act(async () => {
      firstSnapshot.resolve({
        files: ["src/app.tsx"],
        directories: ["src"],
        gitignored_files: [],
        gitignored_directories: [],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.files).toEqual(["src/app.tsx"]);
    expect(result.current.directories).toEqual(["src"]);
    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("cleans up a scheduled retry when the active workspace changes", async () => {
    const getWorkspaceFilesMock = vi.mocked(getWorkspaceFiles);
    getWorkspaceFilesMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        files: ["docs/readme.md"],
        directories: ["docs"],
        gitignored_files: [],
        gitignored_directories: [],
      });

    const { rerender, result, unmount } = renderHook(
      ({ activeWorkspace }: { activeWorkspace: WorkspaceInfo | null }) =>
        useWorkspaceFiles({
          activeWorkspace,
          pollingEnabled: false,
        }),
      {
        initialProps: { activeWorkspace: workspaceA },
      },
    );

    await flushAsyncWork();
    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(1);
    expect(result.current.loadError).toBe("network down");

    rerender({ activeWorkspace: workspaceB });
    await flushAsyncWork();

    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(2);
    expect(result.current.files).toEqual(["docs/readme.md"]);
    expect(result.current.loadError).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1_500);
      await Promise.resolve();
    });

    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("keeps a pending loading state before a disconnected workspace confirms its first snapshot", async () => {
    const disconnectedWorkspace: WorkspaceInfo = {
      ...workspaceA,
      connected: false,
    };
    const getWorkspaceFilesMock = vi.mocked(getWorkspaceFiles);

    const { result, unmount } = renderHook(() =>
      useWorkspaceFiles({
        activeWorkspace: disconnectedWorkspace,
        pollingEnabled: false,
      }),
    );

    await flushAsyncWork();

    expect(getWorkspaceFilesMock).not.toHaveBeenCalled();
    expect(result.current.files).toEqual([]);
    expect(result.current.directories).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.loadError).toBeNull();

    unmount();
  });

  it("does not clear a loaded snapshot when the same workspace briefly disconnects", async () => {
    const getWorkspaceFilesMock = vi.mocked(getWorkspaceFiles);
    getWorkspaceFilesMock.mockResolvedValue({
      files: ["src/app.tsx"],
      directories: ["src"],
      gitignored_files: [],
      gitignored_directories: [],
    });

    const { rerender, result, unmount } = renderHook(
      ({ activeWorkspace }: { activeWorkspace: WorkspaceInfo | null }) =>
        useWorkspaceFiles({
          activeWorkspace,
          pollingEnabled: false,
        }),
      {
        initialProps: { activeWorkspace: workspaceA },
      },
    );

    await flushAsyncWork();
    expect(result.current.files).toEqual(["src/app.tsx"]);
    expect(result.current.directories).toEqual(["src"]);
    expect(result.current.isLoading).toBe(false);

    rerender({ activeWorkspace: { ...workspaceA, connected: false } });
    await flushAsyncWork();

    expect(result.current.files).toEqual(["src/app.tsx"]);
    expect(result.current.directories).toEqual(["src"]);
    expect(result.current.isLoading).toBe(false);
    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("ignores stale responses from the previous workspace after a fast switch", async () => {
    const workspaceAResponse = createDeferred<{
      files: string[];
      directories: string[];
      gitignored_files: string[];
      gitignored_directories: string[];
    }>();
    const workspaceBResponse = createDeferred<{
      files: string[];
      directories: string[];
      gitignored_files: string[];
      gitignored_directories: string[];
    }>();
    const getWorkspaceFilesMock = vi.mocked(getWorkspaceFiles);
    getWorkspaceFilesMock.mockImplementation((requestedWorkspaceId) => {
      if (requestedWorkspaceId === workspaceA.id) {
        return workspaceAResponse.promise;
      }
      if (requestedWorkspaceId === workspaceB.id) {
        return workspaceBResponse.promise;
      }
      return Promise.reject(new Error(`unexpected workspace: ${requestedWorkspaceId}`));
    });

    const { rerender, result, unmount } = renderHook(
      ({ activeWorkspace }: { activeWorkspace: WorkspaceInfo | null }) =>
        useWorkspaceFiles({
          activeWorkspace,
          pollingEnabled: false,
        }),
      {
        initialProps: { activeWorkspace: workspaceA },
      },
    );

    await flushAsyncWork();
    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(1);

    rerender({ activeWorkspace: workspaceB });
    await flushAsyncWork();
    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      workspaceBResponse.resolve({
        files: ["docs/guide.md"],
        directories: ["docs"],
        gitignored_files: [],
        gitignored_directories: [],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.files).toEqual(["docs/guide.md"]);
    expect(result.current.directories).toEqual(["docs"]);
    expect(result.current.loadError).toBeNull();

    await act(async () => {
      workspaceAResponse.resolve({
        files: ["src/app.tsx"],
        directories: ["src"],
        gitignored_files: [],
        gitignored_directories: [],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.files).toEqual(["docs/guide.md"]);
    expect(result.current.directories).toEqual(["docs"]);
    expect(result.current.loadError).toBeNull();

    unmount();
  });
});
