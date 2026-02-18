import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";

type OpenCodeAdvancedSectionProps = {
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  onRunQuickCommand: (command: string) => void;
};

export function OpenCodeAdvancedSection({
  advancedOpen,
  onAdvancedOpenChange,
  onRunQuickCommand,
}: OpenCodeAdvancedSectionProps) {
  return (
    <div className="opencode-panel-advanced">
      <button
        type="button"
        className="opencode-advanced-toggle"
        onClick={() => onAdvancedOpenChange(!advancedOpen)}
      >
        <ChevronDown size={12} aria-hidden className={advancedOpen ? "is-open" : ""} />
        <span>Advanced</span>
      </button>
      {advancedOpen && (
        <div className="opencode-advanced-content">
          <div>快捷命令（在当前会话执行）</div>
          <div className="opencode-session-filters">
            <button
              type="button"
              className="opencode-filter-btn"
              onClick={() => onRunQuickCommand("/status")}
            >
              /status
            </button>
            <button
              type="button"
              className="opencode-filter-btn"
              onClick={() => onRunQuickCommand("/mcp")}
            >
              /mcp
            </button>
            <button
              type="button"
              className="opencode-filter-btn"
              onClick={() => onRunQuickCommand("/export")}
            >
              /export
            </button>
            <button
              type="button"
              className="opencode-filter-btn"
              onClick={() => onRunQuickCommand("/share")}
            >
              /share
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
