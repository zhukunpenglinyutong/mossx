import { useTranslation } from "react-i18next";
import ArrowUpRight from "lucide-react/dist/esm/icons/arrow-up-right";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open";
import MessageSquareText from "lucide-react/dist/esm/icons/message-square-text";

export type ThreadCompletionNotice = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  threadId: string;
  threadName: string;
  completedAt: number;
};

type ThreadCompletionBubbleProps = {
  notices: ThreadCompletionNotice[];
  avoidBottomOffset?: boolean;
  onOpen: (notice: ThreadCompletionNotice) => void;
  onDismiss: (id: string) => void;
};

export function ThreadCompletionBubble({
  notices,
  avoidBottomOffset = false,
  onOpen,
  onDismiss,
}: ThreadCompletionBubbleProps) {
  const { t } = useTranslation();

  if (notices.length === 0) {
    return null;
  }

  return (
    <div
      className={`thread-completion-bubbles${avoidBottomOffset ? " is-offset" : ""}`}
      role="region"
      aria-live="polite"
    >
      {notices.map((notice) => (
        <article key={notice.id} className="thread-completion-bubble" role="status">
          <div className="thread-completion-bubble-head">
            <p className="thread-completion-bubble-title">
              {t("threadCompletion.title")} ·{" "}
              {new Date(notice.completedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
            <button
              type="button"
              className="thread-completion-bubble-open-icon"
              onClick={() => onOpen(notice)}
              aria-label={t("threadCompletion.open")}
              title={t("threadCompletion.open")}
            >
              <ArrowUpRight size={16} />
            </button>
            <button
              type="button"
              className="thread-completion-bubble-close"
              onClick={() => onDismiss(notice.id)}
              aria-label={t("threadCompletion.dismiss")}
            >
              ×
            </button>
          </div>
          <p className="thread-completion-bubble-line" title={notice.workspaceName}>
            <span className="thread-completion-bubble-prefix">
              <FolderOpen size={12} />
              {t("threadCompletion.project")}
            </span>
            <strong>{notice.workspaceName}</strong>
          </p>
          <p className="thread-completion-bubble-line" title={notice.threadName}>
            <span className="thread-completion-bubble-prefix">
              <MessageSquareText size={12} />
              {t("threadCompletion.session")}
            </span>
            <strong>{notice.threadName}</strong>
          </p>
        </article>
      ))}
    </div>
  );
}
