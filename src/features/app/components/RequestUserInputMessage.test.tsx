// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestUserInputRequest } from "../../../types";
import { RequestUserInputMessage } from "./RequestUserInputMessage";

const baseRequest: RequestUserInputRequest = {
  workspace_id: "ws-1",
  request_id: "req-1",
  params: {
    thread_id: "thread-1",
    turn_id: "turn-1",
    item_id: "item-1",
    questions: [
      {
        id: "q-1",
        header: "Question",
        question: "Provide input",
      },
    ],
  },
};

describe("RequestUserInputMessage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders secret questions as password input with visibility toggle", () => {
    const request: RequestUserInputRequest = {
      ...baseRequest,
      params: {
        ...baseRequest.params,
        questions: [
          {
            id: "token",
            header: "Secret",
            question: "Paste token",
            isSecret: true,
          },
        ],
      },
    };

    render(
      <RequestUserInputMessage
        requests={[request]}
        activeThreadId="thread-1"
        activeWorkspaceId="ws-1"
        onSubmit={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("approval.typeAnswerOptional");
    expect(input.getAttribute("type")).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(input.getAttribute("type")).toBe("text");
  });

  it("shows submit error and keeps request on failure", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("fail"));
    render(
      <RequestUserInputMessage
        requests={[baseRequest]}
        activeThreadId="thread-1"
        activeWorkspaceId="ws-1"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "approval.submit" }));

    await waitFor(() => {
      expect(screen.getByText("Submit failed. Please retry.")).toBeTruthy();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "approval.submit" })).toBeTruthy();
  });

  it("preserves draft content when switching threads", () => {
    const threadARequest = baseRequest;
    const threadBRequest: RequestUserInputRequest = {
      ...baseRequest,
      request_id: "req-2",
      params: {
        ...baseRequest.params,
        thread_id: "thread-2",
        turn_id: "turn-2",
      },
    };

    const { rerender } = render(
      <RequestUserInputMessage
        requests={[threadARequest, threadBRequest]}
        activeThreadId="thread-1"
        activeWorkspaceId="ws-1"
        onSubmit={vi.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText("approval.typeAnswerOptional");
    fireEvent.change(textarea, { target: { value: "thread-a-answer" } });

    rerender(
      <RequestUserInputMessage
        requests={[threadARequest, threadBRequest]}
        activeThreadId="thread-2"
        activeWorkspaceId="ws-1"
        onSubmit={vi.fn()}
      />,
    );

    rerender(
      <RequestUserInputMessage
        requests={[threadARequest, threadBRequest]}
        activeThreadId="thread-1"
        activeWorkspaceId="ws-1"
        onSubmit={vi.fn()}
      />,
    );

    expect(
      (screen.getByPlaceholderText("approval.typeAnswerOptional") as HTMLTextAreaElement)
        .value,
    ).toBe("thread-a-answer");
  });

  it("submits empty answers when no questions are provided", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const request: RequestUserInputRequest = {
      ...baseRequest,
      params: {
        ...baseRequest.params,
        questions: [],
      },
    };

    render(
      <RequestUserInputMessage
        requests={[request]}
        activeThreadId="thread-1"
        activeWorkspaceId="ws-1"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "approval.submit" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(request, { answers: {} });
    });
  });
});
