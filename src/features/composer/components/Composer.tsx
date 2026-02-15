import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  ComposerEditorSettings,
  ConversationItem,
  CustomCommandOption,
  CustomPromptOption,
  DictationTranscript,
  EngineType,
  OpenCodeAgentOption,
  QueuedMessage,
  ThreadTokenUsage,
} from "../../../types";
import type {
  ReviewPromptState,
  ReviewPromptStep,
} from "../../threads/hooks/useReviewPrompt";
import type { EngineDisplayInfo } from "../../engine/hooks/useEngineController";
import { computeDictationInsertion } from "../../../utils/dictation";
import { isComposingEvent } from "../../../utils/keys";
import {
  getFenceTriggerLine,
  getLineIndent,
  getListContinuation,
  isCodeLikeSingleLine,
  isCursorInsideFence,
  normalizePastedText,
} from "../../../utils/composerText";
import { useComposerAutocompleteState } from "../hooks/useComposerAutocompleteState";
import { usePromptHistory } from "../hooks/usePromptHistory";
import { useInlineHistoryCompletion } from "../hooks/useInlineHistoryCompletion";
import { recordHistory as recordInputHistory } from "../hooks/useInputHistoryStore";
import { ComposerInput } from "./ComposerInput";
import { ComposerQueue } from "./ComposerQueue";
import { ComposerContextMenuPopover } from "./ComposerContextMenuPopover";
import { StatusPanel } from "../../status-panel/components/StatusPanel";
import { OpenCodeControlPanel } from "../../opencode/components/OpenCodeControlPanel";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Check from "lucide-react/dist/esm/icons/check";
import CircleHelp from "lucide-react/dist/esm/icons/circle-help";
import Hammer from "lucide-react/dist/esm/icons/hammer";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import ClipboardList from "lucide-react/dist/esm/icons/clipboard-list";
import {
  assembleSinglePrompt,
  shouldAssemblePrompt,
} from "../utils/promptAssembler";
import {
  extractInlineSelections,
  mergeUniqueNames,
} from "../utils/inlineSelections";
import { pushErrorToast } from "../../../services/toasts";

