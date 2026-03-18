/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePasteAndDrop } from "./usePasteAndDrop";

let windowDropHandler:
  | ((event: {
      payload: {
        type: "enter" | "over" | "leave" | "drop";
        position: { x: number; y: number };
        paths?: string[];
      };
    }) => void)
  | null = null;

vi.mock("../../../../../services/dragDrop.js", () => ({
  subscribeWindowDragDrop: (handler: typeof windowDropHandler) => {
    windowDropHandler = handler;
    return () => {
      windowDropHandler = null;
    };
  },
}));

type HookResult = ReturnType<typeof usePasteAndDrop>;

function createHarness(disabled = false) {
  let result: HookResult | undefined;
  const editable = document.createElement("div");
  editable.contentEditable = "true";
  editable.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 300, bottom: 120 } as DOMRect);
  document.body.appendChild(editable);

  const pathMappingRef = { current: new Map<string, string>() };
  const adjustHeight = vi.fn();
  const renderFileTags = vi.fn();
  const setHasContent = vi.fn();
  const setInternalAttachments = vi.fn();
  const onInput = vi.fn();
  const fileCompletion = { close: vi.fn() };
  const commandCompletion = { close: vi.fn() };
  const handleInput = vi.fn();
  const flushInput = vi.fn();

  function Test() {
    result = usePasteAndDrop({
      disabled,
      editableRef: { current: editable },
      pathMappingRef,
      getTextContent: () => editable.textContent ?? "",
      adjustHeight,
      renderFileTags,
      setHasContent,
      setInternalAttachments,
      onInput,
      fileCompletion,
      commandCompletion,
      handleInput,
      flushInput,
    });
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(Test));
  });

  return {
    get result() {
      if (!result) {
        throw new Error("hook not ready");
      }
      return result;
    },
    editable,
    pathMappingRef,
    renderFileTags,
    onInput,
    setHasContent,
    unmount() {
      act(() => root.unmount());
      container.remove();
      editable.remove();
    },
  };
}

