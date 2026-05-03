/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

let latestComparisonBasis: string | null = null;

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
    comparison,
    hidden,
    onHide,
    onShow,
    onOpenBlockSource,
  }: {
    projection: { visible: boolean };
    comparison?: { basis: string } | null;
    hidden?: boolean;
    onHide?: () => void;
    onShow?: () => void;
    onOpenBlockSource?: (target: {
      kind: "manual_memory" | "note_card" | "file_reference";
      memoryId?: string;
      noteId?: string;
      path?: string;
    }) => void;
  }) => {
    latestComparisonBasis = comparison?.basis ?? null;
    return (
      <div data-testid="context-ledger-transition-mock">
        <div data-testid="ledger-visible">{String(projection.visible)}</div>
        <div data-testid="ledger-comparison-basis">{comparison?.basis ?? "none"}</div>
        <div data-testid="ledger-hidden">{String(Boolean(hidden))}</div>
        <button type="button" data-testid="hide-ledger" onClick={() => onHide?.()}>
          hide-ledger
        </button>
        <button type="button" data-testid="show-ledger" onClick={() => onShow?.()}>
          show-ledger
        </button>
        <button
          type="button"
          data-testid="open-ledger-memory"
          onClick={() => onOpenBlockSource?.({ kind: "manual_memory", memoryId: "memory-1" })}
        >
          open-memory
        </button>
        <button
          type="button"
          data-testid="open-ledger-note"
          onClick={() => onOpenBlockSource?.({ kind: "note_card", noteId: "note-1" })}
        >
          open-note
        </button>
        <button
          type="button"
          data-testid="open-ledger-file"
          onClick={() => onOpenBlockSource?.({ kind: "file_reference", path: "src/App.tsx" })}
        >
          open-file
        </button>
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

describe("Composer context ledger transitions", () => {
  afterEach(() => {
    cleanup();
    latestComparisonBasis = null;
  });

  it("keeps the ledger visible with a last-send comparison after selected context is consumed", async () => {
    const onSend = vi.fn(() => Promise.resolve());
    const view = renderComposer(onSend);

    await act(async () => {
      fireEvent.click(screen.getByTestId("fill-text"));
      fireEvent.click(screen.getByTestId("select-manual-memory"));
    });

    expect(screen.getByTestId("ledger-visible").textContent).toBe("true");

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-message"));
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("ledger-visible").textContent).toBe("true");
    expect(screen.getByTestId("ledger-comparison-basis").textContent).toBe("last_send");
    expect(latestComparisonBasis).toBe("last_send");
    expect(view.container.querySelector(".composer-context-stack")).toBeTruthy();
  });

  it("routes ledger source-open actions to memory, note, and file handlers", async () => {
    const onSend = vi.fn(() => Promise.resolve());
    const onOpenContextLedgerMemory = vi.fn();
    const onOpenContextLedgerNote = vi.fn();
    const onOpenDiffPath = vi.fn();

    render(
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
        onOpenContextLedgerMemory={onOpenContextLedgerMemory}
        onOpenContextLedgerNote={onOpenContextLedgerNote}
        onOpenDiffPath={onOpenDiffPath}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("fill-text"));
      fireEvent.click(screen.getByTestId("select-manual-memory"));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("open-ledger-memory"));
      fireEvent.click(screen.getByTestId("open-ledger-note"));
      fireEvent.click(screen.getByTestId("open-ledger-file"));
    });

    expect(onOpenContextLedgerMemory).toHaveBeenCalledWith("memory-1");
    expect(onOpenContextLedgerNote).toHaveBeenCalledWith("note-1");
    expect(onOpenDiffPath).toHaveBeenCalledWith("src/App.tsx");
  });

  it("clears last-send comparison when switching to a new thread session", async () => {
    const onSend = vi.fn(() => Promise.resolve());
    const view = renderComposer(onSend);

    await act(async () => {
      fireEvent.click(screen.getByTestId("fill-text"));
      fireEvent.click(screen.getByTestId("select-manual-memory"));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-message"));
    });

    expect(screen.getByTestId("ledger-comparison-basis").textContent).toBe("last_send");

    view.rerender(
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
        activeThreadId="thread-2"
      />,
    );

    expect(screen.queryByTestId("ledger-comparison-basis")).toBeNull();
  });

  it("keeps hidden drawer state local and lets users reopen it", async () => {
    const onSend = vi.fn(() => Promise.resolve());
    renderComposer(onSend);

    await act(async () => {
      fireEvent.click(screen.getByTestId("fill-text"));
      fireEvent.click(screen.getByTestId("select-manual-memory"));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("hide-ledger"));
    });

    expect(screen.getByTestId("ledger-hidden").textContent).toBe("true");

    await act(async () => {
      fireEvent.click(screen.getByTestId("show-ledger"));
    });

    expect(screen.getByTestId("ledger-hidden").textContent).toBe("false");
  });
});
