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
});
