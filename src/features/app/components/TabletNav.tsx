import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import FileText from "lucide-react/dist/esm/icons/file-text";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import MessagesSquare from "lucide-react/dist/esm/icons/messages-square";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";

type TabletNavTab = "codex" | "spec" | "git" | "log";

type TabletNavProps = {
  activeTab: TabletNavTab;
  onSelect: (tab: TabletNavTab) => void;
};

const tabIcons: Record<TabletNavTab, ReactNode> = {
  codex: <MessagesSquare className="tablet-nav-icon" />,
  spec: <FileText className="tablet-nav-icon" />,
  git: <GitBranch className="tablet-nav-icon" />,
  log: <TerminalSquare className="tablet-nav-icon" />,
};

const tabKeys: TabletNavTab[] = ["codex", "spec", "git", "log"];

const tabI18nKeys: Record<TabletNavTab, string> = {
  codex: "tabbar.codex",
  spec: "tabbar.spec",
  git: "tabbar.git",
  log: "tabbar.log",
};

export function TabletNav({ activeTab, onSelect }: TabletNavProps) {
  const { t } = useTranslation();
  return (
    <nav className="tablet-nav" aria-label={t("tabbar.workspaceNavigation")}>
      <div className="tablet-nav-group">
        {tabKeys.map((id) => (
          <button
            key={id}
            type="button"
            className={`tablet-nav-item ${activeTab === id ? "active" : ""}`}
            onClick={() => onSelect(id)}
            aria-current={activeTab === id ? "page" : undefined}
          >
            {tabIcons[id]}
            <span className="tablet-nav-label">{t(tabI18nKeys[id])}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
