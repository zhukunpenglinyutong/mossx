/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

let latestProjection: {
  visible: boolean;
  groups: Array<{ kind: string; blocks: Array<{ id: string; sourceRef?: string | null }> }>;
} | null = null;

vi.mock("../../../services/dragDrop", () => ({
  subscribeWindowDragDrop: vi.fn(() => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `tauri://${path}`,
  invoke: vi.fn(async () => null),
}));

vi.mock("../../engine/components/EngineSelector", () => ({
  EngineSelector: () => null,
}));

vi.mock("../../opencode/components/OpenCodeControlPanel", () => ({
  OpenCodeControlPanel: () => null,
}));

vi.mock("../../context-ledger/components/ContextLedgerPanel", () => ({
  ContextLedgerPanel: ({
    projection,
    onTogglePinBlock,
    onExcludeBlock,
  }: {
    projection: typeof latestProjection;
    onTogglePinBlock?: (block: { id: string }) => void;
    onExcludeBlock?: (block: { id: string }) => void;
  }) => {
    latestProjection = projection;
    const manualBlock = projection?.groups
      .find((group) => group.kind === "manual_memory")
      ?.blocks[0];

    return (
      <div data-testid="context-ledger-mock">
        <div data-testid="ledger-visible">{String(projection?.visible ?? false)}</div>
        <div data-testid="ledger-manual-count">
          {String(
            projection?.groups.find((group) => group.kind === "manual_memory")?.blocks.length ?? 0,
          )}
        </div>
        {manualBlock && onTogglePinBlock ? (
          <button
            type="button"
            data-testid="ledger-pin-manual"
            onClick={() => onTogglePinBlock(manualBlock)}
          >
            pin
          </button>
        ) : null}
        {manualBlock && onExcludeBlock ? (
          <button
            type="button"
            data-testid="ledger-exclude-manual"
            onClick={() => onExcludeBlock(manualBlock)}
          >
            exclude
          </button>
        ) : null}
      </div>
    );
  },
}));

vi.mock("./ChatInputBox/ChatInputBoxAdapter", () => ({
  ChatInputBoxAdapter: ({
    onTextChange,
    onSend,
    onManualMemorySelect,
  }: {
    onTextChange: (next: string, cursor: number | null) => void;
    onSend: () => void;
    onManualMemorySelect?: (memory: {
      id: string;
      title: string;
      summary: string;
      detail: string;
      kind: string;
      importance: string;
      updatedAt: number;
      tags: string[];
    }) => void;
  }) => (
    <div>
      <button
        type="button"
        data-testid="fill-text"
        onClick={() => onTextChange("hello", 5)}
      >
        fill
      </button>
      <button
        type="button"
        data-testid="select-manual-memory"
        onClick={() =>
          onManualMemorySelect?.({
            id: "memory-1",
            title: "Known issue",
            summary: "summary",
            detail: "用户输入：Question\n\n助手输出摘要：Answer",
            kind: "known_issue",
            importance: "high",
            updatedAt: 1,
            tags: [],
          })
        }
      >
        memory
      </button>
      <button type="button" data-testid="send-message" onClick={() => onSend()}>
        send
      </button>
    </div>
  ),
}));

function renderComposer(onSend = vi.fn(() => Promise.resolve())) {
  return render(
    <Composer
      onSend={onSend}
      onQueue={() => {}}
      onStop={() => {}}
      canStop={false}
      isProcessing={false}
      steerEnabled={false}
      collaborationModes={[]}
      collaborationModesEnabled={true}
      selectedCollaborationModeId={null}
      onSelectCollaborationMode={() => {}}
      selectedEngine="claude"
      models={[]}
      selectedModelId={null}
      onSelectModel={() => {}}
      reasoningOptions={[]}
      selectedEffort={null}
      onSelectEffort={() => {}}
      reasoningSupported={false}
      accessMode="current"
      onSelectAccessMode={() => {}}
      skills={[]}
      prompts={[]}
      commands={[]}
      files={[]}
      draftText=""
      onDraftChange={() => {}}
      dictationEnabled={false}
      activeWorkspaceId="ws-1"
      activeThreadId="thread-1"
    />,
  );
}

describe("Composer context ledger governance", () => {
  afterEach(() => {
    cleanup();
    latestProjection = null;
  });

  it("keeps a pinned manual memory for exactly one additional send", async () => {
    const onSend = vi.fn(() => Promise.resolve());
    const view = renderComposer(onSend);

    await act(async () => {
      fireEvent.click(screen.getByTestId("fill-text"));
      fireEvent.click(screen.getByTestId("select-manual-memory"));
    });

    expect(view.container.querySelector(".composer-context-stack")).toBeTruthy();
    expect(screen.getByTestId("ledger-manual-count").textContent).toBe("1");

    await act(async () => {
      fireEvent.click(screen.getByTestId("ledger-pin-manual"));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-message"));
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("ledger-manual-count").textContent).toBe("1");

    await act(async () => {
      fireEvent.click(screen.getByTestId("fill-text"));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-message"));
    });

    expect(onSend).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("ledger-manual-count")).toBeNull();
    expect(view.container.querySelector(".composer-context-stack")).toBeNull();
  });

  it("excludes a manual memory from the next send immediately", async () => {
    const onSend = vi.fn(() => Promise.resolve());
    const view = renderComposer(onSend);

    await act(async () => {
      fireEvent.click(screen.getByTestId("fill-text"));
      fireEvent.click(screen.getByTestId("select-manual-memory"));
    });

    expect(screen.getByTestId("ledger-manual-count").textContent).toBe("1");

    await act(async () => {
      fireEvent.click(screen.getByTestId("ledger-exclude-manual"));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-message"));
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    const firstCall = onSend.mock.calls[0] as unknown[] | undefined;
    expect(firstCall?.[2]).toBeUndefined();
    expect(screen.queryByTestId("ledger-manual-count")).toBeNull();
    expect(view.container.querySelector(".composer-context-stack")).toBeNull();
  });
});
