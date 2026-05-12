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

  it("exposes a stable focus target for composer request pointers", () => {
    const { container } = render(
      <RequestUserInputMessage
        requests={[baseRequest]}
        activeThreadId="thread-1"
        activeWorkspaceId="ws-1"
        onSubmit={vi.fn()}
      />,
    );

    const card = container.querySelector(".request-user-input-card");
    expect(card?.getAttribute("tabindex")).toBe("-1");
    expect(card?.getAttribute("data-request-user-input-id")).toBe("req-1");
    expect(card?.getAttribute("data-workspace-id")).toBe("ws-1");
    expect(card?.getAttribute("data-thread-id")).toBe("thread-1");
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

  it("dismisses active request without submitting", () => {
    const onSubmit = vi.fn();
    const onDismiss = vi.fn();
    render(
      <RequestUserInputMessage
        requests={[baseRequest]}
        activeThreadId="thread-1"
        activeWorkspaceId="ws-1"
        onSubmit={onSubmit}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close this input request card" }));

    expect(onDismiss).toHaveBeenCalledWith(baseRequest);
    expect(onSubmit).not.toHaveBeenCalled();
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

  it("keeps FIFO order for same-thread requests after submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const requestA: RequestUserInputRequest = {
      ...baseRequest,
      request_id: "req-a",
      params: {
        ...baseRequest.params,
        questions: [
          {
            id: "q-a",
            header: "First",
            question: "First question",
          },
        ],
      },
    };
    const requestB: RequestUserInputRequest = {
      ...baseRequest,
      request_id: "req-b",
      params: {
        ...baseRequest.params,
        questions: [
          {
            id: "q-b",
            header: "Second",
            question: "Second question",
          },
        ],
      },
    };

    const { rerender } = render(
      <RequestUserInputMessage
        requests={[requestA, requestB]}
        activeThreadId="thread-1"
        activeWorkspaceId="ws-1"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText("First question")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "approval.submit" }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(requestA, { answers: { "q-a": { answers: [] } } });
    });

    rerender(
      <RequestUserInputMessage
        requests={[requestB]}
        activeThreadId="thread-1"
        activeWorkspaceId="ws-1"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText("Second question")).toBeTruthy();
  });

  it("allows deselecting a selected option by clicking it again", () => {
    const request: RequestUserInputRequest = {
      ...baseRequest,
      params: {
        ...baseRequest.params,
        questions: [
          {
            id: "q-opt",
            header: "Age",
            question: "How old are you?",
            options: [
              { label: "18-25", description: "" },
              { label: "26-35", description: "" },
            ],
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

    const option = screen.getByRole("button", { name: "18-25" });
    fireEvent.click(option);
    expect(option.classList.contains("is-selected")).toBe(true);

    fireEvent.click(option);
    expect(option.classList.contains("is-selected")).toBe(false);
  });

  it("keeps selected option when notes are entered", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const request: RequestUserInputRequest = {
      ...baseRequest,
      params: {
        ...baseRequest.params,
        questions: [
          {
            id: "q-opt",
            header: "Age",
            question: "How old are you?",
            options: [
              { label: "18-25", description: "" },
              { label: "26-35", description: "" },
            ],
          },
        ],
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

    const option = screen.getByRole("button", { name: "18-25" });
    fireEvent.click(option);
    expect(option.classList.contains("is-selected")).toBe(true);

    const textarea = screen.getByPlaceholderText("approval.addNotesOptional");
    fireEvent.change(textarea, { target: { value: "再说吧" } });
    expect(option.classList.contains("is-selected")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "approval.submit" }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(request, {
        answers: {
          "q-opt": {
            answers: ["18-25", "user_note: 再说吧"],
          },
        },
      });
    });
  });

  it("supports selecting multiple options when question is multiSelect", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const request: RequestUserInputRequest = {
      ...baseRequest,
      params: {
        ...baseRequest.params,
        questions: [
          {
            id: "q-opt",
            header: "Focus",
            question: "Choose multiple",
            multiSelect: true,
            options: [
              { label: "性能优化", description: "" },
              { label: "代码质量", description: "" },
              { label: "安全性", description: "" },
            ],
          },
        ],
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

    const optionA = screen.getByRole("button", { name: "性能优化" });
    const optionB = screen.getByRole("button", { name: "代码质量" });
    fireEvent.click(optionA);
    fireEvent.click(optionB);

    expect(optionA.classList.contains("is-selected")).toBe(true);
    expect(optionB.classList.contains("is-selected")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "approval.submit" }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(request, {
        answers: {
          "q-opt": {
            answers: ["性能优化", "代码质量"],
          },
        },
      });
    });
  });
});
