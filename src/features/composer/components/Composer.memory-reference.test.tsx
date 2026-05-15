/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  OpenCodeControlPanel: () => null,
}));

vi.mock("./ChatInputBox/ChatInputBoxAdapter", () => ({
  ChatInputBoxAdapter: ({
    text,
    onTextChange,
    onSend,
    memoryReferenceArmed,
    onToggleMemoryReference,
  }: {
    text: string;
    onTextChange: (next: string, cursor: number | null) => void;
    onSend: () => void;
    memoryReferenceArmed?: boolean;
    onToggleMemoryReference?: () => void;
  }) => (
    <div>
      <button
        type="button"
        aria-pressed={memoryReferenceArmed}
        aria-label="composer.memoryReferenceToggle"
        onClick={onToggleMemoryReference}
      >
        {memoryReferenceArmed
          ? "composer.memoryReferenceOn"
          : "composer.memoryReferenceOff"}
      </button>
      <textarea
        aria-label="chat draft"
        value={text}
        onChange={(event) =>
          onTextChange(event.currentTarget.value, event.currentTarget.value.length)
        }
      />
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

describe("Composer Memory Reference toggle", () => {
  afterEach(() => {
    cleanup();
  });

  it("defaults off, toggles on and clears after send", async () => {
    const onSend = vi.fn(() => Promise.resolve());
    renderComposer(onSend);

    const toggle = screen.getByRole("button", { name: "composer.memoryReferenceToggle" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("composer.memoryReferenceOff")).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("composer.memoryReferenceOn")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("chat draft"), {
      target: { value: "hello memory" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("send-message"));
      await Promise.resolve();
    });

    expect(onSend).toHaveBeenCalledWith(
      "hello memory",
      [],
      expect.objectContaining({ memoryReferenceEnabled: true }),
    );
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });
});
