import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ComposerEditorSettings,
  ConversationItem,
  CustomCommandOption,
  CustomPromptOption,
  DictationTranscript,
  EngineType,
  MessageSendOptions,
  OpenCodeAgentOption,
  QueuedMessage,
  RateLimitSnapshot,
  ThreadTokenUsage,
  TurnPlan,
} from "../../../types";
import type {
  ReviewPromptState,
  ReviewPromptStep,
} from "../../threads/hooks/useReviewPrompt";
import type { EngineDisplayInfo } from "../../engine/hooks/useEngineController";
import { computeDictationInsertion } from "../../../utils/dictation";
// import {
//   getFenceTriggerLine,
//   getLineIndent,
//   isCodeLikeSingleLine,
//   isCursorInsideFence,
//   normalizePastedText,
// } from "../../../utils/composerText";
import { useComposerAutocompleteState } from "../hooks/useComposerAutocompleteState";
import { usePromptHistory } from "../hooks/usePromptHistory";
import { useInlineHistoryCompletion } from "../hooks/useInlineHistoryCompletion";
import { recordHistory as recordInputHistory } from "../hooks/useInputHistoryStore";
import { ChatInputBoxAdapter } from "./ChatInputBox/ChatInputBoxAdapter";
import type { ChatInputBoxHandle } from "./ChatInputBox/ChatInputBoxAdapter";
import { accessModeToPermissionMode, permissionModeToAccessMode } from "./ChatInputBox/types";
import type { PermissionMode } from "./ChatInputBox/types";
import type { SelectedAgent as ChatInputSelectedAgent } from "./ChatInputBox/types";
import { ComposerQueue } from "./ComposerQueue";
import { ComposerContextMenuPopover } from "./ComposerContextMenuPopover";
import { StatusPanel } from "../../status-panel/components/StatusPanel";
import { useStatusPanelData } from "../../status-panel/hooks/useStatusPanelData";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import CircleHelp from "lucide-react/dist/esm/icons/circle-help";
import Hammer from "lucide-react/dist/esm/icons/hammer";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import ClipboardList from "lucide-react/dist/esm/icons/clipboard-list";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import {
  assembleSinglePrompt,
  shouldAssemblePrompt,
} from "../utils/promptAssembler";
import {
  extractInlineSelections,
  mergeUniqueNames,
} from "../utils/inlineSelections";
import { pushErrorToast } from "../../../services/toasts";
import { getManualMemoryInjectionMode } from "../../project-memory/utils/manualInjectionMode";

type ComposerProps = {
  kanbanContextMode?: "new" | "inherit";
  onKanbanContextModeChange?: (mode: "new" | "inherit") => void;
  items?: ConversationItem[];
  onSend: (
    text: string,
    images: string[],
    options?: MessageSendOptions,
  ) => void | Promise<void>;
  onQueue: (
    text: string,
    images: string[],
    options?: MessageSendOptions,
  ) => void | Promise<void>;
  onStop: () => void;
  canStop: boolean;
  disabled?: boolean;
  isProcessing: boolean;
  steerEnabled: boolean;
  collaborationModes: { id: string; label: string }[];
  collaborationModesEnabled: boolean;
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
  selectedAgent?: ChatInputSelectedAgent | null;
  onAgentSelect?: (agent: ChatInputSelectedAgent | null) => void;
  onOpenAgentSettings?: () => void;
  opencodeVariantOptions?: string[];
  selectedOpenCodeVariant?: string | null;
  onSelectOpenCodeVariant?: (variant: string | null) => void;
  accessMode: "default" | "read-only" | "current" | "full-access";
  onSelectAccessMode: (mode: "default" | "read-only" | "current" | "full-access") => void;
  skills: { name: string; description?: string; source?: string }[];
  prompts: CustomPromptOption[];
  commands?: CustomCommandOption[];
  files: string[];
  directories?: string[];
  contextUsage?: ThreadTokenUsage | null;
  accountRateLimits?: RateLimitSnapshot | null;
  usageShowRemaining?: boolean;
  onRefreshAccountRateLimits?: () => Promise<void> | void;
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
  onOpenExperimentalSettings?: () => void;
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
  plan?: TurnPlan | null;
  isPlanMode?: boolean;
  onOpenDiffPath?: (path: string) => void;
  onRewind?: () => void;
};

type ManualMemorySelection = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  kind: string;
  importance: string;
  updatedAt: number;
  tags: string[];
};

type InlineFileReferenceSelection = {
  id: string;
  icon: "📁" | "📄";
  label: string;
  path: string;
};

// const DEFAULT_EDITOR_SETTINGS: ComposerEditorSettings = {
//   preset: "default",
//   expandFenceOnSpace: false,
//   expandFenceOnEnter: false,
//   fenceLanguageTags: false,
//   fenceWrapSelection: false,
//   autoWrapPasteMultiline: false,
//   autoWrapPasteCodeLike: false,
//   continueListOnShiftEnter: false,
// };

const EMPTY_ITEMS: ConversationItem[] = [];
const COMPOSER_MIN_HEIGHT = 20;
const COMPOSER_EXPAND_HEIGHT = 80;

type PrefixOption = {
  name: string;
  description?: string;
  source?: string;
};

type PrefixGroup = {
  prefix: string;
  options: PrefixOption[];
};

type SourceGroup = {
  source: string;
  label: string;
  groups: PrefixGroup[];
};

const CONTEXT_SOURCE_ORDER = [
  "workspace_managed",
  "project_claude",
  "project_codex",
  "global_claude",
  "global_codex",
  "global",
];

const CONTEXT_SOURCE_LABELS: Record<string, string> = {
  workspace_managed: "Managed Workspace",
  project_claude: "Project .claude",
  project_codex: "Project .codex",
  global_claude: "User .claude",
  global_codex: "User .codex",
  global: "User Global",
};

const MANUAL_MEMORY_USER_INPUT_REGEX =
  /(?:^|\n)\s*用户输入[:：]\s*([\s\S]*?)(?=\n+\s*(?:助手输出摘要|助手输出)[:：]|$)/;
