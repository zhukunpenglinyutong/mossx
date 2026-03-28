import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import appIcon from "../../../../icon.png";

type LatestAgentRun = {
  message: string;
  timestamp: number;
  projectName: string;
  groupName?: string | null;
  workspaceId: string;
  threadId: string;
  isProcessing: boolean;
};

type HomeChatProps = {
  latestAgentRuns: LatestAgentRun[];
  isLoadingLatestAgents: boolean;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  composerNode?: ReactNode;
};

export function HomeChat({
  latestAgentRuns: _latestAgentRuns,
  isLoadingLatestAgents: _isLoadingLatestAgents,
  onSelectThread: _onSelectThread,
  composerNode,
}: HomeChatProps) {
  const { t } = useTranslation();

  return (
    <div className="home-chat">
      <div className="home-chat-shell">
        <header className="home-chat-hero">
          <h1 className="home-chat-title">
            <img className="home-chat-title-icon" src={appIcon} alt="" aria-hidden="true" />
            <span>{t("homeChat.title", "MossX Agent，让你的工作更轻松")}</span>
          </h1>

          <p className="home-chat-subtitle">
            {t("homeChat.subtitle", "从项目开始，快速进入对话、执行、交付。")}
          </p>
        </header>

        <div className="home-chat-workspace">
          <section className="home-chat-composer-panel" aria-label={t("home.newConversation", "New Conversation")}>
            <div className="home-chat-composer-host">
              {composerNode}
            </div>
          </section>
        </div>
        <img className="home-chat-bg-icon" src={appIcon} alt="" aria-hidden="true" />
      </div>
    </div>
  );
}
