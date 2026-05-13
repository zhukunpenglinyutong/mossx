import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clampRendererContextMenuPosition,
  RendererContextMenu,
  type RendererContextMenuState,
} from "../../../components/ui/RendererContextMenu";
import type { QueuedMessage } from "../../../types";

type ComposerQueueProps = {
  queuedMessages: QueuedMessage[];
  onEditQueued?: (item: QueuedMessage) => void;
  onDeleteQueued?: (id: string) => void;
};

export function ComposerQueue({
  queuedMessages,
  onEditQueued,
  onDeleteQueued,
}: ComposerQueueProps) {
  const { t } = useTranslation();
  const [queueMenu, setQueueMenu] = useState<RendererContextMenuState | null>(null);
  const handleQueueMenu = useCallback(
    (event: React.MouseEvent, item: QueuedMessage) => {
      event.preventDefault();
      event.stopPropagation();
      const position = clampRendererContextMenuPosition(event.clientX, event.clientY, {
        width: 220,
        height: 120,
      });
      setQueueMenu({
        ...position,
        label: t("composer.queue"),
        items: [
          {
            type: "item",
            id: "edit",
            label: t("composer.editQueued"),
            onSelect: () => onEditQueued?.(item),
          },
          {
            type: "item",
            id: "delete",
            label: t("composer.deleteQueued"),
            tone: "danger",
            onSelect: () => onDeleteQueued?.(item.id),
          },
        ],
      });
    },
    [t, onDeleteQueued, onEditQueued],
  );

  if (queuedMessages.length === 0) {
    return null;
  }

  return (
    <div className="composer-queue">
      <div className="composer-queue-title">{t("composer.queue")}</div>
      <div className="composer-queue-list">
        {queuedMessages.map((item) => (
          <div key={item.id} className="composer-queue-item">
            <span className="composer-queue-text">
              {item.text ||
                (item.images?.length
                  ? item.images.length === 1
                    ? "Image"
                    : "Images"
                  : "")}
              {item.images?.length
                ? ` · ${item.images.length} image${item.images.length === 1 ? "" : "s"}`
                : ""}
            </span>
            <button
              className="composer-queue-menu"
              onClick={(event) => handleQueueMenu(event, item)}
              aria-label="Queue item menu"
            >
              ...
            </button>
          </div>
        ))}
      </div>
      {queueMenu ? (
        <RendererContextMenu
          menu={queueMenu}
          onClose={() => setQueueMenu(null)}
          className="renderer-context-menu composer-queue-context-menu"
        />
      ) : null}
    </div>
  );
}