type ComposerProps = {
  kanbanContextMode?: "new" | "inherit";
  onKanbanContextModeChange?: (mode: "new" | "inherit") => void;
  items?: ConversationItem[];
  onSend: (text: string, images: string[]) => void;
  onQueue: (text: string, images: string[]) => void;
  onStop: () => void;
  canStop: boolean;
  disabled?: boolean;
  isProcessing: boolean;
  steerEnabled: boolean;
  collaborationModes: { id: string; label: string }[];
  selectedCollaborationModeId: string | null;
  onSelectCollaborationMode: (id: string | null) => void;
  // Engine props
  engines?: EngineDisplayInfo[];
  selectedEngine?: EngineType;
  onSelectEngine?: (engine: EngineType) => void;
  // Model props
  models: { id: string; displayName: string; model: string }[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  reasoningSupported: boolean;
  opencodeAgents?: OpenCodeAgentOption[];
  selectedOpenCodeAgent?: string | null;
  onSelectOpenCodeAgent?: (agentId: string | null) => void;
  opencodeVariantOptions?: string[];
  selectedOpenCodeVariant?: string | null;
  onSelectOpenCodeVariant?: (variant: string | null) => void;
  accessMode: "read-only" | "current" | "full-access";
  onSelectAccessMode: (mode: "read-only" | "current" | "full-access") => void;
  skills: { name: string; description?: string }[];
  prompts: CustomPromptOption[];
  commands?: CustomCommandOption[];
  files: string[];
  directories?: string[];
  contextUsage?: ThreadTokenUsage | null;
  queuedMessages?: QueuedMessage[];
  onEditQueued?: (item: QueuedMessage) => void;
  onDeleteQueued?: (id: string) => void;
  sendLabel?: string;
  draftText?: string;
  onDraftChange?: (text: string) => void;
  historyKey?: string | null;
  attachedImages?: string[];
  onPickImages?: () => void;
  onAttachImages?: (paths: string[]) => void;
  onRemoveImage?: (path: string) => void;
  prefillDraft?: QueuedMessage | null;
  onPrefillHandled?: (id: string) => void;
  insertText?: QueuedMessage | null;
  onInsertHandled?: (id: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  editorSettings?: ComposerEditorSettings;
  textareaHeight?: number;
  onTextareaHeightChange?: (height: number) => void;
  dictationEnabled?: boolean;
  dictationState?: "idle" | "listening" | "processing";
  dictationLevel?: number;
  onToggleDictation?: () => void;
  onOpenDictationSettings?: () => void;
  dictationTranscript?: DictationTranscript | null;
  onDictationTranscriptHandled?: (id: string) => void;
  dictationError?: string | null;
  onDismissDictationError?: () => void;
  dictationHint?: string | null;
  onDismissDictationHint?: () => void;
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
  onReviewPromptKeyDown?: (event: {
    key: string;
    shiftKey?: boolean;
    preventDefault: () => void;
  }) => boolean;
  onReviewPromptSelectBranch?: (value: string) => void;
  onReviewPromptSelectBranchAtIndex?: (index: number) => void;
  onReviewPromptConfirmBranch?: () => Promise<void>;
  onReviewPromptSelectCommit?: (sha: string, title: string) => void;
  onReviewPromptSelectCommitAtIndex?: (index: number) => void;
  onReviewPromptConfirmCommit?: () => Promise<void>;
  onReviewPromptUpdateCustomInstructions?: (value: string) => void;
  onReviewPromptConfirmCustom?: () => Promise<void>;
  linkedKanbanPanels?: {
    id: string;
    name: string;
    workspaceId: string;
    createdAt?: number;
  }[];
  selectedLinkedKanbanPanelId?: string | null;
  onSelectLinkedKanbanPanel?: (panelId: string | null) => void;
  onOpenLinkedKanbanPanel?: (panelId: string) => void;
  activeFilePath?: string | null;
  activeFileLineRange?: { startLine: number; endLine: number } | null;
  fileReferenceMode?: "path" | "none";
  activeWorkspaceId?: string | null;
  activeThreadId?: string | null;
};

const DEFAULT_EDITOR_SETTINGS: ComposerEditorSettings = {
  preset: "default",
  expandFenceOnSpace: false,
  expandFenceOnEnter: false,
  fenceLanguageTags: false,
  fenceWrapSelection: false,
  autoWrapPasteMultiline: false,
  autoWrapPasteCodeLike: false,
  continueListOnShiftEnter: false,
};

const EMPTY_ITEMS: ConversationItem[] = [];
const COMPOSER_COMPACT_RESERVED_GAP = 24;
const COMPOSER_MIN_HEIGHT = 20;
const COMPOSER_EXPAND_HEIGHT = 80;

type PrefixOption = {
  name: string;
  description?: string;
};

type PrefixGroup = {
  prefix: string;
  options: PrefixOption[];
};

function extractOptionPrefix(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Other";
  }
  if (trimmed.includes(":")) {
    return trimmed.split(":")[0] || "Other";
  }
  if (trimmed.includes("-")) {
    return trimmed.split("-")[0] || "Other";
  }
  return "Other";
}

function groupOptionsByPrefix(options: PrefixOption[]): PrefixGroup[] {
  const grouped = new Map<string, PrefixOption[]>();
  for (const option of options) {
    const prefix = extractOptionPrefix(option.name);
    const bucket = grouped.get(prefix) ?? [];
    bucket.push(option);
    grouped.set(prefix, bucket);
  }
  return Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([prefix, list]) => ({
      prefix,
      options: list.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

function splitGroupsForColumns(groups: PrefixGroup[]): [PrefixGroup[], PrefixGroup[]] {
  const left: PrefixGroup[] = [];
  const right: PrefixGroup[] = [];
  let leftWeight = 0;
  let rightWeight = 0;
  for (const group of groups) {
    const groupWeight = group.options.length + 1;
    if (leftWeight <= rightWeight) {
      left.push(group);
      leftWeight += groupWeight;
    } else {
      right.push(group);
      rightWeight += groupWeight;
    }
  }
  return [left, right];
}

const OPENCODE_DIRECT_COMMANDS = new Set(["status", "mcp", "export", "share"]);

function normalizeCommandChipName(name: string) {
  const token = name.trim().replace(/^\/+/, "").split(/\s+/)[0];
  return token ? token.toLowerCase() : "";
}

function filterOptionsByQuery<T extends { name: string; description?: string }>(
  options: T[],
  query: string,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return options;
  }
  return options.filter((option) => {
    const searchableText = `${option.name} ${option.description ?? ""}`.toLocaleLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}

export function Composer({
  kanbanContextMode = "new",
  onKanbanContextModeChange,
  items = EMPTY_ITEMS,
  onSend,
  onQueue,
  onStop,
  canStop,
  disabled = false,
  isProcessing,
  steerEnabled,
  collaborationModes,
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  engines,
  selectedEngine,
  onSelectEngine,
  models,
  selectedModelId,
  onSelectModel,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  reasoningSupported,
  opencodeAgents = [],
  selectedOpenCodeAgent = null,
  onSelectOpenCodeAgent,
  opencodeVariantOptions = [],
  selectedOpenCodeVariant = null,
  onSelectOpenCodeVariant,
  accessMode,
  onSelectAccessMode,
  skills,
  prompts,
  commands = [],
  files,
  directories = [],
  contextUsage = null,
  queuedMessages = [],
  onEditQueued,
  onDeleteQueued,
  sendLabel = "Send",
  draftText = "",
  onDraftChange,
  historyKey = null,
  attachedImages = [],
  onPickImages,
  onAttachImages,
  onRemoveImage,
  prefillDraft = null,
  onPrefillHandled,
  insertText = null,
  onInsertHandled,
  textareaRef: externalTextareaRef,
  editorSettings: editorSettingsProp,
  textareaHeight = 80,
  onTextareaHeightChange,
  dictationEnabled = false,
  dictationState = "idle",
  dictationLevel = 0,
  onToggleDictation,
  onOpenDictationSettings,
  dictationTranscript = null,
  onDictationTranscriptHandled,
  dictationError = null,
  onDismissDictationError,
  dictationHint = null,
  onDismissDictationHint,
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
  onReviewPromptKeyDown,
  onReviewPromptSelectBranch,
  onReviewPromptSelectBranchAtIndex,
  onReviewPromptConfirmBranch,
  onReviewPromptSelectCommit,
  onReviewPromptSelectCommitAtIndex,
  onReviewPromptConfirmCommit,
  onReviewPromptUpdateCustomInstructions,
  onReviewPromptConfirmCustom,
  linkedKanbanPanels = [],
  selectedLinkedKanbanPanelId = null,
  onSelectLinkedKanbanPanel,
  onOpenLinkedKanbanPanel,
  activeFilePath = null,
  activeFileLineRange = null,
  fileReferenceMode = "path",
  activeWorkspaceId = null,
  activeThreadId = null,
}: ComposerProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(draftText);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [manualContextCollapsed, setManualContextCollapsed] = useState(true);
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [selectedSkillNames, setSelectedSkillNames] = useState<string[]>([]);
  const [selectedCommonsNames, setSelectedCommonsNames] = useState<string[]>([]);
  const [isComposerCollapsed, setIsComposerCollapsed] = useState(false);
  const [openCodeProviderTone, setOpenCodeProviderTone] = useState<
    "is-ok" | "is-runtime" | "is-fail"
  >("is-fail");
  const [openCodeProviderToneReady, setOpenCodeProviderToneReady] = useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [commonsMenuOpen, setCommonsMenuOpen] = useState(false);
  const [skillSearchQuery, setSkillSearchQuery] = useState("");
  const [commonsSearchQuery, setCommonsSearchQuery] = useState("");
  const helpMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const skillMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const commonsMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const managementPanelRef = useRef<HTMLDivElement | null>(null);
  const managementHeaderRef = useRef<HTMLDivElement | null>(null);
  const contextActionsRef = useRef<HTMLDivElement | null>(null);
  const managementToggleRef = useRef<HTMLButtonElement | null>(null);
  const previousCompactLayoutRef = useRef(false);
  const lastExpandedHeightRef = useRef(
    Math.max(textareaHeight, COMPOSER_EXPAND_HEIGHT),
  );
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = externalTextareaRef ?? internalRef;
  const editorSettings = editorSettingsProp ?? DEFAULT_EDITOR_SETTINGS;
  const isDictationBusy = dictationState !== "idle";
  const canSend = text.trim().length > 0 || attachedImages.length > 0;
  const hasActiveFileReference = Boolean(activeFilePath);
  const {
    expandFenceOnSpace,
    expandFenceOnEnter,
    fenceLanguageTags,
    fenceWrapSelection,
    autoWrapPasteMultiline,
    autoWrapPasteCodeLike,
    continueListOnShiftEnter,
  } = editorSettings;

  // Get current engine display name
  const currentEngineName = engines?.find((e) => e.type === selectedEngine)?.shortName;
  const selectedModel = useMemo(
    () => models.find((entry) => entry.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );
  const selectedSkills = skills.filter((skill) => selectedSkillNames.includes(skill.name));
  const selectedCommons = commands.filter((item) =>
    selectedCommonsNames.includes(item.name),
  );
  const selectedOpenCodeDirectCommand = useMemo(() => {
    if (selectedEngine !== "opencode") {
      return null;
    }
    for (const name of selectedCommonsNames) {
      const normalized = normalizeCommandChipName(name);
      if (OPENCODE_DIRECT_COMMANDS.has(normalized)) {
        return normalized;
      }
    }
    return null;
  }, [selectedCommonsNames, selectedEngine]);
  const openCodeAgentCycleValues = useMemo(() => {
    const primary = opencodeAgents
      .filter((agent) => agent.isPrimary)
      .map((agent) => agent.id)
      .filter((id) => id.trim().length > 0);
    const dedupedPrimary = Array.from(new Set(primary));
    if (dedupedPrimary.length > 0) {
      return dedupedPrimary;
    }
    const fallback = opencodeAgents
      .map((agent) => agent.id)
      .filter((id) => id.trim().length > 0);
    return Array.from(new Set(fallback));
  }, [opencodeAgents]);
  const cycleOpenCodeAgent = useCallback(
    (reverse = false) => {
      if (selectedEngine !== "opencode" || !onSelectOpenCodeAgent) {
        return false;
      }
      const values = openCodeAgentCycleValues;
      if (values.length === 0) {
        return false;
      }
      const current = selectedOpenCodeAgent ?? "";
      const currentIndex = values.indexOf(current);
      const nextIndex =
        currentIndex === -1
          ? reverse
            ? values.length - 1
            : 0
          : (currentIndex + (reverse ? -1 : 1) + values.length) % values.length;
      const nextValue = values[nextIndex] ?? "";
      onSelectOpenCodeAgent(nextValue || null);
      return true;
    },
    [
      onSelectOpenCodeAgent,
      openCodeAgentCycleValues,
      selectedEngine,
      selectedOpenCodeAgent,
    ],
  );
  const openCodeVariantCycleValues = useMemo(() => {
    const deduped = Array.from(
      new Set(opencodeVariantOptions.map((variant) => variant.trim()).filter(Boolean)),
    );
    return ["", ...deduped];
  }, [opencodeVariantOptions]);
  const cycleOpenCodeVariant = useCallback(
    (reverse = false) => {
      if (selectedEngine !== "opencode" || !onSelectOpenCodeVariant) {
        return false;
      }
      const values = openCodeVariantCycleValues;
      if (values.length <= 1) {
        return false;
      }
      const current = selectedOpenCodeVariant ?? "";
      const currentIndex = values.indexOf(current);
      const nextIndex =
        currentIndex === -1
          ? reverse
            ? values.length - 1
            : 0
          : (currentIndex + (reverse ? -1 : 1) + values.length) % values.length;
      const nextValue = values[nextIndex] ?? "";
      onSelectOpenCodeVariant(nextValue || null);
      return true;
    },
    [
      onSelectOpenCodeVariant,
      openCodeVariantCycleValues,
      selectedEngine,
      selectedOpenCodeVariant,
    ],
  );
  const canSend =
    text.trim().length > 0 ||
    attachedImages.length > 0 ||
    Boolean(selectedOpenCodeDirectCommand);
  const opencodeDisconnected =
    selectedEngine === "opencode" && openCodeProviderToneReady && openCodeProviderTone === "is-fail";
  const canSendEffective = canSend && !opencodeDisconnected;
  const contextCollapsed = manualContextCollapsed;
  const showOpenCodeControlPanel = selectedEngine === "opencode";
  const collapsedSkillPreview = selectedSkills.slice(0, 2);
  const collapsedCommonsPreview = selectedCommons.slice(0, 2);
  const collapsedKanbanPreview = (() => {
    if (linkedKanbanPanels.length <= 2) {
      return linkedKanbanPanels;
    }
    const base = linkedKanbanPanels.slice(0, 2);
    if (!selectedLinkedKanbanPanelId) {
      return base;
    }
    if (base.some((panel) => panel.id === selectedLinkedKanbanPanelId)) {
      return base;
    }
    const selected = linkedKanbanPanels.find(
      (panel) => panel.id === selectedLinkedKanbanPanelId,
    );
    return selected ? [base[0], selected] : base;
  })();
  const availableSkills = skills.filter((skill) => !selectedSkillNames.includes(skill.name));
  const availableCommons = commands.filter((item) => !selectedCommonsNames.includes(item.name));
  const skillOptions = availableSkills.map((skill) => ({
    name: skill.name,
    description: skill.description,
  }));
  const commonsOptions = availableCommons.map((item) => ({
    name: item.name,
    description: item.description,
  }));
  const filteredSkillOptions = filterOptionsByQuery(skillOptions, skillSearchQuery);
  const filteredCommonsOptions = filterOptionsByQuery(commonsOptions, commonsSearchQuery);
  const groupedSkillOptions = groupOptionsByPrefix(filteredSkillOptions);
  const groupedCommonsOptions = groupOptionsByPrefix(filteredCommonsOptions);
  const [skillLeftColumn, skillRightColumn] = splitGroupsForColumns(groupedSkillOptions);
  const [commonsLeftColumn, commonsRightColumn] = splitGroupsForColumns(groupedCommonsOptions);

  useEffect(() => {
    if (textareaHeight > COMPOSER_MIN_HEIGHT) {
      lastExpandedHeightRef.current = textareaHeight;
    }
  }, [textareaHeight]);

  const handleCollapseComposer = useCallback(() => {
    setIsComposerCollapsed(true);
  }, []);

  const handleExpandComposer = useCallback(() => {
    setIsComposerCollapsed(false);
    onTextareaHeightChange?.(
      Math.max(lastExpandedHeightRef.current, COMPOSER_EXPAND_HEIGHT),
    );
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [onTextareaHeightChange, textareaRef]);

  useEffect(() => {
    setText((prev) => (prev === draftText ? prev : draftText));
  }, [draftText]);

  useEffect(() => {
    setManualContextCollapsed(true);
  }, [historyKey]);

  const setComposerText = useCallback(
    (next: string) => {
      setText(next);
      onDraftChange?.(next);
    },
    [onDraftChange],
  );

  useEffect(() => {
    const { cleanedText, matchedSkillNames, matchedCommonsNames } =
      extractInlineSelections(text, skills, commands);
    if (matchedSkillNames.length > 0) {
      setSelectedSkillNames((prev) => mergeUniqueNames(prev, matchedSkillNames));
    }
    if (matchedCommonsNames.length > 0) {
      setSelectedCommonsNames((prev) => mergeUniqueNames(prev, matchedCommonsNames));
    }
    if (cleanedText !== text) {
      setComposerText(cleanedText);
    }
  }, [commands, setComposerText, skills, text]);

  const {
    isAutocompleteOpen,
    autocompleteMatches,
    highlightIndex,
    setHighlightIndex,
    applyAutocomplete,
    handleInputKeyDown,
    handleTextChange,
    handleSelectionChange,
  } = useComposerAutocompleteState({
    text,
    selectionStart,
    disabled,
    skills,
    prompts,
    commands,
    files,
    directories,
    textareaRef,
    setText: setComposerText,
    setSelectionStart,
  });
  const reviewPromptOpen = Boolean(reviewPrompt);
  const suggestionsOpen = reviewPromptOpen || isAutocompleteOpen;
  const suggestions = reviewPromptOpen ? [] : autocompleteMatches;

  const {
    handleHistoryKeyDown,
    handleHistoryTextChange,
    recordHistory,
    resetHistoryNavigation,
  } = usePromptHistory({
    historyKey,
    text,
    hasAttachments: attachedImages.length > 0,
    disabled,
    isAutocompleteOpen: suggestionsOpen,
    textareaRef,
    setText: setComposerText,
    setSelectionStart,
  });

  const inlineCompletion = useInlineHistoryCompletion();

  const handleTextChangeWithHistory = useCallback(
    (next: string, cursor: number | null) => {
      handleHistoryTextChange(next);
      handleTextChange(next, cursor);
      // Update inline history completion
      if (!suggestionsOpen) {
        inlineCompletion.updateQuery(next);
      } else {
        inlineCompletion.clear();
      }
    },
    [handleHistoryTextChange, handleTextChange, suggestionsOpen, inlineCompletion],
  );

  const applyActiveFileReference = useCallback(
    (message: string) => {
      if (!(hasActiveFileReference && fileReferenceMode === "path" && activeFilePath && activeFileLineRange)) {
        return message;
      }
      const referenceTarget = `${activeFilePath}#L${activeFileLineRange.startLine}-L${activeFileLineRange.endLine}`;
      if (message.includes(referenceTarget) || message.includes(activeFilePath)) {
        return message;
      }
      return `@file \`${referenceTarget}\`\n${message}`.trim();
    },
    [activeFileLineRange, activeFilePath, fileReferenceMode, hasActiveFileReference],
  );

  const handleSend = useCallback(() => {
    if (disabled) {
      return;
    }
    if (opencodeDisconnected) {
      pushErrorToast({
        title: "OpenCode 未连接",
        message: "当前连接状态为红色，请先在 OpenCode 管理面板完成连接后再发送。",
      });
      return;
    }
    const trimmed = text.trim();
    if (!trimmed && attachedImages.length === 0 && !selectedOpenCodeDirectCommand) {
      return;
    }
    if (selectedOpenCodeDirectCommand) {
      onSend(`/${selectedOpenCodeDirectCommand}`, []);
      setSelectedCommonsNames((prev) =>
        prev.filter(
          (name) => normalizeCommandChipName(name) !== selectedOpenCodeDirectCommand,
        ),
      );
      inlineCompletion.clear();
      resetHistoryNavigation();
      setComposerText("");
      return;
    }
    if (trimmed) {
      recordHistory(trimmed);
      recordInputHistory(trimmed);
    }
    inlineCompletion.clear();
    const finalText = shouldAssemblePrompt({
      userInput: trimmed,
      selectedSkillCount: selectedSkills.length,
      selectedCommonsCount: selectedCommons.length,
    })
      ? assembleSinglePrompt({
          userInput: trimmed,
          skills: selectedSkills,
          commons: selectedCommons.map((item) => ({ name: item.name })),
        })
      : trimmed;
    const finalTextWithReference = applyActiveFileReference(finalText);
    onSend(finalTextWithReference, attachedImages);
    resetHistoryNavigation();
    setComposerText("");
  }, [
    attachedImages,
    disabled,
    applyActiveFileReference,
    opencodeDisconnected,
    selectedOpenCodeDirectCommand,
    selectedCommons,
    selectedSkills,
    onSend,
    inlineCompletion,
    recordHistory,
    resetHistoryNavigation,
    setComposerText,
    text,
  ]);

  const handleQueue = useCallback(() => {
    if (disabled) {
      return;
    }
    if (opencodeDisconnected) {
      pushErrorToast({
        title: "OpenCode 未连接",
        message: "当前连接状态为红色，请先在 OpenCode 管理面板完成连接后再发送。",
      });
      return;
    }
    const trimmed = text.trim();
    if (!trimmed && attachedImages.length === 0 && !selectedOpenCodeDirectCommand) {
      return;
    }
    if (selectedOpenCodeDirectCommand) {
      onQueue(`/${selectedOpenCodeDirectCommand}`, []);
      setSelectedCommonsNames((prev) =>
        prev.filter(
          (name) => normalizeCommandChipName(name) !== selectedOpenCodeDirectCommand,
        ),
      );
      inlineCompletion.clear();
      resetHistoryNavigation();
      setComposerText("");
      return;
    }
    if (trimmed) {
      recordHistory(trimmed);
    }
    const finalText = shouldAssemblePrompt({
      userInput: trimmed,
      selectedSkillCount: selectedSkills.length,
      selectedCommonsCount: selectedCommons.length,
    })
      ? assembleSinglePrompt({
          userInput: trimmed,
          skills: selectedSkills,
          commons: selectedCommons.map((item) => ({ name: item.name })),
        })
      : trimmed;
    const finalTextWithReference = applyActiveFileReference(finalText);
    onQueue(finalTextWithReference, attachedImages);
    inlineCompletion.clear();
    resetHistoryNavigation();
    setComposerText("");
  }, [
    attachedImages,
    disabled,
    applyActiveFileReference,
    opencodeDisconnected,
    selectedOpenCodeDirectCommand,
    selectedCommons,
    selectedSkills,
    onQueue,
    inlineCompletion,
    recordHistory,
    resetHistoryNavigation,
    setComposerText,
    text,
  ]);

  const handleSelectLinkedPanel = useCallback(
    (panelId: string) => {
      const isTogglingOff = selectedLinkedKanbanPanelId === panelId;
      onSelectLinkedKanbanPanel?.(isTogglingOff ? null : panelId);
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
          return;
        }
        textarea.focus();
        const cursor = textarea.selectionStart ?? text.length;
        textarea.setSelectionRange(cursor, cursor);
        handleSelectionChange(cursor);
      });
    },
    [
      handleSelectionChange,
      onSelectLinkedKanbanPanel,
      selectedLinkedKanbanPanelId,
      text,
      textareaRef,
    ],
  );

  const selectedLinkedPanel = linkedKanbanPanels.find(
    (panel) => panel.id === selectedLinkedKanbanPanelId,
  );

  const handlePickSkill = useCallback((name: string) => {
    setSelectedSkillNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setSkillSearchQuery("");
    setSkillMenuOpen(false);
  }, []);

  const handlePickCommons = useCallback((name: string) => {
    setSelectedCommonsNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setCommonsSearchQuery("");
    setCommonsMenuOpen(false);
  }, []);

  const renderGroupedOptions = useCallback(
    (
      leftColumn: PrefixGroup[],
      rightColumn: PrefixGroup[],
      onPick: (name: string) => void,
      emptyLabel: string,
      keyPrefix: string,
    ) => {
      const renderColumn = (groups: PrefixGroup[], columnKey: "left" | "right") => (
        <div className="composer-context-menu-column" key={`${keyPrefix}-${columnKey}`}>
          {groups.map((group) => (
            <section
              key={`${keyPrefix}-${columnKey}-${group.prefix}`}
              className="composer-context-menu-group"
            >
              <header className="composer-context-menu-group-title">{group.prefix}</header>
              <div className="composer-context-menu-group-items">
                {group.options.map((option) => (
                  <button
                    key={`${keyPrefix}-${columnKey}-${group.prefix}-${option.name}`}
                    type="button"
                    className="composer-context-menu-item"
                    onClick={() => onPick(option.name)}
                    title={option.description}
                  >
                    <span className="composer-context-menu-item-name">{option.name}</span>
                    <span className="composer-context-menu-item-desc">
                      {option.description || "暂无描述"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      );

      if (leftColumn.length === 0 && rightColumn.length === 0) {
        return <span className="composer-context-menu-empty">{emptyLabel}</span>;
      }

      return (
        <>
          {renderColumn(leftColumn, "left")}
          {renderColumn(rightColumn, "right")}
        </>
      );
    },
    [],
  );

  useEffect(() => {
    if (!prefillDraft) {
      return;
    }
    setComposerText(prefillDraft.text);
    resetHistoryNavigation();
    onPrefillHandled?.(prefillDraft.id);
  }, [onPrefillHandled, prefillDraft, resetHistoryNavigation, setComposerText]);

  useEffect(() => {
    if (!insertText) {
      return;
    }
    setComposerText(insertText.text);
    resetHistoryNavigation();
    onInsertHandled?.(insertText.id);
  }, [insertText, onInsertHandled, resetHistoryNavigation, setComposerText]);

  useEffect(() => {
    const panelElement = managementPanelRef.current;
    const headerElement = managementHeaderRef.current;
    const actionsElement = contextActionsRef.current;
    const toggleElement = managementToggleRef.current;

    const updateCompactLayout = () => {
      const panelWidth = panelElement?.getBoundingClientRect().width ?? 0;
      const headerWidth = headerElement?.getBoundingClientRect().width ?? panelWidth;
      const actionsWidth = actionsElement?.scrollWidth ?? 0;
      const toggleWidth = toggleElement?.getBoundingClientRect().width ?? 0;
      if (headerWidth <= 0 || actionsWidth <= 0 || toggleWidth <= 0) {
        setIsCompactLayout(false);
        return;
      }
      setIsCompactLayout(
        actionsWidth + toggleWidth + COMPOSER_COMPACT_RESERVED_GAP > headerWidth,
      );
    };

    updateCompactLayout();
    if (typeof ResizeObserver !== "undefined" && panelElement) {
      const observer = new ResizeObserver(() => updateCompactLayout());
      for (const element of [panelElement, headerElement, actionsElement, toggleElement]) {
        if (element) {
          observer.observe(element);
        }
      }
      return () => observer.disconnect();
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", updateCompactLayout);
      return () => window.removeEventListener("resize", updateCompactLayout);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (isCompactLayout && !previousCompactLayoutRef.current) {
      setManualContextCollapsed(false);
    }
    previousCompactLayoutRef.current = isCompactLayout;
  }, [isCompactLayout]);

  useEffect(() => {
    if (!dictationTranscript) {
      return;
    }
    const textToInsert = dictationTranscript.text.trim();
    if (!textToInsert) {
      onDictationTranscriptHandled?.(dictationTranscript.id);
      return;
    }
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? start;
    const { nextText, nextCursor } = computeDictationInsertion(
      text,
      textToInsert,
      start,
      end,
    );
    setComposerText(nextText);
    resetHistoryNavigation();
    requestAnimationFrame(() => {
      if (!textareaRef.current) {
        return;
      }
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextCursor, nextCursor);
      handleSelectionChange(nextCursor);
    });
    onDictationTranscriptHandled?.(dictationTranscript.id);
  }, [
    dictationTranscript,
    handleSelectionChange,
    onDictationTranscriptHandled,
    resetHistoryNavigation,
    selectionStart,
    setComposerText,
    text,
    textareaRef,
  ]);

  const applyTextInsertion = useCallback(
    (nextText: string, nextCursor: number) => {
      setComposerText(nextText);
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
          return;
        }
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
        handleSelectionChange(nextCursor);
      });
    },
    [handleSelectionChange, setComposerText, textareaRef],
  );

  const handleTextPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      if (disabled) {
        return;
      }
      if (!autoWrapPasteMultiline && !autoWrapPasteCodeLike) {
        return;
      }
      const pasted = event.clipboardData?.getData("text/plain") ?? "";
      if (!pasted) {
        return;
      }
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      const start = textarea.selectionStart ?? text.length;
      const end = textarea.selectionEnd ?? start;
      if (isCursorInsideFence(text, start)) {
        return;
      }
      const normalized = normalizePastedText(pasted);
      if (!normalized) {
        return;
      }
      const isMultiline = normalized.includes("\n");
      if (isMultiline && !autoWrapPasteMultiline) {
        return;
      }
      if (
        !isMultiline &&
        !(autoWrapPasteCodeLike && isCodeLikeSingleLine(normalized))
      ) {
        return;
      }
      event.preventDefault();
      const indent = getLineIndent(text, start);
      const content = indent
        ? normalized
            .split("\n")
            .map((line) => `${indent}${line}`)
            .join("\n")
        : normalized;
      const before = text.slice(0, start);
      const after = text.slice(end);
      const block = `${indent}\`\`\`\n${content}\n${indent}\`\`\``;
      const nextText = `${before}${block}${after}`;
      const nextCursor = before.length + block.length;
      applyTextInsertion(nextText, nextCursor);
    },
    [
      applyTextInsertion,
      autoWrapPasteCodeLike,
      autoWrapPasteMultiline,
      disabled,
      text,
      textareaRef,
    ],
  );

  const tryExpandFence = useCallback(
    (start: number, end: number) => {
      if (start !== end && !fenceWrapSelection) {
        return false;
      }
      const fence = getFenceTriggerLine(text, start, fenceLanguageTags);
      if (!fence) {
        return false;
      }
      const before = text.slice(0, fence.lineStart);
      const after = text.slice(fence.lineEnd);
      const openFence = `${fence.indent}\`\`\`${fence.tag}`;
      const closeFence = `${fence.indent}\`\`\``;
      if (fenceWrapSelection && start !== end) {
        const selection = normalizePastedText(text.slice(start, end));
        const content = fence.indent
          ? selection
              .split("\n")
              .map((line) => `${fence.indent}${line}`)
              .join("\n")
          : selection;
        const block = `${openFence}\n${content}\n${closeFence}`;
        const nextText = `${before}${block}${after}`;
        const nextCursor = before.length + block.length;
        applyTextInsertion(nextText, nextCursor);
        return true;
      }
      const block = `${openFence}\n${fence.indent}\n${closeFence}`;
      const nextText = `${before}${block}${after}`;
      const nextCursor =
        before.length + openFence.length + 1 + fence.indent.length;
      applyTextInsertion(nextText, nextCursor);
      return true;
    },
    [applyTextInsertion, fenceLanguageTags, fenceWrapSelection, text],
  );

  return (
    <footer className={`composer${disabled ? " is-disabled" : ""}`}>
      <StatusPanel items={items} isProcessing={isProcessing} />
      <ComposerQueue
        queuedMessages={queuedMessages}
        onEditQueued={onEditQueued}
        onDeleteQueued={onDeleteQueued}
      />
      <div className={`composer-shell${isComposerCollapsed ? " is-collapsed" : ""}`}>
        {isComposerCollapsed ? (
          <button
            type="button"
            className={`composer-shell-collapsed-strip${isProcessing ? " is-processing" : ""}`}
            onClick={handleExpandComposer}
            aria-label={t("composer.expandInput")}
            title={t("composer.expandInput")}
          >
            <span className="composer-shell-collapsed-rail" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            <span className="composer-shell-collapsed-text">
              {isProcessing ? t("composer.collapsedProcessing") : t("composer.expandInput")}
            </span>
          </button>
        ) : (
          <>
            <div
          ref={managementPanelRef}
          className={`composer-management-panel${isCompactLayout ? " is-compact" : ""}`}
            >
          <div ref={managementHeaderRef} className="composer-management-header">
            <div ref={contextActionsRef} className="composer-context-actions">
              <div className="composer-context-menu">
                <button
                  ref={helpMenuAnchorRef}
                  type="button"
                  className="composer-context-action-btn composer-context-action-btn--help"
                  onClick={() => {
                    setHelpMenuOpen((prev) => !prev);
                    setSkillMenuOpen(false);
                    setCommonsMenuOpen(false);
                  }}
                  disabled={disabled}
                  aria-label="管理面板使用说明"
                >
                  <span className="composer-context-action-icon" aria-hidden>
                    <CircleHelp size={12} />
                  </span>
                </button>
                <ComposerContextMenuPopover
                  open={helpMenuOpen}
                  anchorRef={helpMenuAnchorRef}
                  onClose={() => setHelpMenuOpen(false)}
                  panelClassName="composer-context-menu-panel--help"
                  panelProps={{ role: "dialog", "aria-label": "管理面板说明" }}
                >
                  <div className="composer-context-menu-head">
                    <span className="composer-context-menu-title">管理面板使用说明</span>
                    <span className="composer-context-menu-meta">面向 Skill / Commons / 看板联动</span>
                  </div>
                  <div className="composer-context-help-grid">
                    <section className="composer-context-help-section">
                      <h4>按钮含义</h4>
                      <ul>
                        <li>
                          <strong>+S</strong>：添加 Skill（专家视角），如 Review / Debug / Doc。
                        </li>
                        <li>
                          <strong>+M</strong>：添加 Commons（长期规则），如项目约束、团队规范。
                        </li>
                        <li>
                          <strong>S / M / K</strong>：已选 Skill / Commons / 关联看板标识。
                        </li>
                        <li>
                          <strong>K link</strong>：打开对应看板页面；切换不同 K 即切换上下文来源。
                        </li>
                      </ul>
                    </section>
                    <section className="composer-context-help-section">
                      <h4>推荐用法</h4>
                      <ol>
                        <li>先选 1-2 个 Skill，确定分析角度。</li>
                        <li>再补 1-2 个 Commons，限制输出边界。</li>
                        <li>需要结合项目状态时，再选择关联看板 (K)。</li>
                      </ol>
                    </section>
                    <section className="composer-context-help-section">
                      <h4>看板与会话模式</h4>
                      <ul>
                        <li>
                          <strong>K 选中效果</strong>：被选中的看板会作为当前上下文来源，发送时优先绑定该看板。
                        </li>
                        <li>
                          <strong>新会话</strong>：仅使用当前输入 + 已选 S/M/K，不继承上一次该看板会话内容。
                        </li>
                        <li>
                          <strong>继承当前</strong>：继续该看板的当前会话，保留已有上下文与历史推理链路。
                        </li>
                        <li>
                          <strong>选中态 icon</strong>：当前生效模式前会显示绿色勾选 icon，便于快速确认。
                        </li>
                      </ul>
                    </section>
                    <section className="composer-context-help-section composer-context-help-section--wide">
                      <h4>发送时自动拼装（对用户透明）</h4>
                      <pre className="composer-context-help-example">
{`/skill-name /commons-name 你的自然语言问题
示例：/tr-zh-en-jp /AI-REACH:Auto 我要睡觉`}
                      </pre>
                    </section>
                  </div>
                  <div className="composer-context-menu-foot">
                    目标：你只写问题，系统负责结构化 Prompt 组装。
                  </div>
                </ComposerContextMenuPopover>
              </div>

              <div className="composer-context-menu">
                <button
                  ref={skillMenuAnchorRef}
                  type="button"
                  className="composer-context-action-btn composer-context-action-btn--skill"
                  onClick={() => {
                    setSkillMenuOpen((prev) => !prev);
                    setHelpMenuOpen(false);
                    setCommonsMenuOpen(false);
                    setCommonsSearchQuery("");
                  }}
                  disabled={disabled}
                >
                  <span className="composer-context-action-icon" aria-hidden>
                    <Hammer size={12} />
                  </span>
                  <span>S+</span>
                </button>
                <ComposerContextMenuPopover
                  open={skillMenuOpen}
                  anchorRef={skillMenuAnchorRef}
                  onClose={() => setSkillMenuOpen(false)}
                  panelClassName={skillSearchQuery.trim() ? "is-searching" : undefined}
                >
                  <div className="composer-context-menu-sticky">
                    <div className="composer-context-menu-head">
                      <span className="composer-context-menu-title">选择 Skill</span>
                      <span className="composer-context-menu-meta">
                        {filteredSkillOptions.length} 个可选
                      </span>
                    </div>
                    <div className="composer-context-menu-search">
                      <input
                        type="text"
                        className="composer-context-menu-search-input"
                        value={skillSearchQuery}
                        onChange={(event) => setSkillSearchQuery(event.target.value)}
                        placeholder="搜索 Skill（名称或描述）"
                        aria-label="搜索 Skill"
                      />
                    </div>
                  </div>
                  <div className="composer-context-menu-grid" role="listbox" aria-label="Skill options">
                    {renderGroupedOptions(
                      skillLeftColumn,
                      skillRightColumn,
                      handlePickSkill,
                      "没有可选 Skill",
                      "skill",
                    )}
                  </div>
                  <div className="composer-context-menu-foot">点击一项立即添加</div>
                </ComposerContextMenuPopover>
              </div>

              <div className="composer-context-menu">
                <button
                  ref={commonsMenuAnchorRef}
                  type="button"
                  className="composer-context-action-btn composer-context-action-btn--commons"
                  onClick={() => {
                    setCommonsMenuOpen((prev) => !prev);
                    setHelpMenuOpen(false);
                    setSkillMenuOpen(false);
                    setSkillSearchQuery("");
                  }}
                  disabled={disabled}
                >
                  <span className="composer-context-action-icon" aria-hidden>
                    <Wrench size={12} />
                  </span>
                  <span>M+</span>
                </button>
                <ComposerContextMenuPopover
                  open={commonsMenuOpen}
                  anchorRef={commonsMenuAnchorRef}
                  onClose={() => setCommonsMenuOpen(false)}
                  panelClassName={commonsSearchQuery.trim() ? "is-searching" : undefined}
                >
                  <div className="composer-context-menu-sticky">
                    <div className="composer-context-menu-head">
                      <span className="composer-context-menu-title">选择 Commons</span>
                      <span className="composer-context-menu-meta">
                        {filteredCommonsOptions.length} 个可选
                      </span>
                    </div>
                    <div className="composer-context-menu-search">
                      <input
                        type="text"
                        className="composer-context-menu-search-input"
                        value={commonsSearchQuery}
                        onChange={(event) => setCommonsSearchQuery(event.target.value)}
                        placeholder="搜索 Commons（名称或描述）"
                        aria-label="搜索 Commons"
                      />
                    </div>
                  </div>
                  <div
                    className="composer-context-menu-grid"
                    role="listbox"
                    aria-label="Commons options"
                  >
                    {renderGroupedOptions(
                      commonsLeftColumn,
                      commonsRightColumn,
                      handlePickCommons,
                      "没有可选 Commons",
                      "commons",
                    )}
                  </div>
                  <div className="composer-context-menu-foot">点击一项立即添加</div>
                </ComposerContextMenuPopover>
              </div>
            </div>
            {(selectedSkills.length > 0 ||
              selectedCommons.length > 0 ||
              (contextCollapsed && collapsedKanbanPreview.length > 0)) && (
                <div
                  className={`composer-management-collapsed-row${
                    contextCollapsed ? " is-collapsed" : " is-expanded"
                  }`}
                >
                  {(contextCollapsed ? collapsedSkillPreview : selectedSkills).map((skill) => (
                    <button
                      key={`collapsed-skill-${skill.name}`}
                      type="button"
                      className="composer-collapsed-pill composer-collapsed-pill--skill"
                      onClick={() =>
                        setSelectedSkillNames((prev) =>
                          prev.filter((name) => name !== skill.name),
                        )
                      }
                      title={skill.description}
                    >
                      <span className="composer-collapsed-pill-kind" aria-hidden>
                        <Hammer size={10} />
                      </span>
                      <span>{skill.name}</span>
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                  {(contextCollapsed ? collapsedCommonsPreview : selectedCommons).map((item) => (
                    <button
                      key={`collapsed-commons-${item.name}`}
                      type="button"
                      className="composer-collapsed-pill composer-collapsed-pill--commons"
                      onClick={() =>
                        setSelectedCommonsNames((prev) =>
                          prev.filter((name) => name !== item.name),
                        )
                      }
                      title={item.description}
                    >
                      <span className="composer-collapsed-pill-kind" aria-hidden>
                        <Wrench size={10} />
                      </span>
                      <span>{item.name}</span>
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                  {contextCollapsed && collapsedKanbanPreview.length > 0 && (
                    <div
                      className="composer-kanban-strip composer-kanban-strip--compact"
                      role="tablist"
                      aria-label={t("kanban.composer.relatedPanels")}
                    >
                      {collapsedKanbanPreview.map((panel) => {
                        const isActive = selectedLinkedKanbanPanelId === panel.id;
                        return (
                          <div
                            key={`collapsed-panel-${panel.id}`}
                            className={`composer-kanban-strip-item${isActive ? " is-active" : ""}`}
                          >
                            <button
                              type="button"
                              className="composer-kanban-strip-main"
                              onClick={() => handleSelectLinkedPanel(panel.id)}
                            >
                              <span className="composer-kanban-strip-kind" aria-hidden>
                                <ClipboardList size={10} />
                              </span>
                              <span>{panel.name}</span>
                            </button>
                            <button
                              type="button"
                              className="composer-kanban-strip-link"
                              onClick={() => onOpenLinkedKanbanPanel?.(panel.id)}
                              aria-label={`${panel.name} ${t("kanban.composer.link")}`}
                            >
                              <ExternalLink size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {contextCollapsed && selectedLinkedPanel ? (
                    <div
                      className="composer-kanban-context-mode composer-kanban-context-mode--compact"
                      role="group"
                      aria-label={t("kanban.composer.contextModeLabel")}
                    >
                      <button
                        type="button"
                        className={`composer-kanban-context-mode-btn${
                          kanbanContextMode === "new" ? " is-active" : ""
                        }`}
                        onClick={() => onKanbanContextModeChange?.("new")}
                      >
                        {kanbanContextMode === "new" ? (
                          <span className="composer-kanban-context-mode-check" aria-hidden>
                            <Check size={10} />
                          </span>
                        ) : null}
                        {t("kanban.composer.contextModeNew")}
                      </button>
                      <button
                        type="button"
                        className={`composer-kanban-context-mode-btn${
                          kanbanContextMode === "inherit" ? " is-active" : ""
                        }`}
                        onClick={() => onKanbanContextModeChange?.("inherit")}
                      >
                        {kanbanContextMode === "inherit" ? (
                          <span className="composer-kanban-context-mode-check" aria-hidden>
                            <Check size={10} />
                          </span>
                        ) : null}
                        {t("kanban.composer.contextModeInherit")}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            <button
              ref={managementToggleRef}
              type="button"
              className="composer-management-toggle"
              onClick={() => setManualContextCollapsed((prev) => !prev)}
            >
              {contextCollapsed ? "▶" : "▼"} 管理面板
            </button>
          </div>

          {!contextCollapsed && (
            <div className="composer-management-body">
              <div className="composer-management-divider" />
              <div className="composer-kanban-toolbar">
                <span className="composer-kanban-strip-title">
                  {t("kanban.composer.relatedPanels")}
                </span>
                {linkedKanbanPanels.length > 0 ? (
                  <div className="composer-kanban-strip" role="tablist" aria-label={t("kanban.composer.relatedPanels")}>
                    {linkedKanbanPanels.map((panel) => {
                      const isActive = selectedLinkedKanbanPanelId === panel.id;
                      return (
                        <div
                          key={panel.id}
                          className={`composer-kanban-strip-item${isActive ? " is-active" : ""}`}
                        >
                          <button
                            type="button"
                            className="composer-kanban-strip-main"
                            onClick={() => handleSelectLinkedPanel(panel.id)}
                          >
                            <span className="composer-kanban-strip-kind" aria-hidden>
                              <ClipboardList size={10} />
                            </span>
                            <span>{panel.name}</span>
                          </button>
                          <button
                            type="button"
                            className="composer-kanban-strip-link"
                            onClick={() => onOpenLinkedKanbanPanel?.(panel.id)}
                            aria-label={`${panel.name} ${t("kanban.composer.link")}`}
                          >
                            <ExternalLink size={12} />
                          </button>
                        </div>
                      );
                    })}
                    {selectedLinkedPanel && (
                      <button
                        type="button"
                        className="composer-kanban-strip-clear"
                        onClick={() => handleSelectLinkedPanel(selectedLinkedPanel.id)}
                      >
                        {t("kanban.composer.clear")}
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="composer-kanban-strip-empty">{t("kanban.composer.empty")}</span>
                )}
                {selectedLinkedPanel ? (
                  <div className="composer-kanban-context-mode" role="group" aria-label={t("kanban.composer.contextModeLabel")}>
                    <span className="composer-kanban-context-mode-label">
                      {t("kanban.composer.contextModeLabel")}
                    </span>
                    <button
                      type="button"
                      className={`composer-kanban-context-mode-btn${
                        kanbanContextMode === "new" ? " is-active" : ""
                      }`}
                      onClick={() => onKanbanContextModeChange?.("new")}
                    >
                      {kanbanContextMode === "new" ? (
                        <span className="composer-kanban-context-mode-check" aria-hidden>
                          <Check size={10} />
                        </span>
                      ) : null}
                      {t("kanban.composer.contextModeNew")}
                    </button>
                    <button
                      type="button"
                      className={`composer-kanban-context-mode-btn${
                        kanbanContextMode === "inherit" ? " is-active" : ""
                      }`}
                      onClick={() => onKanbanContextModeChange?.("inherit")}
                    >
                      {kanbanContextMode === "inherit" ? (
                        <span className="composer-kanban-context-mode-check" aria-hidden>
                          <Check size={10} />
                        </span>
                      ) : null}
                      {t("kanban.composer.contextModeInherit")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <ComposerInput
          text={text}
          disabled={disabled}
          sendLabel={sendLabel}
          canStop={canStop}
          ghostTextSuffix={inlineCompletion.suffix}
          canSend={canSendEffective}
          isProcessing={isProcessing}
          onStop={onStop}
          onSend={handleSend}
          engineName={currentEngineName}
          dictationEnabled={dictationEnabled}
          dictationState={dictationState}
          dictationLevel={dictationLevel}
          onToggleDictation={onToggleDictation}
          onOpenDictationSettings={onOpenDictationSettings}
          dictationError={dictationError}
          onDismissDictationError={onDismissDictationError}
          dictationHint={dictationHint}
          onDismissDictationHint={onDismissDictationHint}
          attachments={attachedImages}
          onAddAttachment={onPickImages}
          onAttachImages={onAttachImages}
          onRemoveAttachment={onRemoveImage}
          onTextChange={handleTextChangeWithHistory}
          onSelectionChange={handleSelectionChange}
          onTextPaste={handleTextPaste}
          textareaHeight={textareaHeight}
          onHeightChange={onTextareaHeightChange}
          onCollapseRequest={handleCollapseComposer}
          onKeyDown={(event) => {
            if (isComposingEvent(event)) {
              return;
            }
            if (
              event.key === "Tab" &&
              selectedEngine === "opencode" &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey &&
              !suggestionsOpen &&
              !reviewPromptOpen
            ) {
              if (cycleOpenCodeAgent(event.shiftKey)) {
                event.preventDefault();
                return;
              }
            }
            if (
              event.key.toLowerCase() === "t" &&
              event.ctrlKey &&
              !event.metaKey &&
              !event.altKey &&
              selectedEngine === "opencode" &&
              !suggestionsOpen &&
              !reviewPromptOpen
            ) {
              if (cycleOpenCodeVariant(event.shiftKey)) {
                event.preventDefault();
                return;
              }
            }
            handleHistoryKeyDown(event);
            if (event.defaultPrevented) {
              return;
            }
            if (
              expandFenceOnSpace &&
              event.key === " " &&
              !event.shiftKey &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey
            ) {
              const textarea = textareaRef.current;
              if (!textarea) {
                return;
              }
              const start = textarea.selectionStart ?? text.length;
              const end = textarea.selectionEnd ?? start;
              if (tryExpandFence(start, end)) {
                event.preventDefault();
                return;
              }
            }
            if (event.key === "Enter" && event.shiftKey) {
              if (continueListOnShiftEnter && !suggestionsOpen) {
                const textarea = textareaRef.current;
                if (textarea) {
                  const start = textarea.selectionStart ?? text.length;
                  const end = textarea.selectionEnd ?? start;
                  if (start === end) {
                    const marker = getListContinuation(text, start);
                    if (marker) {
                      event.preventDefault();
                      const before = text.slice(0, start);
                      const after = text.slice(end);
                      const nextText = `${before}\n${marker}${after}`;
                      const nextCursor = before.length + 1 + marker.length;
                      applyTextInsertion(nextText, nextCursor);
                      return;
                    }
                  }
                }
              }
              event.preventDefault();
              const textarea = textareaRef.current;
              if (!textarea) {
                return;
              }
              const start = textarea.selectionStart ?? text.length;
              const end = textarea.selectionEnd ?? start;
              const nextText = `${text.slice(0, start)}\n${text.slice(end)}`;
              const nextCursor = start + 1;
              applyTextInsertion(nextText, nextCursor);
              return;
            }
            // Tab to accept inline history completion
            if (
              event.key === "Tab" &&
              !event.shiftKey &&
              inlineCompletion.hasSuggestion &&
              !suggestionsOpen
            ) {
              const fullText = inlineCompletion.applySuggestion();
              if (fullText) {
                event.preventDefault();
                setComposerText(fullText);
                requestAnimationFrame(() => {
                  const textarea = textareaRef.current;
                  if (textarea) {
                    textarea.setSelectionRange(fullText.length, fullText.length);
                    setSelectionStart(fullText.length);
                  }
                });
                return;
              }
            }
            if (
              event.key === "Tab" &&
              !event.shiftKey &&
              steerEnabled &&
              isProcessing &&
              !suggestionsOpen
            ) {
              event.preventDefault();
              handleQueue();
              return;
            }
            if (reviewPromptOpen && onReviewPromptKeyDown) {
              const handled = onReviewPromptKeyDown(event);
              if (handled) {
                return;
              }
            }
            handleInputKeyDown(event);
            if (event.defaultPrevented) {
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              if (expandFenceOnEnter) {
                const textarea = textareaRef.current;
                if (textarea) {
                  const start = textarea.selectionStart ?? text.length;
                  const end = textarea.selectionEnd ?? start;
                  if (tryExpandFence(start, end)) {
                    event.preventDefault();
                    return;
                  }
                }
              }
              if (isDictationBusy) {
                event.preventDefault();
                return;
              }
              event.preventDefault();
              handleSend();
            }
          }}
          textareaRef={textareaRef}
          suggestionsOpen={suggestionsOpen}
          suggestions={suggestions}
          highlightIndex={highlightIndex}
          onHighlightIndex={setHighlightIndex}
          onSelectSuggestion={applyAutocomplete}
          reviewPrompt={reviewPrompt}
          onReviewPromptClose={onReviewPromptClose}
          onReviewPromptShowPreset={onReviewPromptShowPreset}
          onReviewPromptChoosePreset={onReviewPromptChoosePreset}
          highlightedPresetIndex={highlightedPresetIndex}
          onReviewPromptHighlightPreset={onReviewPromptHighlightPreset}
          highlightedBranchIndex={highlightedBranchIndex}
          onReviewPromptHighlightBranch={onReviewPromptHighlightBranch}
          highlightedCommitIndex={highlightedCommitIndex}
          onReviewPromptHighlightCommit={onReviewPromptHighlightCommit}
          onReviewPromptSelectBranch={onReviewPromptSelectBranch}
          onReviewPromptSelectBranchAtIndex={onReviewPromptSelectBranchAtIndex}
          onReviewPromptConfirmBranch={onReviewPromptConfirmBranch}
          onReviewPromptSelectCommit={onReviewPromptSelectCommit}
          onReviewPromptSelectCommitAtIndex={onReviewPromptSelectCommitAtIndex}
          onReviewPromptConfirmCommit={onReviewPromptConfirmCommit}
          onReviewPromptUpdateCustomInstructions={onReviewPromptUpdateCustomInstructions}
          onReviewPromptConfirmCustom={onReviewPromptConfirmCustom}
          engines={engines}
          selectedEngine={selectedEngine}
          onSelectEngine={onSelectEngine}
          opencodeProviderTone={openCodeProviderTone}
          models={models}
          selectedModelId={selectedModelId}
          onSelectModel={onSelectModel}
          collaborationModes={collaborationModes}
          selectedCollaborationModeId={selectedCollaborationModeId}
          onSelectCollaborationMode={onSelectCollaborationMode}
          reasoningOptions={reasoningOptions}
          selectedEffort={selectedEffort}
          onSelectEffort={onSelectEffort}
          reasoningSupported={reasoningSupported}
          opencodeAgents={opencodeAgents}
          selectedOpenCodeAgent={selectedOpenCodeAgent}
          onSelectOpenCodeAgent={onSelectOpenCodeAgent}
          opencodeVariantOptions={opencodeVariantOptions}
          selectedOpenCodeVariant={selectedOpenCodeVariant}
          onSelectOpenCodeVariant={onSelectOpenCodeVariant}
          contextUsage={contextUsage}
          accessMode={accessMode}
          onSelectAccessMode={onSelectAccessMode}
          openCodeDock={
            <OpenCodeControlPanel
              embedded
              dock
              visible={showOpenCodeControlPanel}
              workspaceId={activeWorkspaceId}
              threadId={activeThreadId}
              selectedModel={selectedModel?.model ?? selectedModelId}
              selectedModelId={selectedModelId}
              modelOptions={models}
              onSelectModel={onSelectModel}
              selectedAgent={selectedOpenCodeAgent}
              agentOptions={opencodeAgents}
              onSelectAgent={onSelectOpenCodeAgent}
              selectedVariant={selectedOpenCodeVariant}
              variantOptions={opencodeVariantOptions}
              onSelectVariant={onSelectOpenCodeVariant}
              onProviderStatusToneChange={(tone) => {
                setOpenCodeProviderToneReady(true);
                setOpenCodeProviderTone(tone);
              }}
              onRunOpenCodeCommand={(command) => onSend(command, [])}
            />
          }
        />
          </>
        )}
      </div>
    </footer>
  );
}
