import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Check from "lucide-react/dist/esm/icons/check";
import Copy from "lucide-react/dist/esm/icons/copy";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open";
import History from "lucide-react/dist/esm/icons/history";
import MessagesSquare from "lucide-react/dist/esm/icons/messages-square";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import type { WorkspaceInfo } from "../../../types";
import type { EngineType } from "../../../types";
import type { EngineDisplayInfo } from "../../engine/hooks/useEngineController";
import type { ThreadDeleteErrorCode } from "../../threads/hooks/useThreads";
import { EngineIcon } from "../../engine/components/EngineIcon";
import { formatRelativeTimeShort } from "../../../utils/time";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  WorkspaceHomeSpecModule,
  type WorkspaceHomeGuide,
} from "./WorkspaceHomeSpecModule";
import {
  getEngineAvailabilityStatusKey,
  isEngineSelectable,
} from "../../engine/utils/engineAvailability";

export type WorkspaceHomeThreadSummary = {
  id: string;
  workspaceId: string;
  threadId: string;
  title: string;
  updatedAt: number;
  isProcessing: boolean;
  isReviewing: boolean;
};

export type WorkspaceHomeDeleteResult = {
  succeededThreadIds: string[];
  failed: Array<{ threadId: string; code: ThreadDeleteErrorCode; message: string }>;
};

type WorkspaceHomeProps = {
  workspace: WorkspaceInfo;
  engines?: EngineDisplayInfo[];
  currentBranch: string | null;
  recentThreads: WorkspaceHomeThreadSummary[];
  onSelectConversation: (workspaceId: string, threadId: string) => void;
  onStartConversation: (engine: EngineType) => Promise<void>;
  onContinueLatestConversation: () => void;
  onStartGuidedConversation: (prompt: string, engine: EngineType) => Promise<void>;
  onOpenSpecHub: () => void;
  onRevealWorkspace: () => Promise<void>;
  onDeleteConversations: (threadIds: string[]) => Promise<WorkspaceHomeDeleteResult>;
};

const START_CONVERSATION_ENGINE_OPTIONS: Array<{
  type: EngineType;
  labelKey: string;
}> = [
  { type: "claude", labelKey: "workspace.engineClaudeCode" },
  { type: "codex", labelKey: "workspace.engineCodex" },
  { type: "gemini", labelKey: "workspace.engineGemini" },
  { type: "opencode", labelKey: "workspace.engineOpenCode" },
];

