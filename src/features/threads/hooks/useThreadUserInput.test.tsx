// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RequestUserInputRequest } from "../../../types";
import { respondToUserInputRequest } from "../../../services/tauri";
import { useThreadUserInput } from "./useThreadUserInput";

vi.mock("../../../services/tauri", () => ({
  respondToUserInputRequest: vi.fn(),
}));

const request: RequestUserInputRequest = {
  workspace_id: "ws-1",
  request_id: "req-1",
  params: {
    thread_id: "thread-1",
    turn_id: "turn-1",
    item_id: "item-1",
    questions: [],
  },
};

describe("useThreadUserInput", () => {
  it("removes request only after successful submit", async () => {
    const dispatch = vi.fn();
    vi.mocked(respondToUserInputRequest).mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useThreadUserInput({ dispatch }));

    await act(async () => {
      await result.current.handleUserInputSubmit(request, { answers: {} });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "removeUserInputRequest",
      requestId: "req-1",
      workspaceId: "ws-1",
    });
  });

  it("keeps request when submit fails", async () => {
    const dispatch = vi.fn();
    vi.mocked(respondToUserInputRequest).mockRejectedValue(new Error("failed"));

    const { result } = renderHook(() => useThreadUserInput({ dispatch }));

    await expect(
      result.current.handleUserInputSubmit(request, { answers: {} }),
    ).rejects.toThrow("failed");

    expect(dispatch).not.toHaveBeenCalled();
  });
});
