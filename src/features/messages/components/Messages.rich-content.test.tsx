// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalRequest, ConversationItem } from "../../../types";
import { hydrateClaudeDeferredImage } from "../../../services/tauri";
import { Messages } from "./Messages";

vi.mock("../../../services/tauri", () => ({
  hydrateClaudeDeferredImage: vi.fn(),
}));

describe("Messages rich content", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.mocked(hydrateClaudeDeferredImage).mockReset();
    window.localStorage.setItem("ccgui.claude.hideReasoningModule", "0");
    window.localStorage.removeItem("ccgui.messages.live.autoFollow");
    window.localStorage.removeItem("ccgui.messages.live.collapseMiddleSteps");
  });

  beforeAll(() => {
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
    if (!HTMLElement.prototype.scrollTo) {
      HTMLElement.prototype.scrollTo = vi.fn();
    }
  });

  it("renders image grid above message text and opens lightbox", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-1",
        kind: "message",
        role: "user",
        text: "Hello",
        images: ["data:image/png;base64,AAA"],
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const bubble = container.querySelector(".message-bubble");
    const grid = container.querySelector(".message-image-grid");
    const userText = container.querySelector(".user-collapsible-text-content");
    expect(bubble).toBeTruthy();
    expect(grid).toBeTruthy();
    expect(userText).toBeTruthy();
    if (grid && userText) {
      expect(bubble?.firstChild).toBe(grid);
    }
    const openButton = screen.getByRole("button", { name: "Open image 1" });
    fireEvent.click(openButton);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("renders deferred Claude image placeholder and hydrates it on click", async () => {
    const locator = {
      sessionId: "session-1",
      lineIndex: 2,
      blockIndex: 1,
      mediaType: "image/png",
    };
    vi.mocked(hydrateClaudeDeferredImage).mockResolvedValueOnce({
      src: "data:image/png;base64,BBBB",
      mediaType: "image/png",
      byteSize: 3,
      locator,
    });
    const items: ConversationItem[] = [
      {
        id: "msg-deferred-1",
        kind: "message",
        role: "user",
        text: "",
        deferredImages: [
          {
            workspacePath: "/tmp/workspace",
            mediaType: "image/png",
            estimatedByteSize: 700000,
            reason: "large-inline-image",
            locator,
          },
        ],
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getByText("Claude history image available on demand")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load image" }));
    await waitFor(() => {
      expect(hydrateClaudeDeferredImage).toHaveBeenCalledWith(
        "/tmp/workspace",
        locator,
      );
    });
    const hydratedImage = container.querySelector(".message-deferred-image-preview img");
    expect(hydratedImage?.getAttribute("src")).toBe("data:image/png;base64,BBBB");
  });

  it("keeps deferred Claude image placeholder visible when hydration fails", async () => {
    vi.mocked(hydrateClaudeDeferredImage).mockRejectedValueOnce(
      new Error("locator stale"),
    );
    const items: ConversationItem[] = [
      {
        id: "msg-deferred-error",
        kind: "message",
        role: "user",
        text: "Context stays visible",
        deferredImages: [
          {
            workspacePath: "/tmp/workspace",
            mediaType: "image/png",
            estimatedByteSize: 700000,
            reason: "large-inline-image",
            locator: {
              sessionId: "session-1",
              lineIndex: 2,
              blockIndex: 1,
              mediaType: "image/png",
            },
          },
        ],
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load image" }));
    expect(await screen.findByText("locator stale")).toBeTruthy();
    expect(screen.getAllByText("Context stays visible").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Load image" })).toBeTruthy();
  });

  it("preserves newlines when images are attached", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-2",
        kind: "message",
        role: "user",
        text: "Line 1\n\n- item 1\n- item 2",
        images: ["data:image/png;base64,AAA"],
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const userText = container.querySelector(".user-collapsible-text-content");
    expect(userText).toBeTruthy();
    expect(userText?.textContent ?? "").toContain("Line 1");
    expect(userText?.textContent ?? "").toContain("item 1");
    expect(userText?.textContent ?? "").toContain("item 2");
  });

  it("renders code annotations outside the user message bubble and collapsed by default", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-code-annotation",
        kind: "message",
        role: "user",
        text:
          "看看\n\n@file `src/main/java/com/example/demo/security/JwtAuthenticationDetails.java#L21-L25`\n标注：这是啥",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const bubble = container.querySelector(".message-bubble");
    const annotationContext = container.querySelector(".message-code-annotation-context");
    const userText = container.querySelector(".user-collapsible-text-content")?.textContent ?? "";

    expect(bubble).toBeTruthy();
    expect(annotationContext).toBeTruthy();
    expect(bubble?.contains(annotationContext)).toBe(false);
    expect(userText.trim()).toBe("看看");
    expect(bubble?.textContent ?? "").not.toContain("JwtAuthenticationDetails.java");
    expect(annotationContext?.classList.contains("is-collapsed")).toBe(true);
    expect(annotationContext?.textContent ?? "").not.toContain("JwtAuthenticationDetails.java");
    expect(annotationContext?.textContent ?? "").not.toContain("L21-L25");

    fireEvent.click(screen.getByRole("button", { name: "messages.expandCodeAnnotations" }));

    expect(annotationContext?.classList.contains("is-expanded")).toBe(true);
    expect(annotationContext?.textContent ?? "").toContain("JwtAuthenticationDetails.java");
    expect(annotationContext?.textContent ?? "").toContain("L21-L25");
    expect(annotationContext?.textContent ?? "").toContain("这是啥");
  });

  it("keeps literal [image] text when images are attached", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-3",
        kind: "message",
        role: "user",
        text: "Literal [image] token",
        images: ["data:image/png;base64,AAA"],
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const userText = container.querySelector(".user-collapsible-text-content");
    expect(userText?.textContent ?? "").toContain("Literal [image] token");
  });

  it("renders generated image processing card inline", () => {
    const items: ConversationItem[] = [
      {
        id: "user-generate-1",
        kind: "message",
        role: "user",
        text: "给我生成一张图",
      },
      {
        id: "generated-image-processing-1",
        kind: "generatedImage",
        status: "processing",
        promptText: "主播写真，直播间氛围",
        anchorUserMessageId: "user-generate-1",
        images: [],
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".message-generated-image-card")).toBeTruthy();
    expect(screen.getByText("Making")).toBeTruthy();
    expect(screen.getByText("主播写真，直播间氛围")).toBeTruthy();
  });

  it("renders generated image preview after completion", () => {
    const items: ConversationItem[] = [
      {
        id: "generated-image-completed-1",
        kind: "generatedImage",
        status: "completed",
        promptText: "直播间写真",
        images: [
          {
            src: "data:image/png;base64,AAAA",
          },
        ],
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open generated image 1" })).toBeTruthy();
  });

  it("shows degraded generated image fallback when preview is unavailable", () => {
    const items: ConversationItem[] = [
      {
        id: "generated-image-degraded-1",
        kind: "generatedImage",
        status: "degraded",
        promptText: "主播自拍风",
        fallbackText: "/Users/demo/.codex/generated_images/ig_missing.png",
        images: [],
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(
      screen.getByText("/Users/demo/.codex/generated_images/ig_missing.png"),
    ).toBeTruthy();
  });

  it("renders task-notification assistant output as an independent agent card", () => {
    const items: ConversationItem[] = [
      {
        id: "agent-message-1",
        kind: "message",
        role: "assistant",
        text: `<task-notification>
<task-id>ae242051e14492047</task-id>
<tool-use-id>call_991b9a3c32bb4603a36077d3</tool-use-id>
<output-file>/private/tmp/tasks/ae242051e14492047.output</output-file>
<status>completed</status>
<summary>Agent "Spring生态治理与技术选型评估" completed</summary>
<result>湘宁大兄弟你好！

让我系统地读取项目的核心文件。`,
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".message-agent-task-card")).toBeTruthy();
    expect(screen.getByText("Spring生态治理与技术选型评估")).toBeTruthy();
    expect(screen.getByText("completed")).toBeTruthy();
    expect(container.textContent ?? "").not.toContain("<task-notification>");
    expect(container.textContent ?? "").toContain("让我系统地读取项目的核心文件。");
  });

  it("shows only the current thread approval when sibling thread ids differ", () => {
    const items: ConversationItem[] = [
      {
        id: "approval-user-1",
        kind: "message",
        role: "user",
        text: "create files",
      },
      {
        id: "req-1",
        kind: "tool",
        toolType: "fileChange",
        title: "Pending file approval",
        detail: "{\"file_path\":\"/tmp/a.txt\"}",
        status: "pending",
      },
    ];
    const approvals: ApprovalRequest[] = [
      {
        workspace_id: "ws-1",
        request_id: "req-1",
        method: "item/fileChange/requestApproval",
        params: {
          threadId: "claude:thread-1",
          toolName: "Write",
          input: { file_path: "/tmp/a.txt" },
        },
      },
      {
        workspace_id: "ws-1",
        request_id: "req-2",
        method: "item/fileChange/requestApproval",
        params: {
          threadId: "claude:thread-2",
          toolName: "Write",
          input: { file_path: "/tmp/b.txt" },
        },
      },
    ];

    render(
      <Messages
        items={items}
        approvals={approvals}
        workspaces={[{
          id: "ws-1",
          name: "workspace",
          path: "/tmp/workspace",
          connected: true,
          settings: { sidebarCollapsed: false },
        }]}
        onApprovalDecision={vi.fn()}
        onApprovalBatchAccept={vi.fn()}
        threadId="claude:thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.queryByRole("button", { name: "approval.approveTurnBatch" })).toBeNull();
    expect(screen.getAllByText("/tmp/a.txt").length).toBeGreaterThan(0);
    expect(screen.queryByText("/tmp/b.txt")).toBeNull();
  });

  it("keeps workspace fallback approvals visible when thread id is missing", () => {
    render(
      <Messages
        items={[]}
        approvals={[
          {
            workspace_id: "ws-1",
            request_id: "req-fallback-1",
            method: "item/fileChange/requestApproval",
            params: {
              toolName: "Write",
              input: { file_path: "/tmp/fallback.txt" },
            },
          },
        ]}
        workspaces={[{
          id: "ws-1",
          name: "workspace",
          path: "/tmp/workspace",
          connected: true,
          settings: { sidebarCollapsed: false },
        }]}
        onApprovalDecision={vi.fn()}
        threadId="claude:thread-2"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getByText("/tmp/fallback.txt")).toBeTruthy();
  });

  it("renders inline approval slot at the bottom of the message canvas", () => {
    const items: ConversationItem[] = [
      {
        id: "approval-bottom-user-1",
        kind: "message",
        role: "user",
        text: "update pom",
      },
    ];
    const approvals: ApprovalRequest[] = [
      {
        workspace_id: "ws-1",
        request_id: "req-bottom-1",
        method: "item/fileChange/requestApproval",
        params: {
          file_path: "/tmp/pom.xml",
          toolName: "Edit",
        },
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        approvals={approvals}
        workspaces={[{
          id: "ws-1",
          name: "workspace",
          path: "/tmp/workspace",
          connected: true,
          settings: { sidebarCollapsed: false },
        }]}
        onApprovalDecision={vi.fn()}
        threadId="claude:thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const messagesFull = container.querySelector(".messages-full");
    const approvalSlot = container.querySelector(".messages-inline-approval-slot");
    expect(messagesFull).toBeTruthy();
    expect(approvalSlot).toBeTruthy();
    expect(messagesFull?.lastElementChild?.previousElementSibling?.classList.contains("messages-inline-approval-slot")).toBe(true);
  });

  it("renders task-notification user payloads as an independent agent card", () => {
    const items: ConversationItem[] = [
      {
        id: "agent-message-user-1",
        kind: "message",
        role: "user",
        text: `<task-notification>
<task-id>af452b1b615f93a9e</task-id>
<tool-use-id>call_fa8bd06e774141c4a7f29a79</tool-use-id>
<output-file>/private/tmp/tasks/af452b1b615f93a9e.output</output-file>
<status>completed</status>
<summary>Agent "Bug诊断与性能安全审查" completed</summary>
<result>我先按照规范流程执行：读取项目规范文件，然后进行全面审查。`,
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const taskCard = container.querySelector(".message-agent-task-card");
    expect(taskCard).toBeTruthy();
    expect(screen.getByText("Bug诊断与性能安全审查")).toBeTruthy();
    expect(container.querySelector(".user-collapsible-text-content")).toBeNull();
    expect(container.textContent ?? "").not.toContain("<task-notification>");
    expect(container.textContent ?? "").toContain("读取项目规范文件");
  });

  it("scrolls to the matching independent agent card when requested by tool use id", async () => {
    const items: ConversationItem[] = [
      {
        id: "agent-message-scroll-1",
        kind: "message",
        role: "user",
        text: `<task-notification>
<task-id>af452b1b615f93a9e</task-id>
<tool-use-id>call_fa8bd06e774141c4a7f29a79</tool-use-id>
<output-file>/private/tmp/tasks/af452b1b615f93a9e.output</output-file>
<status>completed</status>
<summary>Agent "Bug诊断与性能安全审查" completed</summary>
<result>我先按照规范流程执行：读取项目规范文件，然后进行全面审查。`,
      },
    ];

    const { container, rerender } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const messagesContainer = container.querySelector(".messages") as HTMLDivElement | null;
    const targetNode = container.querySelector(
      '[data-agent-tool-use-id="call_fa8bd06e774141c4a7f29a79"]',
    ) as HTMLDivElement | null;
    expect(messagesContainer).toBeTruthy();
    expect(targetNode).toBeTruthy();
    const scrollToSpy = vi.fn();
    if (messagesContainer) {
      messagesContainer.scrollTo = scrollToSpy;
      Object.defineProperty(messagesContainer, "clientHeight", {
        configurable: true,
        value: 400,
      });
      Object.defineProperty(messagesContainer, "scrollTop", {
        configurable: true,
        value: 120,
        writable: true,
      });
      messagesContainer.getBoundingClientRect = vi.fn(() => ({
        top: 100,
        left: 0,
        width: 600,
        height: 400,
        bottom: 500,
        right: 600,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      }));
    }
    if (targetNode) {
      targetNode.getBoundingClientRect = vi.fn(() => ({
        top: 340,
        left: 0,
        width: 600,
        height: 120,
        bottom: 460,
        right: 600,
        x: 0,
        y: 340,
        toJSON: () => ({}),
      }));
    }

    rerender(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
        agentTaskScrollRequest={{
          nonce: 1,
          toolUseId: "call_fa8bd06e774141c4a7f29a79",
        }}
      />,
    );

    await waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: "smooth",
          top: expect.any(Number),
        }),
      );
    });
  });

  it("routes file-change row clicks to onOpenDiffPath", () => {
    const onOpenDiffPath = vi.fn();
    const items: ConversationItem[] = [
      {
        id: "tool-file-change-1",
        kind: "tool",
        toolType: "fileChange",
        title: "File changes",
        detail: "",
        status: "completed",
        changes: [{ path: "src/App.tsx", kind: "modified", diff: "@@ -1 +1 @@\n-old\n+new" }],
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
        onOpenDiffPath={onOpenDiffPath}
      />,
    );

    const header = container.querySelector(".task-header");
    expect(header).toBeTruthy();
    if (header) {
      fireEvent.click(header);
    }
    fireEvent.click(screen.getByRole("button", { name: "App.tsx" }));
    expect(onOpenDiffPath).toHaveBeenCalledWith("src/App.tsx");
  });

});
