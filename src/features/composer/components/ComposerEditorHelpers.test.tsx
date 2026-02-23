/** @vitest-environment jsdom */
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { ComposerEditorSettings } from "../../../types";
import { Composer } from "./Composer";

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
  OpenCodeControlPanel: ({ visible }: { visible: boolean }) =>
    visible ? <div data-testid="opencode-control-panel" /> : null,
}));

type HarnessProps = {
  initialText?: string;
  editorSettings: ComposerEditorSettings;
  linkedKanbanPanels?: { id: string; name: string; workspaceId: string }[];
  selectedLinkedKanbanPanelId?: string | null;
  kanbanContextMode?: "new" | "inherit";
  onKanbanContextModeChange?: (mode: "new" | "inherit") => void;
  selectedEngine?: "claude" | "codex" | "opencode";
  commands?: { name: string; path: string; content: string }[];
  onSend?: (text: string, images: string[], options?: { selectedMemoryIds?: string[] }) => void;
  activeWorkspaceId?: string | null;
};

function ComposerHarness({
  initialText = "",
  editorSettings,
  linkedKanbanPanels = [],
  selectedLinkedKanbanPanelId = null,
  kanbanContextMode = "new",
  onKanbanContextModeChange,
  selectedEngine = "claude",
  commands = [],
  onSend = () => {},
  activeWorkspaceId = null,
}: HarnessProps) {
  const [draftText, setDraftText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
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
      selectedEngine={selectedEngine}
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
      commands={commands}
      files={[]}
      draftText={draftText}
      onDraftChange={setDraftText}
      textareaRef={textareaRef}
      dictationEnabled={false}
      editorSettings={editorSettings}
      linkedKanbanPanels={linkedKanbanPanels}
      selectedLinkedKanbanPanelId={selectedLinkedKanbanPanelId}
      kanbanContextMode={kanbanContextMode}
      onKanbanContextModeChange={onKanbanContextModeChange}
      activeWorkspaceId={activeWorkspaceId}
    />
  );
}

type RenderedHarness = {
  container: HTMLDivElement;
  unmount: () => void;
};

function renderComposerHarness(props: HarnessProps): RenderedHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<ComposerHarness {...props} />);
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function getTextarea(container: HTMLElement) {
  const textarea = container.querySelector("textarea");
  if (!textarea) {
    throw new Error("Textarea not found");
  }
  return textarea;
}

const smartSettings: ComposerEditorSettings = {
  preset: "smart",
  expandFenceOnSpace: true,
  expandFenceOnEnter: false,
  fenceLanguageTags: true,
  fenceWrapSelection: true,
  autoWrapPasteMultiline: true,
  autoWrapPasteCodeLike: true,
  continueListOnShiftEnter: true,
};

