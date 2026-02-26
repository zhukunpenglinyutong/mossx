/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComposerEditorSettings, CustomCommandOption, SkillOption } from "../../../types";
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

type HarnessProps = {
  skills?: SkillOption[];
  commands?: CustomCommandOption[];
  onSend?: (text: string, images: string[]) => void;
};

function ComposerHarness({ skills = [], commands = [], onSend = () => {} }: HarnessProps) {
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
      skills={skills}
      prompts={[]}
      commands={commands}
      files={[]}
      draftText={draftText}
      onDraftChange={setDraftText}
      textareaRef={textareaRef}
      dictationEnabled={false}
      editorSettings={editorSettings}
      activeWorkspaceId="ws-1"
      activeThreadId="thread-1"
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

describe("Composer context source grouping", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders S+ with source groups", async () => {
    const view = render(
      <ComposerHarness
        skills={[
          {
            name: "lint-project",
            path: "/repo/.claude/skills/lint/SKILL.md",
            source: "project_claude",
            description: "project skill",
          },
          {
            name: "lint-global",
            path: "/Users/u/.codex/skills/lint/SKILL.md",
            source: "global_codex",
            description: "global skill",
          },
        ]}
      />,
    );

    await act(async () => {
      fireEvent.click(within(view.container).getAllByRole("button", { name: "S+" })[0]!);
    });

    expect(within(document.body).getByText("Project .claude")).toBeTruthy();
    expect(within(document.body).getByText("User .codex")).toBeTruthy();
  });

  it("keeps source grouping semantics after S+ search filter", async () => {
    const view = render(
      <ComposerHarness
        skills={[
          {
            name: "lint-project",
            path: "/repo/.claude/skills/lint/SKILL.md",
            source: "project_claude",
            description: "project lint",
          },
          {
            name: "lint-global",
            path: "/Users/u/.codex/skills/lint/SKILL.md",
            source: "global_codex",
            description: "global lint",
          },
        ]}
      />,
    );

    await act(async () => {
      fireEvent.click(within(view.container).getAllByRole("button", { name: "S+" })[0]!);
    });

    const input = within(document.body).getByLabelText("搜索 Skill");

    await act(async () => {
      fireEvent.change(input, { target: { value: "lint" } });
    });

    expect(within(document.body).getByText("Project .claude")).toBeTruthy();
    expect(within(document.body).getByText("User .codex")).toBeTruthy();

    await act(async () => {
      fireEvent.change(input, { target: { value: "project" } });
    });

    expect(within(document.body).getByText("Project .claude")).toBeTruthy();
    expect(within(document.body).queryByText("User .codex")).toBeNull();
  });

  it("renders M+ with source groups and keeps slash token assembly clean", async () => {
    const onSend = vi.fn();
    const view = render(
      <ComposerHarness
        onSend={onSend}
        skills={[
          {
            name: "build-review",
            path: "/repo/.claude/skills/build-review/SKILL.md",
            source: "project_claude",
            description: "skill",
          },
        ]}
        commands={[
          {
            name: "team-lint",
            path: "/repo/.claude/commands/team/lint.md",
            source: "project_claude",
            description: "command",
            content: "body",
          },
          {
            name: "global-lint",
            path: "/Users/u/.claude/commands/global/lint.md",
            source: "global_claude",
            description: "global",
            content: "body",
          },
        ]}
      />,
    );

    await act(async () => {
      fireEvent.click(within(view.container).getAllByRole("button", { name: "M+" })[0]!);
    });
    expect(within(document.body).getByText("Project .claude")).toBeTruthy();
    expect(within(document.body).getByText("User .claude")).toBeTruthy();

    await act(async () => {
      fireEvent.click(within(view.container).getAllByRole("button", { name: "S+" })[0]!);
    });
    await act(async () => {
      fireEvent.click(within(document.body).getByRole("button", { name: /build-review/i }));
    });

    await act(async () => {
      fireEvent.click(within(view.container).getAllByRole("button", { name: "M+" })[0]!);
    });
    await act(async () => {
      fireEvent.click(within(document.body).getByRole("button", { name: /team-lint/i }));
    });

    const textarea = getTextarea(view.container);
    await act(async () => {
      fireEvent.change(textarea, {
        target: {
          value: "检查一下",
          selectionStart: 4,
        },
      });
      textarea.focus();
      textarea.setSelectionRange(4, 4);
      fireEvent.keyDown(textarea, { key: "Enter", bubbles: true });
    });

    const sentText = onSend.mock.calls[0]?.[0];
    expect(sentText).toBe("/build-review /team-lint 检查一下");
    expect(sentText).not.toContain("project_claude");
    expect(sentText).not.toContain("User .claude");
  });
});
