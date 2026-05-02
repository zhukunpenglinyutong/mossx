// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RequestUserInputRequest, RequestUserInputResponse } from "../../../types";
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
    questions: [
      {
        id: "age",
        header: "年龄确认",
        question: "你今年多大了？",
        options: [
          { label: "18-25岁 (Recommended)", description: "用于快速给出青年阶段建议" },
          { label: "26-35岁", description: "用于快速给出职业发展阶段建议" },
        ],
      },
    ],
  },
};

describe("useThreadUserInput", () => {
  it("adds a visible user history message and removes request after successful submit", async () => {
    const dispatch = vi.fn();
    vi.mocked(respondToUserInputRequest).mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useThreadUserInput({ dispatch }));

    await act(async () => {
      await result.current.handleUserInputSubmit(request, {
        answers: {
          age: {
            answers: ["18-25岁 (Recommended)", "user_note: 我是31岁"],
          },
        },
      });
    });

    expect(respondToUserInputRequest).toHaveBeenCalledWith(
      "ws-1",
      "req-1",
      {
        age: {
          answers: ["18-25岁 (Recommended)", "user_note: 我是31岁"],
        },
      },
      {
        threadId: "thread-1",
        turnId: "turn-1",
      },
    );

    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: true,
      timestamp: expect.any(Number),
    });

    expect(dispatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "upsertItem",
        workspaceId: "ws-1",
        threadId: "thread-1",
        item: expect.objectContaining({
          id: "user-input-answer-req-1",
          kind: "tool",
          toolType: "requestUserInputSubmitted",
          title: "18-25岁 (Recommended)",
          status: "completed",
        }),
        hasCustomName: true,
      }),
    );
    const upsertAction = dispatch.mock.calls[1]?.[0];
    expect(typeof upsertAction.item.detail).toBe("string");
    const payload = JSON.parse(upsertAction.item.detail);
    expect(payload.schema).toBe("requestUserInputSubmitted/v1");
    expect(payload.questions).toEqual([
      {
        id: "age",
        header: "年龄确认",
        question: "你今年多大了？",
        options: [
          { label: "18-25岁 (Recommended)", description: "用于快速给出青年阶段建议" },
          { label: "26-35岁", description: "用于快速给出职业发展阶段建议" },
        ],
        selectedOptions: ["18-25岁 (Recommended)"],
        note: "我是31岁",
      },
    ]);
    expect(upsertAction.item.output).toContain("[用户输入已提交]");
    expect(dispatch).toHaveBeenNthCalledWith(3, {
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

    expect(respondToUserInputRequest).toHaveBeenCalledWith(
      "ws-1",
      "req-1",
      {},
      {
        threadId: "thread-1",
        turnId: "turn-1",
      },
    );

    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: true,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: false,
      timestamp: expect.any(Number),
    });
  });

  it("settles a stale timeout request when cancel reaches an already timed out Claude prompt", async () => {
    const dispatch = vi.fn();
    vi.mocked(respondToUserInputRequest).mockRejectedValue(
      new Error("workspace not connected"),
    );

    const { result } = renderHook(() => useThreadUserInput({ dispatch }));

    await act(async () => {
      await result.current.handleUserInputSubmit(request, { answers: {} });
    });

    expect(respondToUserInputRequest).toHaveBeenCalledWith(
      "ws-1",
      "req-1",
      {},
      {
        threadId: "thread-1",
        turnId: "turn-1",
      },
    );
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: true,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: false,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenNthCalledWith(3, {
      type: "removeUserInputRequest",
      requestId: "req-1",
      workspaceId: "ws-1",
    });
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "upsertItem" }),
    );
  });

  it("settles malformed empty stale responses without throwing from the classifier", async () => {
    const dispatch = vi.fn();
    vi.mocked(respondToUserInputRequest).mockRejectedValue(
      new Error("workspace not connected"),
    );

    const { result } = renderHook(() => useThreadUserInput({ dispatch }));

    await act(async () => {
      await result.current.handleUserInputSubmit(
        request,
        { answers: { age: {} } } as unknown as RequestUserInputResponse,
      );
    });

    expect(dispatch).toHaveBeenNthCalledWith(3, {
      type: "removeUserInputRequest",
      requestId: "req-1",
      workspaceId: "ws-1",
    });
  });

  it("keeps runtime payload stable but remaps Claude continuity state updates", async () => {
    const dispatch = vi.fn();
    vi.mocked(respondToUserInputRequest).mockResolvedValue(undefined as never);

    const { result } = renderHook(() =>
      useThreadUserInput({
        dispatch,
        resolveClaudeContinuationThreadId: () => "claude:canonical",
      }),
    );

    await act(async () => {
      await result.current.handleUserInputSubmit(
        {
          ...request,
          params: {
            ...request.params,
            thread_id: "claude:stale",
          },
        },
        { answers: {} },
      );
    });

    expect(respondToUserInputRequest).toHaveBeenCalledWith(
      "ws-1",
      "req-1",
      {},
      {
        threadId: "claude:stale",
        turnId: "turn-1",
      },
    );
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "markProcessing",
      threadId: "claude:canonical",
      isProcessing: true,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "upsertItem",
        workspaceId: "ws-1",
        threadId: "claude:canonical",
      }),
    );
  });
});
