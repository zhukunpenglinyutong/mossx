import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "../../../utils/time";
import { Plus, Clock, MessageSquare, ArrowRight } from "lucide-react";

type LatestAgentRun = {
  message: string;
  timestamp: number;
  projectName: string;
  groupName?: string | null;
  workspaceId: string;
  threadId: string;
  isProcessing: boolean;
};

type HomeProps = {
  onOpenProject: () => void;
  latestAgentRuns: LatestAgentRun[];
  isLoadingLatestAgents: boolean;
  onSelectThread: (workspaceId: string, threadId: string) => void;
};

export function Home({
  onOpenProject,
  latestAgentRuns,
  isLoadingLatestAgents,
  onSelectThread,
}: HomeProps) {
  const { t } = useTranslation();

  return (
    <div className="home">
      <div className="home-content">
        <div className="home-hero">
          <h1 className="home-title">{t("home.welcome")}</h1>
          <p className="home-subtitle">{t("home.subtitle", "What would you like to build today?")}</p>
          
          <div className="home-hero-actions">
            <button
              className="home-primary-button"
              onClick={onOpenProject}
              data-tauri-drag-region="false"
            >
              <Plus size={20} />
              <span>{t("home.openProject")}</span>
            </button>
          </div>
        </div>

        <div className="home-recent">
          <div className="home-recent-header">
            <h2 className="home-recent-title">{t("home.latestActivity", "Recent Conversations")}</h2>
          </div>

          <div className="home-recent-list">
            {latestAgentRuns.length > 0 ? (
              latestAgentRuns.map((run) => (
                <button
                  className="home-recent-item"
                  key={run.threadId}
                  onClick={() => onSelectThread(run.workspaceId, run.threadId)}
                  type="button"
                >
                  <div className="home-recent-icon">
                    <MessageSquare size={16} />
                  </div>
                  <div className="home-recent-info">
                    <div className="home-recent-top">
                      <span className="home-recent-project">{run.projectName}</span>
                      {run.groupName && (
                        <span className="home-recent-group">{run.groupName}</span>
                      )}
                      <span className="home-recent-time">
                        <Clock size={12} />
                        {formatRelativeTime(run.timestamp)}
                      </span>
                    </div>
                    <div className="home-recent-message">
                      {run.message.trim() || t("home.agentReplied")}
                    </div>
                  </div>
                  <div className="home-recent-arrow">
                    <ArrowRight size={14} />
                  </div>
                </button>
              ))
            ) : isLoadingLatestAgents ? (
              <div className="home-recent-loading" aria-label={t("home.loadingAgents")}>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div className="home-recent-skeleton" key={index}>
                    <div className="home-recent-skeleton-icon" />
                    <div className="home-recent-skeleton-content">
                      <div className="home-recent-skeleton-line" />
                      <div className="home-recent-skeleton-line short" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="home-recent-empty">
                <p>{t("home.noActivity", "No recent conversations")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
