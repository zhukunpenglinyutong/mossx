import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ChangeEvent,
  ClipboardEvent,
  KeyboardEvent,
  RefObject,
  SyntheticEvent,
} from "react";
import type { AutocompleteItem } from "../hooks/useComposerAutocomplete";
import { formatCollaborationModeLabel } from "../../../utils/collaborationModes";
import type { AccessMode, EngineType, ThreadTokenUsage } from "../../../types";
import type { EngineDisplayInfo } from "../../engine/hooks/useEngineController";
import ImagePlus from "lucide-react/dist/esm/icons/image-plus";
import Mic from "lucide-react/dist/esm/icons/mic";
import Square from "lucide-react/dist/esm/icons/square";
import Brain from "lucide-react/dist/esm/icons/brain";
import GitFork from "lucide-react/dist/esm/icons/git-fork";
import PlusCircle from "lucide-react/dist/esm/icons/plus-circle";
import Info from "lucide-react/dist/esm/icons/info";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Plug from "lucide-react/dist/esm/icons/plug";
import Lock from "lucide-react/dist/esm/icons/lock";
import FileIcon from "../../../components/FileIcon";
import { EngineSelector } from "../../engine/components/EngineSelector";
import { useComposerImageDrop } from "../hooks/useComposerImageDrop";
import { ComposerAttachments } from "./ComposerAttachments";
import { DictationWaveform } from "../../dictation/components/DictationWaveform";
import { ReviewInlinePrompt } from "./ReviewInlinePrompt";
import type { ReviewPromptState, ReviewPromptStep } from "../../threads/hooks/useReviewPrompt";
import { ContextUsageIndicator } from "./ContextUsageIndicator";

type ComposerInputProps = {
  text: string;
  disabled: boolean;
  sendLabel: string;
  canStop: boolean;
  canSend: boolean;
  isProcessing: boolean;
  onStop: () => void;
  onSend: () => void;
  engineName?: string;
  dictationState?: "idle" | "listening" | "processing";
  dictationLevel?: number;
  dictationEnabled?: boolean;
  onToggleDictation?: () => void;
  onOpenDictationSettings?: () => void;
  dictationError?: string | null;
  onDismissDictationError?: () => void;
  dictationHint?: string | null;
  onDismissDictationHint?: () => void;
  attachments?: string[];
  onAddAttachment?: () => void;
  onAttachImages?: (paths: string[]) => void;
  onRemoveAttachment?: (path: string) => void;
  onTextChange: (next: string, selectionStart: number | null) => void;
  onTextPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onSelectionChange: (selectionStart: number | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaHeight?: number;
  onHeightChange?: (height: number) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  suggestionsOpen: boolean;
  suggestions: AutocompleteItem[];
  highlightIndex: number;
  onHighlightIndex: (index: number) => void;
  onSelectSuggestion: (item: AutocompleteItem) => void;
  suggestionsStyle?: React.CSSProperties;
  reviewPrompt?: ReviewPromptState;
  onReviewPromptClose?: () => void;
  onReviewPromptShowPreset?: () => void;
  onReviewPromptChoosePreset?: (
    preset: Exclude<ReviewPromptStep, "preset"> | "uncommitted",
  ) => void;
  highlightedPresetIndex?: number;
  onReviewPromptHighlightPreset?: (index: number) => void;
  highlightedBranchIndex?: number;
  onReviewPromptHighlightBranch?: (index: number) => void;
  highlightedCommitIndex?: number;
  onReviewPromptHighlightCommit?: (index: number) => void;
  onReviewPromptSelectBranch?: (value: string) => void;
  onReviewPromptSelectBranchAtIndex?: (index: number) => void;
  onReviewPromptConfirmBranch?: () => Promise<void>;
  onReviewPromptSelectCommit?: (sha: string, title: string) => void;
  onReviewPromptSelectCommitAtIndex?: (index: number) => void;
  onReviewPromptConfirmCommit?: () => Promise<void>;
  onReviewPromptUpdateCustomInstructions?: (value: string) => void;
  onReviewPromptConfirmCustom?: () => Promise<void>;
  // Engine props
  engines?: EngineDisplayInfo[];
  selectedEngine?: EngineType;
  onSelectEngine?: (engine: EngineType) => void;
  // Model props
  models?: { id: string; displayName: string; model: string }[];
  selectedModelId?: string | null;
  onSelectModel?: (id: string) => void;
  // Meta props
  collaborationModes?: { id: string; label: string }[];
  selectedCollaborationModeId?: string | null;
  onSelectCollaborationMode?: (id: string | null) => void;
  reasoningOptions?: string[];
  selectedEffort?: string | null;
  onSelectEffort?: (effort: string) => void;
  reasoningSupported?: boolean;
  contextUsage?: ThreadTokenUsage | null;
  accessMode?: AccessMode;
  onSelectAccessMode?: (mode: AccessMode) => void;
};

const isFileSuggestion = (item: AutocompleteItem) =>
  item.label.includes("/") || item.label.includes("\\");

const suggestionIcon = (item: AutocompleteItem) => {
  if (isFileSuggestion(item)) {
    return FileText;
  }
  if (item.id === "review") {
    return Brain;
  }
  if (item.id === "fork") {
    return GitFork;
  }
  if (item.id === "mcp") {
    return Plug;
  }
  if (item.id === "new") {
    return PlusCircle;
  }
  if (item.id === "resume") {
    return RotateCcw;
  }
  if (item.id === "status") {
    return Info;
  }
  if (item.id.startsWith("prompt:")) {
    return ScrollText;
  }
  return Wrench;
};

const fileTitle = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
};

