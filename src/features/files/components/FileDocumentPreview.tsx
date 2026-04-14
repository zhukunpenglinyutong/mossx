import { useEffect, useMemo, useRef, useState } from "react";
import type { FilePreviewPayload } from "../hooks/useFilePreviewPayload";
import { PreviewOutlineSidebar } from "./PreviewOutlineSidebar";
import {
  extractDocumentPreviewOutline,
  type PreviewOutlineItem,
} from "../utils/filePreviewOutline";

type FileDocumentPreviewProps = {
  payload: FilePreviewPayload | null;
  isLoading: boolean;
  error: string | null;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export function FileDocumentPreview({
  payload,
  isLoading,
  error,
  t,
}: FileDocumentPreviewProps) {
  const articleRef = useRef<HTMLElement | null>(null);
  const [activeOutlineItemId, setActiveOutlineItemId] = useState<string | null>(null);
  const outlinedDocument = useMemo(
    () => payload?.kind === "extracted-structure"
      ? extractDocumentPreviewOutline(payload.html, t("files.previewOutlineUntitled"))
      : { html: "", outline: [] },
    [payload, t],
  );

  useEffect(() => {
    setActiveOutlineItemId(null);
  }, [outlinedDocument.html]);

  if (isLoading) {
    return <div className="fvp-status">{t("files.loadingFile")}</div>;
  }

  if (error) {
    return <div className="fvp-status fvp-error">{error}</div>;
  }

  if (!payload) {
    return <div className="fvp-status">{t("files.documentPreviewUnavailable")}</div>;
  }

  if (payload.kind === "unsupported") {
    const message = payload.reason === "legacy-doc"
      ? t("files.documentPreviewLegacyDocFallback")
      : payload.reason === "budget-exceeded"
        ? t("files.documentPreviewTooLarge", {
          maxMb: payload.budgetMegabytes ?? 2,
        })
      : payload.detail ?? t("files.documentPreviewUnavailable");
    return (
      <div className="fvp-preview-scroll">
        <div className="fvp-document-preview fvp-document-preview--fallback">
          <header className="fvp-preview-section-header">
            <strong>{t("files.documentPreviewTitle")}</strong>
          </header>
          <p>{message}</p>
          <p className="fvp-preview-budget-hint">{t("files.documentPreviewFallbackHint")}</p>
        </div>
      </div>
    );
  }

  if (payload.kind !== "extracted-structure") {
    return <div className="fvp-status">{t("files.documentPreviewUnavailable")}</div>;
  }

  const handleSelectOutlineItem = (item: PreviewOutlineItem) => {
    if (item.target.kind !== "html-anchor") {
      return;
    }
    const articleNode = articleRef.current;
    if (!articleNode) {
      return;
    }
    const anchorNode = articleNode.ownerDocument.getElementById(item.target.anchorId);
    if (!(anchorNode instanceof HTMLElement) || !articleNode.contains(anchorNode)) {
      return;
    }
    setActiveOutlineItemId(item.id);
    anchorNode?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="fvp-preview-scroll">
      <div className="fvp-preview-shell">
        <PreviewOutlineSidebar
          title={t("files.previewOutlineTitle")}
          emptyLabel={t("files.documentPreviewOutlineEmpty")}
          items={outlinedDocument.outline}
          activeItemId={activeOutlineItemId}
          onSelectItem={handleSelectOutlineItem}
        />
        <div className="fvp-document-preview fvp-preview-main">
          <header className="fvp-preview-section-header">
            <strong>{t("files.documentPreviewTitle")}</strong>
            {payload.byteLength > 0 ? (
              <span>{t("files.documentPreviewByteLength", { bytes: payload.byteLength })}</span>
            ) : null}
          </header>
          {payload.warnings.length > 0 ? (
            <div className="fvp-preview-budget-hint">
              {payload.warnings[0]}
            </div>
          ) : null}
          <article
            ref={articleRef}
            className="fvp-document-preview-article"
            dangerouslySetInnerHTML={{ __html: outlinedDocument.html }}
          />
        </div>
      </div>
    </div>
  );
}