describe("usePasteAndDrop path insertion", () => {
  afterEach(() => {
    delete window.__fileTreeDragPaths;
    delete window.__fileTreeDragStamp;
    delete window.__fileTreeDragActive;
  });

  it("inserts multi-path payload from custom drag data once", () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const dropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        files: [] as File[],
        getData: (type: string) =>
          type === "application/x-codemoss-file-paths"
            ? JSON.stringify(["/tmp/a.ts", "/tmp/b.ts"])
            : "",
      },
    } as unknown as React.DragEvent;

    act(() => {
      harness.result.handleDrop(dropEvent);
    });

    expect(harness.editable.textContent).toContain("@/tmp/a.ts");
    expect(harness.editable.textContent).toContain("@/tmp/b.ts");
    expect(harness.pathMappingRef.current.get("a.ts")).toBe("/tmp/a.ts");
    expect(harness.pathMappingRef.current.get("b.ts")).toBe("/tmp/b.ts");
    vi.runAllTimers();
    expect(harness.renderFileTags).toHaveBeenCalled();
    harness.unmount();
    vi.useRealTimers();
  });

  it("falls back to file-tree bridge paths when dataTransfer is empty", () => {
    const harness = createHarness();
    window.__fileTreeDragPaths = ["/tmp/from-tree.ts"];
    window.__fileTreeDragStamp = Date.now();
    const dropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        files: [] as File[],
        getData: () => "",
      },
    } as unknown as React.DragEvent;

    act(() => {
      harness.result.handleDrop(dropEvent);
    });

    expect(harness.editable.textContent).toContain("@/tmp/from-tree.ts");
    expect(window.__fileTreeDragPaths).toBeUndefined();
    expect(window.__fileTreeDragStamp).toBeUndefined();
    harness.unmount();
  });

  it("still inserts bridge paths when drop text payload is oversized", () => {
    const harness = createHarness();
    window.__fileTreeDragPaths = ["/tmp/from-tree-large.txt"];
    window.__fileTreeDragStamp = Date.now();
    const dropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        files: [] as File[],
        getData: (type: string) =>
          type === "text/plain" ? "x".repeat(150_000) : "",
      },
    } as unknown as React.DragEvent;

    act(() => {
      harness.result.handleDrop(dropEvent);
    });

    expect(harness.editable.textContent).toContain("@/tmp/from-tree-large.txt");
    expect(window.__fileTreeDragPaths).toBeUndefined();
    expect(window.__fileTreeDragStamp).toBeUndefined();
    harness.unmount();
  });

  it("consumes internal file-tree drag via document-level drop fallback", () => {
    const harness = createHarness();
    window.__fileTreeDragPaths = ["/tmp/from-document-drop.ts"];
    window.__fileTreeDragStamp = Date.now();
    window.__fileTreeDragActive = true;

    const dragOverEvent = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvent, "clientX", { value: 10 });
    Object.defineProperty(dragOverEvent, "clientY", { value: 10 });
    act(() => {
      document.dispatchEvent(dragOverEvent);
    });

    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "clientX", { value: 10 });
    Object.defineProperty(dropEvent, "clientY", { value: 10 });
    act(() => {
      document.dispatchEvent(dropEvent);
    });

    expect(harness.editable.textContent).toContain("@/tmp/from-document-drop.ts");
    expect(window.__fileTreeDragPaths).toBeUndefined();
    expect(window.__fileTreeDragStamp).toBeUndefined();
    expect(window.__fileTreeDragActive).toBeUndefined();
    harness.unmount();
  });

  it("does not clear file-tree bridge on document dragend before source dragend fallback", () => {
    const harness = createHarness();
    window.__fileTreeDragPaths = ["/tmp/from-tree-dragend.ts"];
    window.__fileTreeDragStamp = Date.now();
    window.__fileTreeDragActive = true;

    const dragEndEvent = new Event("dragend", { bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(dragEndEvent);
    });

    expect(window.__fileTreeDragPaths).toEqual(["/tmp/from-tree-dragend.ts"]);
    expect(window.__fileTreeDragActive).toBe(true);
    harness.unmount();
  });

  it("dedupes repeated drop payload from DOM and window channels", () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const dropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        files: [] as File[],
        getData: (type: string) =>
          type === "text/plain" ? "/tmp/a.ts" : "",
      },
    } as unknown as React.DragEvent;

    act(() => {
      harness.result.handleDrop(dropEvent);
    });

    act(() => {
      windowDropHandler?.({
        payload: { type: "drop", position: { x: 10, y: 10 }, paths: ["/tmp/a.ts"] },
      });
    });

    const allText = harness.editable.textContent ?? "";
    const referenceCount = allText.split("@/tmp/a.ts").length - 1;
    expect(referenceCount).toBe(1);
    harness.unmount();
    vi.useRealTimers();
  });

  it("ignores window drop outside editable bounds", () => {
    const harness = createHarness();
    act(() => {
      windowDropHandler?.({
        payload: { type: "drop", position: { x: 999, y: 999 }, paths: ["/tmp/a.ts"] },
      });
    });
    expect(harness.editable.textContent).toBe("");
    harness.unmount();
  });

  it("shows generic drag overlay for window enter/over even when paths are unavailable", () => {
    const harness = createHarness();
    expect(harness.result.isDragOver).toBe(false);

    act(() => {
      windowDropHandler?.({
        payload: { type: "enter", position: { x: 10, y: 10 } },
      });
    });
    expect(harness.result.isDragOver).toBe(true);
    expect(harness.result.dragPreviewNames).toEqual([]);

    act(() => {
      windowDropHandler?.({
        payload: { type: "leave", position: { x: 10, y: 10 } },
      });
    });
    expect(harness.result.isDragOver).toBe(false);
    harness.unmount();
  });
});