export function ComposerInput({
  text,
  disabled,
  sendLabel,
  canStop,
  canSend,
  isProcessing,
  onStop,
  onSend,
  engineName,
  dictationState = "idle",
  dictationLevel = 0,
  dictationEnabled = false,
  onToggleDictation,
  onOpenDictationSettings,
  dictationError = null,
  onDismissDictationError,
  dictationHint = null,
  onDismissDictationHint,
  attachments = [],
  onAddAttachment,
  onAttachImages,
  onRemoveAttachment,
  onTextChange,
  onTextPaste,
  onSelectionChange,
  onKeyDown,
  textareaHeight = 80,
  onHeightChange,
  textareaRef,
  suggestionsOpen,
  suggestions,
  highlightIndex,
  onHighlightIndex,
  onSelectSuggestion,
  suggestionsStyle,
  reviewPrompt,
  onReviewPromptClose,
  onReviewPromptShowPreset,
  onReviewPromptChoosePreset,
  highlightedPresetIndex,
  onReviewPromptHighlightPreset,
  highlightedBranchIndex,
  onReviewPromptHighlightBranch,
  highlightedCommitIndex,
  onReviewPromptHighlightCommit,
  onReviewPromptSelectBranch,
  onReviewPromptSelectBranchAtIndex,
  onReviewPromptConfirmBranch,
  onReviewPromptSelectCommit,
  onReviewPromptSelectCommitAtIndex,
  onReviewPromptConfirmCommit,
  onReviewPromptUpdateCustomInstructions,
  onReviewPromptConfirmCustom,
  engines,
  selectedEngine,
  onSelectEngine,
  models,
  selectedModelId,
  onSelectModel,
  collaborationModes = [],
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  reasoningOptions = [],
  selectedEffort,
  onSelectEffort,
  reasoningSupported = false,
  contextUsage,
  accessMode,
  onSelectAccessMode,
}: ComposerInputProps) {
  const { t } = useTranslation();
  const suggestionListRef = useRef<HTMLDivElement | null>(null);
  const suggestionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const resizeHandleRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const MIN_HEIGHT = 60;
  const MAX_HEIGHT = 400;
  const currentHeight = Math.max(MIN_HEIGHT, Math.min(textareaHeight, MAX_HEIGHT));
  const reviewPromptOpen = Boolean(reviewPrompt);

  const {
    dropTargetRef,
    isDragOver,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handlePaste,
  } = useComposerImageDrop({
    disabled,
    onAttachImages,
  });

  useEffect(() => {
    if (!suggestionsOpen || suggestions.length === 0) {
      return;
    }
    const list = suggestionListRef.current;
    const item = suggestionRefs.current[highlightIndex];
    if (!list || !item) {
      return;
    }
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.top < listRect.top) {
      item.scrollIntoView({ block: "nearest" });
      return;
    }
    if (itemRect.bottom > listRect.bottom) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex, suggestionsOpen, suggestions.length]);

  // Textarea height management - use user-controlled height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = `${currentHeight}px`;
    textarea.style.minHeight = `${MIN_HEIGHT}px`;
    textarea.style.maxHeight = `${MAX_HEIGHT}px`;
    textarea.style.overflowY = "auto";
  }, [currentHeight, textareaRef]);

  // Drag resize handlers
  const handleResizeStart = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      if (disabled || !onHeightChange) return;
      event.preventDefault();
      setIsDragging(true);
      const clientY = "touches" in event ? event.touches[0].clientY : event.clientY;
      dragStartY.current = clientY;
      dragStartHeight.current = currentHeight;
    },
    [disabled, onHeightChange, currentHeight],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent | TouchEvent) => {
      const clientY = "touches" in event ? event.touches[0].clientY : event.clientY;
      // Dragging up (negative delta) should increase height
      const delta = dragStartY.current - clientY;
      const newHeight = Math.max(MIN_HEIGHT, Math.min(dragStartHeight.current + delta, MAX_HEIGHT));
      onHeightChange?.(newHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", handleMouseMove);
    document.addEventListener("touchend", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleMouseMove);
      document.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging, onHeightChange]);

  const handleActionClick = useCallback(() => {
    if (canStop) {
      onStop();
    } else {
      onSend();
    }
  }, [canStop, onSend, onStop]);
  const isDictating = dictationState === "listening";
  const isDictationBusy = dictationState !== "idle";
  const allowOpenDictationSettings = Boolean(
    onOpenDictationSettings && !dictationEnabled && !disabled,
  );
  const micDisabled =
    disabled || dictationState === "processing" || !dictationEnabled || !onToggleDictation;
  const micAriaLabel = allowOpenDictationSettings
    ? "Open dictation settings"
    : dictationState === "processing"
      ? "Dictation processing"
      : isDictating
        ? "Stop dictation"
        : "Start dictation";
  const micTitle = allowOpenDictationSettings
    ? "Dictation disabled. Open settings"
    : dictationState === "processing"
      ? "Processing dictation"
      : isDictating
        ? "Stop dictation"
        : "Start dictation";
  const handleMicClick = useCallback(() => {
    if (allowOpenDictationSettings) {
      onOpenDictationSettings?.();
      return;
    }
    if (!onToggleDictation || micDisabled) {
      return;
    }
    onToggleDictation();
  }, [
    allowOpenDictationSettings,
    micDisabled,
    onOpenDictationSettings,
    onToggleDictation,
  ]);

  const handleTextareaChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onTextChange(event.target.value, event.target.selectionStart);
    },
    [onTextChange],
  );

  const handleTextareaSelect = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      onSelectionChange((event.target as HTMLTextAreaElement).selectionStart);
    },
    [onSelectionChange],
  );

  const handleTextareaPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      void handlePaste(event);
      if (!event.defaultPrevented) {
        onTextPaste?.(event);
      }
    },
    [handlePaste, onTextPaste],
  );

  const selectedModel = models?.find((m) => m.id === selectedModelId);

  return (
    <div className={`composer-input${isDragging ? " is-resizing" : ""}`}>
      {/* Resize handle at the top */}
      {onHeightChange && (
        <div
          ref={resizeHandleRef}
          className="composer-resize-handle"
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeStart}
          aria-label="Drag to resize"
          role="separator"
          aria-orientation="horizontal"
        >
          <div className="composer-resize-handle-bar" />
        </div>
      )}
      <div
        className={`composer-input-area${isDragOver ? " is-drag-over" : ""}`}
        ref={dropTargetRef}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ComposerAttachments
          attachments={attachments}
          disabled={disabled}
          onRemoveAttachment={onRemoveAttachment}
        />
        <textarea
          ref={textareaRef}
          className="composer-textarea"
          placeholder={
            disabled
              ? "Review in progress. Chat will re-enable when it completes."
              : engineName
                ? t("composer.placeholderAskWithEngine", { engineName })
                : t("composer.placeholderAsk")
          }
          value={text}
          onChange={handleTextareaChange}
          onSelect={handleTextareaSelect}
          disabled={disabled}
          onKeyDown={onKeyDown}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handleTextareaPaste}
        />
        
        <div className="composer-input-footer">
          <div className="composer-input-footer-left">
            <button
              type="button"
              className="composer-attach"
              onClick={onAddAttachment}
              disabled={disabled || !onAddAttachment}
              aria-label="Add image"
              title="Add image"
            >
              <ImagePlus size={14} aria-hidden />
            </button>
            
            {engines && selectedEngine && onSelectEngine && (
              <EngineSelector
                engines={engines}
                selectedEngine={selectedEngine}
                onSelectEngine={onSelectEngine}
                disabled={disabled}
                showOnlyIfMultiple={true}
                showLabel={true}
              />
            )}
            
            {models && selectedModelId && onSelectModel && (
              <div className="composer-select-wrap">
                <span className="composer-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7 8V6a5 5 0 0 1 10 0v2"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                    <rect
                      x="4.5"
                      y="8"
                      width="15"
                      height="11"
                      rx="3"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <circle cx="9" cy="13" r="1" fill="currentColor" />
                    <circle cx="15" cy="13" r="1" fill="currentColor" />
                    <path
                      d="M9 16h6"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="composer-select-value">
                  {selectedModel?.displayName || selectedModel?.model || selectedModelId}
                </span>
                <select
                  className="composer-select composer-select--model"
                  aria-label={t("composer.model")}
                  value={selectedModelId ?? ""}
                  onChange={(event) => onSelectModel(event.target.value)}
                  disabled={disabled}
                >
                  {models.length === 0 && <option value="">No models</option>}
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName || model.model}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {accessMode && onSelectAccessMode && (
              <div className="composer-select-wrap">
                <span className="composer-icon" aria-hidden>
                  <Lock size={14} />
                </span>
                <span className="composer-select-value">
                  {t("composer.fullAccess")}
                </span>
                <select
                  className="composer-select composer-select--access"
                  aria-label={t("composer.agentAccess")}
                  value="full-access"
                  onChange={(event) =>
                    onSelectAccessMode(event.target.value as AccessMode)
                  }
                  disabled={disabled}
                >
                  <option value="read-only" disabled>{t("composer.readOnly")}</option>
                  <option value="current" disabled>{t("composer.onRequest")}</option>
                  <option value="full-access">{t("composer.fullAccess")}</option>
                </select>
              </div>
            )}
            
            {collaborationModes.length > 0 && onSelectCollaborationMode && (
              <div className="composer-select-wrap">
                <span className="composer-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7 7h10M7 12h6M7 17h8"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="composer-select-value">
                  {formatCollaborationModeLabel(
                    collaborationModes.find((m) => m.id === selectedCollaborationModeId)?.label ||
                    selectedCollaborationModeId ||
                    ""
                  )}
                </span>
                <select
                  className="composer-select composer-select--model composer-select--collab"
                  aria-label={t("composer.collaborationMode")}
                  value={selectedCollaborationModeId ?? ""}
                  onChange={(event) =>
                    onSelectCollaborationMode(event.target.value || null)
                  }
                  disabled={disabled}
                >
                  {collaborationModes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {formatCollaborationModeLabel(mode.label || mode.id)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {/* 思考模式选择器 - Claude Code 不支持此功能，仅 Codex 等引擎支持 */}
            {selectedEngine !== "claude" && reasoningSupported && onSelectEffort && (
              <div className="composer-select-wrap">
                <span className="composer-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M8.5 4.5a3.5 3.5 0 0 0-3.46 4.03A4 4 0 0 0 6 16.5h2"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                    <path
                      d="M15.5 4.5a3.5 3.5 0 0 1 3.46 4.03A4 4 0 0 1 18 16.5h-2"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                    <path
                      d="M9 12h6"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                    <path
                      d="M12 12v6"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="composer-select-value">
                  {selectedEffort || t("composer.effortDefault")}
                </span>
                <select
                  className="composer-select composer-select--effort"
                  aria-label={t("composer.thinkingMode")}
                  value={selectedEffort ?? ""}
                  onChange={(event) => onSelectEffort(event.target.value)}
                  disabled={disabled}
                >
                  {reasoningOptions.length === 0 && <option value="">{t("composer.effortDefault")}</option>}
                  {reasoningOptions.map((effort) => (
                    <option key={effort} value={effort}>
                      {effort}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <div className="composer-input-footer-right">
            <ContextUsageIndicator contextUsage={contextUsage} />
            <button
              className={`composer-action composer-action--mic${
                isDictationBusy ? " is-active" : ""
              }${dictationState === "processing" ? " is-processing" : ""}${
                micDisabled ? " is-disabled" : ""
              }`}
              onClick={handleMicClick}
              disabled={
                disabled ||
                dictationState === "processing" ||
                (!onToggleDictation && !allowOpenDictationSettings)
              }
              aria-label={micAriaLabel}
              title={micTitle}
            >
              {isDictating ? <Square aria-hidden /> : <Mic aria-hidden />}
            </button>
            <button
              className={`composer-action${canStop ? " is-stop" : " is-send"}${
                canStop && isProcessing ? " is-loading" : ""
              }`}
              onClick={handleActionClick}
              disabled={disabled || isDictationBusy || (!canStop && !canSend)}
              aria-label={canStop ? "Stop" : sendLabel}
            >
              {canStop ? (
                <>
                  <span className="composer-action-stop-square" aria-hidden />
                  {isProcessing && (
                    <span className="composer-action-spinner" aria-hidden />
                  )}
                </>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 5l6 6m-6-6L6 11m6-6v14"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {isDictationBusy && (
          <DictationWaveform
            active={isDictating}
            processing={dictationState === "processing"}
            level={dictationLevel}
          />
        )}
        {dictationError && (
          <div className="composer-dictation-error" role="status">
            <span>{dictationError}</span>
            <button
              type="button"
              className="ghost composer-dictation-error-dismiss"
              onClick={onDismissDictationError}
            >
              Dismiss
            </button>
          </div>
        )}
        {dictationHint && (
          <div className="composer-dictation-hint" role="status">
            <span>{dictationHint}</span>
            {onDismissDictationHint && (
              <button
                type="button"
                className="ghost composer-dictation-error-dismiss"
                onClick={onDismissDictationHint}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
        {suggestionsOpen && (
          <div
            className={`composer-suggestions popover-surface${
              reviewPromptOpen ? " review-inline-suggestions" : ""
            }`}
            role="listbox"
            ref={suggestionListRef}
            style={suggestionsStyle}
          >
            {reviewPromptOpen &&
            reviewPrompt &&
            onReviewPromptClose &&
            onReviewPromptShowPreset &&
            onReviewPromptChoosePreset &&
            highlightedPresetIndex !== undefined &&
            onReviewPromptHighlightPreset &&
            highlightedBranchIndex !== undefined &&
            onReviewPromptHighlightBranch &&
            highlightedCommitIndex !== undefined &&
            onReviewPromptHighlightCommit &&
            onReviewPromptSelectBranch &&
            onReviewPromptSelectBranchAtIndex &&
            onReviewPromptConfirmBranch &&
            onReviewPromptSelectCommit &&
            onReviewPromptSelectCommitAtIndex &&
            onReviewPromptConfirmCommit &&
            onReviewPromptUpdateCustomInstructions &&
            onReviewPromptConfirmCustom ? (
              <ReviewInlinePrompt
                reviewPrompt={reviewPrompt}
                onClose={onReviewPromptClose}
                onShowPreset={onReviewPromptShowPreset}
                onChoosePreset={onReviewPromptChoosePreset}
                highlightedPresetIndex={highlightedPresetIndex}
                onHighlightPreset={onReviewPromptHighlightPreset}
                highlightedBranchIndex={highlightedBranchIndex}
                onHighlightBranch={onReviewPromptHighlightBranch}
                highlightedCommitIndex={highlightedCommitIndex}
                onHighlightCommit={onReviewPromptHighlightCommit}
                onSelectBranch={onReviewPromptSelectBranch}
                onSelectBranchAtIndex={onReviewPromptSelectBranchAtIndex}
                onConfirmBranch={onReviewPromptConfirmBranch}
                onSelectCommit={onReviewPromptSelectCommit}
                onSelectCommitAtIndex={onReviewPromptSelectCommitAtIndex}
                onConfirmCommit={onReviewPromptConfirmCommit}
                onUpdateCustomInstructions={onReviewPromptUpdateCustomInstructions}
                onConfirmCustom={onReviewPromptConfirmCustom}
              />
            ) : (
              suggestions.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`composer-suggestion${
                    index === highlightIndex ? " is-active" : ""
                  }`}
                  role="option"
                  aria-selected={index === highlightIndex}
                  ref={(node) => {
                    suggestionRefs.current[index] = node;
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectSuggestion(item)}
                  onMouseEnter={() => onHighlightIndex(index)}
                >
                  {(() => {
                    const fileSuggestion = isFileSuggestion(item);
                    const title = fileSuggestion ? fileTitle(item.label) : item.label;
                    const description = fileSuggestion ? item.label : item.description;
                    if (fileSuggestion) {
                      const isDirectory = item.isDirectory === true;
                      const displayPath = isDirectory ? item.label.replace(/\/$/, "") : item.label;
                      return (
                        <span className="composer-suggestion-row">
                          <span className="composer-suggestion-icon" aria-hidden>
                            <FileIcon filePath={displayPath} isFolder={isDirectory} isOpen={false} />
                          </span>
                          <span className="composer-suggestion-content">
                            <span className="composer-suggestion-title">{title}</span>
                            {description && (
                              <span className="composer-suggestion-description">
                                {description}
                              </span>
                            )}
                          </span>
                        </span>
                      );
                    }
                    const Icon = suggestionIcon(item);
                    return (
                      <span className="composer-suggestion-row">
                        <span className="composer-suggestion-icon" aria-hidden>
                          <Icon size={14} />
                        </span>
                        <span className="composer-suggestion-content">
                          <span className="composer-suggestion-title">{title}</span>
                          {description && (
                            <span className="composer-suggestion-description">
                              {description}
                            </span>
                          )}
                          {item.hint && (
                            <span className="composer-suggestion-description">
                              {item.hint}
                            </span>
                          )}
                        </span>
                      </span>
                    );
                  })()}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
