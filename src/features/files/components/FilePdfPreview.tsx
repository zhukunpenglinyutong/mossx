import { useEffect, useMemo, useRef, useState } from "react";
import {
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import { ensurePdfPreviewWorker } from "../utils/pdfPreviewRuntime";
import { PreviewOutlineSidebar } from "./PreviewOutlineSidebar";
import {
  extractPdfPreviewOutline,
  type PreviewOutlineItem,
} from "../utils/filePreviewOutline";

type FilePdfPreviewProps = {
  assetUrl: string | null;
  isLoading: boolean;
  error: string | null;
  t: (key: string, options?: Record<string, unknown>) => string;
};

type PdfPageCanvasProps = {
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  t: (key: string, options?: Record<string, unknown>) => string;
};

const MAX_PDF_PREVIEW_PAGES = 200;
const PDF_PAGE_WINDOW_OFFSET = 5;
const DEFAULT_PDF_SCALE = 1.15;
const MIN_PDF_SCALE = 0.75;
const MAX_PDF_SCALE = 3;
const PDF_SCALE_STEP = 0.1;

function PdfPageCanvas({ pdfDocument, pageNumber, scale, t }: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageRootRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(pageNumber <= 2);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    const node = pageRootRef.current;
    if (!node || shouldRender || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldRender(true);
      }
    }, { rootMargin: "240px 0px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldRender]);

  useEffect(() => {
    if (!shouldRender || !canvasRef.current) {
      return;
    }

    let disposed = false;
    let renderTask: RenderTask | null = null;
    setPageError(null);

    void (async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (disposed || !canvasRef.current) {
          return;
        }
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas context unavailable.");
        }
        const devicePixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * devicePixelRatio);
        canvas.height = Math.floor(viewport.height * devicePixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;
        if (!disposed) {
          page.cleanup();
        }
      } catch (error) {
        if (!disposed) {
          setPageError(error instanceof Error ? error.message : String(error));
        }
      }
    })();

    return () => {
      disposed = true;
      renderTask?.cancel();
    };
  }, [pageNumber, pdfDocument, scale, shouldRender]);

  return (
    <div ref={pageRootRef} className="fvp-pdf-page" data-page-number={pageNumber}>
      <header className="fvp-pdf-page-header">
        <span>{t("files.pdfPreviewPageLabel", { page: pageNumber })}</span>
      </header>
      {pageError ? (
        <div className="fvp-pdf-page-error">{pageError}</div>
      ) : shouldRender ? (
        <canvas ref={canvasRef} className="fvp-pdf-canvas" />
      ) : (
        <div className="fvp-pdf-page-placeholder">{t("files.pdfPreviewPagePlaceholder")}</div>
      )}
    </div>
  );
}

