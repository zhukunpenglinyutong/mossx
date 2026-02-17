import { memo, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { convertFileSrc } from "@tauri-apps/api/core";
import Brain from "lucide-react/dist/esm/icons/brain";
import Check from "lucide-react/dist/esm/icons/check";
import Copy from "lucide-react/dist/esm/icons/copy";
import Terminal from "lucide-react/dist/esm/icons/terminal";
import X from "lucide-react/dist/esm/icons/x";
import type {
  ConversationItem,
  OpenAppTarget,
  RequestUserInputRequest,
  RequestUserInputResponse,
  TurnPlan,
} from "../../../types";
import { Markdown } from "./Markdown";
import { DiffBlock } from "../../git/components/DiffBlock";
import { languageFromPath } from "../../../utils/syntax";
import { useFileLinkOpener } from "../hooks/useFileLinkOpener";
import { RequestUserInputMessage } from "../../app/components/RequestUserInputMessage";
import { groupToolItems, type GroupedEntry } from "../utils/groupToolItems";
import {
  ToolBlockRenderer,
  ReadToolGroupBlock,
  EditToolGroupBlock,
  BashToolGroupBlock,
  SearchToolGroupBlock,
} from "./toolBlocks";
import { buildCommandSummary } from "./toolBlocks/toolConstants";


type MessagesProps = {
  items: ConversationItem[];
  threadId: string | null;
  workspaceId?: string | null;
  isThinking: boolean;
  processingStartedAt?: number | null;
  lastDurationMs?: number | null;
  heartbeatPulse?: number;
  workspacePath?: string | null;
  openTargets: OpenAppTarget[];
  selectedOpenAppId: string;
  showMessageAnchors?: boolean;
  codeBlockCopyUseModifier?: boolean;
  userInputRequests?: RequestUserInputRequest[];
  onUserInputSubmit?: (
    request: RequestUserInputRequest,
    response: RequestUserInputResponse,
  ) => Promise<void> | void;
  activeEngine?: "claude" | "codex" | "gemini" | "opencode";
  activeCollaborationModeId?: string | null;
  plan?: TurnPlan | null;
  isPlanMode?: boolean;
  isPlanProcessing?: boolean;
  onOpenDiffPath?: (path: string) => void;
  onOpenPlanPanel?: () => void;
};

type StatusTone = "completed" | "processing" | "failed" | "unknown";

type WorkingIndicatorProps = {
  isThinking: boolean;
  processingStartedAt?: number | null;
  lastDurationMs?: number | null;
  heartbeatPulse?: number;
  hasItems: boolean;
  reasoningLabel?: string | null;
  activityLabel?: string | null;
  activeEngine?: "claude" | "codex" | "gemini" | "opencode";
  waitingForFirstChunk?: boolean;
};

type MessageRowProps = {
  item: Extract<ConversationItem, { kind: "message" }>;
  activeEngine?: "claude" | "codex" | "gemini" | "opencode";
  isCopied: boolean;
  onCopy: (item: Extract<ConversationItem, { kind: "message" }>) => void;
  codeBlockCopyUseModifier?: boolean;
  onOpenFileLink?: (path: string) => void;
  onOpenFileLinkMenu?: (event: React.MouseEvent, path: string) => void;
};

type ReasoningRowProps = {
  item: Extract<ConversationItem, { kind: "reasoning" }>;
  parsed: ReturnType<typeof parseReasoning>;
  displayTitle: string;
  isExpanded: boolean;
  isCodex: boolean;
  isLive: boolean;
  onToggle: (id: string) => void;
  onOpenFileLink?: (path: string) => void;
  onOpenFileLinkMenu?: (event: React.MouseEvent, path: string) => void;
};

type ReviewRowProps = {
  item: Extract<ConversationItem, { kind: "review" }>;
  onOpenFileLink?: (path: string) => void;
  onOpenFileLinkMenu?: (event: React.MouseEvent, path: string) => void;
};

type DiffRowProps = {
  item: Extract<ConversationItem, { kind: "diff" }>;
};

type ExploreRowProps = {
  item: Extract<ConversationItem, { kind: "explore" }>;
};

type MessageImage = {
  src: string;
  label: string;
};

const SCROLL_THRESHOLD_PX = 120;
const OPENCODE_NON_STREAMING_HINT_DELAY_MS = 12_000;
const OPENCODE_HEARTBEAT_HINTS = [
  "正在读取工具输出并整理上下文。",
  "模型仍在推理，正在等待下一段有效结果。",
  "正在合并子任务结果，准备输出可读结论。",
  "正在校验关键步骤，避免返回不完整内容。",
  "正在持续请求响应数据，请稍候。",
];

function sanitizeReasoningTitle(title: string) {
  return title
    .replace(/[`*_~]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .trim();
}

function isGenericReasoningTitle(title: string) {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[.:：。!！]+$/g, "");
  return (
    normalized === "reasoning" ||
    normalized === "thinking" ||
    normalized === "planning" ||
    normalized === "思考中" ||
    normalized === "正在思考" ||
    normalized === "正在规划"
  );
}

function parseReasoning(item: Extract<ConversationItem, { kind: "reasoning" }>) {
  const summary = item.summary ?? "";
  const content = item.content ?? "";
  const hasSummary = summary.trim().length > 0 && !isGenericReasoningTitle(summary);
  const titleSource = hasSummary ? summary : content;
  const titleLines = titleSource.split("\n");
  const trimmedLines = titleLines.map((line) => line.trim());
  const titleLineIndex = trimmedLines.findIndex(Boolean);
  const rawTitle = titleLineIndex >= 0 ? trimmedLines[titleLineIndex] : "";
  const cleanTitle = sanitizeReasoningTitle(rawTitle);
  const summaryTitle = cleanTitle
    ? cleanTitle.length > 80
      ? `${cleanTitle.slice(0, 80)}…`
      : cleanTitle
    : "Reasoning";
  const summaryLines = summary.split("\n");
  const contentLines = content.split("\n");
  const summaryBody =
    hasSummary && titleLineIndex >= 0
      ? summaryLines
          .filter((_, index) => index !== titleLineIndex)
          .join("\n")
          .trim()
      : "";
  let contentBody = hasSummary
    ? content.trim()
    : titleLineIndex >= 0
      ? contentLines
          .filter((_, index) => index !== titleLineIndex)
          .join("\n")
          .trim()
      : content.trim();
  if (!hasSummary && !contentBody && content.trim()) {
    // Preserve single-line reasoning so Codex rows don't collapse to title-only.
    contentBody = content.trim();
  }
  const bodyParts = [summaryBody, contentBody].filter(Boolean);
  const bodyText = bodyParts.join("\n\n").trim();
  const hasBody = bodyText.length > 0;
  const hasAnyText = titleSource.trim().length > 0;
  const workingLabel = hasAnyText ? summaryTitle : null;
  return {
    summaryTitle,
    bodyText,
    hasBody,
    workingLabel,
  };
}

function normalizeMessageImageSrc(path: string) {
  if (!path) {
    return "";
  }
  if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (path.startsWith("file://")) {
    return path;
  }
  try {
    return convertFileSrc(path);
  } catch {
    return "";
  }
}

const MessageImageGrid = memo(function MessageImageGrid({
  images,
  onOpen,
  hasText,
}: {
  images: MessageImage[];
  onOpen: (index: number) => void;
  hasText: boolean;
}) {
  return (
    <div
      className={`message-image-grid${hasText ? " message-image-grid--with-text" : ""}`}
      role="list"
    >
      {images.map((image, index) => (
        <button
          key={`${image.src}-${index}`}
          type="button"
          className="message-image-thumb"
          onClick={() => onOpen(index)}
          aria-label={`Open image ${index + 1}`}
        >
          <img src={image.src} alt={image.label} loading="lazy" />
        </button>
      ))}
    </div>
  );
});

const ImageLightbox = memo(function ImageLightbox({
  images,
  activeIndex,
  onClose,
}: {
  images: MessageImage[];
  activeIndex: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const activeImage = images[activeIndex];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!activeImage) {
    return null;
  }

  return createPortal(
    <div
      className="message-image-lightbox"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="message-image-lightbox-content"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="message-image-lightbox-close"
          onClick={onClose}
          aria-label={t("messages.closeImagePreview")}
        >
          <X size={16} aria-hidden />
        </button>
        <img src={activeImage.src} alt={activeImage.label} />
      </div>
    </div>,
    document.body,
  );
});

function formatDurationMs(durationMs: number) {
  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const durationMinutes = Math.floor(durationSeconds / 60);
  const durationRemainder = durationSeconds % 60;
  return `${durationMinutes}:${String(durationRemainder).padStart(2, "0")}`;
}

function scrollKeyForItems(items: ConversationItem[]) {
  if (!items.length) {
    return "empty";
  }
  const last = items[items.length - 1];
  switch (last.kind) {
    case "message":
      return `${last.id}-${last.text.length}`;
    case "reasoning":
      return `${last.id}-${last.summary.length}-${last.content.length}`;
    case "explore":
      return `${last.id}-${last.status}-${last.entries.length}`;
    case "tool":
      return `${last.id}-${last.status ?? ""}-${last.output?.length ?? 0}`;
    case "diff":
      return `${last.id}-${last.status ?? ""}-${last.diff.length}`;
    case "review":
      return `${last.id}-${last.state}-${last.text.length}`;
    default: {
      const _exhaustive: never = last;
      return _exhaustive;
    }
  }
}

function resolveCodexCommandActivityLabel(item: Extract<ConversationItem, { kind: "tool" }>) {
  return buildCommandSummary(item, { includeDetail: false });
}

function resolveWorkingActivityLabel(
  item: ConversationItem,
  activeEngine: "claude" | "codex" | "gemini" | "opencode" = "claude",
) {
  if (item.kind === "reasoning") {
    const parsed = parseReasoning(item);
    return parsed.workingLabel;
  }
  if (item.kind === "explore") {
    const lastEntry = item.entries[item.entries.length - 1];
    if (!lastEntry) {
      return item.status === "exploring" ? "Exploring..." : "Explored";
    }
    return lastEntry.detail ? `${lastEntry.label} (${lastEntry.detail})` : lastEntry.label;
  }
  if (item.kind === "tool") {
    const title = item.title?.trim();
    const detail = item.detail?.trim();
    if (activeEngine === "codex") {
      const codexCommand = resolveCodexCommandActivityLabel(item);
      if (codexCommand) {
        return codexCommand;
      }
    }
    if (!title) {
      return null;
    }
    if (detail && item.toolType === "commandExecution") {
      return `${title} @ ${detail}`;
    }
    return title;
  }
  if (item.kind === "diff") {
    return item.title?.trim() || null;
  }
  if (item.kind === "review") {
    return item.state === "started" ? "Review started" : "Review completed";
  }
  return null;
}

const WorkingIndicator = memo(function WorkingIndicator({
  isThinking,
  processingStartedAt = null,
  lastDurationMs = null,
  heartbeatPulse = 0,
  hasItems,
  reasoningLabel = null,
  activityLabel = null,
  activeEngine = "claude",
  waitingForFirstChunk = false,
}: WorkingIndicatorProps) {
  const { t } = useTranslation();
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isThinking || !processingStartedAt) {
      setElapsedMs(0);
      return undefined;
    }
    setElapsedMs(Date.now() - processingStartedAt);
    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - processingStartedAt);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isThinking, processingStartedAt]);

  const showNonStreamingHint =
    activeEngine === "opencode" &&
    isThinking &&
    waitingForFirstChunk &&
    elapsedMs >= OPENCODE_NON_STREAMING_HINT_DELAY_MS;
  const nonStreamingHintText = t("messages.nonStreamingHint");
  const resolvedNonStreamingHint =
    nonStreamingHintText === "messages.nonStreamingHint"
      ? "This model may return non-streaming output, or the network may be unreachable. Please wait..."
      : nonStreamingHintText;
  const [heartbeatHintText, setHeartbeatHintText] = useState("");
  const heartbeatStateRef = useRef<{ lastPulse: number; lastIndex: number }>({
    lastPulse: 0,
    lastIndex: -1,
  });

  useEffect(() => {
    if (!showNonStreamingHint) {
      heartbeatStateRef.current = { lastPulse: 0, lastIndex: -1 };
      setHeartbeatHintText("");
      return;
    }
    if (heartbeatPulse <= 0 || heartbeatPulse === heartbeatStateRef.current.lastPulse) {
      return;
    }
    heartbeatStateRef.current.lastPulse = heartbeatPulse;
    let randomIndex = Math.floor(Math.random() * OPENCODE_HEARTBEAT_HINTS.length);
    if (OPENCODE_HEARTBEAT_HINTS.length > 1 && randomIndex === heartbeatStateRef.current.lastIndex) {
      randomIndex = (randomIndex + 1) % OPENCODE_HEARTBEAT_HINTS.length;
    }
    heartbeatStateRef.current.lastIndex = randomIndex;
    setHeartbeatHintText(`心跳 ${heartbeatPulse}: ${OPENCODE_HEARTBEAT_HINTS[randomIndex]}`);
  }, [heartbeatPulse, showNonStreamingHint]);

  return (
    <>
      {isThinking && (
        <div className="working">
          <span className="working-spinner" aria-hidden />
          <div className="working-timer">
            <span className="working-timer-clock">{formatDurationMs(elapsedMs)}</span>
          </div>
          <span className="working-text">{reasoningLabel || t("messages.generatingResponse")}</span>
          {activityLabel && <span className="working-activity">{activityLabel}</span>}
          {showNonStreamingHint && (
            <span className="working-hint">
              {heartbeatHintText || resolvedNonStreamingHint}
            </span>
          )}
        </div>
      )}
      {!isThinking && lastDurationMs !== null && hasItems && (
        <div className="turn-complete" aria-live="polite">
          <span className="turn-complete-line" aria-hidden />
          <span className="turn-complete-label">
            {t("messages.doneIn", { duration: formatDurationMs(lastDurationMs) })}
          </span>
          <span className="turn-complete-line" aria-hidden />
        </div>
      )}
    </>
  );
});

const MessageRow = memo(function MessageRow({
  item,
  activeEngine = "claude",
  isCopied,
  onCopy,
  codeBlockCopyUseModifier,
  onOpenFileLink,
  onOpenFileLinkMenu,
}: MessageRowProps) {
  const { t } = useTranslation();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const displayText = useMemo(() => {
    const originalText = item.text;
    if (item.role !== "user") {
      return originalText;
    }
    const userInputMatches = [...originalText.matchAll(/\[User Input\]\s*/g)];
    if (userInputMatches.length === 0) {
      return originalText;
    }
    const lastMatch = userInputMatches[userInputMatches.length - 1];
    const markerIndex = lastMatch.index ?? -1;
    if (markerIndex < 0) {
      return originalText;
    }
    const markerLength = lastMatch[0]?.length ?? 0;
    const extracted = originalText.slice(markerIndex + markerLength).trim();
    return extracted.length > 0 ? extracted : originalText;
  }, [item.role, item.text]);
  const hasText = displayText.trim().length > 0;
  const markdownClassName =
    item.role === "assistant" && activeEngine === "codex"
      ? "markdown markdown-codex-canvas"
      : "markdown";
  const imageItems = useMemo(() => {
    if (!item.images || item.images.length === 0) {
      return [];
    }
    return item.images
      .map((image, index) => {
        const src = normalizeMessageImageSrc(image);
        if (!src) {
          return null;
        }
        return { src, label: `Image ${index + 1}` };
      })
      .filter(Boolean) as MessageImage[];
  }, [item.images]);

  return (
    <div className={`message ${item.role}`}>
      <div className="bubble message-bubble">
        {imageItems.length > 0 && (
          <MessageImageGrid
            images={imageItems}
            onOpen={setLightboxIndex}
            hasText={hasText}
          />
        )}
        {hasText && (
          <Markdown
            value={displayText}
            className={markdownClassName}
            codeBlockStyle="message"
            codeBlockCopyUseModifier={codeBlockCopyUseModifier}
            onOpenFileLink={onOpenFileLink}
            onOpenFileLinkMenu={onOpenFileLinkMenu}
          />
        )}
        {lightboxIndex !== null && imageItems.length > 0 && (
          <ImageLightbox
            images={imageItems}
            activeIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
        <button
          type="button"
          className={`ghost message-copy-button${isCopied ? " is-copied" : ""}`}
          onClick={() => onCopy(item)}
          aria-label={t("messages.copyMessage")}
          title={t("messages.copyMessage")}
        >
          <span className="message-copy-icon" aria-hidden>
            <Copy className="message-copy-icon-copy" size={14} />
            <Check className="message-copy-icon-check" size={14} />
          </span>
        </button>
      </div>
    </div>
  );
});

const ReasoningRow = memo(function ReasoningRow({
  item,
  parsed,
  displayTitle,
  isExpanded,
  isCodex,
  isLive,
  onToggle,
  onOpenFileLink,
  onOpenFileLinkMenu,
}: ReasoningRowProps) {
  const { t } = useTranslation();
  const { bodyText, hasBody } = parsed;
  const reasoningTone: StatusTone = hasBody ? "completed" : "processing";
  return (
    <div
      className={`tool-inline reasoning-inline${
        isCodex ? " reasoning-inline-codex" : ""
      }${isLive ? " is-live" : ""}`}
    >
      <button
        type="button"
        className="tool-inline-bar-toggle"
        onClick={() => onToggle(item.id)}
        aria-expanded={isExpanded}
        aria-label={t("messages.toggleReasoning")}
      />
      <div className="tool-inline-content">
        <button
          type="button"
          className="tool-inline-summary tool-inline-toggle"
          onClick={() => onToggle(item.id)}
          aria-expanded={isExpanded}
        >
          <Brain
            className={`tool-inline-icon ${reasoningTone}`}
            size={14}
            aria-hidden
          />
          {isCodex && (
            <span
              className={`reasoning-inline-live-dot${isLive ? " is-live" : ""}`}
              aria-hidden
            />
          )}
          <span className="tool-inline-value">{displayTitle}</span>
        </button>
        {hasBody && (
          <Markdown
            value={bodyText}
            className={`reasoning-inline-detail markdown ${
              isExpanded ? "" : "tool-inline-clamp"
            }`}
            onOpenFileLink={onOpenFileLink}
            onOpenFileLinkMenu={onOpenFileLinkMenu}
          />
        )}
      </div>
    </div>
  );
});

const ReviewRow = memo(function ReviewRow({
  item,
  onOpenFileLink,
  onOpenFileLinkMenu,
}: ReviewRowProps) {
  const title = item.state === "started" ? "Review started" : "Review completed";
  return (
    <div className="item-card review">
      <div className="review-header">
        <span className="review-title">{title}</span>
        <span
          className={`review-badge ${item.state === "started" ? "active" : "done"}`}
        >
          Review
        </span>
      </div>
      {item.text && (
        <Markdown
          value={item.text}
          className="item-text markdown"
          onOpenFileLink={onOpenFileLink}
          onOpenFileLinkMenu={onOpenFileLinkMenu}
        />
      )}
    </div>
  );
});

const DiffRow = memo(function DiffRow({ item }: DiffRowProps) {
  return (
    <div className="item-card diff">
      <div className="diff-header">
        <span className="diff-title">{item.title}</span>
        {item.status && <span className="item-status">{item.status}</span>}
      </div>
      <div className="diff-viewer-output">
        <DiffBlock diff={item.diff} language={languageFromPath(item.title)} />
      </div>
    </div>
  );
});

function exploreKindLabel(kind: ExploreRowProps["item"]["entries"][number]["kind"]) {
  return kind[0].toUpperCase() + kind.slice(1);
}

const ExploreRow = memo(function ExploreRow({ item }: ExploreRowProps) {
  const title = item.status === "exploring" ? "Exploring" : "Explored";
  return (
    <div className="tool-inline explore-inline">
      <div className="tool-inline-bar-toggle" aria-hidden />
      <div className="tool-inline-content">
        <div className="explore-inline-header">
          <Terminal
            className={`tool-inline-icon ${
              item.status === "exploring" ? "processing" : "completed"
            }`}
            size={14}
            aria-hidden
          />
          <span className="explore-inline-title">{title}</span>
        </div>
        <div className="explore-inline-list">
          {item.entries.map((entry, index) => (
            <div key={`${entry.kind}-${entry.label}-${index}`} className="explore-inline-item">
              <span className="explore-inline-kind">{exploreKindLabel(entry.kind)}</span>
              <span className="explore-inline-label">{entry.label}</span>
              {entry.detail && entry.detail !== entry.label && (
                <span className="explore-inline-detail">{entry.detail}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export const Messages = memo(function Messages({
  items,
  threadId,
  workspaceId = null,
  isThinking,
  processingStartedAt = null,
  lastDurationMs = null,
  heartbeatPulse = 0,
  workspacePath = null,
  openTargets,
  selectedOpenAppId,
  showMessageAnchors = true,
  codeBlockCopyUseModifier = false,
  userInputRequests = [],
  onUserInputSubmit,
  activeEngine = "claude",
  activeCollaborationModeId = null,
  plan = null,
  isPlanMode = false,
  isPlanProcessing = false,
  onOpenDiffPath,
  onOpenPlanPanel,
}: MessagesProps) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const messageNodeByIdRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const autoScrollRef = useRef(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [activeAnchorId, setActiveAnchorId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const activeUserInputRequestId =
    threadId && userInputRequests.length
      ? (userInputRequests.find(
          (request) =>
            request.params.thread_id === threadId &&
            (!workspaceId || request.workspace_id === workspaceId),
        )?.request_id ?? null)
      : null;
  const rawScrollKey = `${scrollKeyForItems(items)}-${activeUserInputRequestId ?? "no-input"}`;
  // Throttle scrollKey during streaming to avoid flooding the main thread
  // with smooth-scroll animations that block keyboard input.
  const [scrollKey, setScrollKey] = useState(rawScrollKey);
  const scrollThrottleRef = useRef<number>(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (scrollThrottleRef.current) {
      window.clearTimeout(scrollThrottleRef.current);
    }
    scrollThrottleRef.current = window.setTimeout(() => {
      if (!mountedRef.current) {
        return;
      }
      startTransition(() => {
        setScrollKey(rawScrollKey);
      });
    }, isThinking ? 120 : 0);
    return () => {
      if (scrollThrottleRef.current) {
        window.clearTimeout(scrollThrottleRef.current);
      }
    };
  }, [rawScrollKey, isThinking]);
  const { openFileLink, showFileLinkMenu } = useFileLinkOpener(
    workspacePath,
    openTargets,
    selectedOpenAppId,
  );

  const isNearBottom = useCallback(
    (node: HTMLDivElement) =>
      node.scrollHeight - node.scrollTop - node.clientHeight <= SCROLL_THRESHOLD_PX,
    [],
  );

  const computeActiveAnchor = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return null;
    }
    const viewportAnchorY =
      container.getBoundingClientRect().top + Math.min(96, container.clientHeight * 0.32);
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [messageId, node] of messageNodeByIdRef.current) {
      const distance = Math.abs(node.getBoundingClientRect().top - viewportAnchorY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = messageId;
      }
    }
    return bestId;
  }, []);

  const updateAutoScroll = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    autoScrollRef.current = isNearBottom(containerRef.current);
    const nextActiveAnchor = computeActiveAnchor();
    setActiveAnchorId((previous) => (previous === nextActiveAnchor ? previous : nextActiveAnchor));
  }, [computeActiveAnchor, isNearBottom]);

  const requestAutoScroll = useCallback(() => {
    if (!bottomRef.current) {
      return;
    }
    const container = containerRef.current;
    const shouldScroll =
      autoScrollRef.current || (container ? isNearBottom(container) : true);
    if (!shouldScroll) {
      return;
    }
    // Always use instant for programmatic scroll requests to avoid blocking input
    bottomRef.current.scrollIntoView({ behavior: "instant", block: "end" });
  }, [isNearBottom]);

  useEffect(() => {
    autoScrollRef.current = true;
    setExpandedItems(new Set());
  }, [threadId]);
  const toggleExpanded = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const reasoningMetaById = useMemo(() => {
    const meta = new Map<string, ReturnType<typeof parseReasoning>>();
    items.forEach((item) => {
      if (item.kind === "reasoning") {
        meta.set(item.id, parseReasoning(item));
      }
    });
    return meta;
  }, [items]);

  const latestReasoningLabel = useMemo(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.kind === "message") {
        break;
      }
      if (item.kind !== "reasoning") {
        continue;
      }
      const parsed = reasoningMetaById.get(item.id);
      if (parsed?.workingLabel) {
        return parsed.workingLabel;
      }
    }
    return null;
  }, [items, reasoningMetaById]);

  const latestReasoningId = useMemo(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.kind === "message") {
        break;
      }
      if (item.kind === "reasoning") {
        return item.id;
      }
    }
    return null;
  }, [items]);

  const latestWorkingActivityLabel = useMemo(() => {
    let lastUserIndex = -1;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.kind === "message" && item.role === "user") {
        lastUserIndex = index;
        break;
      }
    }
    if (lastUserIndex < 0) {
      return null;
    }
    for (let index = items.length - 1; index > lastUserIndex; index -= 1) {
      const item = items[index];
      if (item.kind === "message" && item.role === "assistant") {
        break;
      }
      const label = resolveWorkingActivityLabel(item, activeEngine);
      if (label) {
        return label;
      }
    }
    return null;
  }, [activeEngine, items]);

  const waitingForFirstChunk = useMemo(() => {
    if (!isThinking || items.length === 0) {
      return false;
    }
    let lastUserIndex = -1;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.kind === "message" && item.role === "user") {
        lastUserIndex = index;
        break;
      }
    }
    if (lastUserIndex < 0) {
      return false;
    }
    for (let index = lastUserIndex + 1; index < items.length; index += 1) {
      const item = items[index];
      if (item.kind === "message" && item.role === "assistant") {
        return false;
      }
    }
    return true;
  }, [isThinking, items]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (item.kind !== "reasoning") {
          return true;
        }
        const hasBody = reasoningMetaById.get(item.id)?.hasBody ?? false;
        if (hasBody) {
          return true;
        }
        // Keep title-only reasoning visible for Codex canvas to surface
        // real-time model thinking progress without affecting other engines.
        return activeEngine === "codex";
      }),
    [activeEngine, items, reasoningMetaById],
  );
  const messageAnchors = useMemo(() => {
    const messageItems = visibleItems.filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "user",
    );
    if (!messageItems.length) {
      return [];
    }
    return messageItems.map((item, index) => {
      const position =
        messageItems.length === 1 ? 0.5 : 0.04 + (index / (messageItems.length - 1)) * 0.92;
      return {
        id: item.id,
        role: item.role,
        position,
      };
    });
  }, [visibleItems]);
  const hasAnchorRail = showMessageAnchors && messageAnchors.length > 1;

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasAnchorRail) {
      setActiveAnchorId(null);
      return;
    }
    const rafId = window.requestAnimationFrame(() => {
      const nextActiveAnchor =
        computeActiveAnchor() ?? messageAnchors[messageAnchors.length - 1]?.id ?? null;
      setActiveAnchorId((previous) => (previous === nextActiveAnchor ? previous : nextActiveAnchor));
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [computeActiveAnchor, hasAnchorRail, messageAnchors, scrollKey, threadId]);

  const handleCopyMessage = useCallback(
    async (item: Extract<ConversationItem, { kind: "message" }>) => {
      try {
        await navigator.clipboard.writeText(item.text);
        setCopiedMessageId(item.id);
        if (copyTimeoutRef.current) {
          window.clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = window.setTimeout(() => {
          setCopiedMessageId(null);
        }, 1200);
      } catch {
        // No-op: clipboard errors can occur in restricted contexts.
      }
    },
    [],
  );

  useEffect(() => {
    if (!bottomRef.current) {
      return undefined;
    }
    const container = containerRef.current;
    const shouldScroll =
      autoScrollRef.current ||
      (container ? isNearBottom(container) : true);
    if (!shouldScroll) {
      return undefined;
    }
    let raf = 0;
    const target = bottomRef.current;
    // Use instant scroll during streaming to avoid blocking the main thread
    // with smooth-scroll animations that compete with keyboard input events.
    const scrollBehavior = isThinking ? "instant" as const : "smooth" as const;
    raf = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: scrollBehavior, block: "end" });
    });
    return () => {
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [scrollKey, isThinking, isNearBottom]);

  const groupedEntries = useMemo(() => groupToolItems(visibleItems), [visibleItems]);

  const hasActiveUserInputRequest = activeUserInputRequestId !== null;
  const userInputNode =
    hasActiveUserInputRequest && onUserInputSubmit ? (
      <RequestUserInputMessage
        requests={userInputRequests}
        activeThreadId={threadId}
        activeWorkspaceId={workspaceId}
        onSubmit={onUserInputSubmit}
      />
    ) : null;

  const renderSingleItem = (item: ConversationItem) => {
    if (item.kind === "message") {
      const isCopied = copiedMessageId === item.id;
      const bindMessageNode = (node: HTMLDivElement | null) => {
        if (item.role === "user" && node) {
          messageNodeByIdRef.current.set(item.id, node);
          return;
        }
        messageNodeByIdRef.current.delete(item.id);
      };
      return (
        <div key={item.id} ref={bindMessageNode} data-message-anchor-id={item.id}>
          <MessageRow
            item={item}
            activeEngine={activeEngine}
            isCopied={isCopied}
            onCopy={handleCopyMessage}
            codeBlockCopyUseModifier={codeBlockCopyUseModifier}
            onOpenFileLink={openFileLink}
            onOpenFileLinkMenu={showFileLinkMenu}
          />
        </div>
      );
    }
    if (item.kind === "reasoning") {
      const isExpanded = expandedItems.has(item.id);
      const parsed =
        reasoningMetaById.get(item.id) ??
        parseReasoning(item);
      const isCodexReasoning = activeEngine === "codex";
      const isLiveReasoning =
        isCodexReasoning && isThinking && latestReasoningId === item.id;
      const displayTitle = parsed.summaryTitle;
      return (
        <ReasoningRow
          key={item.id}
          item={item}
          parsed={parsed}
          displayTitle={displayTitle}
          isExpanded={isExpanded}
          isCodex={isCodexReasoning}
          isLive={isLiveReasoning}
          onToggle={toggleExpanded}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
        />
      );
    }
    if (item.kind === "review") {
      return (
        <ReviewRow
          key={item.id}
          item={item}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
        />
      );
    }
    if (item.kind === "diff") {
      return <DiffRow key={item.id} item={item} />;
    }
    if (item.kind === "tool") {
      const isExpanded = expandedItems.has(item.id);
      return (
        <ToolBlockRenderer
          key={item.id}
          item={item}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
          onRequestAutoScroll={requestAutoScroll}
          activeCollaborationModeId={activeCollaborationModeId}
        />
      );
    }
    if (item.kind === "explore") {
      return <ExploreRow key={item.id} item={item} />;
    }
    return null;
  };

  const renderEntry = (entry: GroupedEntry, _index: number) => {
    if (entry.kind === "readGroup") {
      return <ReadToolGroupBlock key={`rg-${entry.items[0].id}`} items={entry.items} />;
    }
    if (entry.kind === "editGroup") {
      return (
        <EditToolGroupBlock
          key={`eg-${entry.items[0].id}`}
          items={entry.items}
          plan={plan}
          isPlanMode={isPlanMode}
          isProcessing={isPlanProcessing}
          onOpenDiffPath={onOpenDiffPath}
          onOpenFullPlan={() => {
            onOpenPlanPanel?.();
            window.requestAnimationFrame(() => {
              const planPanel = document.querySelector(".plan-panel");
              if (!(planPanel instanceof HTMLElement)) {
                return;
              }
              planPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
              planPanel.classList.add("plan-panel-focus-ring");
              window.setTimeout(() => {
                planPanel.classList.remove("plan-panel-focus-ring");
              }, 1400);
            });
          }}
        />
      );
    }
    if (entry.kind === "bashGroup") {
      return (
        <BashToolGroupBlock
          key={`bg-${entry.items[0].id}`}
          items={entry.items}
          onRequestAutoScroll={requestAutoScroll}
        />
      );
    }
    if (entry.kind === "searchGroup") {
      return <SearchToolGroupBlock key={`sg-${entry.items[0].id}`} items={entry.items} />;
    }
    return renderSingleItem(entry.item);
  };

  const scrollToAnchor = useCallback((messageId: string) => {
    const node = messageNodeByIdRef.current.get(messageId);
    const container = containerRef.current;
    if (!node || !container) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const targetTop =
      container.scrollTop + (nodeRect.top - containerRect.top) - container.clientHeight * 0.28;
    autoScrollRef.current = false;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth",
    });
    setActiveAnchorId((previous) => (previous === messageId ? previous : messageId));
  }, []);

  return (
    <div className={`messages-shell${hasAnchorRail ? " has-anchor-rail" : ""}`}>
      {hasAnchorRail && (
        <div className="messages-anchor-rail" role="navigation" aria-label="Message anchors">
          <div className="messages-anchor-track" aria-hidden />
          {messageAnchors.map((anchor, index) => {
            const isActive = activeAnchorId === anchor.id;
            return (
              <div
                key={anchor.id}
                role="button"
                tabIndex={0}
                className={`messages-anchor-dot${isActive ? " is-active" : ""}`}
                style={{ top: `${anchor.position * 100}%` }}
                onClick={() => scrollToAnchor(anchor.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    scrollToAnchor(anchor.id);
                  }
                }}
                aria-label={`Go to user message ${index + 1}`}
                title={`User #${index + 1}`}
              />
            );
          })}
        </div>
      )}
      <div
        className="messages messages-full"
        ref={containerRef}
        onScroll={updateAutoScroll}
      >
        {groupedEntries.map(renderEntry)}
        {userInputNode}
        <WorkingIndicator
          isThinking={isThinking}
          processingStartedAt={processingStartedAt}
          lastDurationMs={lastDurationMs}
          heartbeatPulse={heartbeatPulse}
          hasItems={items.length > 0}
          reasoningLabel={latestReasoningLabel}
          activityLabel={latestWorkingActivityLabel}
          activeEngine={activeEngine}
          waitingForFirstChunk={waitingForFirstChunk}
        />
        {!items.length && !userInputNode && (
          <div className="empty messages-empty">
            {t("messages.emptyThread")}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});
