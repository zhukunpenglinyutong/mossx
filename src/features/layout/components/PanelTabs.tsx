import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Folder from "lucide-react/dist/esm/icons/folder";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Brain from "lucide-react/dist/esm/icons/brain";

export type PanelTabId = "git" | "files" | "prompts" | "memory";

type PanelTab = {
  id: PanelTabId;
  label: string;
  icon: ReactNode;
};

type PanelTabsProps = {
  active: PanelTabId;
  onSelect: (id: PanelTabId) => void;
  tabs?: PanelTab[];
};

// Toggle to show/hide prompts tab (set to true to re-enable)
const SHOW_PROMPTS_TAB = false;

const tabIds: PanelTabId[] = (["git", "files", "memory", "prompts"] as const).filter(
  (id) => id !== "prompts" || SHOW_PROMPTS_TAB
);

const tabIcons: Record<PanelTabId, ReactNode> = {
  git: <GitBranch aria-hidden />,
  files: <Folder aria-hidden />,
  memory: <Brain aria-hidden />,
  prompts: <ScrollText aria-hidden />,
};

const tabI18nKeys: Record<PanelTabId, string> = {
  git: "panels.git",
  files: "panels.files",
  memory: "panels.memory",
  prompts: "panels.prompts",
};

export function PanelTabs({ active, onSelect, tabs }: PanelTabsProps) {
  const { t } = useTranslation();
  const resolvedTabs =
    tabs ??
    tabIds.map((id) => ({
      id,
      label: t(tabI18nKeys[id]),
      icon: tabIcons[id],
    }));
  return (
    <div className="panel-tabs" role="tablist" aria-label="Panel">
      {resolvedTabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`panel-tab${isActive ? " is-active" : ""}`}
            onClick={() => onSelect(tab.id)}
            aria-current={isActive ? "page" : undefined}
            aria-label={tab.label}
            title={tab.label}
          >
            <span className="panel-tab-icon" aria-hidden>
              {tab.icon}
            </span>
          </button>
        );
      })}
    </div>
  );
}
