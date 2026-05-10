// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDictationModel } from "./useDictationModel";
import { getDictationModelStatus } from "../../../services/tauri";

const unsubscribeMock = vi.hoisted(() => vi.fn());

vi.mock("../../../services/tauri", () => ({
  cancelDictationDownload: vi.fn(),
  downloadDictationModel: vi.fn(),
  getDictationModelStatus: vi.fn(),
  removeDictationModel: vi.fn(),
}));

vi.mock("../../../services/events", () => ({
  subscribeDictationDownload: vi.fn(() => unsubscribeMock),
}));

describe("useDictationModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    unsubscribeMock.mockReset();
    vi.mocked(getDictationModelStatus).mockResolvedValue({
      modelId: "default",
      state: "ready",
      progress: null,
      error: null,
      path: null,
    });
  });

  it("does not query model status on mount when disabled", async () => {
    renderHook(() => useDictationModel("default", { enabled: false }));

    await waitFor(() => {
      expect(unsubscribeMock).not.toHaveBeenCalled();
    });
    expect(getDictationModelStatus).not.toHaveBeenCalled();
  });

  it("queries model status on mount when enabled", async () => {
    const { result } = renderHook(() => useDictationModel("default", { enabled: true }));

    await waitFor(() => {
      expect(result.current.status?.state).toBe("ready");
    });
    expect(getDictationModelStatus).toHaveBeenCalledWith("default");
  });

  it("keeps explicit refresh available when disabled", async () => {
    const { result } = renderHook(() => useDictationModel("default", { enabled: false }));

    await act(async () => {
      await result.current.refresh();
    });

    expect(getDictationModelStatus).toHaveBeenCalledWith("default");
  });
});
