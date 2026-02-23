/** @vitest-environment jsdom */
import { act, fireEvent, render, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComposerEditorSettings } from "../../../types";
import { projectMemoryFacade } from "../../project-memory/services/projectMemoryFacade";
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

vi.mock("../../project-memory/services/projectMemoryFacade", () => ({
  projectMemoryFacade: {
    list: vi.fn(),
  },
}));

type HarnessProps = {
  onSend?: (text: string, images: string[], options?: { selectedMemoryIds?: string[] }) => void;
  activeWorkspaceId?: string | null;
  activeThreadId?: string | null;
};

function ComposerHarness({
  onSend = () => {},
  activeWorkspaceId = "ws-1",
  activeThreadId = "thread-1",
}: HarnessProps) {
  const [draftText, setDraftText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const editorSettings: ComposerEditorSettings = {
    preset: "default",
    expandFenceOnSpace: false,
    expandFenceOnEnter: false,
    fenceLanguageTags: false,
    fenceWrapSelection: false,
    autoWrapPasteMultiline: false,
    autoWrapPasteCodeLike: false,
    continueListOnShiftEnter: false,
  };

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
      draftText={draftText}
      onDraftChange={setDraftText}
      textareaRef={textareaRef}
      dictationEnabled={false}
      editorSettings={editorSettings}
      activeWorkspaceId={activeWorkspaceId}
      activeThreadId={activeThreadId}
    />
  );
}

function getTextarea(container: HTMLElement) {
  const textarea = container.querySelector("textarea");
  if (!textarea) {
    throw new Error("Textarea not found");
  }
  return textarea as HTMLTextAreaElement;
}

async function typeTextarea(textarea: HTMLTextAreaElement, value: string) {
  await act(async () => {
    fireEvent.change(textarea, {
      target: {
        value,
        selectionStart: value.length,
      },
    });
    textarea.focus();
    textarea.setSelectionRange(value.length, value.length);
    fireEvent.select(textarea);
  });
}

async function waitMemorySuggestions() {
  await act(async () => {
    vi.advanceTimersByTime(150);
    await Promise.resolve();
  });
}

async function openMemoryPicker(
  textarea: HTMLTextAreaElement,
  value: string = "@@",
): Promise<HTMLElement> {
  await typeTextarea(textarea, value);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await waitMemorySuggestions();
    const listbox = document.querySelector(".composer-suggestions");
    if (listbox) {
      return listbox as HTMLElement;
    }
  }
  throw new Error("Memory suggestions listbox not found");
}

describe("Composer manual memory selection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(projectMemoryFacade.list).mockResolvedValue({
      items: [
        {
          id: "mem-1",
          workspaceId: "ws-1",
          kind: "note",
          title: "发布步骤",
          summary: "发布前检查清单",
          detail:
            "用户输入：请给我一份发布前检查清单\n助手输出摘要：先构建，再 smoke test，最后灰度发布。\n助手输出：完整回答",
          cleanText: "",
          tags: ["release", "checklist"],
          importance: "high",
          source: "manual",
          fingerprint: "fp-1",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "mem-2",
          workspaceId: "ws-1",
          kind: "decision",
          title: "数据库回滚预案",
          summary: "异常场景回滚流程",
          detail: "先冻结写流量，再切换备份快照并校验。",
          cleanText: "",
          tags: ["db", "rollback"],
          importance: "medium",
          source: "manual",
          fingerprint: "fp-2",
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      total: 2,
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("supports multi-select remove and clears selected memories after send", async () => {
    const onSend = vi.fn();
    const view = render(<ComposerHarness onSend={onSend} />);
    const textarea = getTextarea(view.container);

    const listbox = await openMemoryPicker(textarea, "@@");
    await act(async () => {
      const options = within(listbox).getAllByRole("option");
      fireEvent.click(options[0] as HTMLElement);
      fireEvent.click(options[1] as HTMLElement);
    });

    expect(view.container.querySelectorAll(".composer-memory-chip").length).toBe(2);

    const removeButtons = view.container.querySelectorAll(".composer-memory-chip-remove");
    expect(removeButtons.length).toBeGreaterThan(0);
    await act(async () => {
      (removeButtons[0] as HTMLButtonElement).click();
    });
    expect(view.container.querySelectorAll(".composer-memory-chip").length).toBe(1);

    await typeTextarea(textarea, "请执行回滚演练");
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", bubbles: true });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onSend).toHaveBeenCalledWith(
      "请执行回滚演练",
      [],
      expect.objectContaining({
        selectedMemoryIds: ["mem-2"],
      }),
    );
    expect(view.container.querySelectorAll(".composer-memory-chip").length).toBe(0);
  });

  it("renders selected memory chip with extracted user input title and assistant summary detail", async () => {
    const view = render(<ComposerHarness />);
    const textarea = getTextarea(view.container);
    const listbox = await openMemoryPicker(textarea, "@@");

    await act(async () => {
      const options = within(listbox).getAllByRole("option");
      fireEvent.click(options[0] as HTMLElement);
    });

    const chipTitle = view.container.querySelector(".composer-memory-chip-title");
    const chipSummary = view.container.querySelector(".composer-memory-chip-summary");
    expect(chipTitle?.textContent).toBe("请给我一份发布前检查清单");
    expect(chipTitle?.textContent).not.toBe("发布步骤");
    expect(chipSummary?.textContent).toBe("先构建，再 smoke test，最后灰度发布。");
  });
});
