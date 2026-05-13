/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";
import type { ComposerSendReadiness } from "../utils/composerSendReadiness";

let forceLedgerProjectionVisible = false;

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

vi.mock("../../context-ledger/utils/contextLedgerProjection", async () => {
  const actual =
    await vi.importActual<typeof import("../../context-ledger/utils/contextLedgerProjection")>(
      "../../context-ledger/utils/contextLedgerProjection",
    );
  return {
    ...actual,
    buildContextLedgerProjection: (input: Parameters<typeof actual.buildContextLedgerProjection>[0]) => {
      if (!forceLedgerProjectionVisible) {
        return actual.buildContextLedgerProjection(input);
      }
      return {
        visible: true,
        totalBlockCount: 1,
        totalGroupCount: 1,
        totalUsageTokens: null,
        contextWindowTokens: null,
        groups: [
          {
            kind: "helper_selection",
            blocks: [
              {
                id: "helper-skill-doc-backup",
                kind: "helper_selection",
                title: "doc-backup",
                detail: "backup docs",
                sourceRef: "skill:doc-backup",
                sourcePath: null,
                backendSource: "global_claude",
                attributionKind: "engine_injected",
                attributionConfidence: "coarse",
                participationState: "selected",
                carryOverReason: null,
                freshness: "fresh",
                estimate: { kind: "unknown", value: null },
              },
            ],
          },
        ],
      };
    },
  };
});

vi.mock("../../opencode/components/OpenCodeControlPanel", () => ({
  OpenCodeControlPanel: () => null,
}));

vi.mock("./ChatInputBox/ChatInputBoxAdapter", () => ({
  ChatInputBoxAdapter: ({
    onTextChange,
    onSend,
    onManualMemorySelect,
    sendReadiness,
    onExpandContextSources,
  }: {
    onTextChange: (next: string, cursor: number | null) => void;
    onSend: () => void;
    sendReadiness?: ComposerSendReadiness | null;
    onExpandContextSources?: () => void;
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
      <div data-testid="readiness-context-summary">
        {sendReadiness?.contextSummary.compactLabel ?? ""}
      </div>
      <button
        type="button"
        data-testid="expand-context-sources"
        onClick={() => onExpandContextSources?.()}
      >
        expand context sources
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
    forceLedgerProjectionVisible = false;
  });

  it("projects context ledger summary into the chat input header", async () => {
    const onSend = vi.fn(() => Promise.resolve());
    const view = renderComposer(onSend);

    await act(async () => {
      fireEvent.click(screen.getByTestId("fill-text"));
      fireEvent.click(screen.getByTestId("select-manual-memory"));
    });

    expect(screen.getByTestId("readiness-context-summary").textContent).toBe(
      "items:1 · groups:1",
    );
    expect(view.container.querySelector(".composer-context-stack")).toBeTruthy();
    expect(screen.queryByTestId("context-ledger-mock")).toBeNull();
    expect(view.container.querySelector(".composer-context-ledger")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId("expand-context-sources"));
    });

    expect(view.container.querySelector(".composer-context-ledger")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerTitle")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-message"));
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("readiness-context-summary").textContent).toBe(
      "no-extra-context",
    );
  });

  it("keeps context source summary in the input header", async () => {
    forceLedgerProjectionVisible = true;
    renderComposer();

    expect(screen.queryByTestId("context-ledger-mock")).toBeNull();
    expect(screen.getByTestId("readiness-context-summary").textContent).toBe(
      "items:1 · groups:1",
    );
  });
});
