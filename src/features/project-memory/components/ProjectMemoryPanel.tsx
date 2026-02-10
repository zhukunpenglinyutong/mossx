import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Search from "lucide-react/dist/esm/icons/search";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Settings2 from "lucide-react/dist/esm/icons/settings-2";
import X from "lucide-react/dist/esm/icons/x";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import HelpCircle from "lucide-react/dist/esm/icons/help-circle";
import { PanelTabs, type PanelTabId } from "../../layout/components/PanelTabs";
import { useProjectMemory } from "../hooks/useProjectMemory";
import { projectMemoryFacade } from "../services/projectMemoryFacade";
import { isLikelyPollutedMemory } from "../utils/memoryMarkers";
import "../../../styles/project-memory.css";

const CONTEXT_INJECTION_TOGGLE_KEY = "projectMemory.contextInjectionEnabled";

function readContextInjectionEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    const raw = window.localStorage.getItem(CONTEXT_INJECTION_TOGGLE_KEY);
    if (raw === null) {
      return true;
    }
    return raw !== "false" && raw !== "0";
  } catch {
    return true;
  }
}

function parseTagTerms(value: string): string[] {
  return value
    .split(/[，,]/)
    .map((entry) => entry.trim())
    .filter((entry, index, arr) => entry.length > 0 && arr.indexOf(entry) === index);
}

type ProjectMemoryPanelProps = {
  workspaceId: string | null;
  filePanelMode: PanelTabId;
  onFilePanelModeChange: (mode: PanelTabId) => void;
};