const MANUAL_MEMORY_ASSISTANT_SUMMARY_REGEX =
  /(?:^|\n)\s*助手输出摘要[:：]\s*([\s\S]*?)(?=\n+\s*(?:助手输出|用户输入)[:：]|$)/;
const INLINE_FILE_REFERENCE_TOKEN_REGEX = /(📁|📄)\s+([^\n`📁📄]+?)\s+`([^`\n]+)`/gu;

function normalizeInlineFileReferenceTokens(text: string) {
  return text.replace(
    INLINE_FILE_REFERENCE_TOKEN_REGEX,
    (_full, _icon: string, _name: string, fullPath: string) => fullPath,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractInlineFileReferenceTokens(
  text: string,
  existingReferenceIds: Set<string> = new Set(),
) {
  const extracted: InlineFileReferenceSelection[] = [];
  const seenInBatch = new Set<string>();
  const cleanedText = text.replace(
    INLINE_FILE_REFERENCE_TOKEN_REGEX,
    (
      _full,
      iconRaw: string,
      nameRaw: string,
      fullPathRaw: string,
      offset: number,
      source: string,
    ) => {
      const icon = iconRaw === "📁" ? "📁" : "📄";
      const name = nameRaw.trim();
      const fullPath = fullPathRaw.trim();
      const id = `${icon}:${fullPath}`;
      const label = `${icon} ${name}`;
      const prefixText = source.slice(0, offset);
      const hasVisibleLabelBefore = new RegExp(
        `(?:^|\\s)${escapeRegExp(label)}(?:\\s|$)`,
      ).test(prefixText);
      const seenBefore = seenInBatch.has(id);
      if (seenBefore) {
        return "";
      }
      seenInBatch.add(id);
      const isExistingReference = existingReferenceIds.has(id);
      if (isExistingReference) {
        // Keep one visible label for already-tracked refs; only trim duplicates.
        return hasVisibleLabelBefore ? "" : label;
      }
      if (hasVisibleLabelBefore) {
        return "";
      }
      extracted.push({
        id,
        icon,
        label,
        path: fullPath,
      });
      return label;
    },
  );
  return {
    cleanedText: cleanedText
      .replace(/ {3,}/g, "  ")
      .replace(/[ \t]+\n/g, "\n"),
    extracted,
  };
}

function replaceVisibleFileReferenceLabels(
  text: string,
  refs: InlineFileReferenceSelection[],
) {
  let nextText = text;
  for (const ref of refs) {
    const pattern = new RegExp(escapeRegExp(ref.label), "g");
    if (!pattern.test(nextText)) {
      continue;
    }
    nextText = nextText.replace(pattern, ref.path);
  }
  return nextText;
}

function resolveManualMemoryChipTitle(memory: ManualMemorySelection) {
  const detail = memory.detail.trim();
  if (detail) {
    const matched = detail.match(MANUAL_MEMORY_USER_INPUT_REGEX);
    if (matched?.[1]) {
      const normalized = matched[1].replace(/\s+/g, " ").trim();
      if (normalized) {
        return normalized;
      }
    }
    const firstLine = detail
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (firstLine) {
      return firstLine;
    }
  }
  const fallbackSummary = memory.summary.trim();
  if (fallbackSummary) {
    return fallbackSummary;
  }
  return "（未提取到用户输入）";
}

function resolveManualMemoryChipDetail(memory: ManualMemorySelection) {
  const detail = memory.detail.trim();
  if (detail) {
    const matched = detail.match(MANUAL_MEMORY_ASSISTANT_SUMMARY_REGEX);
    if (matched?.[1]) {
      const normalized = matched[1].replace(/\s+/g, " ").trim();
      if (normalized) {
        return normalized;
      }
    }
  }
  const fallbackSummary = memory.summary.trim();
  if (fallbackSummary) {
    return fallbackSummary;
  }
  return "";
}

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

function normalizeOptionSource(source: string | undefined) {
  const normalized = source?.trim().toLowerCase();
  if (!normalized) {
    return "global";
  }
  return normalized;
}

function groupOptionsBySourceAndPrefix(options: PrefixOption[]): SourceGroup[] {
  const grouped = new Map<string, PrefixOption[]>();
  for (const option of options) {
    const source = normalizeOptionSource(option.source);
    const bucket = grouped.get(source) ?? [];
    bucket.push(option);
    grouped.set(source, bucket);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => {
      const leftIndex = CONTEXT_SOURCE_ORDER.indexOf(a[0]);
      const rightIndex = CONTEXT_SOURCE_ORDER.indexOf(b[0]);
      const safeLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const safeRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      if (safeLeft !== safeRight) {
        return safeLeft - safeRight;
      }
      return a[0].localeCompare(b[0]);
    })
    .map(([source, list]) => ({
      source,
      label: CONTEXT_SOURCE_LABELS[source] ?? source,
      groups: groupOptionsByPrefix(list),
    }));
}

function splitGroupsForColumns(groups: SourceGroup[]): [SourceGroup[], SourceGroup[]] {
  const left: SourceGroup[] = [];
  const right: SourceGroup[] = [];
  let leftWeight = 0;
  let rightWeight = 0;
  for (const sourceGroup of groups) {
    const groupWeight =
      sourceGroup.groups.reduce((sum, group) => sum + group.options.length + 1, 0) + 1;
    if (leftWeight <= rightWeight) {
      left.push(sourceGroup);
      leftWeight += groupWeight;
    } else {
      right.push(sourceGroup);
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
  onQueue: _onQueue,
  onStop,
  canStop,
  disabled = false,
  isProcessing,
  steerEnabled: _steerEnabled,
  collaborationModes: _collaborationModes,
  collaborationModesEnabled: _collaborationModesEnabled,
  selectedCollaborationModeId: _selectedCollaborationModeId,
  onSelectCollaborationMode: _onSelectCollaborationMode,
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
  selectedAgent = null,
  onAgentSelect,
  onOpenAgentSettings,
  opencodeVariantOptions: _opencodeVariantOptions = [],
  selectedOpenCodeVariant: _selectedOpenCodeVariant = null,
  onSelectOpenCodeVariant: _onSelectOpenCodeVariant,
  accessMode,
  onSelectAccessMode,
  skills,
  prompts,
  commands = [],
  files,
  directories = [],
  contextUsage = null,
  accountRateLimits: _accountRateLimits = null,
  usageShowRemaining: _usageShowRemaining = false,
  onRefreshAccountRateLimits: _onRefreshAccountRateLimits,
  queuedMessages = [],
  onEditQueued,
  onDeleteQueued,
  sendLabel: _sendLabel = "Send",
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
  editorSettings: _editorSettingsProp,
  textareaHeight = 80,
  onTextareaHeightChange,
  dictationEnabled: _dictationEnabled = false,
  dictationState: _dictationState = "idle",
  dictationLevel: _dictationLevel = 0,
  onToggleDictation: _onToggleDictation,
  onOpenDictationSettings: _onOpenDictationSettings,
  onOpenExperimentalSettings: _onOpenExperimentalSettings,
  dictationTranscript = null,
  onDictationTranscriptHandled,
  dictationError: _dictationError = null,
  onDismissDictationError: _onDismissDictationError,
  dictationHint: _dictationHint = null,
  onDismissDictationHint: _onDismissDictationHint,
  reviewPrompt,
  onReviewPromptClose: _onReviewPromptClose,
  onReviewPromptShowPreset: _onReviewPromptShowPreset,
  onReviewPromptChoosePreset: _onReviewPromptChoosePreset,
  highlightedPresetIndex: _highlightedPresetIndex,
  onReviewPromptHighlightPreset: _onReviewPromptHighlightPreset,
  highlightedBranchIndex: _highlightedBranchIndex,
  onReviewPromptHighlightBranch: _onReviewPromptHighlightBranch,
  highlightedCommitIndex: _highlightedCommitIndex,
  onReviewPromptHighlightCommit: _onReviewPromptHighlightCommit,
  onReviewPromptKeyDown: _onReviewPromptKeyDown,
  onReviewPromptSelectBranch: _onReviewPromptSelectBranch,
  onReviewPromptSelectBranchAtIndex: _onReviewPromptSelectBranchAtIndex,
  onReviewPromptConfirmBranch: _onReviewPromptConfirmBranch,
  onReviewPromptSelectCommit: _onReviewPromptSelectCommit,
  onReviewPromptSelectCommitAtIndex: _onReviewPromptSelectCommitAtIndex,
  onReviewPromptConfirmCommit: _onReviewPromptConfirmCommit,
  onReviewPromptUpdateCustomInstructions: _onReviewPromptUpdateCustomInstructions,
  onReviewPromptConfirmCustom: _onReviewPromptConfirmCustom,
  linkedKanbanPanels = [],
  selectedLinkedKanbanPanelId = null,
  onSelectLinkedKanbanPanel,
  onOpenLinkedKanbanPanel,
  activeFilePath = null,
  activeFileLineRange = null,
  fileReferenceMode = "path",
  activeWorkspaceId = null,
  activeThreadId = null,
  plan = null,
  isPlanMode = false,
  onOpenDiffPath,
  onRewind,
}: ComposerProps) {
  const { t } = useTranslation();
  const isCodexEngine = selectedEngine === "codex";
  const { todoTotal, subagentTotal, fileChanges, commandTotal } = useStatusPanelData(
    items,
    { isCodexEngine },
  );
  const hasStatusPanelActivity = useMemo(() => {
    const hasLegacyActivity =
      todoTotal > 0 ||
      subagentTotal > 0 ||
      fileChanges.length > 0 ||
      isPlanMode ||
      Boolean(plan);
    if (isCodexEngine) {
      return hasLegacyActivity || commandTotal > 0;
    }
    return hasLegacyActivity;
  }, [
    commandTotal,
    fileChanges.length,
    isCodexEngine,
    isPlanMode,
    plan,
    subagentTotal,
    todoTotal,
  ]);
  const [text, setText] = useState(draftText);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectedSkillNames, setSelectedSkillNames] = useState<string[]>([]);
  const [selectedCommonsNames, setSelectedCommonsNames] = useState<string[]>([]);
  const [selectedManualMemories, setSelectedManualMemories] = useState<
    ManualMemorySelection[]
  >([]);
  const [selectedInlineFileReferences, setSelectedInlineFileReferences] = useState<
    InlineFileReferenceSelection[]
  >([]);
  const [isComposerCollapsed, setIsComposerCollapsed] = useState(false);
  const [statusPanelExpanded, setStatusPanelExpanded] = useState(
    hasStatusPanelActivity,
  );
  const previousStatusPanelActivityRef = useRef(hasStatusPanelActivity);
  const [dismissedActiveFileReference, setDismissedActiveFileReference] = useState<
    string | null
  >(null);
  const [openCodeProviderTone, _setOpenCodeProviderTone] = useState<
    "is-ok" | "is-runtime" | "is-fail"
  >("is-fail");
  const [openCodeProviderToneReady, _setOpenCodeProviderToneReady] = useState(false);
  // const [_openCodePanelOpenRequestNonce, _setOpenCodePanelOpenRequestNonce] = useState(0);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [commonsMenuOpen, setCommonsMenuOpen] = useState(false);
  const [skillSearchQuery, setSkillSearchQuery] = useState("");
  const [commonsSearchQuery, setCommonsSearchQuery] = useState("");
  const helpMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const skillMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const commonsMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const kanbanPopoverAnchorRef = useRef<HTMLButtonElement | null>(null);
  const pillsContainerRef = useRef<HTMLDivElement | null>(null);
  const [kanbanPopoverOpen, setKanbanPopoverOpen] = useState(false);
  const [visiblePillCount, setVisiblePillCount] = useState<number>(Infinity);
  const lastExpandedHeightRef = useRef(
    Math.max(textareaHeight, COMPOSER_EXPAND_HEIGHT),
  );
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = externalTextareaRef ?? internalRef;
  const chatInputRef = useRef<ChatInputBoxHandle>(null);
  // const editorSettings = editorSettingsProp ?? DEFAULT_EDITOR_SETTINGS;
  // const _isDictationBusy = dictationState !== "idle";
  const activeFileReferenceSignature =
    activeFilePath
      ? activeFileLineRange
        ? `${activeFilePath}:${activeFileLineRange.startLine}-${activeFileLineRange.endLine}`
        : `${activeFilePath}:all`
      : null;
  const hasActiveFileReference = Boolean(
    activeFileReferenceSignature &&
      fileReferenceMode === "path" &&
      dismissedActiveFileReference !== activeFileReferenceSignature,
  );
  // const {
  //   expandFenceOnSpace,
  //   expandFenceOnEnter,
  //   fenceLanguageTags,
  //   fenceWrapSelection,
  //   autoWrapPasteMultiline,
  //   autoWrapPasteCodeLike,
  //   continueListOnShiftEnter,
  // } = editorSettings;

  // Get current engine display name
  // const _currentEngineName = engines?.find((e) => e.type === selectedEngine)?.shortName;
  // const _selectedModel = useMemo(
  //   () => models.find((entry) => entry.id === selectedModelId) ?? null,
  //   [models, selectedModelId],
  // );
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

  useEffect(() => {
    if (!dismissedActiveFileReference) {
      return;
    }
    if (!activeFileReferenceSignature || activeFileReferenceSignature !== dismissedActiveFileReference) {
      setDismissedActiveFileReference(null);
    }
  }, [activeFileReferenceSignature, dismissedActiveFileReference]);

  const activeFileLinesLabel = useMemo(() => {
    if (!activeFileLineRange) {
      return undefined;
    }
    if (activeFileLineRange.startLine === activeFileLineRange.endLine) {
      return `L${activeFileLineRange.startLine}`;
    }
    return `L${activeFileLineRange.startLine}-${activeFileLineRange.endLine}`;
  }, [activeFileLineRange]);

  const selectedChatInputAgent = useMemo<ChatInputSelectedAgent | null>(() => {
    if (selectedEngine === "opencode") {
      if (!selectedOpenCodeAgent) {
        return null;
      }
      const matchedAgent = opencodeAgents.find(
        (agent) => agent.id === selectedOpenCodeAgent,
      );
      return {
        id: selectedOpenCodeAgent,
        name: selectedOpenCodeAgent,
        prompt: matchedAgent?.description,
      };
    }
    return selectedAgent;
  }, [opencodeAgents, selectedAgent, selectedEngine, selectedOpenCodeAgent]);
  // const openCodeAgentCycleValues = useMemo(() => {
  //   const primary = opencodeAgents
  //     .filter((agent) => agent.isPrimary)
  //     .map((agent) => agent.id)
  //     .filter((id) => id.trim().length > 0);
  //   const dedupedPrimary = Array.from(new Set(primary));
  //   if (dedupedPrimary.length > 0) {
  //     return dedupedPrimary;
  //   }
  //   const fallback = opencodeAgents
  //     .map((agent) => agent.id)
  //     .filter((id) => id.trim().length > 0);
  //   return Array.from(new Set(fallback));
  // }, [opencodeAgents]);
  // const _cycleOpenCodeAgent = useCallback(
  //   (reverse = false) => {
  //     if (selectedEngine !== "opencode" || !onSelectOpenCodeAgent) {
  //       return false;
  //     }
  //     const values = openCodeAgentCycleValues;
  //     if (values.length === 0) {
  //       return false;
  //     }
  //     const current = selectedOpenCodeAgent ?? "";
  //     const currentIndex = values.indexOf(current);
  //     const nextIndex =
  //       currentIndex === -1
  //         ? reverse
  //           ? values.length - 1
  //           : 0
  //         : (currentIndex + (reverse ? -1 : 1) + values.length) % values.length;
  //     const nextValue = values[nextIndex] ?? "";
  //     onSelectOpenCodeAgent(nextValue || null);
  //     return true;
  //   },
  //   [
  //     onSelectOpenCodeAgent,
  //     openCodeAgentCycleValues,
  //     selectedEngine,
  //     selectedOpenCodeAgent,
  //   ],
  // );
  // const openCodeVariantCycleValues = useMemo(() => {
  //   const deduped = Array.from(
  //     new Set(opencodeVariantOptions.map((variant) => variant.trim()).filter(Boolean)),
  //   );
  //   return ["", ...deduped];
  // }, [opencodeVariantOptions]);
  // const _cycleOpenCodeVariant = useCallback(
  //   (reverse = false) => {
  //     if (selectedEngine !== "opencode" || !onSelectOpenCodeVariant) {
  //       return false;
  //     }
  //     const values = openCodeVariantCycleValues;
  //     if (values.length <= 1) {
  //       return false;
  //     }
  //     const current = selectedOpenCodeVariant ?? "";
  //     const currentIndex = values.indexOf(current);
  //     const nextIndex =
  //       currentIndex === -1
  //         ? reverse
  //           ? values.length - 1
  //           : 0
  //         : (currentIndex + (reverse ? -1 : 1) + values.length) % values.length;
  //     const nextValue = values[nextIndex] ?? "";
  //     onSelectOpenCodeVariant(nextValue || null);
  //     return true;
  //   },
  //   [
  //     onSelectOpenCodeVariant,
  //     openCodeVariantCycleValues,
  //     selectedEngine,
  //     selectedOpenCodeVariant,
  //   ],
  // );
  // const canSend =
  //   text.trim().length > 0 ||
  //   attachedImages.length > 0 ||
  //   Boolean(selectedOpenCodeDirectCommand);
  const opencodeDisconnected =
    selectedEngine === "opencode" && openCodeProviderToneReady && openCodeProviderTone === "is-fail";
  // const _canSendEffective = canSend && !opencodeDisconnected;
  // const _showOpenCodeControlPanel = selectedEngine === "opencode";
  // const _requestOpenOpenCodePanel = useCallback(() => {
  //   setOpenCodePanelOpenRequestNonce((prev) => prev + 1);
  // }, []);
  const availableSkills = skills.filter((skill) => !selectedSkillNames.includes(skill.name));
  const availableCommons = commands.filter((item) => !selectedCommonsNames.includes(item.name));
  const skillOptions = availableSkills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    source: skill.source,
  }));
  const commonsOptions = availableCommons.map((item) => ({
    name: item.name,
    description: item.description,
    source: item.source,
  }));
  const filteredSkillOptions = filterOptionsByQuery(skillOptions, skillSearchQuery);
  const filteredCommonsOptions = filterOptionsByQuery(commonsOptions, commonsSearchQuery);
  const groupedSkillOptions = groupOptionsBySourceAndPrefix(filteredSkillOptions);
  const groupedCommonsOptions = groupOptionsBySourceAndPrefix(filteredCommonsOptions);
  const [skillLeftColumn, skillRightColumn] = splitGroupsForColumns(groupedSkillOptions);
  const [commonsLeftColumn, commonsRightColumn] = splitGroupsForColumns(groupedCommonsOptions);

  const allPills = useMemo(() => [
    ...selectedSkills.map(s => ({ type: 'skill' as const, ...s })),
    ...selectedCommons.map(c => ({ type: 'commons' as const, ...c })),
  ], [selectedSkills, selectedCommons]);

  useEffect(() => {
    const container = pillsContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      const children = Array.from(container.children) as HTMLElement[];
      const containerRight = container.getBoundingClientRect().right;
      let lastVisible = children.length;

      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.classList.contains('composer-toolbar-overflow')) continue;
        if (child.getBoundingClientRect().right > containerRight - 40) {
          lastVisible = i;
          break;
        }
      }
      setVisiblePillCount(lastVisible);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [allPills.length]);

  const visiblePills = allPills.slice(0, visiblePillCount);
  const overflowCount = Math.max(0, allPills.length - visiblePillCount);


  useEffect(() => {
    if (textareaHeight > COMPOSER_MIN_HEIGHT) {
      lastExpandedHeightRef.current = textareaHeight;
    }
  }, [textareaHeight]);

  useEffect(() => {
    const hadActivity = previousStatusPanelActivityRef.current;
    if (!hasStatusPanelActivity) {
      setStatusPanelExpanded(false);
    } else if (!hadActivity) {
      setStatusPanelExpanded(true);
    }
    previousStatusPanelActivityRef.current = hasStatusPanelActivity;
  }, [hasStatusPanelActivity]);

  useEffect(() => {
    setSelectedManualMemories([]);
    setSelectedInlineFileReferences([]);
  }, [activeThreadId, activeWorkspaceId]);

  // const _handleCollapseComposer = useCallback(() => {
  //   setIsComposerCollapsed(true);
  // }, []);

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

  const setComposerText = useCallback(
    (next: string) => {
      setText(next);
      onDraftChange?.(next);
    },
    [onDraftChange],
  );

  useEffect(() => {
    const existingReferenceIds = new Set(
      selectedInlineFileReferences
        .filter((entry) => text.includes(entry.label))
        .map((entry) => entry.id),
    );
    const { cleanedText, extracted } = extractInlineFileReferenceTokens(
      text,
      existingReferenceIds,
    );
    if (extracted.length > 0) {
      setSelectedInlineFileReferences((prev) => {
        const next = [...prev];
        for (const ref of extracted) {
          if (next.some((entry) => entry.id === ref.id)) {
            continue;
          }
          next.push(ref);
        }
        return next;
      });
    }
    if (cleanedText !== text) {
      setComposerText(cleanedText);
      return;
    }
    const {
      cleanedText: cleanedSelectionText,
      matchedSkillNames,
      matchedCommonsNames,
    } =
      extractInlineSelections(text, skills, commands);
    if (matchedSkillNames.length > 0) {
      setSelectedSkillNames((prev) => mergeUniqueNames(prev, matchedSkillNames));
    }
    if (matchedCommonsNames.length > 0) {
      setSelectedCommonsNames((prev) => mergeUniqueNames(prev, matchedCommonsNames));
    }
    if (cleanedSelectionText !== text) {
      setComposerText(cleanedSelectionText);
    }
  }, [commands, selectedInlineFileReferences, setComposerText, skills, text]);

  const handleSelectManualMemory = useCallback((memory: ManualMemorySelection) => {
    setSelectedManualMemories((prev) => {
      if (prev.some((entry) => entry.id === memory.id)) {
        return prev.filter((entry) => entry.id !== memory.id);
      }
      return [...prev, memory];
    });
  }, []);

  const {
    isAutocompleteOpen,
    activeAutocompleteTrigger: _activeAutocompleteTrigger,
    autocompleteMatches: _autocompleteMatches,
    highlightIndex: _highlightIndex,
    setHighlightIndex: _setHighlightIndex,
    applyAutocomplete: _applyAutocomplete,
    handleInputKeyDown: _handleInputKeyDown,
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
    workspaceId: activeWorkspaceId,
    onManualMemorySelect: handleSelectManualMemory,
    textareaRef,
    setText: setComposerText,
    setSelectionStart,
  });
  const reviewPromptOpen = Boolean(reviewPrompt);
  const suggestionsOpen = reviewPromptOpen || isAutocompleteOpen;
  // const _suggestions = reviewPromptOpen ? [] : autocompleteMatches;

  const {
    handleHistoryKeyDown: _handleHistoryKeyDown,
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
      if (!(hasActiveFileReference && fileReferenceMode === "path" && activeFilePath)) {
        return message;
      }
      const referenceTarget = activeFileLineRange
        ? `${activeFilePath}#L${activeFileLineRange.startLine}-L${activeFileLineRange.endLine}`
        : activeFilePath;
      if (message.includes(referenceTarget) || message.includes(activeFilePath)) {
        return message;
      }
      return `@file \`${referenceTarget}\`\n${message}`.trim();
    },
    [activeFileLineRange, activeFilePath, fileReferenceMode, hasActiveFileReference],
  );

  const handleClearContext = useCallback(() => {
    if (activeFileReferenceSignature) {
      setDismissedActiveFileReference(activeFileReferenceSignature);
    }
  }, [activeFileReferenceSignature]);

  const handleAgentSelect = useCallback(
    (agent: ChatInputSelectedAgent | null) => {
      if (selectedEngine === "opencode") {
        onSelectOpenCodeAgent?.(agent?.id ?? null);
        return;
      }
      onAgentSelect?.(agent);
    },
    [onAgentSelect, onSelectOpenCodeAgent, selectedEngine],
  );

  const handleModeSelect = useCallback(
    (mode: PermissionMode) => {
      onSelectAccessMode(permissionModeToAccessMode(mode));
    },
    [onSelectAccessMode],
  );

  const handleToggleStatusPanel = useCallback(() => {
    setStatusPanelExpanded((prev) => !prev);
  }, []);

  const handleRewind = useCallback(() => {
    if (onRewind) {
      onRewind();
      return;
    }
    pushErrorToast({
      title: t("rewind.title"),
      message: t("rewind.notAvailable"),
    });
  }, [onRewind, t]);

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
      setSelectedManualMemories([]);
      setSelectedInlineFileReferences([]);
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
    const resolvedFinalText = replaceVisibleFileReferenceLabels(
      normalizeInlineFileReferenceTokens(finalTextWithReference),
      selectedInlineFileReferences,
    );
    const selectedMemoryIds = selectedManualMemories.map((entry) => entry.id);
    const selectedMemoryInjectionMode = getManualMemoryInjectionMode();
    const sendOptions =
      selectedMemoryIds.length > 0
        ? { selectedMemoryIds, selectedMemoryInjectionMode }
        : undefined;
    const sendResult = onSend(resolvedFinalText, attachedImages, sendOptions);
    void Promise.resolve(sendResult).finally(() => {
      setSelectedManualMemories([]);
      setSelectedInlineFileReferences([]);
    });
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
    selectedInlineFileReferences,
    selectedManualMemories,
    onSend,
    inlineCompletion,
    recordHistory,
    resetHistoryNavigation,
    setComposerText,
    setSelectedManualMemories,
    text,
  ]);

  // const _handleQueue = useCallback(() => {
  //   if (disabled) {
  //     return;
  //   }
  //   if (opencodeDisconnected) {
  //     pushErrorToast({
  //       title: "OpenCode 未连接",
  //       message: "当前连接状态为红色，请先在 OpenCode 管理面板完成连接后再发送。",
  //     });
  //     return;
  //   }
  //   const trimmed = text.trim();
  //   if (!trimmed && attachedImages.length === 0 && !selectedOpenCodeDirectCommand) {
  //     return;
  //   }
  //   if (selectedOpenCodeDirectCommand) {
  //     onQueue(`/${selectedOpenCodeDirectCommand}`, []);
  //     setSelectedCommonsNames((prev) =>
  //       prev.filter(
  //         (name) => normalizeCommandChipName(name) !== selectedOpenCodeDirectCommand,
  //       ),
  //     );
  //     setSelectedManualMemories([]);
  //     setSelectedInlineFileReferences([]);
  //     inlineCompletion.clear();
  //     resetHistoryNavigation();
  //     setComposerText("");
  //     return;
  //   }
  //   if (trimmed) {
  //     recordHistory(trimmed);
  //   }
  //   const finalText = shouldAssemblePrompt({
  //     userInput: trimmed,
  //     selectedSkillCount: selectedSkills.length,
  //     selectedCommonsCount: selectedCommons.length,
  //   })
  //     ? assembleSinglePrompt({
  //         userInput: trimmed,
  //         skills: selectedSkills,
  //         commons: selectedCommons.map((item) => ({ name: item.name })),
  //       })
  //     : trimmed;
  //   const finalTextWithReference = applyActiveFileReference(finalText);
  //   const resolvedFinalText = replaceVisibleFileReferenceLabels(
  //     normalizeInlineFileReferenceTokens(finalTextWithReference),
  //     selectedInlineFileReferences,
  //   );
  //   const selectedMemoryIds = selectedManualMemories.map((entry) => entry.id);
  //   const selectedMemoryInjectionMode = getManualMemoryInjectionMode();
  //   const queueOptions =
  //     selectedMemoryIds.length > 0
  //       ? { selectedMemoryIds, selectedMemoryInjectionMode }
  //       : undefined;
  //   const queueResult = onQueue(resolvedFinalText, attachedImages, queueOptions);
  //   void Promise.resolve(queueResult).finally(() => {
  //     setSelectedManualMemories([]);
  //     setSelectedInlineFileReferences([]);
  //   });
  //   inlineCompletion.clear();
  //   resetHistoryNavigation();
  //   setComposerText("");
  // }, [
  //   attachedImages,
  //   disabled,
  //   applyActiveFileReference,
  //   opencodeDisconnected,
  //   selectedOpenCodeDirectCommand,
  //   selectedCommons,
  //   selectedSkills,
  //   selectedInlineFileReferences,
  //   selectedManualMemories,
  //   onQueue,
  //   inlineCompletion,
  //   recordHistory,
  //   resetHistoryNavigation,
  //   setComposerText,
  //   setSelectedManualMemories,
  //   text,
  // ]);

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

  const handleRemoveManualMemory = useCallback((memoryId: string) => {
    setSelectedManualMemories((prev) =>
      prev.filter((entry) => entry.id !== memoryId),
    );
  }, []);

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
      leftColumn: SourceGroup[],
      rightColumn: SourceGroup[],
      onPick: (name: string) => void,
      emptyLabel: string,
      keyPrefix: string,
    ) => {
      const renderColumn = (sourceGroups: SourceGroup[], columnKey: "left" | "right") => (
        <div className="composer-context-menu-column" key={`${keyPrefix}-${columnKey}`}>
          {sourceGroups.map((sourceGroup) => (
            <section
              key={`${keyPrefix}-${columnKey}-${sourceGroup.source}`}
              className="composer-context-menu-source-group"
            >
              <header className="composer-context-menu-source-title">{sourceGroup.label}</header>
              {sourceGroup.groups.map((group) => (
                <section
                  key={`${keyPrefix}-${columnKey}-${sourceGroup.source}-${group.prefix}`}
                  className="composer-context-menu-group"
                >
                  <header className="composer-context-menu-group-title">{group.prefix}</header>
                  <div className="composer-context-menu-group-items">
                    {group.options.map((option) => (
                      <button
                        key={`${keyPrefix}-${columnKey}-${sourceGroup.source}-${group.prefix}-${option.name}`}
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

  // const applyTextInsertion = useCallback(
  //   (nextText: string, nextCursor: number) => {
  //     setComposerText(nextText);
  //     requestAnimationFrame(() => {
  //       const textarea = textareaRef.current;
  //       if (!textarea) {
  //         return;
  //       }
  //       textarea.focus();
  //       textarea.setSelectionRange(nextCursor, nextCursor);
  //       handleSelectionChange(nextCursor);
  //     });
  //   },
  //   [handleSelectionChange, setComposerText, textareaRef],
  // );

  // const _handleTextPaste = useCallback(
  //   (event: ClipboardEvent<HTMLTextAreaElement>) => {
  //     if (disabled) {
  //       return;
  //     }
  //     if (!autoWrapPasteMultiline && !autoWrapPasteCodeLike) {
  //       return;
  //     }
  //     const pasted = event.clipboardData?.getData("text/plain") ?? "";
  //     if (!pasted) {
  //       return;
  //     }
  //     const textarea = textareaRef.current;
  //     if (!textarea) {
  //       return;
  //     }
  //     const start = textarea.selectionStart ?? text.length;
  //     const end = textarea.selectionEnd ?? start;
  //     if (isCursorInsideFence(text, start)) {
  //       return;
  //     }
  //     const normalized = normalizePastedText(pasted);
  //     if (!normalized) {
  //       return;
  //     }
  //     const isMultiline = normalized.includes("\n");
  //     if (isMultiline && !autoWrapPasteMultiline) {
  //       return;
  //     }
  //     if (
  //       !isMultiline &&
  //       !(autoWrapPasteCodeLike && isCodeLikeSingleLine(normalized))
  //     ) {
  //       return;
  //     }
  //     event.preventDefault();
  //     const indent = getLineIndent(text, start);
  //     const content = indent
  //       ? normalized
  //           .split("\n")
  //           .map((line) => `${indent}${line}`)
  //           .join("\n")
  //       : normalized;
  //     const before = text.slice(0, start);
  //     const after = text.slice(end);
  //     const block = `${indent}\`\`\`\n${content}\n${indent}\`\`\``;
  //     const nextText = `${before}${block}${after}`;
  //     const nextCursor = before.length + block.length;
  //     applyTextInsertion(nextText, nextCursor);
  //   },
  //   [
  //     applyTextInsertion,
  //     autoWrapPasteCodeLike,
  //     autoWrapPasteMultiline,
  //     disabled,
  //     text,
  //     textareaRef,
  //   ],
  // );

  // const _tryExpandFence = useCallback(
  //   (start: number, end: number) => {
  //     if (start !== end && !fenceWrapSelection) {
  //       return false;
  //     }
  //     const fence = getFenceTriggerLine(text, start, fenceLanguageTags);
  //     if (!fence) {
  //       return false;
  //     }
  //     const before = text.slice(0, fence.lineStart);
  //     const after = text.slice(fence.lineEnd);
  //     const openFence = `${fence.indent}\`\`\`${fence.tag}`;
  //     const closeFence = `${fence.indent}\`\`\``;
  //     if (fenceWrapSelection && start !== end) {
  //       const selection = normalizePastedText(text.slice(start, end));
  //       const content = fence.indent
  //         ? selection
  //             .split("\n")
  //             .map((line) => `${fence.indent}${line}`)
  //             .join("\n")
  //         : selection;
  //       const block = `${openFence}\n${content}\n${closeFence}`;
  //       const nextText = `${before}${block}${after}`;
  //       const nextCursor = before.length + block.length;
  //       applyTextInsertion(nextText, nextCursor);
  //       return true;
  //     }
  //     const block = `${openFence}\n${fence.indent}\n${closeFence}`;
  //     const nextText = `${before}${block}${after}`;
  //     const nextCursor =
  //       before.length + openFence.length + 1 + fence.indent.length;
  //     applyTextInsertion(nextText, nextCursor);
  //     return true;
  //   },
  //   [applyTextInsertion, fenceLanguageTags, fenceWrapSelection, text],
  // );

  return (
    <footer className={`composer${disabled ? " is-disabled" : ""}`}>
      <StatusPanel
        items={items}
        isProcessing={isProcessing}
        expanded={statusPanelExpanded}
        plan={plan}
        isPlanMode={isPlanMode}
        isCodexEngine={isCodexEngine}
        onOpenDiffPath={onOpenDiffPath}
      />
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
            {false && (<div
          className="composer-management-toolbar"
            >
          <div className="composer-toolbar-left" data-pill-count={allPills.length > 0 ? `+${allPills.length}` : undefined}>
            <div className="composer-context-actions">
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
            {allPills.length > 0 && (
                <div ref={pillsContainerRef} className="composer-toolbar-pills">
                  {visiblePills.map((pill) => (
                    <button
                      key={pill.type === 'skill' ? `collapsed-skill-${pill.name}` : `collapsed-commons-${pill.name}`}
                      type="button"
                      className={`composer-collapsed-pill composer-collapsed-pill--${pill.type}`}
                      onClick={() =>
                        pill.type === 'skill'
                          ? setSelectedSkillNames((prev) => prev.filter((name) => name !== pill.name))
                          : setSelectedCommonsNames((prev) => prev.filter((name) => name !== pill.name))
                      }
                      title={pill.description}
                    >
                      <span className="composer-collapsed-pill-kind" aria-hidden>
                        {pill.type === 'skill' ? <Hammer size={10} /> : <Wrench size={10} />}
                      </span>
                      <span>{pill.name}</span>
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                  {overflowCount > 0 && (
                    <span className="composer-toolbar-overflow">+{overflowCount}</span>
                  )}
                </div>
              )}
          </div>

          {linkedKanbanPanels.length > 0 && (
            <div className="composer-toolbar-right">
              <button
                ref={kanbanPopoverAnchorRef}
                type="button"
                className={`composer-kanban-trigger${selectedLinkedPanel ? " is-active" : ""}`}
                onClick={() => setKanbanPopoverOpen(prev => !prev)}
              >
                <span className="composer-kanban-trigger-icon" aria-hidden>
                  <ClipboardList size={10} />
                </span>
                <span>{selectedLinkedPanel?.name ?? linkedKanbanPanels[0].name}</span>
                <ChevronDown size={10} />
              </button>
              {selectedLinkedPanel && (
                <button
                  type="button"
                  className="composer-kanban-trigger-link"
                  aria-label={t("kanban.composer.openPanel")}
                  onClick={() => {
                    if (selectedLinkedPanel) onOpenLinkedKanbanPanel?.(selectedLinkedPanel.id);
                  }}
                >
                  <ExternalLink size={10} />
                </button>
              )}

              <ComposerContextMenuPopover
                open={kanbanPopoverOpen}
                anchorRef={kanbanPopoverAnchorRef}
                onClose={() => setKanbanPopoverOpen(false)}
                panelClassName="composer-kanban-popover"
              >
                <div className="composer-kanban-popover-title">
                  {t("kanban.composer.relatedPanels")}
                </div>
                {linkedKanbanPanels.map((panel) => (
                  <div
                    className={`composer-kanban-popover-item${
                      panel.id === selectedLinkedKanbanPanelId ? " is-active" : ""
                    }`}
                    key={panel.id}
                  >
                    <button
                      type="button"
                      className="composer-kanban-popover-select"
                      onClick={() => {
                        handleSelectLinkedPanel(panel.id);
                      }}
                    >
                      <span className="composer-kanban-popover-radio">
                        {panel.id === selectedLinkedKanbanPanelId ? "●" : "○"}
                      </span>
                      {panel.name}
                    </button>
                    <button
                      type="button"
                      className="composer-kanban-popover-link"
                      onClick={() => onOpenLinkedKanbanPanel?.(panel.id)}
                    >
                      <ExternalLink size={12} />
                    </button>
                  </div>
                ))}
                {selectedLinkedPanel && (
                  <div className="composer-kanban-popover-mode">
                    <span className="composer-kanban-mode-label">{t("kanban.composer.contextModeLabel")}</span>
                    <div className="composer-kanban-mode-group">
                      <button
                        type="button"
                        className={`composer-kanban-mode-btn${kanbanContextMode === "new" ? " is-active" : ""}`}
                        onClick={() => onKanbanContextModeChange?.("new")}
                      >
                        {t("kanban.composer.contextModeNew")}
                      </button>
                      <button
                        type="button"
                        className={`composer-kanban-mode-btn${kanbanContextMode === "inherit" ? " is-active" : ""}`}
                        onClick={() => onKanbanContextModeChange?.("inherit")}
                      >
                        {t("kanban.composer.contextModeInherit")}
                      </button>
                    </div>
                  </div>
                )}
              </ComposerContextMenuPopover>
            </div>
          )}
        </div>)}

        {selectedManualMemories.length > 0 && (
          <div className="composer-memory-strip">
            <div className="composer-memory-strip-head">
              <span className="composer-memory-strip-label">
                {t("composer.manualMemorySelection", {
                  count: selectedManualMemories.length,
                })}
              </span>
              <span className="composer-memory-strip-hint">
                {t("composer.manualMemorySelectionHint")}
              </span>
            </div>
            <div className="composer-memory-chip-list">
              {selectedManualMemories.map((memory) => {
                const chipTitle = resolveManualMemoryChipTitle(memory);
                const chipDetail = resolveManualMemoryChipDetail(memory);
                return (
                  <article
                    key={`manual-memory-${memory.id}`}
                    className="composer-memory-chip"
                  >
                    <button
                      type="button"
                      className="composer-memory-chip-remove"
                      onClick={() => handleRemoveManualMemory(memory.id)}
                      title={t("composer.manualMemoryRemove", {
                        title: memory.title,
                      })}
                      aria-label={t("composer.manualMemoryRemove", {
                        title: memory.title,
                      })}
                    >
                      ×
                    </button>
                    <div className="composer-memory-chip-main">
                      <span className="composer-memory-chip-title">{chipTitle}</span>
                      {chipDetail && (
                        <span className="composer-memory-chip-summary">{chipDetail}</span>
                      )}
                      <span className="composer-memory-chip-meta">
                        <span>{memory.kind}</span>
                        <span>{memory.importance}</span>
                        <span>
                          {new Date(memory.updatedAt).toLocaleDateString(undefined, {
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </span>
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        <ChatInputBoxAdapter
          ref={chatInputRef}
          text={text}
          disabled={disabled}
          isProcessing={isProcessing}
          canStop={canStop}
          onSend={handleSend}
          onStop={onStop}
          onTextChange={handleTextChangeWithHistory}
          selectedModelId={selectedModelId}
          selectedEngine={selectedEngine}
          engines={engines}
          onSelectEngine={onSelectEngine}
          models={models}
          onSelectModel={onSelectModel}
          reasoningOptions={reasoningOptions}
          selectedEffort={selectedEffort}
          onSelectEffort={onSelectEffort}
          reasoningSupported={reasoningSupported}
          attachments={attachedImages}
          onAddAttachment={onPickImages}
          onAttachImages={onAttachImages}
          onRemoveAttachment={onRemoveImage}
          textareaHeight={textareaHeight}
          onHeightChange={onTextareaHeightChange}
          contextUsage={contextUsage ? { used: contextUsage.total.totalTokens, total: contextUsage.modelContextWindow ?? 0 } : null}
          queuedMessages={queuedMessages}
          onDeleteQueued={onDeleteQueued}
          suggestionsOpen={suggestionsOpen}
          files={files}
          directories={directories}
          commands={commands}
          placeholder={t("chat.inputPlaceholderEnter")}
          activeFile={hasActiveFileReference ? (activeFilePath ?? undefined) : undefined}
          selectedLines={hasActiveFileReference ? activeFileLinesLabel : undefined}
          onClearContext={hasActiveFileReference ? handleClearContext : undefined}
          selectedAgent={selectedChatInputAgent}
          onAgentSelect={handleAgentSelect}
          onOpenAgentSettings={onOpenAgentSettings}
          permissionMode={accessModeToPermissionMode(accessMode)}
          onModeSelect={handleModeSelect}
          hasMessages={items.length > 0}
          onRewind={handleRewind}
          statusPanelExpanded={statusPanelExpanded}
          showStatusPanelToggle
          onToggleStatusPanel={handleToggleStatusPanel}
        />
          </>
        )}
      </div>
    </footer>
  );
}
