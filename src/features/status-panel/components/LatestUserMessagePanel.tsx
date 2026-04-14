import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LatestUserMessagePreview } from "../utils/latestUserMessage";

const PREVIEW_LINE_LIMIT = 4;

interface LatestUserMessagePanelProps {
  preview: LatestUserMessagePreview;
}

function countLines(text: string) {
  if (!text) {
    return 0;
  }
  return text.split(/\r?\n/).length;
}

export const LatestUserMessagePanel = memo(function LatestUserMessagePanel({
  preview,
}: LatestUserMessagePanelProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [preview.text, preview.imageCount, preview.hasMessage]);

  const hasText = preview.text.length > 0;
  const hasImages = preview.imageCount > 0;
  const isExpandable = useMemo(
    () => countLines(preview.text) > PREVIEW_LINE_LIMIT,
    [preview.text],
  );

  if (!preview.hasMessage) {
    return <div className="sp-empty">{t("statusPanel.emptyLatestUserMessage")}</div>;
  }

  return (
    <div className="sp-latest-user-message">
      {hasText ? (
        <pre
          className={`sp-latest-user-message-text${
            !expanded && isExpandable ? " is-collapsed" : ""
          }`}
        >
          {preview.text}
        </pre>
      ) : null}

      {hasImages ? (
        <div className="sp-latest-user-message-meta">
          {t("statusPanel.latestUserMessageImages", { count: preview.imageCount })}
        </div>
      ) : null}

      {isExpandable ? (
        <button
          type="button"
          className="sp-latest-user-message-toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? t("statusPanel.collapseLatestUserMessage")
            : t("statusPanel.expandLatestUserMessage")}
        </button>
      ) : null}
    </div>
  );
});
