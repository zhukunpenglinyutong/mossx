import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Check from "lucide-react/dist/esm/icons/check";
import ClipboardList from "lucide-react/dist/esm/icons/clipboard-list";
import Copy from "lucide-react/dist/esm/icons/copy";
import FileText from "lucide-react/dist/esm/icons/file-text";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open";
import History from "lucide-react/dist/esm/icons/history";
import LayoutList from "lucide-react/dist/esm/icons/layout-list";
import MessagesSquare from "lucide-react/dist/esm/icons/messages-square";
import Search from "lucide-react/dist/esm/icons/search";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import type { WorkspaceInfo } from "../../../types";
import type { EngineType } from "../../../types";
import { EngineIcon } from "../../engine/components/EngineIcon";
import { formatRelativeTimeShort } from "../../../utils/time";

export type WorkspaceHomeThreadSummary = {
  id: string;
  workspaceId: string;
  threadId: string;
  title: string;
  updatedAt: number;
  isProcessing: boolean;
  isReviewing: boolean;
};

type WorkspaceGuide = {
  id:
    | "projectSpec"
    | "codebaseScan"
    | "implementationPlan"
    | "requirements"
    | "review"
    | "debug";
  title: string;
  description: string;
  prompt: string;
};

type WorkspaceHomeProps = {
  workspace: WorkspaceInfo;
  currentBranch: string | null;
  recentThreads: WorkspaceHomeThreadSummary[];
  onSelectConversation: (workspaceId: string, threadId: string) => void;
  onStartConversation: (engine: EngineType) => Promise<void>;
  onContinueLatestConversation: () => void;
  onStartGuidedConversation: (prompt: string, engine: EngineType) => Promise<void>;
  onRevealWorkspace: () => Promise<void>;
  onDeleteConversations: (threadIds: string[]) => Promise<void>;
};

const START_CONVERSATION_ENGINE_OPTIONS: Array<{
  type: EngineType;
  labelKey: string;
  disabled?: boolean;
}> = [
  { type: "claude", labelKey: "workspace.engineClaudeCode" },
  { type: "codex", labelKey: "workspace.engineCodex" },
  { type: "gemini", labelKey: "workspace.engineGemini", disabled: true },
  { type: "opencode", labelKey: "workspace.engineOpenCode", disabled: true },
];

