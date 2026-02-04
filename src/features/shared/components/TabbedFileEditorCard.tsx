import { useState, type ReactNode } from "react";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Save from "lucide-react/dist/esm/icons/save";

type TabId = "claude" | "agents";

type FileEditorTabData = {
  id: TabId;
  title: string;
  meta?: string;
  error?: string | null;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  refreshDisabled?: boolean;
  saveDisabled?: boolean;
  saveLabel: string;
  truncated?: boolean;
  truncatedWarning?: string;
  onChange: (value: string) => void;
  onRefresh: () => void;
  onSave: () => void;
};

type TabbedFileEditorCardClassNames = {
  container: string;
  header: string;
  title: string;
  actions: string;
  meta: string;
  iconButton: string;
  error: string;
  textarea: string;
  help: string;
  tabs: string;
  tab: string;
  tabActive: string;
  warning: string;
};

type TabbedFileEditorCardProps = {
  tabs: FileEditorTabData[];
  defaultTab?: TabId;
  helpText?: ReactNode;
  classNames: TabbedFileEditorCardClassNames;
};

export function TabbedFileEditorCard({
  tabs,
  defaultTab,
  helpText,
  classNames,
}: TabbedFileEditorCardProps) {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab ?? tabs[0]?.id ?? "claude");

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  if (!currentTab) {
    return null;
  }

  return (
    <div className={classNames.container}>
      <div className={classNames.header}>
        <div className={classNames.tabs}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${classNames.tab} ${activeTab === tab.id ? classNames.tabActive : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.title}
            </button>
          ))}
        </div>
        <div className={classNames.actions}>
          {currentTab.meta ? <div className={classNames.meta}>{currentTab.meta}</div> : null}
          <button
            type="button"
            className={classNames.iconButton}
            onClick={currentTab.onRefresh}
            disabled={currentTab.refreshDisabled}
            aria-label={`Refresh ${currentTab.title}`}
            title="Refresh"
          >
            <RefreshCw aria-hidden />
          </button>
          <button
            type="button"
            className={classNames.iconButton}
            onClick={currentTab.onSave}
            disabled={currentTab.saveDisabled}
            aria-label={currentTab.saveLabel === "Create" ? `Create ${currentTab.title}` : `Save ${currentTab.title}`}
            title={currentTab.saveLabel}
          >
            <Save aria-hidden />
          </button>
        </div>
      </div>
      {currentTab.truncated && currentTab.truncatedWarning && (
        <div className={classNames.warning}>{currentTab.truncatedWarning}</div>
      )}
      {currentTab.error ? <div className={classNames.error}>{currentTab.error}</div> : null}
      <textarea
        className={classNames.textarea}
        value={currentTab.value}
        onChange={(event) => currentTab.onChange(event.target.value)}
        placeholder={currentTab.placeholder}
        spellCheck={false}
        disabled={currentTab.disabled}
      />
      {helpText ? <div className={classNames.help}>{helpText}</div> : null}
    </div>
  );
}
