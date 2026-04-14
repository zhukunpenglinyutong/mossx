/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilePdfPreview } from "./FilePdfPreview";

const pdfMocks = vi.hoisted(() => ({
  ensurePdfPreviewWorker: vi.fn(),
  getDocument: vi.fn(),
}));

vi.mock("../utils/pdfPreviewRuntime", () => ({
  ensurePdfPreviewWorker: pdfMocks.ensurePdfPreviewWorker,
}));

vi.mock("pdfjs-dist", () => ({
  getDocument: pdfMocks.getDocument,
}));

function createPdfDocument(numPages: number, overrides?: {
  getOutline?: () => Promise<Array<{
    title: string;
    dest: string | Array<unknown> | null;
    items: Array<any>;
  }> | null>;
  getDestination?: (destination: string) => Promise<Array<unknown> | null>;
  getPageIndex?: (ref: { num: number; gen: number }) => Promise<number>;
}) {
  return {
    numPages,
    destroy: vi.fn(),
    getOutline: overrides?.getOutline ?? vi.fn().mockResolvedValue([]),
    getDestination: overrides?.getDestination ?? vi.fn().mockResolvedValue(null),
    getPageIndex: overrides?.getPageIndex ?? vi.fn().mockResolvedValue(0),
    getPage: vi.fn().mockImplementation(async () => ({
      getViewport: vi.fn(() => ({ width: 120, height: 180 })),
      render: vi.fn(() => ({
        promise: Promise.resolve(),
        cancel: vi.fn(),
      })),
      cleanup: vi.fn(),
    })),
  };
}

function translatePdfKey(key: string, options?: Record<string, unknown>) {
  switch (key) {
    case "files.loadingFile":
      return "loading";
    case "files.previewOutlineTitle":
      return "Outline";
    case "files.previewOutlineUntitled":
      return "Untitled section";
    case "files.pdfPreviewOutlineEmpty":
      return "No outline";
    case "files.pdfPreviewToolbarLabel":
      return "PDF toolbar";
    case "files.pdfPreviewCollapseOutline":
      return "Hide outline";
    case "files.pdfPreviewExpandOutline":
      return "Show outline";
    case "files.pdfPreviewZoomOut":
      return "Zoom out";
    case "files.pdfPreviewZoomIn":
      return "Zoom in";
    case "files.pdfPreviewResetZoom":
      return "Reset zoom";
    case "files.pdfPreviewZoomValue":
      return `${String(options?.percent)}%`;
    case "files.pdfPreviewPageLimitHint":
      return `limit-${String(options?.visibleCount)}-${String(options?.totalCount)}`;
    case "files.pdfPreviewPageLabel":
      return `page-${String(options?.page)}`;
    default:
      return key;
  }
}