export function WorkspaceHome({
  workspace,
  currentBranch,
  recentThreads,
  onSelectConversation,
  onStartConversation,
  onContinueLatestConversation,
  onStartGuidedConversation,
  onRevealWorkspace,
  onDeleteConversations,
}: WorkspaceHomeProps) {
  const { t } = useTranslation();
  const [copiedPath, setCopiedPath] = useState(false);
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const [pendingGuideId, setPendingGuideId] = useState<string | null>(null);
  const [startConversationEngine, setStartConversationEngine] = useState<EngineType>("claude");
  const [isManagingThreads, setIsManagingThreads] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Record<string, true>>({});
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [isDeleteConfirmArmed, setIsDeleteConfirmArmed] = useState(false);
  const latestThread = recentThreads[0] ?? null;
  const selectedCount = useMemo(
    () => Object.keys(selectedThreadIds).length,
    [selectedThreadIds],
  );
  const allThreadsSelected =
    recentThreads.length > 0 && recentThreads.every((thread) => selectedThreadIds[thread.threadId]);

  const guides = useMemo<WorkspaceGuide[]>(
    () => [
      {
        id: "projectSpec",
        title: t("workspace.guideProjectSpecTitle"),
        description: t("workspace.guideProjectSpecDescription"),
        prompt: t("workspace.guideProjectSpecPrompt"),
      },
      {
        id: "codebaseScan",
        title: t("workspace.guideCodebaseScanTitle"),
        description: t("workspace.guideCodebaseScanDescription"),
        prompt: t("workspace.guideCodebaseScanPrompt"),
      },
      {
        id: "implementationPlan",
        title: t("workspace.guideImplementationPlanTitle"),
        description: t("workspace.guideImplementationPlanDescription"),
        prompt: t("workspace.guideImplementationPlanPrompt"),
      },
      {
        id: "requirements",
        title: t("workspace.guideRequirementsTitle"),
        description: t("workspace.guideRequirementsDescription"),
        prompt: t("workspace.guideRequirementsPrompt"),
      },
      {
        id: "review",
        title: t("workspace.guideReviewTitle"),
        description: t("workspace.guideReviewDescription"),
        prompt: t("workspace.guideReviewPrompt"),
      },
      {
        id: "debug",
        title: t("workspace.guideDebugTitle"),
        description: t("workspace.guideDebugDescription"),
        prompt: t("workspace.guideDebugPrompt"),
      },
    ],
    [t],
  );

  const workspaceType =
    workspace.kind === "worktree"
      ? t("workspace.workspaceTypeWorktree")
      : t("workspace.workspaceTypeMain");
  const branchLabel = currentBranch || workspace.worktree?.branch || t("workspace.unknownBranch");

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(workspace.path);
      setCopiedPath(true);
      setTimeout(() => {
        setCopiedPath(false);
      }, 1200);
    } catch {
      setCopiedPath(false);
    }
  };

  const handleStartConversation = async () => {
    if (isStartingConversation) {
      return;
    }
    setIsStartingConversation(true);
    try {
      await onStartConversation(startConversationEngine);
    } finally {
      setIsStartingConversation(false);
    }
  };

  const handleContinueConversation = () => {
    if (!latestThread) {
      return;
    }
    onContinueLatestConversation();
  };

  const handleStartGuide = async (guide: WorkspaceGuide) => {
    if (pendingGuideId) {
      return;
    }
    setPendingGuideId(guide.id);
    try {
      await onStartGuidedConversation(guide.prompt, startConversationEngine);
    } finally {
      setPendingGuideId(null);
    }
  };

  const handleEnterManageMode = () => {
    setIsManagingThreads(true);
    setSelectedThreadIds({});
    setIsDeleteConfirmArmed(false);
  };

  const handleExitManageMode = () => {
    setIsManagingThreads(false);
    setSelectedThreadIds({});
    setIsDeleteConfirmArmed(false);
  };

  const handleToggleThreadSelection = (threadId: string) => {
    setSelectedThreadIds((prev) => {
      if (prev[threadId]) {
        const { [threadId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [threadId]: true };
    });
  };

  const handleSelectAllThreads = () => {
    const next: Record<string, true> = {};
    recentThreads.forEach((thread) => {
      next[thread.threadId] = true;
    });
    setSelectedThreadIds(next);
  };

  const handleClearThreadSelection = () => {
    setSelectedThreadIds({});
    setIsDeleteConfirmArmed(false);
  };

  const handleDeleteSelectedThreads = async () => {
    if (isDeletingSelected || selectedCount === 0) {
      return;
    }
    if (!isDeleteConfirmArmed) {
      setIsDeleteConfirmArmed(true);
      return;
    }
    setIsDeletingSelected(true);
    try {
      await onDeleteConversations(Object.keys(selectedThreadIds));
      setSelectedThreadIds({});
      setIsManagingThreads(false);
      setIsDeleteConfirmArmed(false);
    } finally {
      setIsDeletingSelected(false);
    }
  };

  return (
    <section className="workspace-home">
      <header className="workspace-home-hero-card">
        <div className="workspace-home-hero-heading">
          <h1 className="workspace-home-title">{workspace.name}</h1>
          <p className="workspace-home-path">{workspace.path}</p>
        </div>
        <div className="workspace-home-meta-grid">
          <div className="workspace-home-meta-item">
            <span className="workspace-home-meta-label">{t("workspace.branch")}</span>
            <span className="workspace-home-meta-value">{branchLabel}</span>
          </div>
          <div className="workspace-home-meta-item">
            <span className="workspace-home-meta-label">{t("workspace.workspaceType")}</span>
            <span className="workspace-home-meta-value">{workspaceType}</span>
          </div>
        </div>
        <div className="workspace-home-hero-actions">
          <button
            type="button"
            className="workspace-home-chip-button"
            onClick={handleCopyPath}
          >
            {copiedPath ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            <span>{copiedPath ? t("workspace.pathCopied") : t("workspace.copyPath")}</span>
          </button>
          <button
            type="button"
            className="workspace-home-chip-button"
            onClick={() => {
              void onRevealWorkspace();
            }}
          >
            <FolderOpen size={14} aria-hidden />
            <span>{t("workspace.openProjectFolder")}</span>
          </button>
        </div>
      </header>

      <div className="workspace-home-primary-actions">
        <div className="workspace-home-start-conversation-group">
          <span
            className="workspace-home-engine-select-label"
            aria-label={t("workspace.conversationType")}
            title={t("workspace.conversationType")}
          >
            <EngineIcon engine={startConversationEngine} size={14} />
          </span>
          <select
            id="workspace-home-engine-select"
            className="workspace-home-engine-select"
            value={startConversationEngine}
            onChange={(event) => {
              setStartConversationEngine(event.target.value as EngineType);
            }}
          >
            {START_CONVERSATION_ENGINE_OPTIONS.map((option) => (
              <option key={option.type} value={option.type} disabled={Boolean(option.disabled)}>
                {t(option.labelKey)}
                {option.disabled ? ` (${t("workspace.engineComingSoon")})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="workspace-home-primary-button workspace-home-start-create-button"
            onClick={() => {
              void handleStartConversation();
            }}
            disabled={isStartingConversation}
          >
            <MessagesSquare size={16} aria-hidden />
            <span>
              {isStartingConversation
                ? t("workspace.startingConversation")
                : t("workspace.startConversation")}
            </span>
          </button>
        </div>
        <button
          type="button"
          className="workspace-home-primary-button workspace-home-primary-button-secondary"
          onClick={() => {
            handleContinueConversation();
          }}
          disabled={!latestThread}
        >
          <History size={16} aria-hidden />
          <span>{t("workspace.continueLatestConversation")}</span>
        </button>
      </div>

      <div className="workspace-home-content-grid">
        <section className="workspace-home-panel">
          <div className="workspace-home-section-header">
            <h2>{t("workspace.guidedStart")}</h2>
            <p>{t("workspace.guidedStartHint")}</p>
          </div>
          <div className="workspace-home-guide-list">
            {guides.map((guide) => {
              const isPending = pendingGuideId === guide.id;
              const GuideIcon =
                guide.id === "projectSpec"
                  ? FileText
                  : guide.id === "codebaseScan"
                    ? LayoutList
                    : guide.id === "implementationPlan"
                      ? ClipboardList
                      : guide.id === "requirements"
                  ? ClipboardList
                  : guide.id === "review"
                    ? Sparkles
                    : Search;
              return (
                <button
                  type="button"
                  key={guide.id}
                  className="workspace-home-guide-card"
                  onClick={() => {
                    void handleStartGuide(guide);
                  }}
                  disabled={Boolean(pendingGuideId)}
                >
                  <span className="workspace-home-guide-icon">
                    <GuideIcon size={16} aria-hidden />
                  </span>
                  <span className="workspace-home-guide-body">
                    <span className="workspace-home-guide-title">
                      {isPending ? t("workspace.startingConversation") : guide.title}
                    </span>
                    <span className="workspace-home-guide-description">{guide.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="workspace-home-panel">
          <div className="workspace-home-section-header">
            <h2>{t("workspace.recentConversations")}</h2>
            <p>{t("workspace.recentConversationsHint")}</p>
          </div>
          {recentThreads.length > 0 && (
            <div className="workspace-home-thread-actions">
              {!isManagingThreads ? (
                <button
                  type="button"
                  className="workspace-home-thread-action-btn"
                  onClick={handleEnterManageMode}
                >
                  {t("workspace.manageRecentConversations")}
                </button>
              ) : (
                <>
                  <span className="workspace-home-thread-selected-count">
                    {t("workspace.selectedConversations", {
                      count: selectedCount,
                    })}
                  </span>
                  <button
                    type="button"
                    className="workspace-home-thread-action-btn"
                    onClick={handleSelectAllThreads}
                    disabled={allThreadsSelected || isDeletingSelected}
                  >
                    {t("workspace.selectAllConversations")}
                  </button>
                  <button
                    type="button"
                    className="workspace-home-thread-action-btn"
                    onClick={handleClearThreadSelection}
                    disabled={selectedCount === 0 || isDeletingSelected}
                  >
                    {t("workspace.clearConversationSelection")}
                  </button>
                  <button
                    type="button"
                    className="workspace-home-thread-action-btn workspace-home-thread-action-btn-danger"
                    onClick={() => {
                      void handleDeleteSelectedThreads();
                    }}
                    disabled={selectedCount === 0 || isDeletingSelected}
                  >
                    <Trash2 size={13} aria-hidden />
                    <span>
                      {isDeletingSelected
                        ? t("workspace.deletingConversations")
                        : isDeleteConfirmArmed
                          ? t("workspace.confirmDeleteSelectedConversations", {
                              count: selectedCount,
                            })
                          : t("workspace.deleteSelectedConversations")}
                    </span>
                  </button>
                  {isDeleteConfirmArmed && !isDeletingSelected && (
                    <button
                      type="button"
                      className="workspace-home-thread-action-btn"
                      onClick={() => setIsDeleteConfirmArmed(false)}
                    >
                      {t("workspace.cancelDeleteSelectedConversations")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="workspace-home-thread-action-btn"
                    onClick={handleExitManageMode}
                    disabled={isDeletingSelected}
                  >
                    {t("workspace.cancelConversationManagement")}
                  </button>
                </>
              )}
            </div>
          )}
          {recentThreads.length === 0 ? (
            <div className="workspace-home-empty">{t("workspace.noRecentConversations")}</div>
          ) : (
            <div className="workspace-home-thread-list">
              {recentThreads.map((thread) => {
                const statusClass = thread.isProcessing
                  ? "is-processing"
                  : thread.isReviewing
                    ? "is-reviewing"
                    : "is-idle";
                const statusLabel = thread.isProcessing
                  ? t("workspace.threadProcessing")
                  : thread.isReviewing
                    ? t("workspace.threadReviewing")
                    : t("workspace.threadIdle");
                return (
                  <button
                    key={thread.id}
                    type="button"
                    className={`workspace-home-thread-item${
                      isManagingThreads ? " is-manage-mode" : ""
                    }${selectedThreadIds[thread.threadId] ? " is-selected" : ""}`}
                    data-tooltip={thread.title}
                    onClick={() => {
                      if (isManagingThreads) {
                        handleToggleThreadSelection(thread.threadId);
                        return;
                      }
                      onSelectConversation(thread.workspaceId, thread.threadId);
                    }}
                    disabled={isDeletingSelected}
                  >
                    <span className={`workspace-home-thread-status ${statusClass}`} aria-hidden />
                    <span className="workspace-home-thread-main">
                      <span className="workspace-home-thread-title">{thread.title}</span>
                      <span className="workspace-home-thread-meta">
                        {statusLabel} · {formatRelativeTimeShort(thread.updatedAt)}
                      </span>
                    </span>
                    {isManagingThreads && (
                      <span className="workspace-home-thread-check" aria-hidden>
                        {selectedThreadIds[thread.threadId] ? <Check size={14} /> : null}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
