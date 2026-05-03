// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProjectMemory } from "./useProjectMemory";
import { projectMemoryFacade } from "../services/projectMemoryFacade";

vi.mock("../services/projectMemoryFacade", () => ({
  projectMemoryFacade: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockItem = {
  id: "m-1",
  workspaceId: "ws-1",
  kind: "note",
  title: "title",
  summary: "summary",
  detail: "detail",
  cleanText: "detail",
  tags: [],
  importance: "low",
  source: "manual",
  fingerprint: "fp",
  createdAt: 1,
  updatedAt: 1,
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useProjectMemory", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads settings and list with filters", async () => {
    const getSettings = vi.mocked(projectMemoryFacade.getSettings);
    const list = vi.mocked(projectMemoryFacade.list);
    getSettings.mockResolvedValue({
      autoEnabled: true,
      captureMode: "balanced",
      dedupeEnabled: true,
      desensitizeEnabled: true,
      workspaceOverrides: {},
    });
    list.mockResolvedValue({ items: [mockItem], total: 1 });

    const { result } = renderHook(() => useProjectMemory({ workspaceId: "ws-1" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(getSettings).toHaveBeenCalled();
    expect(list).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      query: "",
      kind: null,
      importance: null,
      tag: null,
      page: 0,
      pageSize: 50,
    });
    expect(result.current.items).toHaveLength(1);
  });

  it("resets page when filter changes", async () => {
    const getSettings = vi.mocked(projectMemoryFacade.getSettings);
    const list = vi.mocked(projectMemoryFacade.list);
    getSettings.mockResolvedValue({
      autoEnabled: true,
      captureMode: "balanced",
      dedupeEnabled: true,
      desensitizeEnabled: true,
      workspaceOverrides: {},
    });
    list.mockResolvedValue({ items: [mockItem], total: 1 });

    const { result } = renderHook(() => useProjectMemory({ workspaceId: "ws-1" }));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.setPage(2);
    });
    expect(result.current.page).toBe(2);

    act(() => {
      result.current.setImportance("high");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.page).toBe(0);
  });

  it("creates and deletes item in local state", async () => {
    const getSettings = vi.mocked(projectMemoryFacade.getSettings);
    const list = vi.mocked(projectMemoryFacade.list);
    const create = vi.mocked(projectMemoryFacade.create);
    const remove = vi.mocked(projectMemoryFacade.delete);
    getSettings.mockResolvedValue({
      autoEnabled: true,
      captureMode: "balanced",
      dedupeEnabled: true,
      desensitizeEnabled: true,
      workspaceOverrides: {},
    });
    list.mockResolvedValue({ items: [], total: 0 });
    create.mockResolvedValue(mockItem);
    remove.mockResolvedValue();

    const { result } = renderHook(() => useProjectMemory({ workspaceId: "ws-1" }));

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.createMemory({ detail: "detail" });
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.total).toBe(1);

    await act(async () => {
      await result.current.deleteMemory("m-1");
    });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.total).toBe(0);
    expect(remove).toHaveBeenCalledWith("m-1", "ws-1");
  });

  it("hydrates a preferred memory into the current list when it is missing from the active page", async () => {
    const getSettings = vi.mocked(projectMemoryFacade.getSettings);
    const list = vi.mocked(projectMemoryFacade.list);
    const get = vi.mocked(projectMemoryFacade.get);
    getSettings.mockResolvedValue({
      autoEnabled: true,
      captureMode: "balanced",
      dedupeEnabled: true,
      desensitizeEnabled: true,
      workspaceOverrides: {},
    });
    list.mockResolvedValue({
      items: [{ ...mockItem, id: "m-2", title: "other" }],
      total: 2,
    });
    get.mockResolvedValue({ ...mockItem, id: "m-focus", title: "focused memory" });

    const { result } = renderHook(() =>
      useProjectMemory({
        workspaceId: "ws-1",
        preferredSelectedId: "m-focus",
        preferredSelectionKey: 1,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(get).toHaveBeenCalledWith("m-focus", "ws-1");
    expect(result.current.selectedId).toBe("m-focus");
    expect(result.current.items[0]?.id).toBe("m-focus");
  });

  it("ignores stale list responses after switching workspaces", async () => {
    const getSettings = vi.mocked(projectMemoryFacade.getSettings);
    const list = vi.mocked(projectMemoryFacade.list);
    getSettings.mockResolvedValue({
      autoEnabled: true,
      captureMode: "balanced",
      dedupeEnabled: true,
      desensitizeEnabled: true,
      workspaceOverrides: {},
    });
    const ws1Deferred = createDeferred<{ items: typeof mockItem[]; total: number }>();
    const ws2Deferred = createDeferred<{ items: typeof mockItem[]; total: number }>();
    list.mockImplementation(({ workspaceId }) => {
      if (workspaceId === "ws-1") {
        return ws1Deferred.promise;
      }
      return ws2Deferred.promise;
    });

    const { result, rerender } = renderHook(
      ({ workspaceId }) => useProjectMemory({ workspaceId }),
      {
        initialProps: { workspaceId: "ws-1" as string | null },
      },
    );

    rerender({ workspaceId: "ws-2" });

    await act(async () => {
      ws2Deferred.resolve({
        items: [{ ...mockItem, id: "ws2-item", workspaceId: "ws-2", title: "ws2" }],
        total: 1,
      });
      await Promise.resolve();
    });

    await act(async () => {
      ws1Deferred.resolve({
        items: [{ ...mockItem, id: "ws1-item", workspaceId: "ws-1", title: "ws1" }],
        total: 1,
      });
      await Promise.resolve();
    });

    expect(result.current.items.map((item) => item.id)).toEqual(["ws2-item"]);
    expect(result.current.selectedId).toBe("ws2-item");
  });
});