export function ProjectMemoryPanel({
  workspaceId,
  filePanelMode,
  onFilePanelModeChange,
}: ProjectMemoryPanelProps) {
  const { t } = useTranslation();
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
  } = useProjectMemory({ workspaceId });
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [managerOpen, setManagerOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [detailTitleDraft, setDetailTitleDraft] = useState("");
  const [detailTagsDraft, setDetailTagsDraft] = useState("");
  const [detailTextDraft, setDetailTextDraft] = useState("");
  const [contextInjectionEnabled, setContextInjectionEnabled] = useState(
    readContextInjectionEnabled(),
  );
  const [pollutionCandidateIds, setPollutionCandidateIds] = useState<string[]>([]);
  const [pollutionScannedTotal, setPollutionScannedTotal] = useState(0);
  const [pollutionBusy, setPollutionBusy] = useState<"scan" | "cleanup" | null>(null);
  const [pollutionMessage, setPollutionMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!selectedItem) {
      setDetailTitleDraft("");
      setDetailTagsDraft("");
      setDetailTextDraft("");
      return;
    }
    setDetailTitleDraft(selectedItem.title);
    setDetailTagsDraft((selectedItem.tags ?? []).join(", "));
    setDetailTextDraft(selectedItem.detail ?? selectedItem.cleanText);
  }, [selectedItem]);

  const closeManager = () => {
    setManagerOpen(false);
    onFilePanelModeChange("git");
  };

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
  }, [managerOpen]);

  useEffect(() => {
    if (!showSettings) {
      return;
    }
    setContextInjectionEnabled(readContextInjectionEnabled());
  }, [showSettings]);

  const toggleContextInjection = () => {
    const next = !contextInjectionEnabled;
    setContextInjectionEnabled(next);
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(CONTEXT_INJECTION_TOGGLE_KEY, next ? "true" : "false");
    } catch {
      // no-op
    }
  };

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

      // Pull full memory set page-by-page, then dry-run filter on client.
      while (true) {
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
        if ((currentPage + 1) * scanPageSize >= response.total) {
          break;
        }
        currentPage += 1;
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
          projectMemoryFacade.delete(id, workspaceId, true),
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
    try {
      await deleteMemory(selectedItem.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDetailSave = async () => {
    if (!selectedItem) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateMemory(selectedItem.id, {
        title: detailTitleDraft,
        summary: detailTextDraft.slice(0, 140),
        detail: detailTextDraft,
        tags: parseTagTerms(detailTagsDraft),
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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

  const handleBatchDelete = async () => {
    if (!workspaceId || selectedIds.size === 0) {
      return;
    }
    setShowBatchDeleteConfirm(false);
    setDeleteError(null);
    try {
      const settled = await Promise.allSettled(
        Array.from(selectedIds).map((id) =>
          projectMemoryFacade.delete(id, workspaceId, true),
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
    }
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

      while (true) {
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
        if ((currentPage + 1) * scanPageSize >= response.total) {
          break;
        }
        currentPage += 1;
      }

      const settled = await Promise.allSettled(
        allIds.map((id) => projectMemoryFacade.delete(id, workspaceId, true)),
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
        {items.length > 0 && (
          <>
            <button
              type="button"
              className="project-memory-action-btn"
              onClick={toggleSelectAll}
            >
              {selectedIds.size === items.length
                ? t("memory.unselectAll")
                : t("memory.selectAll")}
            </button>
            {selectedIds.size > 0 && (
              <>
                <button
                  type="button"
                  className="project-memory-action-btn"
                  onClick={() => {
                    void handleBatchSetImportance("high");
                  }}
                  disabled={batchUpdating}
                >
                  {t("memory.batchSetHigh")}
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn"
                  onClick={() => {
                    void handleBatchSetImportance("medium");
                  }}
                  disabled={batchUpdating}
                >
                  {t("memory.batchSetMedium")}
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn"
                  onClick={() => {
                    void handleBatchSetImportance("low");
                  }}
                  disabled={batchUpdating}
                >
                  {t("memory.batchSetLow")}
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn danger"
                  onClick={() => setShowBatchDeleteConfirm(true)}
                  disabled={batchUpdating}
                >
                  <Trash2 size={14} aria-hidden />
                  <span>
                    {t("memory.batchDelete")} ({selectedIds.size})
                  </span>
                </button>
              </>
            )}
          </>
        )}
      </div>

      {availableTags.length > 0 ? (
        <div className="project-memory-tag-quick-filters">
          <span className="project-memory-tag-quick-label">{t("memory.quickTags")}</span>
          {availableTags.map((entry) => {
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
            <label className="project-memory-toggle">
              <input
                type="checkbox"
                checked={contextInjectionEnabled}
                onChange={toggleContextInjection}
              />
              <span>{t("memory.contextInjectionEnabled")}</span>
            </label>
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
      </div>

      <div className="project-memory-content">
        <aside className="project-memory-list">
          {emptyMessage ? (
            <div className="project-memory-empty">{emptyMessage}</div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={`project-memory-list-item${
                  selectedId === item.id ? " is-active" : ""
                }${selectedIds.has(item.id) ? " is-selected" : ""}`}
              >
                <label className="project-memory-list-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelectItem(item.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>
                <button
                  type="button"
                  className="project-memory-list-item-content"
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="project-memory-list-item-head">
                    <div className="project-memory-list-head-left">
                      <span
                        className={`project-memory-list-kind kind-${item.kind.replace(/_/g, "-")}`}
                      >
                        {kindLabel(item.kind)}
                      </span>
                      {item.kind === "conversation" && item.engine ? (
                        <span className="project-memory-list-engine">
                          {item.engine.toUpperCase()}
                        </span>
                      ) : null}
                    </div>
                    <span className="project-memory-list-importance">
                      {importanceLabel(item.importance)}
                    </span>
                  </div>
                  <div className="project-memory-list-title">{item.title}</div>
                  <div className="project-memory-list-summary">{item.summary}</div>
                  {item.tags && item.tags.length > 0 ? (
                    <div className="project-memory-list-tags">
                      {item.tags.slice(0, 4).map((entry) => (
                        <span key={entry} className="project-memory-list-tag">
                          {entry}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              </div>
            ))
          )}
        </aside>

        <div className="project-memory-detail">
          {selectedItem ? (
            <>
              <input
                className="project-memory-detail-title"
                value={detailTitleDraft}
                onChange={(event) => {
                  setDetailTitleDraft(event.target.value);
                }}
              />
              <input
                className="project-memory-detail-title"
                value={detailTagsDraft}
                onChange={(event) => {
                  setDetailTagsDraft(event.target.value);
                }}
                placeholder={t("memory.detailTagsPlaceholder")}
              />
              <textarea
                className="project-memory-detail-text"
                value={detailTextDraft}
                onChange={(event) => {
                  setDetailTextDraft(event.target.value);
                }}
              />
              <div className="project-memory-actions">
                <button
                  type="button"
                  className="project-memory-action-btn"
                  onClick={() => {
                    void handleDetailSave();
                  }}
                  disabled={saving}
                >
                  {t("memory.save")}
                </button>
                <button
                  type="button"
                  className="project-memory-action-btn danger"
                  onClick={() => {
                    void handleDelete();
                  }}
                >
                  <Trash2 size={14} aria-hidden />
                  <span>{t("memory.delete")}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="project-memory-empty">{t("memory.selectRecord")}</div>
          )}
        </div>
      </div>

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
          className="project-memory-action-btn"
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          disabled={page === 0 || loading}
        >
          {t("memory.prevPage")}
        </button>
        <span className="project-memory-page-meta">
          {t("memory.pageMeta", {
            from: total === 0 ? 0 : page * pageSize + 1,
            to: Math.min(total, (page + 1) * pageSize),
            total,
          })}
        </span>
        <button
          type="button"
          className="project-memory-action-btn"
          onClick={() => setPage((current) => current + 1)}
          disabled={(page + 1) * pageSize >= total || loading}
        >
          {t("memory.nextPage")}
        </button>
      </div>

      {(error || saveError || deleteError) && (
        <div className="project-memory-error">{error ?? saveError ?? deleteError}</div>
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
    </div>
  );

  return (
    <>
      <section className="project-memory-panel">
        <header className="project-memory-header">
          <PanelTabs active={filePanelMode} onSelect={onFilePanelModeChange} />
        </header>
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
