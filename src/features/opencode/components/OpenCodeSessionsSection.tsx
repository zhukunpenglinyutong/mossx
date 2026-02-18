import Search from "lucide-react/dist/esm/icons/search";
import Star from "lucide-react/dist/esm/icons/star";
import type { OpenCodeSessionSummary } from "../types";

type OpenCodeSessionsSectionProps = {
  sessionFilter: "recent" | "favorites";
  onSessionFilterChange: (filter: "recent" | "favorites") => void;
  sessionQuery: string;
  onSessionQueryChange: (query: string) => void;
  visibleSessions: OpenCodeSessionSummary[];
  favoriteSessionIds: Record<string, true>;
  onToggleFavoriteSession: (sessionId: string) => void;
  onResumeSession: (sessionId: string) => void;
};

export function OpenCodeSessionsSection({
  sessionFilter,
  onSessionFilterChange,
  sessionQuery,
  onSessionQueryChange,
  visibleSessions,
  favoriteSessionIds,
  onToggleFavoriteSession,
  onResumeSession,
}: OpenCodeSessionsSectionProps) {
  return (
    <div className="opencode-panel-sessions">
      <div className="opencode-provider-head">
        <div className="opencode-provider-title">
          <Search size={13} aria-hidden />
          <span>Sessions</span>
        </div>
        <div className="opencode-session-filters">
          <button
            type="button"
            className={`opencode-filter-btn${sessionFilter === "recent" ? " is-active" : ""}`}
            onClick={() => onSessionFilterChange("recent")}
          >
            最近
          </button>
          <button
            type="button"
            className={`opencode-filter-btn${sessionFilter === "favorites" ? " is-active" : ""}`}
            onClick={() => onSessionFilterChange("favorites")}
          >
            收藏
          </button>
        </div>
      </div>
      <input
        className="opencode-session-search"
        placeholder="搜索 session / title"
        value={sessionQuery}
        onChange={(event) => onSessionQueryChange(event.target.value)}
      />
      <div className="opencode-session-list">
        {visibleSessions.length === 0 && <div className="opencode-mcp-empty">没有匹配的会话</div>}
        {visibleSessions.map((session) => (
          <div key={session.sessionId} className="opencode-session-row">
            <button
              type="button"
              className="opencode-session-fav"
              onClick={() => onToggleFavoriteSession(session.sessionId)}
              title="收藏会话"
            >
              <Star
                size={12}
                aria-hidden
                className={favoriteSessionIds[session.sessionId] ? "is-favorite" : ""}
              />
            </button>
            <div className="opencode-session-main">
              <div className="opencode-session-title">{session.title}</div>
              <div className="opencode-session-meta">
                <span>{session.sessionId}</span>
                <span>{session.updatedLabel}</span>
              </div>
            </div>
            <button
              type="button"
              className="opencode-provider-test"
              onClick={() => onResumeSession(session.sessionId)}
              title="恢复到该 OpenCode 会话"
            >
              恢复
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
