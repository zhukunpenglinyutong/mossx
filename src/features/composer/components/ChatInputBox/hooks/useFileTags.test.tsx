// @vitest-environment jsdom
import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFileTags } from "./useFileTags";

function seedEditableText(element: HTMLDivElement, text: string) {
  const textNode = document.createTextNode(text);
  element.innerHTML = "";
  element.appendChild(textNode);
  const range = document.createRange();
  range.setStart(textNode, text.length);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

describe("useFileTags", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens the referenced file when clicking a rendered file tag", () => {
    const editable = document.createElement("div");
    document.body.appendChild(editable);
    const editableRef = { current: editable };
    const onOpenFileTag = vi.fn();

    seedEditableText(editable, "@AGENTS.md ");

    const { result } = renderHook(() =>
      useFileTags({
        editableRef,
        getTextContent: () => editable.textContent ?? "",
        onCloseCompletions: vi.fn(),
        onOpenFileTag,
      }),
    );

    act(() => {
      result.current.pathMappingRef.current.set("AGENTS.md", "/repo/AGENTS.md");
      result.current.renderFileTags();
    });

    const tag = editable.querySelector(".file-tag");
    expect(tag).toBeTruthy();

    fireEvent.click(tag!);

    expect(onOpenFileTag).toHaveBeenCalledWith("/repo/AGENTS.md");
  });

  it("removes the file tag without opening the file when clicking the close control", () => {
    const editable = document.createElement("div");
    document.body.appendChild(editable);
    const editableRef = { current: editable };
    const onOpenFileTag = vi.fn();

    seedEditableText(editable, "@AGENTS.md ");

    const { result } = renderHook(() =>
      useFileTags({
        editableRef,
        getTextContent: () => editable.textContent ?? "",
        onCloseCompletions: vi.fn(),
        onOpenFileTag,
      }),
    );

    act(() => {
      result.current.pathMappingRef.current.set("AGENTS.md", "/repo/AGENTS.md");
      result.current.renderFileTags();
    });

    const closeButton = editable.querySelector(".file-tag-close");
    expect(closeButton).toBeTruthy();

    fireEvent.click(closeButton!);

    expect(onOpenFileTag).not.toHaveBeenCalled();
    expect(editable.querySelector(".file-tag")).toBeNull();
  });

  it("keeps hash characters in real file names while stripping trailing line fragments", () => {
    const editable = document.createElement("div");
    document.body.appendChild(editable);
    const editableRef = { current: editable };
    const onOpenFileTag = vi.fn();

    seedEditableText(editable, '@"docs/foo#bar.ts#L12-L18" ');

    const { result } = renderHook(() =>
      useFileTags({
        editableRef,
        getTextContent: () => editable.textContent ?? "",
        onCloseCompletions: vi.fn(),
        onOpenFileTag,
      }),
    );

    act(() => {
      result.current.pathMappingRef.current.set(
        "docs/foo#bar.ts#L12-L18",
        "/repo/docs/foo#bar.ts#L12-L18",
      );
      result.current.renderFileTags();
    });

    const tag = editable.querySelector(".file-tag");
    expect(tag).toBeTruthy();

    fireEvent.click(tag!);

    expect(onOpenFileTag).toHaveBeenCalledWith("/repo/docs/foo#bar.ts");
  });
});