export function FilePdfPreview({
  assetUrl,
  isLoading,
  error,
  t,
}: FilePdfPreviewProps) {
  const previewRootRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollPageNumberRef = useRef<number | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [isRuntimeLoading, setIsRuntimeLoading] = useState(false);
  const [outlineItems, setOutlineItems] = useState<PreviewOutlineItem[]>([]);
  const [activeOutlineItemId, setActiveOutlineItemId] = useState<string | null>(null);
  const [pageWindowStart, setPageWindowStart] = useState(1);
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);
  const [pdfScale, setPdfScale] = useState(DEFAULT_PDF_SCALE);

  useEffect(() => {
    if (!assetUrl) {
      setPdfDocument(null);
      setNumPages(0);
      setRuntimeError(null);
      setIsRuntimeLoading(false);
      setOutlineItems([]);
      setActiveOutlineItemId(null);
      setPageWindowStart(1);
      setIsOutlineCollapsed(false);
      setPdfScale(DEFAULT_PDF_SCALE);
      return;
    }

    ensurePdfPreviewWorker();
    setPdfDocument(null);
    setNumPages(0);
    setRuntimeError(null);
    setIsRuntimeLoading(true);
    setOutlineItems([]);
    setActiveOutlineItemId(null);
    setPageWindowStart(1);
    setIsOutlineCollapsed(false);
    setPdfScale(DEFAULT_PDF_SCALE);
    let disposed = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let loadedDocument: PDFDocumentProxy | null = null;

    void (async () => {
      try {
        loadingTask = getDocument(assetUrl);
        const nextDocument = await loadingTask.promise;
        loadedDocument = nextDocument;
        if (disposed) {
          await nextDocument.destroy();
          return;
        }
        setPdfDocument(nextDocument);
        setNumPages(nextDocument.numPages);
        setRuntimeError(null);
        setIsRuntimeLoading(false);
      } catch (loadError) {
        if (!disposed) {
          setPdfDocument(null);
          setNumPages(0);
          setRuntimeError(loadError instanceof Error ? loadError.message : String(loadError));
          setIsRuntimeLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
      if (loadedDocument) {
        void loadedDocument.destroy();
      } else {
        void loadingTask?.destroy();
      }
    };
  }, [assetUrl]);

  useEffect(() => {
    if (!pdfDocument) {
      setOutlineItems([]);
      setActiveOutlineItemId(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const nextOutlineItems = await extractPdfPreviewOutline(
          pdfDocument,
          t("files.previewOutlineUntitled"),
        );
        if (!cancelled) {
          setOutlineItems(nextOutlineItems);
        }
      } catch {
        if (!cancelled) {
          setOutlineItems([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDocument, t]);

  const maxPageWindowStart = Math.max(1, numPages - MAX_PDF_PREVIEW_PAGES + 1);
  const normalizedPageWindowStart = Math.min(pageWindowStart, maxPageWindowStart);
  const visiblePageCount = Math.min(
    MAX_PDF_PREVIEW_PAGES,
    Math.max(0, numPages - normalizedPageWindowStart + 1),
  );
  const isPageCountTruncated = numPages > MAX_PDF_PREVIEW_PAGES;
  const visiblePageNumbers = useMemo(
    () => Array.from({ length: visiblePageCount }, (_, index) => normalizedPageWindowStart + index),
    [normalizedPageWindowStart, visiblePageCount],
  );

  const scrollToRenderedPage = (pageNumber: number) => {
    const pageNode = previewRootRef.current?.querySelector<HTMLElement>(
      `[data-page-number="${pageNumber}"]`,
    );
    pageNode?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleSelectOutlineItem = (item: PreviewOutlineItem) => {
    if (item.target.kind !== "pdf-page") {
      return;
    }
    const nextPageNumber = item.target.pageNumber;
    if (!Number.isInteger(nextPageNumber) || nextPageNumber < 1 || nextPageNumber > numPages) {
      return;
    }
    const nextWindowStart = Math.min(
      Math.max(nextPageNumber - PDF_PAGE_WINDOW_OFFSET, 1),
      maxPageWindowStart,
    );

    setActiveOutlineItemId(item.id);
    pendingScrollPageNumberRef.current = nextPageNumber;
    setPageWindowStart(nextWindowStart);

    if (
      nextWindowStart === normalizedPageWindowStart &&
      nextPageNumber >= normalizedPageWindowStart &&
      nextPageNumber < normalizedPageWindowStart + visiblePageCount
    ) {
      scrollToRenderedPage(nextPageNumber);
      pendingScrollPageNumberRef.current = null;
    }
  };

  useEffect(() => {
    const pendingPageNumber = pendingScrollPageNumberRef.current;
    if (!pendingPageNumber) {
      return;
    }
    scrollToRenderedPage(pendingPageNumber);
    pendingScrollPageNumberRef.current = null;
  }, [visiblePageNumbers]);

  const handleZoomOut = () => {
    setPdfScale((currentScale) => Math.max(
      MIN_PDF_SCALE,
      Math.round((currentScale - PDF_SCALE_STEP) * 100) / 100,
    ));
  };

  const handleZoomIn = () => {
    setPdfScale((currentScale) => Math.min(
      MAX_PDF_SCALE,
      Math.round((currentScale + PDF_SCALE_STEP) * 100) / 100,
    ));
  };

  const handleResetZoom = () => {
    setPdfScale(DEFAULT_PDF_SCALE);
  };

  if (isLoading || isRuntimeLoading) {
    return <div className="fvp-status">{t("files.loadingFile")}</div>;
  }

  if (error || runtimeError) {
    return <div className="fvp-status fvp-error">{error ?? runtimeError}</div>;
  }

  if (!assetUrl || !pdfDocument) {
    return <div className="fvp-status">{t("files.pdfPreviewUnavailable")}</div>;
  }

  return (
    <div className="fvp-preview-scroll">
      <div className={`fvp-preview-shell${isOutlineCollapsed ? " is-outline-collapsed" : ""}`}>
        {!isOutlineCollapsed ? (
          <PreviewOutlineSidebar
            title={t("files.previewOutlineTitle")}
            emptyLabel={t("files.pdfPreviewOutlineEmpty")}
            items={outlineItems}
            activeItemId={activeOutlineItemId}
            onSelectItem={handleSelectOutlineItem}
          />
        ) : null}
        <div ref={previewRootRef} className="fvp-pdf-preview fvp-preview-main">
          <header className="fvp-preview-section-header">
            <div className="fvp-preview-section-title">
              <strong>{t("files.pdfPreviewTitle")}</strong>
              <span>{t("files.pdfPreviewPageCount", { count: numPages })}</span>
            </div>
            <div className="fvp-preview-toolbar" role="toolbar" aria-label={t("files.pdfPreviewToolbarLabel")}>
              {outlineItems.length > 0 ? (
                <button
                  type="button"
                  className="fvp-preview-toolbar-button"
                  aria-label={t(
                    isOutlineCollapsed
                      ? "files.pdfPreviewExpandOutline"
                      : "files.pdfPreviewCollapseOutline",
                  )}
                  onClick={() => setIsOutlineCollapsed((current) => !current)}
                >
                  {isOutlineCollapsed ? t("files.pdfPreviewExpandOutline") : t("files.pdfPreviewCollapseOutline")}
                </button>
              ) : null}
              <button
                type="button"
                className="fvp-preview-toolbar-button"
                aria-label={t("files.pdfPreviewZoomOut")}
                disabled={pdfScale <= MIN_PDF_SCALE}
                onClick={handleZoomOut}
              >
                -
              </button>
              <button
                type="button"
                className="fvp-preview-toolbar-button fvp-preview-toolbar-value"
                aria-label={t("files.pdfPreviewResetZoom")}
                onClick={handleResetZoom}
              >
                {t("files.pdfPreviewZoomValue", { percent: Math.round(pdfScale * 100) })}
              </button>
              <button
                type="button"
                className="fvp-preview-toolbar-button"
                aria-label={t("files.pdfPreviewZoomIn")}
                disabled={pdfScale >= MAX_PDF_SCALE}
                onClick={handleZoomIn}
              >
                +
              </button>
            </div>
          </header>
          {isPageCountTruncated ? (
            <div className="fvp-preview-budget-hint">
              {t("files.pdfPreviewPageLimitHint", {
                visibleCount: visiblePageCount,
                totalCount: numPages,
                startPage: normalizedPageWindowStart,
              })}
            </div>
          ) : null}
          <div className="fvp-pdf-pages">
            {visiblePageNumbers.map((pageNumber) => (
              <PdfPageCanvas
                key={`pdf-page-${pageNumber}`}
                pdfDocument={pdfDocument}
                pageNumber={pageNumber}
                scale={pdfScale}
                t={t}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
