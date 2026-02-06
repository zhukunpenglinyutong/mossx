import { memo, useCallback, useEffect, useRef, useState } from "react";
import ListChecks from "lucide-react/dist/esm/icons/list-checks";
import Bot from "lucide-react/dist/esm/icons/bot";
import FileEdit from "lucide-react/dist/esm/icons/file-edit";
import type { ConversationItem } from "../../../types";
import type { TabType } from "../types";
import { useStatusPanelData } from "../hooks/useStatusPanelData";
import { TodoList } from "./TodoList";
import { SubagentList } from "./SubagentList";
import { FileChangesList } from "./FileChangesList";

interface StatusPanelProps {
  items: ConversationItem[];
  isProcessing: boolean;
}

export const StatusPanel = memo(function StatusPanel({
  items,
  isProcessing,
}: StatusPanelProps) {
  const {
    todos,
    subagents,
    fileChanges,
    todoCompleted,
    todoTotal,
    hasInProgressTodo,
    subagentCompleted,
    subagentTotal,
    hasRunningSubagent,
  } = useStatusPanelData(items);

  const [openTab, setOpenTab] = useState<TabType | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasContent =
    todoTotal > 0 || subagentTotal > 0 || fileChanges.length > 0;

  // 点击外部关闭 popover
  useEffect(() => {
    if (!openTab) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setOpenTab(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openTab]);

  const handleTabClick = useCallback(
    (tab: TabType) => {
      setOpenTab((prev) => (prev === tab ? null : tab));
    },
    [],
  );

  if (!hasContent) return null;

  return (
    <div className="sp-root" ref={panelRef}>
      {/* Popover - 向上弹出 */}
      {openTab && (
        <div className="sp-popover">
          <div className="sp-popover-content">
            {openTab === "todo" && <TodoList todos={todos} />}
            {openTab === "subagent" && <SubagentList subagents={subagents} />}
            {openTab === "files" && (
              <FileChangesList fileChanges={fileChanges} />
            )}
          </div>
        </div>
      )}

      {/* Tab 栏 */}
      <div className="sp-tabs">
        {todoTotal > 0 && (
          <button
            type="button"
            className={`sp-tab${openTab === "todo" ? " sp-tab-active" : ""}`}
            onClick={() => handleTabClick("todo")}
          >
            <ListChecks size={14} className="sp-tab-icon" />
            <span className="sp-tab-label">任务</span>
            <span className="sp-tab-count">
              {todoCompleted}/{todoTotal}
            </span>
            {isProcessing && hasInProgressTodo && (
              <span className="sp-tab-loading" />
            )}
          </button>
        )}

        {subagentTotal > 0 && (
          <button
            type="button"
            className={`sp-tab${openTab === "subagent" ? " sp-tab-active" : ""}`}
            onClick={() => handleTabClick("subagent")}
          >
            <Bot size={14} className="sp-tab-icon" />
            <span className="sp-tab-label">子代理</span>
            <span className="sp-tab-count">
              {subagentCompleted}/{subagentTotal}
            </span>
            {isProcessing && hasRunningSubagent && (
              <span className="sp-tab-loading" />
            )}
          </button>
        )}

        {fileChanges.length > 0 && (
          <button
            type="button"
            className={`sp-tab${openTab === "files" ? " sp-tab-active" : ""}`}
            onClick={() => handleTabClick("files")}
          >
            <FileEdit size={14} className="sp-tab-icon" />
            <span className="sp-tab-label">编辑</span>
            <span className="sp-tab-file-stats">
              <span className="sp-stat-add">
                {fileChanges.filter((f) => f.status === "A").length || 0}
              </span>
              <span className="sp-stat-sep">/</span>
              <span className="sp-stat-mod">
                {fileChanges.filter((f) => f.status === "M").length || 0}
              </span>
              <span className="sp-stat-label">文件</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
});