describe("FilePdfPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ setTransform: vi.fn() } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("disposes the pdf runtime and cancels page rendering on unmount", async () => {
    const renderCancel = vi.fn();
    const loadingTaskDestroy = vi.fn();
    const documentDestroy = vi.fn();
    const pageCleanup = vi.fn();

    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({
        ...createPdfDocument(1),
        destroy: documentDestroy,
        getPage: vi.fn().mockResolvedValue({
          getViewport: vi.fn(() => ({ width: 120, height: 180 })),
          render: vi.fn(() => ({
            promise: new Promise(() => {}),
            cancel: renderCancel,
          })),
          cleanup: pageCleanup,
        }),
      }),
      destroy: loadingTaskDestroy,
    });

    const { unmount } = render(
      <FilePdfPreview
        assetUrl="asset://preview.pdf"
        isLoading={false}
        error={null}
        t={translatePdfKey}
      />,
    );

    await waitFor(() => {
      expect(pdfMocks.getDocument).toHaveBeenCalledWith("asset://preview.pdf");
    });

    await waitFor(() => {
      expect(pdfMocks.ensurePdfPreviewWorker).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(loadingTaskDestroy).not.toHaveBeenCalled();
    expect(documentDestroy).toHaveBeenCalledTimes(1);
    expect(renderCancel).toHaveBeenCalledTimes(1);
    expect(pageCleanup).not.toHaveBeenCalled();
  });

  it("clears stale document content on asset changes and caps rendered page containers", async () => {
    pdfMocks.getDocument
      .mockReturnValueOnce({
        promise: Promise.resolve(createPdfDocument(250)),
        destroy: vi.fn(),
      })
      .mockReturnValueOnce({
        promise: new Promise(() => {}),
        destroy: vi.fn(),
      });

    const { container, rerender } = render(
      <FilePdfPreview
        assetUrl="asset://first.pdf"
        isLoading={false}
        error={null}
        t={translatePdfKey}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("limit-200-250")).toBeTruthy();
    });
    expect(container.querySelectorAll(".fvp-pdf-page")).toHaveLength(200);

    rerender(
      <FilePdfPreview
        assetUrl="asset://second.pdf"
        isLoading={false}
        error={null}
        t={translatePdfKey}
      />,
    );

    await waitFor(() => {
      expect(pdfMocks.getDocument).toHaveBeenCalledWith("asset://second.pdf");
    });
    expect(container.querySelectorAll(".fvp-pdf-page")).toHaveLength(0);
    expect(screen.getByText("loading")).toBeTruthy();
  });

  it("renders outline entries and jumps the preview window to later pages", async () => {
    const outlineDocument = createPdfDocument(260, {
      getOutline: vi.fn().mockResolvedValue([
        {
          title: "Appendix",
          dest: [{ num: 7, gen: 0 }],
          items: [],
        },
      ]),
      getPageIndex: vi.fn().mockResolvedValue(239),
    });

    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.resolve(outlineDocument),
      destroy: vi.fn(),
    });

    render(
      <FilePdfPreview
        assetUrl="asset://with-outline.pdf"
        isLoading={false}
        error={null}
        t={translatePdfKey}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Appendix" })).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Hide outline" })).toBeTruthy();
    expect(screen.getByText("page-1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Appendix" }));

    await waitFor(() => {
      expect(screen.getByText("page-240")).toBeTruthy();
    });
    expect(screen.queryByText("page-1")).toBeNull();
  });

  it("drops outline entries that resolve outside the document page range", async () => {
    const invalidOutlineDocument = createPdfDocument(4, {
      getOutline: vi.fn().mockResolvedValue([
        {
          title: "Broken target",
          dest: [{ num: 99, gen: 0 }],
          items: [],
        },
      ]),
      getPageIndex: vi.fn().mockResolvedValue(99),
    });

    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.resolve(invalidOutlineDocument),
      destroy: vi.fn(),
    });

    render(
      <FilePdfPreview
        assetUrl="asset://invalid-outline.pdf"
        isLoading={false}
        error={null}
        t={translatePdfKey}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("No outline")).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "Broken target" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hide outline" })).toBeNull();
  });

  it("supports collapsing the outline sidebar and changing zoom scale from the toolbar", async () => {
    const getViewport = vi.fn(() => ({ width: 120, height: 180 }));
    const pdfDocument = createPdfDocument(1, {
      getOutline: vi.fn().mockResolvedValue([
        {
          title: "Section A",
          dest: [{ num: 1, gen: 0 }],
          items: [],
        },
      ]),
      getPageIndex: vi.fn().mockResolvedValue(0),
    });

    pdfDocument.getPage = vi.fn().mockResolvedValue({
      getViewport,
      render: vi.fn(() => ({
        promise: Promise.resolve(),
        cancel: vi.fn(),
      })),
      cleanup: vi.fn(),
    });

    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.resolve(pdfDocument),
      destroy: vi.fn(),
    });

    render(
      <FilePdfPreview
        assetUrl="asset://zoomable.pdf"
        isLoading={false}
        error={null}
        t={translatePdfKey}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Hide outline" })).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Section A" })).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText("115%")).toBeTruthy();
    });
    expect(getViewport).toHaveBeenCalledWith({ scale: 1.15 });

    fireEvent.click(screen.getByRole("button", { name: "Hide outline" }));
    expect(screen.queryByRole("button", { name: "Section A" })).toBeNull();
    expect(screen.getByRole("button", { name: "Show outline" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await waitFor(() => {
      expect(screen.getByText("125%")).toBeTruthy();
    });
    expect(getViewport).toHaveBeenCalledWith({ scale: 1.25 });

    const zoomInButton = screen.getByRole("button", { name: "Zoom in" });
    for (let currentStep = 0; currentStep < 18; currentStep += 1) {
      fireEvent.click(zoomInButton);
    }

    await waitFor(() => {
      expect(screen.getByText("300%")).toBeTruthy();
    });
    expect(getViewport).toHaveBeenCalledWith({ scale: 3 });
    expect((zoomInButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    await waitFor(() => {
      expect(screen.getByText("115%")).toBeTruthy();
    });
  });
});
