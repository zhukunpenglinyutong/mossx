import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Search from "lucide-react/dist/esm/icons/search";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Settings2 from "lucide-react/dist/esm/icons/settings-2";
import X from "lucide-react/dist/esm/icons/x";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import HelpCircle from "lucide-react/dist/esm/icons/help-circle";
import CheckSquare from "lucide-react/dist/esm/icons/check-square";
import Square from "lucide-react/dist/esm/icons/square";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import Copy from "lucide-react/dist/esm/icons/copy";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import type { PanelTabId } from "../../layout/components/PanelTabs";
import { Markdown } from "../../messages/components/Markdown";
import { useProjectMemory } from "../hooks/useProjectMemory";
import { projectMemoryFacade } from "../services/projectMemoryFacade";
import type {
  ProjectMemoryDiagnosticsResult,
  ProjectMemoryReconcileResult,
} from "../../../services/tauri";
import type { WorkspaceInfo } from "../../../types";
import { isLikelyPollutedMemory } from "../utils/memoryMarkers";
import {
  deriveProjectMemoryHealthState,
  deriveProjectMemoryReviewState,
  getProjectMemoryDisplayRecordKind,
  isConversationTurnMemory,
  resolveProjectMemoryCompactSummary,
  resolveProjectMemoryCompactTitle,
  resolveProjectMemoryDetailText,
  resolveProjectMemorySourceLocator,
  type ProjectMemoryHealthState,
  type ProjectMemoryReviewState,
} from "../utils/projectMemoryDisplay";
import {
  getManualMemoryInjectionMode,
  setManualMemoryInjectionMode,
} from "../utils/manualInjectionMode";
import "../../../styles/project-memory.css";

function parseTagTerms(value: string): string[] {
  return value
    .split(/[，,]/)
    .map((entry) => entry.trim())
    .filter((entry, index, arr) => entry.length > 0 && arr.indexOf(entry) === index);
}

type MemoryDetailSection = {
  label: string;
  content: string;
};

const DETAIL_SECTION_MARKER_REGEX =
  /(用户输入|AI 回复|AI 思考摘要|助手输出摘要|助手输出|User input|Assistant response|Assistant thinking summary|Assistant summary|Assistant output)[:：]/gi;

const DEFAULT_VISIBLE_QUICK_TAG_COUNT = 8;

function normalizeDetailSectionLabel(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "user input") {
    return "User input";
  }
  if (normalized === "assistant summary") {
    return "Assistant summary";
  }
  if (normalized === "assistant output") {
    return "Assistant output";
  }
  return raw.trim();
}

function parseMemoryDetailSections(detail: string): MemoryDetailSection[] {
  const text = detail.trim();
  if (!text) {
    return [];
  }
  const matches = Array.from(
    text.matchAll(
      new RegExp(DETAIL_SECTION_MARKER_REGEX.source, DETAIL_SECTION_MARKER_REGEX.flags),
    ),
  );
  if (matches.length === 0) {
    return [];
  }
  const sections: MemoryDetailSection[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    if (!current || current.index === undefined) {
      continue;
    }
    const rawLabel = current[1] ?? "";
    const start = current.index + current[0].length;
    const next = matches[i + 1];
    const end = next?.index ?? text.length;
    const content = text.slice(start, end).trim();
    if (!content) {
      continue;
    }
    sections.push({
      label: normalizeDetailSectionLabel(rawLabel),
      content,
    });
  }
  return sections;
}

type ProjectMemoryPanelProps = {
  workspaceId: string | null;
  workspaces?: readonly Pick<WorkspaceInfo, "id" | "name" | "path" | "connected">[];
  onSelectWorkspace?: (workspaceId: string) => void;
  filePanelMode: PanelTabId;
  onFilePanelModeChange: (mode: PanelTabId) => void;
  focusMemoryId?: string | null;
  focusRequestKey?: number;
};