export function WorkspaceHome({
  workspace,
  engines = [],
  currentBranch,
  recentThreads,
  onSelectConversation,
  onStartConversation,
  onContinueLatestConversation,
  onStartGuidedConversation,
  onOpenSpecHub,
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
  const startConversationEngineOptions = useMemo(
    () =>
      START_CONVERSATION_ENGINE_OPTIONS.map((option) => {
        const statusKey = getEngineAvailabilityStatusKey(engines, option.type);
        return {
          ...option,
          disabled: !isEngineSelectable(engines, option.type),
          statusKey,
        };
      }),
    [engines],
  );
  const selectedEngineOption = useMemo(
    () =>
      startConversationEngineOptions.find(
        (option) => option.type === startConversationEngine,
      ) ?? null,
    [startConversationEngine, startConversationEngineOptions],
  );
  const fallbackStartEngine = useMemo(
    () =>
      startConversationEngineOptions.find((option) => !option.disabled)?.type ??
      START_CONVERSATION_ENGINE_OPTIONS[0].type,
    [startConversationEngineOptions],
  );

  useEffect(() => {
    if (selectedEngineOption && !selectedEngineOption.disabled) {
      return;
    }
    setStartConversationEngine(fallbackStartEngine);
  }, [fallbackStartEngine, selectedEngineOption]);

  const guides = useMemo<WorkspaceHomeGuide[]>(
    () => [
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
        id: "review",
        title: t("workspace.guideReviewTitle"),
        description: t("workspace.guideReviewDescription"),
        prompt: t("workspace.guideReviewPrompt"),
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
    if (isStartingConversation || !selectedEngineOption || selectedEngineOption.disabled) {
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

  const handleStartGuide = async (guide: WorkspaceHomeGuide) => {
    if (pendingGuideId || !selectedEngineOption || selectedEngineOption.disabled) {
      return;
    }
    setPendingGuideId(guide.id);
    try {
      await onStartGuidedConversation(guide.prompt, startConversationEngine);
    } finally {
      setPendingGuideId(null);
    }
  };

  const canRunGuides = Boolean(!pendingGuideId && selectedEngineOption && !selectedEngineOption.disabled);
  const deleteStateAnnouncement = isDeletingSelected
    ? t("workspace.deletingConversations")
    : isDeleteConfirmArmed
      ? t("workspace.confirmDeleteSelectedConversations", {
          count: selectedCount,
        })
      : t("workspace.deleteSelectedConversations");

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
      const result = await onDeleteConversations(Object.keys(selectedThreadIds));
      if (result.failed.length === 0) {
        setSelectedThreadIds({});
        setIsManagingThreads(false);
      } else {
        const failedSelection: Record<string, true> = {};
        result.failed.forEach((entry) => {
          failedSelection[entry.threadId] = true;
        });
        setSelectedThreadIds(failedSelection);
      }
      setIsDeleteConfirmArmed(false);
    } finally {
      setIsDeletingSelected(false);
    }
  };

  return (
    <section className="workspace-home workspace-home-v2">
      <Card className="workspace-home-hero-card">
        <CardHeader className="workspace-home-hero-header">
          <div className="workspace-home-hero-top-row">
            <div className="workspace-home-hero-heading">
              <div className="workspace-home-title-meta-row">
                <p
                  className={`workspace-home-title-context ${
                    workspace.kind === "worktree" ? "is-worktree" : "is-main"
                  }`}
                >
                  {workspaceType}
                </p>
                <Badge variant="outline" className="workspace-home-meta-pill workspace-home-branch-pill">
                  {t("workspace.branch")}: {branchLabel}
                </Badge>
              </div>
              <h1 className="workspace-home-title">{workspace.name}</h1>
            </div>
          </div>
          <div className="workspace-home-path-bar" title={workspace.path}>
            <p className="workspace-home-path">{workspace.path}</p>
            <div className="workspace-home-hero-actions">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="workspace-home-chip-button"
                onClick={handleCopyPath}
              >
                {copiedPath ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                <span>{copiedPath ? t("workspace.pathCopied") : t("workspace.copyPath")}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="workspace-home-chip-button"
                onClick={() => {
                  void onRevealWorkspace();
                }}
              >
                <FolderOpen size={14} aria-hidden />
                <span>{t("workspace.openProjectFolder")}</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="workspace-home-hero-body">
          <div className="workspace-home-command-strip">
            <div className="workspace-home-command-segment workspace-home-start-conversation-group">
              <span
                className="workspace-home-engine-select-label"
                aria-label={t("workspace.conversationType")}
                title={t("workspace.conversationType")}
              >
                <EngineIcon engine={startConversationEngine} size={14} />
              </span>
              <Select
                value={startConversationEngine}
                onValueChange={(value) => {
                  if (value) {
                    setStartConversationEngine(value as EngineType);
                  }
                }}
              >
                <SelectTrigger
                  aria-label={t("workspace.conversationType")}
                  className="workspace-home-engine-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {startConversationEngineOptions.map((option) => (
                    <SelectItem key={option.type} value={option.type} disabled={option.disabled}>
                      {t(option.labelKey)}
                      {option.statusKey ? ` (${t(option.statusKey)})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="workspace-home-command-button workspace-home-command-button-create"
              onClick={() => {
                void handleStartConversation();
              }}
              disabled={
                isStartingConversation ||
                !selectedEngineOption ||
                selectedEngineOption.disabled
              }
            >
              <MessagesSquare size={16} aria-hidden />
              <span>
                {isStartingConversation
                  ? t("workspace.startingConversation")
                  : t("workspace.startConversation")}
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="workspace-home-command-button workspace-home-command-button-secondary"
              onClick={() => {
                handleContinueConversation();
              }}
              disabled={!latestThread}
            >
              <History size={16} aria-hidden />
              <span>{t("workspace.continueLatestConversation")}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="workspace-home-dashboard-grid">
        <WorkspaceHomeSpecModule
          title={t("workspace.guidedStart")}
          hint={t("workspace.guidedStartHint")}
          openSpecTitle={t("workspace.guideProjectSpecTitle")}
          openSpecDescription={t("workspace.guideProjectSpecDescription")}
          openSpecActionLabel={t("workspace.specProviderOpenSpecAction")}
          specKitTitle={t("workspace.specProviderSpecKitTitle")}
          specKitDescription={t("workspace.specProviderSpecKitDescription")}
          specKitActionLabel={t("workspace.specProviderSpecKitAction")}
          generalGuidesTitle={t("workspace.generalGuidesTitle")}
          generalGuidesHint={t("workspace.generalGuidesHint")}
          guides={guides}
          pendingGuideId={pendingGuideId}
          canRunGuides={canRunGuides}
          startingLabel={t("workspace.startingConversation")}
          onOpenSpecHub={onOpenSpecHub}
          onRunGuide={(guide) => {
            void handleStartGuide(guide);
          }}
        />

        <Card className="workspace-home-panel workspace-home-recents-panel">
          <CardHeader className="workspace-home-panel-header">
            <div className="workspace-home-section-header">
              <h2>
                <History size={15} aria-hidden className="workspace-home-title-icon" />
                {t("workspace.recentConversations")}
              </h2>
              <p>{t("workspace.recentConversationsHint")}</p>
            </div>
            {recentThreads.length > 0 && (
              <div
                className={`workspace-home-thread-actions${isManagingThreads ? " is-manage-mode" : ""}`}
              >
                {!isManagingThreads ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="workspace-home-thread-action-btn"
                    onClick={handleEnterManageMode}
                  >
                    {t("workspace.manageRecentConversations")}
                  </Button>
                ) : (
                  <>
                    <span className="workspace-home-thread-selected-count" aria-live="polite">
                      {t("workspace.selectedConversations", {
                        count: selectedCount,
                      })}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="workspace-home-thread-action-btn"
                      onClick={handleSelectAllThreads}
                      disabled={allThreadsSelected || isDeletingSelected}
                    >
                      {t("workspace.selectAllConversations")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="workspace-home-thread-action-btn"
                      onClick={handleClearThreadSelection}
                      disabled={selectedCount === 0 || isDeletingSelected}
                    >
                      {t("workspace.clearConversationSelection")}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="xs"
                      className={`workspace-home-thread-action-btn workspace-home-thread-action-btn-danger${
                        isDeleteConfirmArmed ? " is-armed" : ""
                      }`}
                      onClick={() => {
                        void handleDeleteSelectedThreads();
                      }}
                      disabled={selectedCount === 0 || isDeletingSelected}
                    >
                      <Trash2 size={13} aria-hidden />
                      <span>{deleteStateAnnouncement}</span>
                    </Button>
                    {isDeleteConfirmArmed && !isDeletingSelected && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="workspace-home-thread-action-btn"
                        onClick={() => setIsDeleteConfirmArmed(false)}
                      >
                        {t("workspace.cancelDeleteSelectedConversations")}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="workspace-home-thread-action-btn"
                      onClick={handleExitManageMode}
                      disabled={isDeletingSelected}
                    >
                      {t("workspace.cancelConversationManagement")}
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="workspace-home-panel-content">
            {recentThreads.length === 0 ? (
              <div className="workspace-home-empty">{t("workspace.noRecentConversations")}</div>
            ) : (
              <div className="workspace-home-thread-list">
                <span className="workspace-home-sr-only" aria-live="polite">
                  {isManagingThreads
                    ? `${t("workspace.selectedConversations", { count: selectedCount })}. ${deleteStateAnnouncement}.`
                    : ""}
                </span>
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
                    <Button
                      key={thread.id}
                      type="button"
                      variant="ghost"
                      size="sm"
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
                      aria-label={`${thread.title}. ${statusLabel}`}
                      aria-pressed={isManagingThreads ? Boolean(selectedThreadIds[thread.threadId]) : undefined}
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
                    </Button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
