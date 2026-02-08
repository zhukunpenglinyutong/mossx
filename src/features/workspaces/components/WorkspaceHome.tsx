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
import type { WorkspaceInfo } from "../../../types";
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
  onStartConversation: () => Promise<void>;
  onContinueLatestConversation: () => void;
  onStartGuidedConversation: (prompt: string) => Promise<void>;
  onRevealWorkspace: () => Promise<void>;
};

export function WorkspaceHome({
  workspace,
  currentBranch,
  recentThreads,
  onSelectConversation,
  onStartConversation,
  onContinueLatestConversation,
  onStartGuidedConversation,
  onRevealWorkspace,
}: WorkspaceHomeProps) {
  const { t } = useTranslation();
  const [copiedPath, setCopiedPath] = useState(false);
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const [pendingGuideId, setPendingGuideId] = useState<string | null>(null);
  const latestThread = recentThreads[0] ?? null;

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
      await onStartConversation();
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
      await onStartGuidedConversation(guide.prompt);
    } finally {
      setPendingGuideId(null);
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
        <button
          type="button"
          className="workspace-home-primary-button"
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
                    className="workspace-home-thread-item"
                    onClick={() => onSelectConversation(thread.workspaceId, thread.threadId)}
                  >
                    <span className={`workspace-home-thread-status ${statusClass}`} aria-hidden />
                    <span className="workspace-home-thread-main">
                      <span className="workspace-home-thread-title">{thread.title}</span>
                      <span className="workspace-home-thread-meta">
                        {statusLabel} · {formatRelativeTimeShort(thread.updatedAt)}
                      </span>
                    </span>
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
