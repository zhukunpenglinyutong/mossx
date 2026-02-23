// @vitest-environment jsdom
import { createRef, type ComponentProps } from "react";
import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AutocompleteItem } from "../hooks/useComposerAutocomplete";
import { ComposerInput } from "./ComposerInput";

function makeMemorySuggestion(partial: Partial<AutocompleteItem>): AutocompleteItem {
  return {
    id: "memory:default",
    label: "默认记忆",
    kind: "manual-memory",
    memoryId: "mem-default",
    memoryTitle: "默认记忆",
    memorySummary: "默认摘要",
    memoryDetail: "默认详情",
    memoryKind: "note",
    memoryImportance: "high",
    memoryUpdatedAt: 1_700_000_000_000,
    memoryTags: ["tag-a"],
    ...partial,
  };
}

function renderComposerInput(overrides: Partial<ComponentProps<typeof ComposerInput>> = {}) {
  const textareaRef = createRef<HTMLTextAreaElement>();
  return render(
    <ComposerInput
      text="@@"
      disabled={false}
      sendLabel="Send"
      canStop={false}
      canSend={false}
      isProcessing={false}
      onStop={() => {}}
      onSend={() => {}}
      onTextChange={() => {}}
      onSelectionChange={() => {}}
      onKeyDown={() => {}}
      textareaRef={textareaRef}
      suggestionsOpen
      suggestions={[]}
      autocompleteTrigger="@@"
      selectedManualMemoryIds={[]}
      highlightIndex={0}
      onHighlightIndex={() => {}}
      onSelectSuggestion={() => {}}
      {...overrides}
    />,
  );
}

describe("ComposerInput manual memory picker", () => {
  it("renders preview for highlighted memory and hover only updates highlight", () => {
    const onHighlightIndex = vi.fn();
    const onSelectSuggestion = vi.fn();
    const suggestions = [
      makeMemorySuggestion({
        id: "memory:mem-1",
        label: "发布步骤",
        memoryId: "mem-1",
        memoryTitle: "发布步骤",
        memoryDetail: "先构建，再运行 smoke test，最后发布。",
      }),
      makeMemorySuggestion({
        id: "memory:mem-2",
        label: "数据库回滚预案",
        memoryId: "mem-2",
        memoryTitle: "数据库回滚预案",
        memoryDetail: "发现异常后，先冻结写流量，再执行回滚脚本。",
      }),
    ];

    const view = renderComposerInput({
      suggestions,
      onHighlightIndex,
      onSelectSuggestion,
      highlightIndex: 0,
    });

    expect(within(view.container).getByText("先构建，再运行 smoke test，最后发布。")).toBeTruthy();

    fireEvent.mouseEnter(within(view.container).getByRole("option", { name: /数据库回滚预案/ }));
    expect(onHighlightIndex).toHaveBeenCalledWith(1);
    expect(onSelectSuggestion).not.toHaveBeenCalled();
  });

  it("updates preview with highlight and selects on click", () => {
    const onHighlightIndex = vi.fn();
    const onSelectSuggestion = vi.fn();
    const suggestions = [
      makeMemorySuggestion({
        id: "memory:mem-1",
        label: "发布步骤",
        memoryId: "mem-1",
        memoryTitle: "发布步骤",
        memoryDetail: "先构建，再运行 smoke test，最后发布。",
      }),
      makeMemorySuggestion({
        id: "memory:mem-2",
        label: "数据库回滚预案",
        memoryId: "mem-2",
        memoryTitle: "数据库回滚预案",
        memoryDetail: "发现异常后，先冻结写流量，再执行回滚脚本。",
      }),
    ];

    const view = renderComposerInput({
      suggestions,
      onHighlightIndex,
      onSelectSuggestion,
      highlightIndex: 0,
      selectedManualMemoryIds: ["mem-1"],
    });

    view.rerender(
      <ComposerInput
        text="@@"
        disabled={false}
        sendLabel="Send"
        canStop={false}
        canSend={false}
        isProcessing={false}
        onStop={() => {}}
        onSend={() => {}}
        onTextChange={() => {}}
        onSelectionChange={() => {}}
        onKeyDown={() => {}}
        textareaRef={createRef<HTMLTextAreaElement>()}
        suggestionsOpen
        suggestions={suggestions}
        autocompleteTrigger="@@"
        selectedManualMemoryIds={["mem-1"]}
        highlightIndex={1}
        onHighlightIndex={onHighlightIndex}
        onSelectSuggestion={onSelectSuggestion}
      />,
    );

    const optionsAfterRerender = within(view.container).getAllByRole("option");
    expect(optionsAfterRerender[1]?.className).toContain("is-active");

    fireEvent.click(within(view.container).getByRole("option", { name: /数据库回滚预案/ }));
    expect(onSelectSuggestion).toHaveBeenCalledWith(suggestions[1]);
  });

  it("shows user input as list title and hides list summary for merged memories", () => {
    const suggestions = [
      makeMemorySuggestion({
        id: "memory:mem-merge",
        label: "你好！",
        memoryId: "mem-merge",
        memoryTitle: "你好！",
        memorySummary: "这段摘要不应出现在左侧列表",
        memoryDetail:
          "用户输入：skills/wf-thinking 分析一下\n助手输出摘要：这段摘要不应出现在左侧列表\n助手输出：完整回答",
      }),
    ];

    const view = renderComposerInput({
      suggestions,
      highlightIndex: 0,
    });

    const option = within(view.container).getByRole("option", {
      name: /skills\/wf-thinking 分析一下/,
    });
    expect(within(option).getByText("skills/wf-thinking 分析一下")).toBeTruthy();
    expect(option.querySelector(".composer-memory-picker-card-summary")).toBeNull();
    expect(within(option).queryByText("这段摘要不应出现在左侧列表")).toBeNull();
  });

  it("renders structured preview sections for merged memory detail", () => {
    const suggestions = [
      makeMemorySuggestion({
        id: "memory:mem-structured",
        label: "结构化记忆",
        memoryId: "mem-structured",
        memoryTitle: "结构化记忆",
        memoryDetail:
          "用户输入：我要发布\n助手输出摘要：先构建后 smoke test\n助手输出：## 发布步骤\n- 构建\n- 验证",
      }),
    ];

    const view = renderComposerInput({
      suggestions,
      highlightIndex: 0,
    });

    expect(within(view.container).getByText("用户输入")).toBeTruthy();
    expect(within(view.container).getByText("助手输出摘要")).toBeTruthy();
    expect(within(view.container).getByText("助手输出")).toBeTruthy();
    expect(within(view.container).getByRole("heading", { level: 2, name: "发布步骤" })).toBeTruthy();
    expect(within(view.container).getByText("构建")).toBeTruthy();
    expect(within(view.container).getByText("验证")).toBeTruthy();
  });

  it("shows current @@ query in picker header", () => {
    const suggestions = [
      makeMemorySuggestion({
        id: "memory:mem-q",
        label: "数据库回滚预案",
        memoryId: "mem-q",
      }),
    ];
    const text = "@@回滚";
    const view = renderComposerInput({
      text,
      selectionStart: text.length,
      suggestions,
      highlightIndex: 0,
    });

    const header = view.container.querySelector(".composer-memory-picker-title");
    expect(header?.textContent || "").toContain("@@回滚");
  });
});