export function ProjectMemoryPanel({
  workspaceId,
  workspaces = [],
  onSelectWorkspace,
  filePanelMode: _filePanelMode,
  onFilePanelModeChange,
  focusMemoryId = null,
  focusRequestKey = 0,
}: ProjectMemoryPanelProps) {
  const { t, i18n } = useTranslation();
  const kindLabel = (value: string) => {
    switch (value) {
      case "project_context":
        return t("memory.kind.projectContext");
      case "conversation":
        return t("memory.kind.conversation");
      case "code_decision":
        return t("memory.kind.codeDecision");
      case "known_issue":
        return t("memory.kind.knownIssue");
      case "note":
        return t("memory.kind.note");
      default:
        return value;
    }
  };
  const importanceLabel = (value: string) => {
    switch (value) {
      case "high":
        return t("memory.importance.high");
      case "medium":
        return t("memory.importance.medium");
      case "low":
        return t("memory.importance.low");
      default:
        return value;
    }
  };
  const recordKindLabel = (value: ReturnType<typeof getProjectMemoryDisplayRecordKind>) => {
    switch (value) {
      case "conversation_turn":
        return t("memory.recordKind.conversationTurn");
      case "manual_note":
        return t("memory.recordKind.manualNote");
      case "legacy":
        return t("memory.recordKind.legacy");
      default:
        return value;
    }
  };
  const healthStateLabel = (value: ProjectMemoryHealthState) => {
    switch (value) {
      case "complete":
        return t("memory.health.complete");
      case "input_only":
        return t("memory.health.inputOnly");
      case "assistant_only":
        return t("memory.health.assistantOnly");
      case "pending_fusion":
        return t("memory.health.pendingFusion");
      case "capture_failed":
        return t("memory.health.captureFailed");
      default:
        return value;
    }
  };
  const reviewStateLabel = (value: ProjectMemoryReviewState) => {
    switch (value) {
      case "unreviewed":
        return t("memory.review.unreviewed");
      case "kept":
        return t("memory.review.kept");
      case "converted":
        return t("memory.review.converted");
      case "obsolete":
        return t("memory.review.obsolete");
      case "dismissed":
        return t("memory.review.dismissed");
      default:
        return value;
    }
  };
  const {
    items,
    loading,
    error,
    query,
    kind,
    importance,
    tag,
    total,
    page,
    pageSize,
    selectedId,
    selectedItem,
    detailLoading,
    detailError,
    workspaceAutoEnabled,
    settingsLoading,
    setQuery,
    setKind,
    setImportance,
    setTag,
    setPage,
    setSelectedId,
    toggleWorkspaceAutoCapture,
    refresh,
    updateMemory,
    deleteMemory,
  } = useProjectMemory({
    workspaceId,
    preferredSelectedId: focusMemoryId,
    preferredSelectionKey: focusRequestKey,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [managerOpen, setManagerOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [detailTextDraft, setDetailTextDraft] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [showAllQuickTags, setShowAllQuickTags] = useState(false);
  const [pollutionCandidateIds, setPollutionCandidateIds] = useState<string[]>([]);
  const [pollutionScannedTotal, setPollutionScannedTotal] = useState(0);
  const [pollutionBusy, setPollutionBusy] = useState<"scan" | "cleanup" | null>(null);
  const [pollutionMessage, setPollutionMessage] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ProjectMemoryReviewState | "all">("all");
  const [healthFilter, setHealthFilter] = useState<ProjectMemoryHealthState | "all">("all");
  const [diagnostics, setDiagnostics] = useState<ProjectMemoryDiagnosticsResult | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState<"diagnostics" | "dry-run" | "apply" | null>(null);
  const [reconcileResult, setReconcileResult] = useState<ProjectMemoryReconcileResult | null>(null);
  const [showReconcileApplyConfirm, setShowReconcileApplyConfirm] = useState(false);
  const [manualInjectionMode, setManualInjectionModeState] = useState<
    "summary" | "detail"
  >(() => getManualMemoryInjectionMode());
  const workspaceSelectValue = workspaceId ?? "";
  const hasWorkspacePicker = workspaces.length > 0;

  const emptyMessage = useMemo(() => {
    if (!workspaceId) {
      return t("memory.selectWorkspace");
    }
    if (loading) {
      return t("memory.loading");
    }
    if (items.length === 0) {
      return t("memory.empty");
    }
    return null;
  }, [items.length, loading, t, workspaceId]);
  const detailSections = useMemo(
    () => parseMemoryDetailSections(detailTextDraft),
    [detailTextDraft],
  );
  const selectedRecordKind = useMemo(
    () => (selectedItem ? getProjectMemoryDisplayRecordKind(selectedItem) : null),
    [selectedItem],
  );
  const selectedIsConversationTurn = Boolean(
    selectedItem && isConversationTurnMemory(selectedItem),
  );
  const selectedDetailText = useMemo(() => {
    if (!selectedItem) {
      return "";
    }
    return resolveProjectMemoryDetailText(selectedItem, {
      userInput: t("memory.turnUserInput"),
      assistantResponse: t("memory.turnAssistantResponse"),
      assistantThinkingSummary: t("memory.turnAssistantThinkingSummary"),
      threadId: "threadId",
      turnId: "turnId",
      engine: "engine",
    });
  }, [selectedItem, t]);

  const activeTagTerms = useMemo(() => parseTagTerms(tag), [tag]);

  const availableTags = useMemo(() => {
    const bag = new Set<string>();
    items.forEach((item) => {
      item.tags.forEach((entry) => {
        const normalized = entry.trim();
        if (normalized) {
          bag.add(normalized);
        }
      });
    });
    return Array.from(bag).sort((a, b) => a.localeCompare(b)).slice(0, 24);
  }, [items]);
  const visibleQuickTags = useMemo(
    () =>
      showAllQuickTags
        ? availableTags
        : availableTags.slice(0, DEFAULT_VISIBLE_QUICK_TAG_COUNT),
    [availableTags, showAllQuickTags],
  );
  const hiddenQuickTagCount = Math.max(0, availableTags.length - visibleQuickTags.length);
  const reviewInboxCount = useMemo(
    () =>
      items.filter((item) => deriveProjectMemoryReviewState(item) === "unreviewed").length,
    [items],
  );
  const healthIssueCount = useMemo(
    () =>
      items.filter((item) => deriveProjectMemoryHealthState(item) !== "complete").length,
    [items],
  );
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const reviewState = deriveProjectMemoryReviewState(item);
        const healthState = deriveProjectMemoryHealthState(item);
        return (
          (reviewFilter === "all" || reviewState === reviewFilter) &&
          (healthFilter === "all" || healthState === healthFilter)
        );
      }),
    [healthFilter, items, reviewFilter],
  );
  const selectedSourceLocator = useMemo(
    () => (selectedItem ? resolveProjectMemorySourceLocator(selectedItem) : null),
    [selectedItem],
  );

  useEffect(() => {
    if (!selectedItem) {
      setDetailTextDraft("");
      return;
    }
    setDetailTextDraft(selectedDetailText);
  }, [selectedDetailText, selectedItem]);

  useEffect(() => {
    if (!workspaceId || !focusMemoryId) {
      return;
    }
    setManagerOpen(true);
    setSelectedIds(new Set());
    setQuery("");
    setKind(null);
    setImportance(null);
    setTag("");
    setPage(0);
  }, [
    focusMemoryId,
    focusRequestKey,
    setImportance,
    setKind,
    setPage,
    setQuery,
    setTag,
    workspaceId,
  ]);

  const formatMemoryDateTime = (value?: number) => {
    if (!value || !Number.isFinite(value)) {
      return "--";
    }
    return new Intl.DateTimeFormat(i18n.language || undefined, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  };

  const closeManager = useCallback(() => {
    setManagerOpen(false);
    onFilePanelModeChange("git");
  }, [onFilePanelModeChange]);

  useEffect(() => {
    if (!managerOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeManager();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeManager, managerOpen]);

  const handleScanPollutedMemories = async () => {
    if (!workspaceId) {
      return;
    }
    setPollutionBusy("scan");
    setPollutionMessage(null);
    try {
      const hitIds: string[] = [];
      let scanned = 0;
      let currentPage = 0;
      const scanPageSize = 200;
      let hasNextPage = true;

      // Pull full memory set page-by-page, then dry-run filter on client.
      while (hasNextPage) {
        const response = await projectMemoryFacade.list({
          workspaceId,
          page: currentPage,
          pageSize: scanPageSize,
          importance: null,
          kind: null,
          query: null,
          tag: null,
        });
        if (!response.items.length) {
          break;
        }
        scanned += response.items.length;
        response.items.forEach((item) => {
          if (isLikelyPollutedMemory(item)) {
            hitIds.push(item.id);
          }
        });
        hasNextPage = (currentPage + 1) * scanPageSize < response.total;
        if (hasNextPage) {
          currentPage += 1;
        }
      }

      setPollutionScannedTotal(scanned);
      setPollutionCandidateIds(hitIds);
      setPollutionMessage(
        t("memory.cleanupPreview", {
          matched: hitIds.length,
          scanned,
        }),
      );
    } catch (err) {
      setPollutionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setPollutionBusy(null);
    }
  };

  const handleCleanupPollutedMemories = async () => {
    if (!workspaceId || pollutionCandidateIds.length === 0) {
      return;
    }
    setPollutionBusy("cleanup");
    setPollutionMessage(null);
    try {
      const settled = await Promise.allSettled(
        pollutionCandidateIds.map((id) =>
          projectMemoryFacade.delete(id, workspaceId),
        ),
      );
      const successCount = settled.filter((entry) => entry.status === "fulfilled").length;
      const failedCount = settled.length - successCount;
      setPollutionCandidateIds([]);
      setPollutionScannedTotal(0);
      setPollutionMessage(
        t("memory.cleanupResult", {
          success: successCount,
          failed: failedCount,
        }),
      );
      if (successCount > 0) {
        await refresh();
      }
    } catch (err) {
      setPollutionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setPollutionBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) {
      return;
    }
    setDeleteError(null);
    setShowDeleteConfirm(true);
  };

  const handleSaveManualDetail = async () => {
    if (!selectedItem || selectedIsConversationTurn) {
      return;
    }
    setDetailSaving(true);
    setDeleteError(null);
    try {
      await updateMemory(selectedItem.id, {
        detail: detailTextDraft,
        source: selectedItem.source || "manual",
      });
      setPollutionMessage(t("memory.detailSaved"));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailSaving(false);
    }
  };

  const handleCopySelectedTurn = async () => {
    if (!selectedItem || !selectedIsConversationTurn) {
      return;
    }
    setCopyMessage(null);
    const copyText = resolveProjectMemoryDetailText(selectedItem, {
      userInput: t("memory.turnUserInput"),
      assistantResponse: t("memory.turnAssistantResponse"),
      assistantThinkingSummary: t("memory.turnAssistantThinkingSummary"),
      threadId: "threadId",
      turnId: "turnId",
      engine: "engine",
    });
    try {
      if (!navigator.clipboard) {
        throw new Error(t("memory.copyUnavailable"));
      }
      await navigator.clipboard.writeText(copyText);
      setCopyMessage(t("memory.copyTurnSuccess"));
    } catch (err) {
      setCopyMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCopySourceLocator = async () => {
    if (!selectedSourceLocator?.available) {
      return;
    }
    const lines = [
      selectedSourceLocator.threadId ? `threadId: ${selectedSourceLocator.threadId}` : null,
      selectedSourceLocator.turnId ? `turnId: ${selectedSourceLocator.turnId}` : null,
      selectedSourceLocator.engine ? `engine: ${selectedSourceLocator.engine}` : null,
    ].filter((entry): entry is string => Boolean(entry));
    try {
      if (!navigator.clipboard) {
        throw new Error(t("memory.copyUnavailable"));
      }
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyMessage(t("memory.sourceLocatorCopied"));
    } catch (err) {
      setCopyMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSetReviewState = async (nextReviewState: ProjectMemoryReviewState) => {
    if (!selectedItem) {
      return;
    }
    setDetailSaving(true);
    setDeleteError(null);
    try {
      await updateMemory(selectedItem.id, {
        reviewState: nextReviewState,
      });
      setPollutionMessage(
        t("memory.reviewStateUpdated", {
          state: reviewStateLabel(nextReviewState),
        }),
      );
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailSaving(false);
    }
  };

  const handleConvertToManualNote = async () => {
    if (!workspaceId || !selectedItem) {
      return;
    }
    setDetailSaving(true);
    setDeleteError(null);
    try {
      await projectMemoryFacade.create({
        workspaceId,
        recordKind: "manual_note",
        kind: "note",
        title: resolveProjectMemoryCompactTitle(selectedItem),
        summary: resolveProjectMemoryCompactSummary(selectedItem),
        detail: resolveProjectMemoryDetailText(selectedItem, {
          userInput: t("memory.turnUserInput"),
          assistantResponse: t("memory.turnAssistantResponse"),
          assistantThinkingSummary: t("memory.turnAssistantThinkingSummary"),
          threadId: "threadId",
          turnId: "turnId",
          engine: "engine",
        }),
        tags: selectedItem.tags,
        importance: selectedItem.importance,
        source: "manual",
      });
      await updateMemory(selectedItem.id, {
        reviewState: "converted",
      });
      setPollutionMessage(t("memory.reviewConverted"));
      await refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailSaving(false);
    }
  };

  const handleRunDiagnostics = async () => {
    if (!workspaceId) {
      return;
    }
    setDiagnosticsBusy("diagnostics");
    setDeleteError(null);
    try {
      setDiagnostics(await projectMemoryFacade.diagnostics(workspaceId));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiagnosticsBusy(null);
    }
  };

  const handleRunReconcileDryRun = async () => {
    if (!workspaceId) {
      return;
    }
    setDiagnosticsBusy("dry-run");
    setDeleteError(null);
    try {
      const result = await projectMemoryFacade.reconcile(workspaceId, true);
      setReconcileResult(result);
      setPollutionMessage(t("memory.reconcileDryRunDone", { count: result.fixableCount }));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiagnosticsBusy(null);
    }
  };

  const handleApplyReconcile = async () => {
    if (!workspaceId) {
      return;
    }
    setShowReconcileApplyConfirm(false);
    setDiagnosticsBusy("apply");
    setDeleteError(null);
    try {
      const result = await projectMemoryFacade.reconcile(workspaceId, false);
      setReconcileResult(result);
      setPollutionMessage(t("memory.reconcileApplyDone", { count: result.fixedCount }));
      await refresh();
      setDiagnostics(await projectMemoryFacade.diagnostics(workspaceId));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiagnosticsBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (!selectedItem) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteMemory(selectedItem.id);
      setShowDeleteConfirm(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((item) => item.id)));
    }
  };

  const toggleQuickTag = (targetTag: string) => {
    const terms = parseTagTerms(tag);
    const hasTag = terms.includes(targetTag);
    const nextTerms = hasTag
      ? terms.filter((entry) => entry !== targetTag)
      : [...terms, targetTag];
    setTag(nextTerms.join(", "));
  };

  const toggleSelectItem = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBatchSetImportance = async (nextImportance: "high" | "medium" | "low") => {
    if (!workspaceId || selectedIds.size === 0) {
      return;
    }
    setBatchUpdating(true);
    setDeleteError(null);
    try {
      const settled = await Promise.allSettled(
        Array.from(selectedIds).map((id) =>
          projectMemoryFacade.update(id, workspaceId, { importance: nextImportance }),
        ),
      );
      const successCount = settled.filter((entry) => entry.status === "fulfilled").length;
      setPollutionMessage(
        t("memory.batchUpdateImportanceSuccess", {
          count: successCount,
          importance: importanceLabel(nextImportance),
        }),
      );
      if (successCount > 0) {
        await refresh();
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setBatchUpdating(false);
    }
  };

  const handleBatchDelete = async () => {
    if (!workspaceId || selectedIds.size === 0) {
      return;
    }
    setShowBatchDeleteConfirm(false);
    setBatchUpdating(true);
    setDeleteError(null);
    try {
      const settled = await Promise.allSettled(
        Array.from(selectedIds).map((id) =>
          projectMemoryFacade.delete(id, workspaceId),
        ),
      );
      const successCount = settled.filter((entry) => entry.status === "fulfilled").length;
      setSelectedIds(new Set());
      setPollutionMessage(
        t("memory.batchDeleteSuccess", { count: successCount }),
      );
      await refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setBatchUpdating(false);
    }
  };

  const handleClearAll = async () => {
    if (!workspaceId || total === 0) {
      return;
    }
    setShowClearAllConfirm(false);
    setDeleteError(null);
    try {
      const allIds: string[] = [];
      let currentPage = 0;
      const scanPageSize = 200;
      let hasNextPage = true;

      while (hasNextPage) {
        const response = await projectMemoryFacade.list({
          workspaceId,
          page: currentPage,
          pageSize: scanPageSize,
          importance: null,
          kind: null,
          query: null,
          tag: null,
        });
        if (!response.items.length) {
          break;
        }
        allIds.push(...response.items.map((item) => item.id));
        hasNextPage = (currentPage + 1) * scanPageSize < response.total;
        if (hasNextPage) {
          currentPage += 1;
        }
      }

      const settled = await Promise.allSettled(
        allIds.map((id) => projectMemoryFacade.delete(id, workspaceId)),
      );
      const successCount = settled.filter((entry) => entry.status === "fulfilled").length;
      setSelectedIds(new Set());
      setPollutionMessage(
        t("memory.clearAllSuccess", { count: successCount }),
      );
      await refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  };

  const renderManagerBody = (isModal: boolean) => (
    <div className={`project-memory-body${isModal ? " is-modal" : ""}`}>
      <div className="project-memory-workbench-strip" aria-label={t("memory.workbenchOverview")}>
        <div className="project-memory-workbench-stat">
          <span>{t("memory.workbenchTotal")}</span>
          <strong>{total}</strong>
        </div>
        <div className="project-memory-workbench-stat">
          <span>{t("memory.workbenchSelected")}</span>
          <strong>{selectedIds.size}</strong>
        </div>
        <div className="project-memory-workbench-stat">
          <span>{t("memory.workbenchReview")}</span>
          <strong>{reviewInboxCount}</strong>
        </div>
        <div className="project-memory-workbench-stat">
          <span>{t("memory.workbenchHealth")}</span>
          <strong>{healthIssueCount}</strong>
        </div>
      </div>

      <div className="project-memory-toolbar">
        <label className="project-memory-search">
          <Search size={14} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("memory.searchPlaceholder")}
          />
        </label>
        <select
          value={kind ?? ""}
          onChange={(event) => setKind(event.target.value || null)}
          className="project-memory-kind-select"
        >
          <option value="">{t("memory.kind.all")}</option>
          <option value="project_context">{t("memory.kind.projectContext")}</option>
          <option value="conversation">{t("memory.kind.conversation")}</option>
          <option value="code_decision">{t("memory.kind.codeDecision")}</option>
          <option value="known_issue">{t("memory.kind.knownIssue")}</option>
          <option value="note">{t("memory.kind.note")}</option>
        </select>
        <select
          value={importance ?? ""}
          onChange={(event) => setImportance(event.target.value || null)}
          className="project-memory-kind-select"
        >
          <option value="">{t("memory.importance.all")}</option>
          <option value="high">{t("memory.importance.high")}</option>
          <option value="medium">{t("memory.importance.medium")}</option>
          <option value="low">{t("memory.importance.low")}</option>
        </select>
        <select
          value={reviewFilter}
          onChange={(event) =>
            setReviewFilter(event.target.value as ProjectMemoryReviewState | "all")
          }
          className="project-memory-kind-select"
        >
          <option value="all">{t("memory.review.all")}</option>
          <option value="unreviewed">{t("memory.review.unreviewed")}</option>
          <option value="kept">{t("memory.review.kept")}</option>
          <option value="converted">{t("memory.review.converted")}</option>
          <option value="obsolete">{t("memory.review.obsolete")}</option>
          <option value="dismissed">{t("memory.review.dismissed")}</option>
        </select>
        <select
          value={healthFilter}
          onChange={(event) =>
            setHealthFilter(event.target.value as ProjectMemoryHealthState | "all")
          }
          className="project-memory-kind-select"
        >
          <option value="all">{t("memory.health.all")}</option>
          <option value="complete">{t("memory.health.complete")}</option>
          <option value="input_only">{t("memory.health.inputOnly")}</option>
          <option value="assistant_only">{t("memory.health.assistantOnly")}</option>
          <option value="pending_fusion">{t("memory.health.pendingFusion")}</option>
          <option value="capture_failed">{t("memory.health.captureFailed")}</option>
        </select>
        <input
          className="project-memory-tag-input"
          list="project-memory-tag-suggestions"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          placeholder={t("memory.tagPlaceholder")}
        />
        <datalist id="project-memory-tag-suggestions">
          {availableTags.map((entry) => (
            <option key={entry} value={entry} />
          ))}
        </datalist>
      </div>

      {availableTags.length > 0 ? (
        <div className="project-memory-tag-quick-filters">
          <span className="project-memory-tag-quick-label">{t("memory.quickTags")}</span>
          {visibleQuickTags.map((entry) => {
            const active = activeTagTerms.includes(entry);
            return (
              <button
                key={entry}
                type="button"
                className={`project-memory-tag-chip${active ? " is-active" : ""}`}
                onClick={() => toggleQuickTag(entry)}
              >
                {entry}
              </button>
            );
          })}
          {hiddenQuickTagCount > 0 || showAllQuickTags ? (
            <button
              type="button"
              className="project-memory-tag-chip project-memory-tag-chip-more"
              onClick={() => setShowAllQuickTags((value) => !value)}
              aria-expanded={showAllQuickTags}
            >
              {showAllQuickTags
                ? t("memory.quickTagsCollapse")
                : t("memory.quickTagsMore", { count: hiddenQuickTagCount })}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={`project-memory-settings${showSettings ? ' is-open' : ''}`}>
          <div className="project-memory-toggle-row">
            <label className="project-memory-toggle">
              <input
                type="checkbox"
                checked={workspaceAutoEnabled}
                disabled={!workspaceId || settingsLoading}
                onChange={() => {
                  void toggleWorkspaceAutoCapture();
                }}
              />
              <span>{t("memory.autoCaptureWorkspace")}</span>
            </label>
            <label className="project-memory-toggle project-memory-toggle-disabled">
              <input
                type="checkbox"
                checked={false}
                disabled
                readOnly
              />
              <span>{t("memory.contextInjectionEnabled")}</span>
            </label>
          </div>
          <div className="project-memory-toggle-hint">
            {t("memory.contextInjectionManualHint")}
          </div>
          <div className="project-memory-injection-mode-row">
            <span className="project-memory-injection-mode-label">
              {t("memory.manualInjectionMode")}
            </span>
            <select
              className="project-memory-kind-select project-memory-injection-mode-select"
              value={manualInjectionMode}
              onChange={(event) => {
                const nextMode = event.target.value === "summary" ? "summary" : "detail";
                setManualInjectionModeState(nextMode);
                setManualMemoryInjectionMode(nextMode);
              }}
            >
              <option value="detail">{t("memory.manualInjectionModeDetail")}</option>
              <option value="summary">{t("memory.manualInjectionModeSummary")}</option>
            </select>
          </div>
          <div className="project-memory-toggle-hint">
            {t("memory.manualInjectionModeHint")}
          </div>
          <div className="project-memory-cleanup">
            <div className="project-memory-cleanup-header">
              <div className="project-memory-cleanup-title">{t("memory.cleanupTitle")}</div>
              <div className="project-memory-cleanup-actions">
                <button
                  type="button"
                  className="project-memory-action-btn compact"
                  onClick={() => {
                    void handleScanPollutedMemories();
                  }}
                  disabled={!workspaceId || pollutionBusy !== null}
                >
                  {pollutionBusy === "scan"
                    ? t("memory.cleanupScanning")
                    : t("memory.cleanupScan")}
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn compact danger"
                  onClick={() => {
                    void handleCleanupPollutedMemories();
                  }}
                  disabled={
                    !workspaceId ||
                    pollutionBusy !== null ||
                    pollutionCandidateIds.length === 0
                  }
                >
                  {pollutionBusy === "cleanup"
                    ? t("memory.cleanupRunning")
                    : t("memory.cleanupRun")}
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn compact danger"
                  onClick={() => setShowClearAllConfirm(true)}
                  disabled={!workspaceId || total === 0}
                >
                  {t("memory.clearAll")}
                </button>
              </div>
            </div>
            <div className="project-memory-cleanup-hint">
              {pollutionMessage
                ? pollutionMessage
                : pollutionScannedTotal > 0
                  ? t("memory.cleanupScanned", { total: pollutionScannedTotal })
                  : t("memory.cleanupHint")}
            </div>
          </div>
          <div className="project-memory-cleanup project-memory-diagnostics">
            <div className="project-memory-cleanup-header">
              <div className="project-memory-cleanup-title">{t("memory.diagnosticsTitle")}</div>
              <div className="project-memory-cleanup-actions">
                <button
                  type="button"
                  className="project-memory-action-btn compact"
                  onClick={() => {
                    void handleRunDiagnostics();
                  }}
                  disabled={!workspaceId || diagnosticsBusy !== null}
                >
                  <ShieldCheck size={13} aria-hidden />
                  <span>
                    {diagnosticsBusy === "diagnostics"
                      ? t("memory.diagnosticsRunning")
                      : t("memory.diagnosticsRun")}
                  </span>
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn compact"
                  onClick={() => {
                    void handleRunReconcileDryRun();
                  }}
                  disabled={!workspaceId || diagnosticsBusy !== null}
                >
                  {diagnosticsBusy === "dry-run"
                    ? t("memory.reconcileRunning")
                    : t("memory.reconcileDryRun")}
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn compact danger"
                  onClick={() => setShowReconcileApplyConfirm(true)}
                  disabled={
                    !workspaceId ||
                    diagnosticsBusy !== null ||
                    !reconcileResult ||
                    reconcileResult.fixableCount === 0
                  }
                >
                  <Wrench size={13} aria-hidden />
                  <span>
                    {diagnosticsBusy === "apply"
                      ? t("memory.reconcileRunning")
                      : t("memory.reconcileApply")}
                  </span>
                </button>
              </div>
            </div>
            <div className="project-memory-cleanup-hint">
              {diagnostics
                ? t("memory.diagnosticsSummary", {
                    total: diagnostics.total,
                    incomplete:
                      diagnostics.healthCounts.input_only +
                      diagnostics.healthCounts.assistant_only +
                      diagnostics.healthCounts.pending_fusion +
                      diagnostics.healthCounts.capture_failed,
                    duplicates: diagnostics.duplicateTurnGroups.length,
                    badFiles: diagnostics.badFiles.length,
                  })
                : t("memory.diagnosticsHint")}
            </div>
            {reconcileResult ? (
              <div className="project-memory-cleanup-hint">
                {t("memory.reconcileSummary", {
                  fixable: reconcileResult.fixableCount,
                  fixed: reconcileResult.fixedCount,
                  skipped: reconcileResult.skippedCount,
                })}
              </div>
            ) : null}
          </div>
      </div>

      <div className="project-memory-content">
        <aside className="project-memory-list" aria-label={t("memory.memoryList")}>
          <div className="project-memory-list-toolbar">
            <span>{t("memory.memoryList")}</span>
            <span>{t("memory.pageMeta", {
              from: total === 0 ? 0 : page * pageSize + 1,
              to: Math.min(total, (page + 1) * pageSize),
              total,
            })}</span>
          </div>
          {emptyMessage ? (
            <div className="project-memory-empty">{emptyMessage}</div>
          ) : filteredItems.length === 0 ? (
            <div className="project-memory-empty">{t("memory.filteredEmpty")}</div>
          ) : (
            filteredItems.map((item) => {
              const recordKind = getProjectMemoryDisplayRecordKind(item);
              const healthState = deriveProjectMemoryHealthState(item);
              const reviewState = deriveProjectMemoryReviewState(item);
              const compactTitle = resolveProjectMemoryCompactTitle(item);
              const compactSummary = resolveProjectMemoryCompactSummary(item);
              return (
                <div
                  key={item.id}
                  className={`project-memory-list-item${
                    selectedId === item.id ? " is-active" : ""
                  }${selectedIds.has(item.id) ? " is-selected" : ""}${
                    item.importance ? ` importance-${item.importance}` : ""
                  }${reviewState === "obsolete" ? " is-obsolete" : ""}${
                    reviewState === "dismissed" ? " is-dismissed" : ""
                  }`}
                  onClick={() => toggleSelectItem(item.id)}
                >
                  <label className="project-memory-list-checkbox" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelectItem(item.id)}
                    />
                    <span className="checkbox-indicator" />
                  </label>
                  <div
                    className="project-memory-list-item-content"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(item.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(item.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="project-memory-list-item-head">
                      <div className="project-memory-list-head-left">
                        <span
                          className={`project-memory-list-kind kind-${item.kind.replace(/_/g, "-")}`}
                        >
                          {kindLabel(item.kind)}
                        </span>
                        <span
                          className={`project-memory-record-kind record-${recordKind.replace(/_/g, "-")}`}
                        >
                          {recordKindLabel(recordKind)}
                        </span>
                        {isConversationTurnMemory(item) && item.engine ? (
                          <span className="project-memory-list-engine">
                            {item.engine.toUpperCase()}
                          </span>
                        ) : null}
                      </div>
                      <span className="project-memory-list-importance">
                        {importanceLabel(item.importance)}
                      </span>
                    </div>
                    <div className="project-memory-list-title">{compactTitle}</div>
                    <div className="project-memory-list-summary">{compactSummary}</div>
                    <div className="project-memory-list-meta-row">
                      <span>{formatMemoryDateTime(item.updatedAt)}</span>
                      <span>{healthStateLabel(healthState)}</span>
                      <span>{reviewStateLabel(reviewState)}</span>
                    </div>
                    {item.tags && item.tags.length > 0 ? (
                      <div className="project-memory-list-tags">
                        {item.tags.slice(0, 3).map((entry) => (
                          <span key={entry} className="project-memory-list-tag">
                            {entry}
                          </span>
                        ))}
                        {item.tags.length > 3 ? (
                          <span className="project-memory-list-tag project-memory-list-tag-muted">
                            +{item.tags.length - 3}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </aside>

        <div className="project-memory-detail" aria-label={t("memory.memoryDetail")}>
          {selectedItem ? (
            <>
              <div className="project-memory-detail-readonly-head">
                <div className="project-memory-detail-readonly-title">
                  {selectedItem.title || selectedItem.summary || selectedItem.kind}
                </div>
                <div className="project-memory-detail-readonly-meta">
                  {selectedRecordKind ? (
                    <span>{recordKindLabel(selectedRecordKind)}</span>
                  ) : null}
                  <span>{kindLabel(selectedItem.kind)}</span>
                  <span>{importanceLabel(selectedItem.importance)}</span>
                  <span>{formatMemoryDateTime(selectedItem.updatedAt)}</span>
                  {selectedItem.threadId ? <span>{selectedItem.threadId}</span> : null}
                  {selectedItem.turnId ? <span>{selectedItem.turnId}</span> : null}
                  {selectedItem.engine ? <span>{selectedItem.engine}</span> : null}
                </div>
                {selectedItem.tags.length > 0 ? (
                  <div className="project-memory-detail-readonly-tags">
                    {selectedItem.tags.slice(0, 8).map((entry) => (
                      <span key={entry} className="project-memory-detail-readonly-tag">
                        #{entry}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="project-memory-source-locator">
                  <div>
                    <span className="project-memory-source-locator-label">
                      {t("memory.sourceLocator")}
                    </span>
                    <span className="project-memory-source-locator-status">
                      {selectedSourceLocator?.available
                        ? t("memory.sourceLocatorAvailable")
                        : t("memory.sourceLocatorUnavailable")}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="project-memory-action-btn compact"
                    onClick={() => {
                      void handleCopySourceLocator();
                    }}
                    disabled={!selectedSourceLocator?.available}
                    aria-label={t("memory.copySourceLocator")}
                  >
                    <Copy size={13} aria-hidden />
                    <span>{t("memory.copySourceLocator")}</span>
                  </button>
                </div>
              </div>
              {detailLoading ? (
                <div className="project-memory-detail-status">{t("memory.detailLoading")}</div>
              ) : null}
              {detailError ? (
                <div className="project-memory-error">{detailError}</div>
              ) : null}
              {selectedIsConversationTurn ? (
                <div className="project-memory-turn-grid">
                  <section className="project-memory-turn-section">
                    <h3>{t("memory.turnUserInput")}</h3>
                    <Markdown
                      className="markdown project-memory-detail-preview-markdown"
                      value={selectedItem.userInput?.trim() || t("memory.detailPreviewEmpty")}
                    />
                  </section>
                  {selectedItem.assistantThinkingSummary?.trim() ? (
                    <section className="project-memory-turn-section">
                      <h3>{t("memory.turnAssistantThinkingSummary")}</h3>
                      <Markdown
                        className="markdown project-memory-detail-preview-markdown"
                        value={selectedItem.assistantThinkingSummary.trim()}
                      />
                    </section>
                  ) : null}
                  <section className="project-memory-turn-section">
                    <h3>{t("memory.turnAssistantResponse")}</h3>
                    <Markdown
                      className="markdown project-memory-detail-preview-markdown"
                      value={selectedItem.assistantResponse?.trim() || t("memory.detailPreviewEmpty")}
                    />
                  </section>
                </div>
              ) : (
                <div className="project-memory-detail-editor">
                  <label className="project-memory-detail-editor-label" htmlFor="project-memory-detail-editor">
                    {t("memory.editManualDetail")}
                  </label>
                  <textarea
                    id="project-memory-detail-editor"
                    className="project-memory-detail-text"
                    value={detailTextDraft}
                    onChange={(event) => setDetailTextDraft(event.target.value)}
                  />
                </div>
              )}
              {!selectedIsConversationTurn ? (
                <div className="project-memory-detail-preview">
                  <div className="project-memory-detail-preview-title">
                    {t("memory.detailPreviewTitle")}
                  </div>
                  {detailSections.length > 0 ? (
                    <div className="project-memory-detail-preview-sections">
                      {detailSections.map((section, index) => (
                        <div
                          key={`${section.label}-${index}`}
                          className="project-memory-detail-preview-section"
                        >
                          <div className="project-memory-detail-preview-section-label">
                            {section.label}
                          </div>
                          <div className="project-memory-detail-preview-section-content">
                            <Markdown
                              className="markdown project-memory-detail-preview-markdown"
                              value={section.content}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="project-memory-detail-preview-plain">
                      <Markdown
                        className="markdown project-memory-detail-preview-markdown"
                        value={detailTextDraft.trim() || t("memory.detailPreviewEmpty")}
                      />
                    </div>
                  )}
                </div>
              ) : null}
              {copyMessage ? (
                <div className="project-memory-detail-status">{copyMessage}</div>
              ) : null}
              <div className="project-memory-review-actions" aria-label={t("memory.reviewActions")}>
                <button
                  type="button"
                  className="project-memory-action-btn compact"
                  onClick={() => {
                    void handleSetReviewState("kept");
                  }}
                  disabled={detailSaving}
                >
                  {t("memory.reviewKeep")}
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn compact"
                  onClick={() => {
                    void handleConvertToManualNote();
                  }}
                  disabled={detailSaving || !selectedIsConversationTurn}
                >
                  {t("memory.reviewConvert")}
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn compact"
                  onClick={() => {
                    void handleSetReviewState("obsolete");
                  }}
                  disabled={detailSaving}
                >
                  {t("memory.reviewObsolete")}
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn compact"
                  onClick={() => {
                    void handleSetReviewState("dismissed");
                  }}
                  disabled={detailSaving}
                >
                  {t("memory.reviewDismiss")}
                </button>
              </div>
            </>
          ) : (
            <div className="project-memory-empty">{t("memory.selectRecord")}</div>
          )}
        </div>
      </div>

      {/* 统一操作区：批量操作（左） + 详情操作（右） */}
      {items.length > 0 && (
        <div className="project-memory-actions">
          <div className="project-memory-batch-actions">
            <button
              type="button"
              className="project-memory-action-btn compact"
              onClick={toggleSelectAll}
              aria-label={
                selectedIds.size === items.length
                  ? t("memory.unselectAll")
                  : t("memory.selectAll")
              }
            >
              {selectedIds.size === items.length ? (
                <>
                  <Square size={14} aria-hidden />
                  <span>{t("memory.unselectAll")}</span>
                </>
              ) : (
                <>
                  <CheckSquare size={14} aria-hidden />
                  <span>{t("memory.selectAll")}</span>
                </>
              )}
            </button>
            {selectedIds.size > 0 && (
              <>
                <button
                  type="button"
                  className="project-memory-action-btn compact"
                  onClick={() => { void handleBatchSetImportance("high"); }}
                  disabled={batchUpdating}
                >
                  {t("memory.batchSetHigh")}
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn compact"
                  onClick={() => { void handleBatchSetImportance("medium"); }}
                  disabled={batchUpdating}
                >
                  {t("memory.batchSetMedium")}
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn compact"
                  onClick={() => { void handleBatchSetImportance("low"); }}
                  disabled={batchUpdating}
                >
                  {t("memory.batchSetLow")}
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn compact danger"
                  onClick={() => setShowBatchDeleteConfirm(true)}
                  disabled={batchUpdating}
                  aria-label={t("memory.batchDelete")}
                >
                  <Trash2 size={14} aria-hidden />
                  <span>
                    {t("memory.batchDelete")} ({selectedIds.size})
                  </span>
                </button>
              </>
            )}
          </div>

          <div className="project-memory-actions-divider" />

          <div className="project-memory-main-actions">
            {selectedIsConversationTurn ? (
              <button
                type="button"
                className="project-memory-action-btn"
                onClick={() => {
                  void handleCopySelectedTurn();
                }}
                disabled={!selectedItem}
                aria-label={t("memory.copyTurn")}
              >
                <Copy size={14} aria-hidden />
                <span>{t("memory.copyTurn")}</span>
              </button>
            ) : (
              <button
                type="button"
                className="project-memory-action-btn"
                onClick={() => {
                  void handleSaveManualDetail();
                }}
                disabled={!selectedItem || detailSaving}
                aria-label={t("memory.save")}
              >
                <span>{detailSaving ? t("memory.saving") : t("memory.save")}</span>
              </button>
            )}
            <button
              type="button"
              className="project-memory-action-btn danger"
              onClick={() => {
                handleDelete();
              }}
              disabled={!selectedItem}
              aria-label={t("memory.delete")}
            >
              <Trash2 size={14} aria-hidden />
              <span>{t("memory.delete")}</span>
            </button>
          </div>
        </div>
      )}

      <div className={`project-memory-help${showHelp ? ' is-visible' : ''}`}>
        <button
          type="button"
          className="project-memory-help-close"
          onClick={() => setShowHelp(false)}
          aria-label={t("memory.closeHelp")}
        >
          <X size={14} aria-hidden />
        </button>
        <h4 className="project-memory-help-title">{t("memory.helpTitle")}</h4>
        <ul className="project-memory-help-list">
          <li>{t("memory.helpAutoCapture")}</li>
          <li>{t("memory.helpContextInjection")}</li>
          <li>{t("memory.helpBatchOps")}</li>
          <li>{t("memory.helpMemoryTypes")}</li>
          <li>{t("memory.helpButtons")}</li>
          <li>{t("memory.helpFilters")}</li>
        </ul>
      </div>

      <div className="project-memory-pagination">
        <button
          type="button"
          className="project-memory-action-btn compact"
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          disabled={page === 0 || loading}
          aria-label={t("memory.prevPage")}
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        <span className="project-memory-page-indicator">
          {page + 1} / {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <button
          type="button"
          className="project-memory-action-btn compact"
          onClick={() => setPage((current) => current + 1)}
          disabled={(page + 1) * pageSize >= total || loading}
          aria-label={t("memory.nextPage")}
        >
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      {(error || deleteError) && (
        <div className="project-memory-error">{error ?? deleteError}</div>
      )}

      {/* 批量删除确认对话框 */}
      {showBatchDeleteConfirm && (
        <div className="project-memory-confirm-dialog">
          <div className="project-memory-confirm-backdrop" onClick={() => setShowBatchDeleteConfirm(false)} />
          <div className="project-memory-confirm-card">
            <h3 className="project-memory-confirm-title">{t("memory.batchDelete")}</h3>
            <p className="project-memory-confirm-message">
              {t("memory.batchDeleteConfirm", { count: selectedIds.size })}
            </p>
            <div className="project-memory-confirm-actions">
              <button
                type="button"
                className="project-memory-action-btn"
                onClick={() => setShowBatchDeleteConfirm(false)}
              >
                {t("memory.cancel")}
              </button>
              <button
                type="button"
                className="project-memory-action-btn danger"
                onClick={() => {
                  void handleBatchDelete();
                }}
              >
                {t("memory.confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 清空所有记忆确认对话框 */}
      {showClearAllConfirm && (
        <div className="project-memory-confirm-dialog">
          <div className="project-memory-confirm-backdrop" onClick={() => setShowClearAllConfirm(false)} />
          <div className="project-memory-confirm-card">
            <h3 className="project-memory-confirm-title">{t("memory.clearAll")}</h3>
            <p className="project-memory-confirm-message">
              {t("memory.clearAllConfirm")}
            </p>
            <div className="project-memory-confirm-actions">
              <button
                type="button"
                className="project-memory-action-btn"
                onClick={() => setShowClearAllConfirm(false)}
              >
                {t("memory.cancel")}
              </button>
              <button
                type="button"
                className="project-memory-action-btn danger"
                onClick={() => {
                  void handleClearAll();
                }}
              >
                {t("memory.confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 单个删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="project-memory-confirm-dialog">
          <div className="project-memory-confirm-backdrop" onClick={() => setShowDeleteConfirm(false)} />
          <div className="project-memory-confirm-card">
            <h3 className="project-memory-confirm-title">{t("memory.delete")}</h3>
            <p className="project-memory-confirm-message">
              {t("memory.deleteConfirm")}
            </p>
            <div className="project-memory-confirm-actions">
              <button
                type="button"
                className="project-memory-action-btn"
                onClick={() => setShowDeleteConfirm(false)}
              >
                {t("memory.cancel")}
              </button>
              <button
                type="button"
                className="project-memory-action-btn danger"
                onClick={() => {
                  void confirmDelete();
                }}
              >
                {t("memory.confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReconcileApplyConfirm && (
        <div className="project-memory-confirm-dialog">
          <div
            className="project-memory-confirm-backdrop"
            onClick={() => setShowReconcileApplyConfirm(false)}
          />
          <div className="project-memory-confirm-card">
            <h3 className="project-memory-confirm-title">{t("memory.reconcileApply")}</h3>
            <p className="project-memory-confirm-message">
              {t("memory.reconcileApplyConfirm")}
            </p>
            <div className="project-memory-confirm-actions">
              <button
                type="button"
                className="project-memory-action-btn"
                onClick={() => setShowReconcileApplyConfirm(false)}
              >
                {t("memory.cancel")}
              </button>
              <button
                type="button"
                className="project-memory-action-btn danger"
                onClick={() => {
                  void handleApplyReconcile();
                }}
              >
                {t("memory.reconcileApply")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <section className="project-memory-panel">
      </section>

      {managerOpen && (
        <div className="project-memory-modal" role="dialog" aria-modal="true">
          <div
            className="project-memory-modal-backdrop"
            onClick={closeManager}
          />
          <div className="project-memory-modal-card">
            <div className="project-memory-modal-header">
              <h2 className="project-memory-modal-title">{t("memory.title")}</h2>
              <label className="project-memory-workspace-picker">
                <span>{t("memory.workspacePickerLabel")}</span>
                <select
                  value={workspaceSelectValue}
                  onChange={(event) => {
                    const nextWorkspaceId = event.target.value;
                    if (nextWorkspaceId && nextWorkspaceId !== workspaceId) {
                      onSelectWorkspace?.(nextWorkspaceId);
                    }
                  }}
                  disabled={!hasWorkspacePicker || !onSelectWorkspace}
                  aria-label={t("memory.workspacePickerLabel")}
                >
                  {hasWorkspacePicker ? (
                    workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name || workspace.path || workspace.id}
                        {workspace.connected ? "" : " (disconnected)"}
                      </option>
                    ))
                  ) : (
                    <option value={workspaceSelectValue}>
                      {workspaceId ?? t("memory.workspacePickerEmpty")}
                    </option>
                  )}
                </select>
              </label>
              <div className="project-memory-modal-actions">
                <button
                  type="button"
                  className="project-memory-settings-btn"
                  onClick={() => {
                    void refresh();
                  }}
                  title={t("memory.refresh")}
                  aria-label={t("memory.refresh")}
                  disabled={loading}
                >
                  <RefreshCw size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  className="project-memory-settings-btn"
                  onClick={() => setShowSettings((prev) => !prev)}
                  title={t("memory.settings")}
                  aria-label={t("memory.settings")}
                >
                  <Settings2 size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  className="project-memory-settings-btn"
                  onClick={() => setShowHelp((prev) => !prev)}
                  title={t("memory.help")}
                  aria-label={t("memory.help")}
                >
                  <HelpCircle size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  className="project-memory-settings-btn"
                  onClick={closeManager}
                  title={t("memory.closeManager")}
                  aria-label={t("memory.closeManager")}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </div>
            {renderManagerBody(true)}
          </div>
        </div>
      )}
    </>
  );
}
