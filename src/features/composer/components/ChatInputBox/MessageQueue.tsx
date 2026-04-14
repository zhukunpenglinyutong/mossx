import { useTranslation } from 'react-i18next';
import type { QueuedMessage } from './types';

const MESSAGE_QUEUE_PREVIEW_LIMIT = 120;

function buildMessageQueuePreview(content: string): string {
  const normalizedContent = content.replace(/\s+/g, ' ').trim();
  if (normalizedContent.length <= MESSAGE_QUEUE_PREVIEW_LIMIT) {
    return normalizedContent;
  }
  return `${normalizedContent.slice(0, MESSAGE_QUEUE_PREVIEW_LIMIT - 1)}…`;
}

function isFuseEligibleQueuedContent(content: string): boolean {
  return !content.trim().startsWith('/');
}

export interface MessageQueueProps {
  /** Queue items */
  queue: QueuedMessage[];
  /** Remove item callback */
  onRemove: (id: string) => void;
  /** Fuse item callback */
  onFuse?: (id: string) => void;
  /** Whether fuse is available */
  canFuse?: boolean;
  /** Message id currently being fused */
  fusingMessageId?: string | null;
}

/**
 * MessageQueue - Displays queued messages above input box
 * Shows numbered list with message preview and close button
 */
export function MessageQueue({
  queue,
  onRemove,
  onFuse,
  canFuse = false,
  fusingMessageId = null,
}: MessageQueueProps) {
  const { t } = useTranslation();

  if (queue.length === 0) {
    return null;
  }

  return (
    <div className="message-queue">
      {/* Render in reverse order so newest is at bottom (closest to input) */}
      {[...queue].reverse().map((item, reversedIndex) => {
        // Calculate actual queue position (1-based, from bottom)
        const queuePosition = queue.length - reversedIndex;
        const fullContent = item.fullContent ?? item.content;
        const previewContent = buildMessageQueuePreview(item.content);
        const isFusing = item.isFusing || item.id === fusingMessageId;
        const canFuseItem = canFuse && isFuseEligibleQueuedContent(fullContent);
        return (
          <div key={item.id} className="message-queue-item">
            <span className="message-queue-number">{queuePosition}</span>
            <span
              className="message-queue-content"
              title={fullContent}
              aria-label={fullContent}
            >
              {previewContent}
            </span>
            <div className="message-queue-actions">
              <button
                type="button"
                className="message-queue-action message-queue-fuse"
                onClick={() => onFuse?.(item.id)}
                disabled={!canFuseItem || isFusing}
                aria-disabled={!canFuseItem || isFusing}
                title={
                  isFusing
                    ? t('chat.fusingQueuedMessage')
                    : t('chat.fuseFromQueue')
                }
              >
                {isFusing ? t('chat.fusingQueuedMessage') : t('chat.fuseFromQueue')}
              </button>
              <button
                type="button"
                className="message-queue-action message-queue-remove"
                onClick={() => onRemove(item.id)}
                disabled={isFusing}
                aria-disabled={isFusing}
                title={t('chat.removeFromQueue')}
              >
                {t('chat.deleteQueuedMessage')}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default MessageQueue;
