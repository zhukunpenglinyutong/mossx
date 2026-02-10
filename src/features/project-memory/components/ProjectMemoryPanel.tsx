import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Search from "lucide-react/dist/esm/icons/search";
import Plus from "lucide-react/dist/esm/icons/plus";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Settings2 from "lucide-react/dist/esm/icons/settings-2";
import X from "lucide-react/dist/esm/icons/x";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import { PanelTabs, type PanelTabId } from "../../layout/components/PanelTabs";
import { useProjectMemory } from "../hooks/useProjectMemory";
import "../../../styles/project-memory.css";

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
    createMemory,
    updateMemory,
    deleteMemory,
  } = useProjectMemory({ workspaceId });
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [managerOpen, setManagerOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailTitleDraft, setDetailTitleDraft] = useState("");
  const [detailTextDraft, setDetailTextDraft] = useState("");

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

  useEffect(() => {
    if (!selectedItem) {
      setDetailTitleDraft("");
      setDetailTextDraft("");
      return;
    }
    setDetailTitleDraft(selectedItem.title);
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

  const handleCreate = async () => {
    if (!workspaceId || !draftText.trim()) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await createMemory({
        title: draftTitle.trim() || null,
        detail: draftText,
        summary: draftText.slice(0, 140),
        kind: kind || "note",
      });
      setDraftTitle("");
      setDraftText("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          placeholder={t("memory.tagPlaceholder")}
        />
      </div>

      {showSettings && (
        <div className="project-memory-settings">
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
        </div>
      )}

      <div className="project-memory-content">
        <aside className="project-memory-list">
          {emptyMessage ? (
            <div className="project-memory-empty">{emptyMessage}</div>
          ) : (
            items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`project-memory-list-item${
                  selectedId === item.id ? " is-active" : ""
                }`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="project-memory-list-item-head">
                  <div className="project-memory-list-head-left">
                    <span
                      className={`project-memory-list-kind kind-${item.kind.replace(/_/g, "-")}`}
                    >
                      {item.kind}
                    </span>
                    {item.kind === "conversation" && item.engine ? (
                      <span className="project-memory-list-engine">
                        {item.engine.toUpperCase()}
                      </span>
                    ) : null}
                  </div>
                  <span className="project-memory-list-importance">{item.importance}</span>
                </div>
                <div className="project-memory-list-title">{item.title}</div>
                <div className="project-memory-list-summary">{item.summary}</div>
              </button>
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

      <div className="project-memory-create">
        <input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          placeholder={t("memory.newTitle")}
        />
        <textarea
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          placeholder={t("memory.newDetail")}
        />
        <button
          type="button"
          className="project-memory-create-btn"
          onClick={() => {
            void handleCreate();
          }}
          disabled={!workspaceId || saving || !draftText.trim()}
        >
          <Plus size={14} aria-hidden />
          <span>{t("memory.add")}</span>
        </button>
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
