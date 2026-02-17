import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ListChecks from "lucide-react/dist/esm/icons/list-checks";
import Bot from "lucide-react/dist/esm/icons/bot";
import FileEdit from "lucide-react/dist/esm/icons/file-edit";
import ListTodo from "lucide-react/dist/esm/icons/list-todo";
import Terminal from "lucide-react/dist/esm/icons/terminal";
import type { ConversationItem } from "../../../types";
import type { TurnPlan } from "../../../types";
import type { TabType } from "../types";
import { useStatusPanelData } from "../hooks/useStatusPanelData";
import { TodoList } from "./TodoList";
import { SubagentList } from "./SubagentList";
import { FileChangesList } from "./FileChangesList";
import { PlanList } from "./PlanList";
import { CommandList } from "./CommandList";

interface StatusPanelProps {
  items: ConversationItem[];
  isProcessing: boolean;
  plan?: TurnPlan | null;
  isPlanMode?: boolean;
  isCodexEngine?: boolean;
  onOpenDiffPath?: (path: string) => void;
}

export const StatusPanel = memo(function StatusPanel({
  items,
  isProcessing,
  plan = null,
  isPlanMode = false,
  isCodexEngine = false,
  onOpenDiffPath,
}: StatusPanelProps) {
  const { t } = useTranslation();
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
    commands,
    commandCompleted,
    commandTotal,
    hasRunningCommand,
  } = useStatusPanelData(items, { isCodexEngine });

  const [openTab, setOpenTab] = useState<TabType | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const planTotal = plan?.steps.length ?? 0;
  const planCompleted =
    plan?.steps.filter((step) => step.status === "completed").length ?? 0;
  const showPlanTab = isPlanMode || Boolean(plan);
  const addedCount = fileChanges.filter((f) => f.status === "A").length || 0;
  const modifiedCount = fileChanges.filter((f) => f.status === "M").length || 0;
  const showEditPlanHalfSplit =
    todoTotal === 0 &&
    subagentTotal === 0 &&
    fileChanges.length > 0 &&
    showPlanTab;

  const hasLegacyContent =
    todoTotal > 0 || subagentTotal > 0 || fileChanges.length > 0 || showPlanTab;
  const hasCodexContent = hasLegacyContent || commandTotal > 0;
  const hasContent = isCodexEngine ? hasCodexContent : hasLegacyContent;

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

  useEffect(() => {
    if (!openTab) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenTab(null);
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
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
              <FileChangesList
                fileChanges={fileChanges}
                onOpenDiffPath={onOpenDiffPath}
                onAfterSelect={() => setOpenTab(null)}
              />
            )}
            {openTab === "plan" && (
              <PlanList
                plan={plan}
                isPlanMode={isPlanMode}
                isProcessing={isProcessing}
                isCodexEngine={isCodexEngine}
              />
            )}
            {openTab === "command" && (
              <CommandList commands={commands} enableExpand={isCodexEngine} />
            )}
          </div>
        </div>
      )}

      {/* Tab 栏 */}
      <div className="sp-tabs">
        {isCodexEngine && subagentTotal > 0 && (
          <button
            type="button"
            className={`sp-tab${openTab === "subagent" ? " sp-tab-active" : ""}`}
            onClick={() => handleTabClick("subagent")}
          >
            <Bot size={14} className="sp-tab-icon" />
            <span className="sp-tab-label">{t("statusPanel.tabAgents")}</span>
            <span className="sp-tab-count">
              {subagentCompleted}/{subagentTotal}
            </span>
            {isProcessing && hasRunningSubagent && (
              <span className="sp-tab-loading" />
            )}
          </button>
        )}

        {isCodexEngine && fileChanges.length > 0 && (
          <button
            type="button"
            className={`sp-tab${openTab === "files" ? " sp-tab-active" : ""}`}
            onClick={() => handleTabClick("files")}
            aria-expanded={openTab === "files"}
          >
            <FileEdit size={14} className="sp-tab-icon" />
            <span className="sp-tab-label">{t("statusPanel.tabEdits")}</span>
            <span className="sp-tab-file-stats">
              <span className="sp-stat-add">{addedCount}</span>
              <span className="sp-stat-sep">/</span>
              <span className="sp-stat-mod">{modifiedCount}</span>
              <span className="sp-stat-label">{t("statusPanel.files")}</span>
            </span>
          </button>
        )}

        {isCodexEngine && showPlanTab && (
          <button
            type="button"
            className={`sp-tab${openTab === "plan" ? " sp-tab-active" : ""}`}
            onClick={() => handleTabClick("plan")}
            aria-expanded={openTab === "plan"}
          >
            <ListTodo size={14} className="sp-tab-icon" />
            <span className="sp-tab-label">{t("statusPanel.tabPlan")}</span>
            <span className="sp-tab-count">
              {planCompleted}/{planTotal}
            </span>
            {isProcessing && isPlanMode && (
              <span className="sp-tab-loading" />
            )}
          </button>
        )}

        {isCodexEngine && commandTotal > 0 && (
          <button
            type="button"
            className={`sp-tab${openTab === "command" ? " sp-tab-active" : ""}`}
            onClick={() => handleTabClick("command")}
            aria-expanded={openTab === "command"}
          >
            <Terminal size={14} className="sp-tab-icon" />
            <span className="sp-tab-label">{t("statusPanel.tabCommands")}</span>
            <span className="sp-tab-count">
              {commandCompleted}/{commandTotal}
            </span>
            {isProcessing && hasRunningCommand && (
              <span className="sp-tab-loading" />
            )}
          </button>
        )}

        {!isCodexEngine && todoTotal > 0 && (
          <button
            type="button"
            className={`sp-tab${openTab === "todo" ? " sp-tab-active" : ""}`}
            onClick={() => handleTabClick("todo")}
          >
            <ListChecks size={14} className="sp-tab-icon" />
            <span className="sp-tab-label">{t("statusPanel.tabTodos")}</span>
            <span className="sp-tab-count">
              {todoCompleted}/{todoTotal}
            </span>
            {isProcessing && hasInProgressTodo && (
              <span className="sp-tab-loading" />
            )}
          </button>
        )}

        {!isCodexEngine && subagentTotal > 0 && (
          <button
            type="button"
            className={`sp-tab${openTab === "subagent" ? " sp-tab-active" : ""}`}
            onClick={() => handleTabClick("subagent")}
          >
            <Bot size={14} className="sp-tab-icon" />
            <span className="sp-tab-label">{t("statusPanel.tabSubagents")}</span>
            <span className="sp-tab-count">
              {subagentCompleted}/{subagentTotal}
            </span>
            {isProcessing && hasRunningSubagent && (
              <span className="sp-tab-loading" />
            )}
          </button>
        )}

        {!isCodexEngine && showEditPlanHalfSplit && (
          <>
            <button
              type="button"
              className={`sp-tab sp-tab-half${openTab === "files" ? " sp-tab-active" : ""}`}
              onClick={() => handleTabClick("files")}
              aria-expanded={openTab === "files"}
            >
              <FileEdit size={14} className="sp-tab-icon" />
              <span className="sp-tab-label">{t("statusPanel.tabEdits")}</span>
              <span className="sp-tab-file-stats">
                <span className="sp-stat-add">{addedCount}</span>
                <span className="sp-stat-sep">/</span>
                <span className="sp-stat-mod">{modifiedCount}</span>
                <span className="sp-stat-label">{t("statusPanel.files")}</span>
              </span>
            </button>
            <button
              type="button"
              className={`sp-tab sp-tab-half${openTab === "plan" ? " sp-tab-active" : ""}`}
              onClick={() => handleTabClick("plan")}
              aria-expanded={openTab === "plan"}
            >
              <ListTodo size={14} className="sp-tab-icon" />
              <span className="sp-tab-label">{t("statusPanel.tabPlan")}</span>
              <span className="sp-tab-count">
                {planCompleted}/{planTotal}
              </span>
              {isProcessing && isPlanMode && (
                <span className="sp-tab-loading" />
              )}
            </button>
          </>
        )}

        {!isCodexEngine && !showEditPlanHalfSplit && fileChanges.length > 0 && (
          <button
            type="button"
            className={`sp-tab${openTab === "files" ? " sp-tab-active" : ""}`}
            onClick={() => handleTabClick("files")}
            aria-expanded={openTab === "files"}
          >
            <FileEdit size={14} className="sp-tab-icon" />
            <span className="sp-tab-label">{t("statusPanel.tabEdits")}</span>
            <span className="sp-tab-file-stats">
              <span className="sp-stat-add">{addedCount}</span>
              <span className="sp-stat-sep">/</span>
              <span className="sp-stat-mod">{modifiedCount}</span>
              <span className="sp-stat-label">{t("statusPanel.files")}</span>
            </span>
          </button>
        )}

        {!isCodexEngine && showPlanTab && fileChanges.length === 0 && (
          <button
            type="button"
            className={`sp-tab${openTab === "plan" ? " sp-tab-active" : ""}`}
            onClick={() => handleTabClick("plan")}
            aria-expanded={openTab === "plan"}
          >
            <ListTodo size={14} className="sp-tab-icon" />
            <span className="sp-tab-label">{t("statusPanel.tabPlan")}</span>
            <span className="sp-tab-count">
              {planCompleted}/{planTotal}
            </span>
            {isProcessing && isPlanMode && (
              <span className="sp-tab-loading" />
            )}
          </button>
        )}
      </div>
    </div>
  );
});
