// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTaskRunStore } from "./useTaskRunStore";
import { loadTaskRunStore } from "../utils/taskRunStorage";
import type { TaskRunStoreData } from "../types";

vi.mock("../utils/taskRunStorage", () => ({
  loadTaskRunStore: vi.fn(),
}));

const mockedLoadTaskRunStore = vi.mocked(loadTaskRunStore);

function makeStore(runId: string): TaskRunStoreData {
  return {
    version: 1,
    runs: [
      {
        runId,
        task: {
          taskId: "task-1",
          source: "kanban",
          workspaceId: "/repo",
          title: "Build release",
        },
        engine: "codex",
        status: "running",
        trigger: "manual",
        linkedThreadId: "thread-1",
        artifacts: [],
        availableRecoveryActions: ["open_conversation"],
        updatedAt: 20,
      },
    ],
  };
}

describe("useTaskRunStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedLoadTaskRunStore.mockReset();
  });

  it("loads task runs and refreshes them with cleanup", () => {
    mockedLoadTaskRunStore
      .mockReturnValueOnce(makeStore("run-1"))
      .mockReturnValueOnce(makeStore("run-1"))
      .mockReturnValueOnce(makeStore("run-2"));

    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const { result, unmount } = renderHook(() =>
      useTaskRunStore({ refreshIntervalMs: 100 }),
    );

    expect(result.current.runs[0]?.runId).toBe("run-1");

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.runs[0]?.runId).toBe("run-2");

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