describe("Composer editor helpers", () => {
  it("expands ```lang + Space into a fenced block", async () => {
    const harness = renderComposerHarness({
      initialText: "```ts",
      editorSettings: smartSettings,
    });
    const textarea = getTextarea(harness.container);
    textarea.setSelectionRange(5, 5);

    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
    });

    expect(getTextarea(harness.container).value).toBe("```ts\n\n```");

    harness.unmount();
  });

  it("continues numbered lists on Shift+Enter", async () => {
    const harness = renderComposerHarness({
      initialText: "1. First",
      editorSettings: smartSettings,
    });
    const textarea = getTextarea(harness.container);
    textarea.setSelectionRange(8, 8);

    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
        }),
      );
    });

    expect(getTextarea(harness.container).value).toBe("1. First\n2. ");

    harness.unmount();
  });

  it("auto-wraps multi-line paste into a fenced block", async () => {
    const harness = renderComposerHarness({
      editorSettings: smartSettings,
    });
    const textarea = getTextarea(harness.container);
    textarea.setSelectionRange(0, 0);

    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) =>
          type === "text/plain" ? "line one\nline two" : "",
        items: [],
      },
    });

    await act(async () => {
      textarea.dispatchEvent(event);
    });

    expect(getTextarea(harness.container).value).toBe(
      "```\nline one\nline two\n```",
    );

    harness.unmount();
  });

  it("shows context mode switch only when a linked panel is selected", async () => {
    const onModeChange = vi.fn();
    const harness = renderComposerHarness({
      editorSettings: smartSettings,
      linkedKanbanPanels: [{ id: "p-1", name: "Panel 1", workspaceId: "ws-1" }],
      selectedLinkedKanbanPanelId: "p-1",
      kanbanContextMode: "new",
      onKanbanContextModeChange: onModeChange,
    });

    const trigger = harness.container.querySelector(
      ".composer-kanban-trigger",
    ) as HTMLButtonElement | null;
    if (!trigger) {
      throw new Error("Kanban trigger not found");
    }
    expect(trigger.className).toContain("is-active");
    expect(trigger.querySelector(".composer-kanban-trigger-icon")).not.toBeNull();
    await act(async () => {
      trigger.click();
    });
    const modeButtons = document.querySelectorAll(
      ".composer-kanban-mode-btn",
    );
    expect(modeButtons.length).toBe(2);
    expect(document.querySelector(".composer-kanban-popover-item.is-active")).not.toBeNull();

    await act(async () => {
      (modeButtons[1] as HTMLButtonElement).click();
    });
    expect(onModeChange).toHaveBeenCalledWith("inherit");

    harness.unmount();

    const noSelectionHarness = renderComposerHarness({
      editorSettings: smartSettings,
      linkedKanbanPanels: [{ id: "p-1", name: "Panel 1", workspaceId: "ws-1" }],
      selectedLinkedKanbanPanelId: null,
    });
    const noSelectionTrigger = noSelectionHarness.container.querySelector(
      ".composer-kanban-trigger",
    ) as HTMLButtonElement | null;
    if (!noSelectionTrigger) {
      throw new Error("Kanban trigger not found");
    }
    expect(noSelectionTrigger.className).not.toContain("is-active");
    await act(async () => {
      noSelectionTrigger.click();
    });
    expect(
      document.querySelector(".composer-kanban-popover-mode"),
    ).toBeNull();
    noSelectionHarness.unmount();
  });

  it("closes kanban popover when clicking backdrop", async () => {
    const harness = renderComposerHarness({
      editorSettings: smartSettings,
      linkedKanbanPanels: [{ id: "p-1", name: "Panel 1", workspaceId: "ws-1" }],
      selectedLinkedKanbanPanelId: "p-1",
    });
    const trigger = harness.container.querySelector(
      ".composer-kanban-trigger",
    ) as HTMLButtonElement | null;
    if (!trigger) {
      throw new Error("Kanban trigger not found");
    }

    await act(async () => {
      trigger.click();
    });
    expect(document.querySelector(".composer-context-backdrop")).not.toBeNull();

    const backdrop = document.querySelector(".composer-context-backdrop");
    if (!backdrop) {
      throw new Error("Backdrop not found");
    }
    await act(async () => {
      (backdrop as HTMLDivElement).click();
    });

    expect(document.querySelector(".composer-kanban-popover")).toBeNull();
    harness.unmount();
  });

  it("sends selected opencode direct command chip on Enter without chat text", async () => {
    const onSend = vi.fn();
    const harness = renderComposerHarness({
      initialText: "/export",
      editorSettings: smartSettings,
      selectedEngine: "opencode",
      commands: [{ name: "export", path: "", content: "" }],
      onSend,
    });
    const textarea = getTextarea(harness.container);
    textarea.focus();
    textarea.setSelectionRange(0, 0);

    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(onSend).toHaveBeenCalledWith("/export", []);
    harness.unmount();
  });

  it("renders opencode panel only in opencode mode", () => {
    const opencodeHarness = renderComposerHarness({
      editorSettings: smartSettings,
      selectedEngine: "opencode",
    });
    expect(
      opencodeHarness.container.querySelector('[data-testid="opencode-control-panel"]'),
    ).not.toBeNull();
    opencodeHarness.unmount();

    const codexHarness = renderComposerHarness({
      editorSettings: smartSettings,
      selectedEngine: "codex",
    });
    expect(
      codexHarness.container.querySelector('[data-testid="opencode-control-panel"]'),
    ).toBeNull();
    codexHarness.unmount();
  });
});
