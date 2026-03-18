/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import {
  dedupeAndValidateFilePaths,
  insertFilePathReferences,
  normalizePathForComparison,
  parsePathsFromDropText,
} from "./filePathReferences";

describe("filePathReferences utils", () => {
  it("normalizes windows drive for comparison", () => {
    expect(normalizePathForComparison("C:\\Workspace\\README.md")).toBe("c:/Workspace/README.md");
    expect(normalizePathForComparison("c:/Workspace/README.md")).toBe("c:/Workspace/README.md");
  });

  it("dedupes paths with win/mac separator variants", () => {
    const result = dedupeAndValidateFilePaths([
      "C:\\workspace\\a.ts",
      "c:/workspace/a.ts",
      "/tmp/demo/file.ts",
      "/tmp/demo/file.ts",
    ]);
    expect(result).toEqual(["C:\\workspace\\a.ts", "/tmp/demo/file.ts"]);
  });

  it("parses custom payload json and line-based text", () => {
    expect(parsePathsFromDropText('["/a","/b"]')).toEqual(["/a", "/b"]);
    expect(parsePathsFromDropText("/a\n/b\n")).toEqual(["/a", "/b"]);
    expect(parsePathsFromDropText("file:///tmp/demo%20space.ts")).toEqual([
      "/tmp/demo space.ts",
    ]);
  });

  it("inserts deduped file references and updates mapping", () => {
    vi.useFakeTimers();
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    document.body.appendChild(editable);
    editable.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const pathMappingRef = { current: new Map<string, string>() };
    const renderFileTags = vi.fn();
    const setHasContent = vi.fn();
    const onInput = vi.fn();

    const inserted = insertFilePathReferences({
      editableRef: { current: editable },
      pathMappingRef,
      filePaths: ["/tmp/a.ts", "/tmp/a.ts", "C:\\repo\\b.ts", "c:/repo/b.ts"],
      getTextContent: () => editable.textContent ?? "",
      adjustHeight: vi.fn(),
      renderFileTags,
      setHasContent,
      onInput,
      fileCompletion: { close: vi.fn() },
      commandCompletion: { close: vi.fn() },
    });

    expect(inserted).toEqual(["/tmp/a.ts", "C:\\repo\\b.ts"]);
    expect(editable.textContent).toContain("@/tmp/a.ts");
    expect(editable.textContent).toContain("@C:\\repo\\b.ts");
    expect(pathMappingRef.current.get("a.ts")).toBe("/tmp/a.ts");
    expect(pathMappingRef.current.get("b.ts")).toBe("C:\\repo\\b.ts");

    vi.runAllTimers();
    expect(renderFileTags).toHaveBeenCalled();
    expect(setHasContent).toHaveBeenCalledWith(true);
    expect(onInput).toHaveBeenCalled();

    vi.useRealTimers();
    editable.remove();
  });
});
