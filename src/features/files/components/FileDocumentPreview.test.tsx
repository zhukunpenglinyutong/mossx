/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileDocumentPreview } from "./FileDocumentPreview";
import type { FilePreviewPayload } from "../hooks/useFilePreviewPayload";

function makeDocumentPayload(html: string): FilePreviewPayload {
  return {
    kind: "extracted-structure",
    sourceKind: "extracted-structure",
    absolutePath: "/repo/docs/report.docx",
    assetUrl: "asset://report.docx",
    extension: "docx",
    byteLength: 2048,
    html,
    warnings: [],
  };
}

function translateDocumentKey(key: string) {
  switch (key) {
    case "files.loadingFile":
      return "loading";
    case "files.previewOutlineTitle":
      return "目录";
    case "files.previewOutlineUntitled":
      return "未命名章节";
    case "files.documentPreviewOutlineEmpty":
      return "未检测到目录";
    default:
      return key;
  }
}

describe("FileDocumentPreview", () => {
  afterEach(() => {
    cleanup();
  });

  it("preserves existing heading anchors so document internal links stay stable", () => {
    render(
      <FileDocumentPreview
        payload={makeDocumentPayload("<p><a href=\"#_Toc123\">前往概览</a></p><h1 id=\"_Toc123\">概览</h1>")}
        isLoading={false}
        error={null}
        t={translateDocumentKey}
      />,
    );

    const headingNode = screen.getByRole("heading", { level: 1, name: "概览" });
    const scrollIntoView = vi.fn();
    headingNode.scrollIntoView = scrollIntoView;

    fireEvent.click(screen.getByRole("button", { name: "概览" }));

    expect(headingNode.id).toBe("_Toc123");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("builds an outline from document headings and scrolls to anchors", () => {
    render(
      <FileDocumentPreview
        payload={makeDocumentPayload("<h1>概览</h1><p>说明</p><h2>细节</h2><p>更多内容</p>")}
        isLoading={false}
        error={null}
        t={translateDocumentKey}
      />,
    );

    const headingNode = screen.getByRole("heading", { level: 2, name: "细节" });
    const scrollIntoView = vi.fn();
    headingNode.scrollIntoView = scrollIntoView;

    fireEvent.click(screen.getByRole("button", { name: "细节" }));

    expect(screen.getByRole("button", { name: "概览" })).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("shows an empty outline state when no headings are present", () => {
    render(
      <FileDocumentPreview
        payload={makeDocumentPayload("<p>plain content only</p>")}
        isLoading={false}
        error={null}
        t={translateDocumentKey}
      />,
    );

    expect(screen.getByText("未检测到目录")).toBeTruthy();
  });
});
