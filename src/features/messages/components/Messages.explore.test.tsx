// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";
import { Messages } from "./Messages";

describe("Messages explore rows", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.setItem("ccgui.claude.hideReasoningModule", "0");
  });

  beforeAll(() => {
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
  });

  it("merges consecutive explore items under a single explored block", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-1",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "search", label: "Find routes" }],
      },
      {
        id: "explore-2",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "routes.ts" }],
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

    await waitFor(() => {
      expect(container.querySelector(".explore-inline")).toBeTruthy();
    });
    expect(screen.queryByText(/tool calls/i)).toBeNull();
    const exploreItems = container.querySelectorAll(".explore-inline-item");
    expect(exploreItems.length).toBe(2);
    expect(container.querySelector(".explore-inline-title")?.textContent ?? "").toContain(
      "Explored",
    );
  });

  it("auto-enables collapse for completed multi-step explore blocks", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-auto-collapse-1",
        kind: "explore",
        status: "explored",
        entries: [
          { kind: "search", label: "find reducer" },
          { kind: "read", label: "Messages.tsx" },
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

    const block = container.querySelector(".explore-inline");
    expect(block?.className ?? "").toContain("is-collapsible");
    expect(container.querySelector(".explore-inline-list")?.className ?? "").toContain(
      "is-collapsed",
    );

    fireEvent.click(container.querySelector(".explore-inline-header-toggle") as HTMLElement);
    expect(container.querySelector(".explore-inline-list")?.className ?? "").not.toContain(
      "is-collapsed",
    );
  });

  it("uses the same collapsed summary and expand path for a single-step explored block", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-single-step",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "package.json" }],
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

    const block = container.querySelector(".explore-inline");
    expect(block?.className ?? "").toContain("is-collapsible");
    expect(block?.className ?? "").toContain("is-inline-summary");
    expect(container.querySelector(".explore-inline-title")?.textContent ?? "").toBe(
      "Explored · Read package.json",
    );
    expect(container.querySelector(".explore-inline-list")?.className ?? "").toContain(
      "is-collapsed",
    );

    const toggle = screen.getByRole("button", {
      name: /Explored · Read package\.json · messages\.toggleDetails/i,
    });
    fireEvent.click(toggle);

    expect(block?.className ?? "").not.toContain("is-inline-summary");
    expect(container.querySelector(".explore-inline-title")?.textContent ?? "").toBe("Explored");
    expect(container.querySelector(".explore-inline-list")?.className ?? "").not.toContain(
      "is-collapsed",
    );
    expect(screen.getByText("package.json")).toBeTruthy();
  });

  it("expands explored card during thinking and auto-collapses after thinking ends", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-live-toggle-1",
        kind: "explore",
        status: "explored",
        entries: [
          { kind: "search", label: "find route guards" },
          { kind: "read", label: "routes.ts" },
        ],
      },
    ];

    const { container, rerender } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".explore-inline-list")?.className ?? "").not.toContain(
      "is-collapsed",
    );

    rerender(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".explore-inline-list")?.className ?? "").toContain(
        "is-collapsed",
      );
    });
  });

  it("auto-collapses explored card during thinking after a non-explore stage appears", async () => {
    const exploreItem: ConversationItem = {
      id: "explore-live-stage-1",
      kind: "explore",
      status: "explored",
      entries: [
        { kind: "search", label: "find message renderer" },
        { kind: "read", label: "Messages.tsx" },
      ],
    };
    const assistantItem: ConversationItem = {
      id: "assistant-live-stage-1",
      kind: "message",
      role: "assistant",
      text: "Continuing with the implementation.",
    };

    const { container, rerender } = render(
      <Messages
        items={[exploreItem]}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".explore-inline-list")?.className ?? "").not.toContain(
      "is-collapsed",
    );

    rerender(
      <Messages
        items={[exploreItem, assistantItem]}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".explore-inline-list")?.className ?? "").toContain(
        "is-collapsed",
      );
    });
    expect(screen.getByText("Continuing with the implementation.")).toBeTruthy();
  });

  it("suppresses completed explored cards that are stranded between live codex user turns", async () => {
    const items: ConversationItem[] = [
      {
        id: "user-before-stale-explore",
        kind: "message",
        role: "user",
        text: "先查一下技能读取链路",
      },
      {
        id: "stale-explore-between-users",
        kind: "explore",
        status: "explored",
        entries: [
          {
            kind: "read",
            label: "SKILL.md",
            detail: "/Users/demo/project/.agents/skills/before-dev/SKILL.md",
          },
        ],
      },
      {
        id: "user-live-follow-up",
        kind: "message",
        role: "user",
        text: "修一下",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getByText("先查一下技能读取链路")).toBeTruthy();
    expect(screen.getByText("修一下")).toBeTruthy();
    expect(container.querySelector(".explore-inline")).toBeNull();
    expect(screen.queryByText("SKILL.md")).toBeNull();
  });

  it("keeps the current live codex explored card after the latest user turn", async () => {
    const items: ConversationItem[] = [
      {
        id: "user-before-current-explore",
        kind: "message",
        role: "user",
        text: "先查一下技能读取链路",
      },
      {
        id: "stale-explore-before-latest-user",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "stale SKILL.md" }],
      },
      {
        id: "user-current-explore",
        kind: "message",
        role: "user",
        text: "继续查当前链路",
      },
      {
        id: "current-explore-after-latest-user",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "current SKILL.md" }],
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".explore-inline").length).toBe(1);
    });
    expect(screen.queryByText("stale SKILL.md")).toBeNull();
    expect(container.querySelector(".explore-inline-label")?.textContent).toBe(
      "current SKILL.md",
    );
  });

  it("keeps completed explored cards between user turns in finished codex history", async () => {
    const items: ConversationItem[] = [
      {
        id: "user-history-before-explore",
        kind: "message",
        role: "user",
        text: "先查一下技能读取链路",
      },
      {
        id: "history-explore-between-users",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "history SKILL.md" }],
      },
      {
        id: "user-history-follow-up",
        kind: "message",
        role: "user",
        text: "修一下",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".explore-inline")).toBeTruthy();
    });
    expect(screen.getByText("history SKILL.md")).toBeTruthy();
  });

  it("renders spec-root explore card as collapsible and toggles details", async () => {
    const items: ConversationItem[] = [
      {
        id: "spec-root-context-thread-1",
        kind: "explore",
        status: "explored",
        title: "External Spec Root (Priority)",
        collapsible: true,
        mergeKey: "spec-root-context",
        entries: [
          { kind: "list", label: "Active root path", detail: "/tmp/external-openspec" },
          { kind: "read", label: "Read policy", detail: "Read this root first." },
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

    const exploreBlock = container.querySelector(".explore-inline.is-collapsible");
    expect(exploreBlock).toBeTruthy();
    expect(exploreBlock?.className ?? "").toContain("is-collapsed");
    const list = container.querySelector(".explore-inline-list");
    expect(list?.className ?? "").toContain("is-collapsed");

    const toggle = container.querySelector(
      ".explore-inline.is-collapsible .explore-inline-header-toggle",
    );
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle as HTMLElement);
    expect(exploreBlock?.className ?? "").not.toContain("is-collapsed");
    expect(container.querySelector(".explore-inline-list")?.className ?? "").not.toContain(
      "is-collapsed",
    );
  });

  it("uses the latest explore status when merging a consecutive run", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-started",
        kind: "explore",
        status: "exploring",
        entries: [{ kind: "search", label: "starting" }],
      },
      {
        id: "explore-finished",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "finished" }],
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

    await waitFor(() => {
      expect(container.querySelectorAll(".explore-inline").length).toBe(1);
    });
    const exploreTitle = container.querySelector(".explore-inline-title");
    expect(exploreTitle?.textContent ?? "").toContain("Explored");
  });

  it("hides only exploring cards in codex canvas while keeping explored cards", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-hidden-codex",
        kind: "explore",
        status: "exploring",
        entries: [{ kind: "search", label: "Search routes.ts" }],
      },
      {
        id: "explore-keep-codex",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "Read routes.ts" }],
      },
      {
        id: "tool-edit-visible",
        kind: "tool",
        toolType: "edit",
        title: "Tool: edit",
        detail: JSON.stringify({
          file_path: "src/routes.ts",
          old_string: "before",
          new_string: "after",
        }),
        status: "completed",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    await waitFor(() => {
      expect(container.textContent ?? "").toContain("routes.ts");
    });
    const exploreRows = container.querySelectorAll(".explore-inline");
    expect(exploreRows.length).toBe(1);
    expect(container.textContent ?? "").not.toContain("Search routes.ts");
    expect(container.textContent ?? "").toContain("Read routes.ts");
  });

  it("hides only exploring cards in claude canvas while keeping explored cards", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-hidden-claude",
        kind: "explore",
        status: "exploring",
        entries: [{ kind: "search", label: "Search reducers.ts" }],
      },
      {
        id: "explore-keep-claude",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "Read reducers.ts" }],
      },
      {
        id: "tool-edit-visible-claude",
        kind: "tool",
        toolType: "edit",
        title: "Tool: edit",
        detail: JSON.stringify({
          file_path: "src/reducers.ts",
          old_string: "before",
          new_string: "after",
        }),
        status: "completed",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        activeEngine="claude"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    await waitFor(() => {
      expect(container.textContent ?? "").toContain("reducers.ts");
    });
    const exploreRows = container.querySelectorAll(".explore-inline");
    expect(exploreRows.length).toBe(1);
    expect(container.textContent ?? "").not.toContain("Search reducers.ts");
    expect(container.textContent ?? "").toContain("Read reducers.ts");
  });

  it("does not merge explore items across interleaved tools", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-a",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "search", label: "Find reducers" }],
      },
      {
        id: "tool-a",
        kind: "tool",
        toolType: "edit",
        title: "Tool: edit",
        detail: JSON.stringify({
          file_path: "src/reducers.ts",
          old_string: "before",
          new_string: "after",
        }),
        status: "completed",
        output: "",
      },
      {
        id: "explore-b",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "useThreadsReducer.ts" }],
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

    await waitFor(() => {
      const exploreBlocks = container.querySelectorAll(".explore-inline");
      expect(exploreBlocks.length).toBe(2);
    });
    const exploreItems = container.querySelectorAll(".explore-inline-item");
    expect(exploreItems.length).toBe(2);
    expect(screen.getByText(/reducers\.ts/i)).toBeTruthy();
  });

  it("preserves chronology when reasoning with body appears between explore items", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-1",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "search", label: "first explore" }],
      },
      {
        id: "reasoning-body",
        kind: "reasoning",
        summary: "Reasoning title\nReasoning body",
        content: "",
      },
      {
        id: "explore-2",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "second explore" }],
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

    await waitFor(() => {
      expect(container.querySelectorAll(".explore-inline").length).toBe(2);
    });
    const exploreBlocks = Array.from(container.querySelectorAll(".explore-inline"));
    const reasoningDetail = container.querySelector(".thinking-content");
    expect(exploreBlocks.length).toBe(2);
    expect(reasoningDetail).toBeTruthy();
    const [firstExploreBlock, secondExploreBlock] = exploreBlocks;
    if (!firstExploreBlock || !secondExploreBlock) {
      throw new Error("Explore blocks not found");
    }
    const firstBeforeReasoning =
      firstExploreBlock.compareDocumentPosition(reasoningDetail as Node) &
      Node.DOCUMENT_POSITION_FOLLOWING;
    const reasoningBeforeSecond =
      (reasoningDetail as Node).compareDocumentPosition(secondExploreBlock) &
      Node.DOCUMENT_POSITION_FOLLOWING;
    expect(firstBeforeReasoning).toBeTruthy();
    expect(reasoningBeforeSecond).toBeTruthy();
  });

  it("does not merge across message boundaries and does not drop messages", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-before",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "search", label: "before message" }],
      },
      {
        id: "assistant-msg",
        kind: "message",
        role: "assistant",
        text: "A message between explore blocks",
      },
      {
        id: "explore-after",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "after message" }],
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

    await waitFor(() => {
      const exploreBlocks = container.querySelectorAll(".explore-inline");
      expect(exploreBlocks.length).toBe(2);
    });
    expect(screen.getByText("A message between explore blocks")).toBeTruthy();
  });

  it("keeps explore entry steps separate from tool-group summary", async () => {
    const items: ConversationItem[] = [
      {
        id: "tool-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: git status --porcelain=v1",
        detail: "/repo",
        status: "completed",
        output: "",
      },
      {
        id: "explore-steps-1",
        kind: "explore",
        status: "explored",
        entries: [
          { kind: "read", label: "Messages.tsx" },
          { kind: "search", label: "toolCount" },
        ],
      },
      {
        id: "explore-steps-2",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "types.ts" }],
      },
      {
        id: "tool-2",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: git diff -- src/features/messages/components/Messages.tsx",
        detail: "/repo",
        status: "completed",
        output: "",
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

    await waitFor(() => {
      const exploreRows = container.querySelectorAll(".explore-inline-item");
      expect(exploreRows.length).toBe(3);
    });
    expect(screen.queryByText("5 tool calls")).toBeNull();
  });

  it("avoids React key collisions when reasoning and message share the same item id", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const items: ConversationItem[] = [
      {
        id: "shared-item-1",
        kind: "reasoning",
        summary: "思考中",
        content: "先拆解问题。",
      },
      {
        id: "shared-item-1",
        kind: "message",
        role: "assistant",
        text: "这是正文增量。",
      },
    ];

    render(
      <Messages
        items={items}
        threadId="claude:session-1"
        workspaceId="ws-1"
        isThinking={true}
        openTargets={[]}
        selectedOpenAppId=""
        activeEngine="claude"
      />,
    );

    expect(screen.getByText("这是正文增量。")).toBeTruthy();
    expect(screen.getByText("先拆解问题。")).toBeTruthy();
    const duplicateKeyWarnings = consoleErrorSpy.mock.calls.filter(([firstArg]) =>
      typeof firstArg === "string" &&
      firstArg.includes("Encountered two children with the same key"),
    );
    expect(duplicateKeyWarnings).toHaveLength(0);
    consoleErrorSpy.mockRestore();
  });
});
