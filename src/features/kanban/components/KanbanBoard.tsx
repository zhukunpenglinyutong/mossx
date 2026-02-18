import { useCallback, useMemo, useState, type ReactNode, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { DragDropContext } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import { Terminal, X } from "lucide-react";
import type { AppMode, EngineStatus, EngineType, WorkspaceInfo } from "../../../types";
import type {
  KanbanColumnDef,
  KanbanPanel,
  KanbanTask,
  KanbanTaskStatus,
} from "../types";
import { KanbanBoardHeader } from "./KanbanBoardHeader";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCreateModal } from "./TaskCreateModal";

type CreateTaskInput = {
  workspaceId: string;
  panelId: string;
  title: string;
  description: string;
  engineType: EngineType;
  modelId: string | null;
  branchName: string;
  images: string[];
  autoStart: boolean;
};

type KanbanBoardProps = {
  workspace: WorkspaceInfo;
  workspaces: WorkspaceInfo[];
  panel: KanbanPanel;
  panels: KanbanPanel[];
  tasks: KanbanTask[];
  columns: KanbanColumnDef[];
  onBack: () => void;
  onCreateTask: (input: CreateTaskInput) => KanbanTask;
  onUpdateTask: (taskId: string, changes: Partial<KanbanTask>) => void;
  onDeleteTask: (taskId: string) => void;
  onReorderTask: (
    taskId: string,
    newStatus: KanbanTaskStatus,
    newSortOrder: number
  ) => void;
  onAppModeChange: (mode: AppMode) => void;
  engineStatuses: EngineStatus[];
  conversationNode: ReactNode | null;
  selectedTaskId: string | null;
  taskProcessingMap: Record<string, { isProcessing: boolean; startedAt: number | null }>;
  onSelectTask: (task: KanbanTask) => void;
  onCloseConversation: () => void;
  onDragToInProgress: (task: KanbanTask) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectPanel: (panelId: string) => void;
  kanbanConversationWidth?: number;
  onKanbanConversationResizeStart?: (event: MouseEvent<HTMLDivElement>) => void;
  gitPanelNode: ReactNode | null;
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
};

export function KanbanBoard({
  workspace,
  workspaces,
  panel,
  panels,
  tasks,
  columns,
  onBack,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onReorderTask,
  onAppModeChange,
  engineStatuses,
  conversationNode,
  selectedTaskId,
  taskProcessingMap,
  onSelectTask,
  onCloseConversation,
  onDragToInProgress,
  onSelectWorkspace,
  onSelectPanel,
  kanbanConversationWidth,
  onKanbanConversationResizeStart,
  gitPanelNode,
  terminalOpen = false,
  onToggleTerminal,
}: KanbanBoardProps) {
  const { t } = useTranslation();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createDefaultStatus, setCreateDefaultStatus] =
    useState<KanbanTaskStatus>("todo");
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showGitPanel, setShowGitPanel] = useState(false);

  const handleToggleGitPanel = useCallback(() => {
    setShowGitPanel((prev) => !prev);
  }, []);

  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId) ?? null
    : null;

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length === 0) return tasks;
    return tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(q) ||
        task.description.toLowerCase().includes(q)
    );
  }, [tasks, searchQuery]);

  const tasksByColumn = useMemo(() => {
    const map: Record<KanbanTaskStatus, KanbanTask[]> = {
      todo: [],
      inprogress: [],
      testing: [],
      done: [],
    };
    for (const task of filteredTasks) {
      if (map[task.status]) {
        map[task.status].push(task);
      }
    }
    for (const key of Object.keys(map) as KanbanTaskStatus[]) {
      map[key].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [filteredTasks]);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      ) {
        return;
      }

      const sourceStatus = source.droppableId as KanbanTaskStatus;
      const destStatus = destination.droppableId as KanbanTaskStatus;
      const destTasks = [...tasksByColumn[destStatus]];

      if (source.droppableId !== destination.droppableId) {
        const task = tasks.find((t) => t.id === draggableId);
        if (task) {
          destTasks.splice(destination.index, 0, task);
        }
      } else {
        const [moved] = destTasks.splice(source.index, 1);
        if (moved) {
          destTasks.splice(destination.index, 0, moved);
        }
      }

      destTasks.forEach((task, idx) => {
        const newSortOrder = (idx + 1) * 1000;
        if (task.id === draggableId) {
          onReorderTask(task.id, destStatus, newSortOrder);
        } else if (task.sortOrder !== newSortOrder) {
          onReorderTask(task.id, task.status, newSortOrder);
        }
      });

      // Auto-execute when dragging to "inprogress" from another column
      if (destStatus === "inprogress" && sourceStatus !== "inprogress") {
        const draggedTask = tasks.find((t) => t.id === draggableId);
        if (draggedTask) {
          onDragToInProgress(draggedTask);
        }
      }
    },
    [tasksByColumn, tasks, onReorderTask, onDragToInProgress]
  );

  const handleOpenCreate = (status: KanbanTaskStatus = "todo") => {
    setEditingTask(null);
    setCreateDefaultStatus(status);
    setCreateModalOpen(true);
  };

  const handleCreateTask = (input: CreateTaskInput) => {
    onCreateTask(input);
    setCreateModalOpen(false);
  };

  const handleEditTask = useCallback((task: KanbanTask) => {
    setEditingTask(task);
    setCreateModalOpen(true);
  }, []);

  const handleUpdateTask = useCallback(
    (taskId: string, changes: Partial<KanbanTask>) => {
      onUpdateTask(taskId, changes);
      setEditingTask(null);
      setCreateModalOpen(false);
    },
    [onUpdateTask]
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      if (taskId === selectedTaskId) {
        onCloseConversation();
      }
      onDeleteTask(taskId);
    },
    [selectedTaskId, onCloseConversation, onDeleteTask]
  );

  return (
    <div className="kanban-board">
      <KanbanBoardHeader
        workspace={workspace}
        workspaces={workspaces}
        panel={panel}
        panels={panels}
        onBack={onBack}
        onAppModeChange={onAppModeChange}
        onSelectWorkspace={onSelectWorkspace}
        onSelectPanel={onSelectPanel}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showGitPanel={showGitPanel}
        onToggleGitPanel={handleToggleGitPanel}
      />
      <div className="kanban-board-body">
        <div className="kanban-board-columns-area">
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="kanban-columns">
              {columns.map((col) => (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  tasks={tasksByColumn[col.id]}
                  selectedTaskId={selectedTaskId}
                  taskProcessingMap={taskProcessingMap}
                  onAddTask={() => handleOpenCreate(col.id)}
                  onDeleteTask={handleDeleteTask}
                  onSelectTask={onSelectTask}
                  onEditTask={col.id === "todo" ? handleEditTask : undefined}
                />
              ))}
            </div>
          </DragDropContext>
        </div>

        {selectedTask && conversationNode && (
          <div
            className="kanban-conversation-panel"
            style={{ width: kanbanConversationWidth ? `${kanbanConversationWidth}px` : undefined }}
          >
            {onKanbanConversationResizeStart && (
              <div
                className="kanban-conversation-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize conversation panel"
                onMouseDown={onKanbanConversationResizeStart}
              />
            )}
            <div className="kanban-conversation-header">
              <span className="kanban-conversation-title">
                {selectedTask.title}
              </span>
              <button
                className="kanban-icon-btn"
                onClick={onCloseConversation}
                aria-label={t("kanban.conversation.close")}
              >
                <X size={16} />
              </button>
            </div>
            <div className="kanban-conversation-body">
              {conversationNode}
            </div>
          </div>
        )}

        {showGitPanel && gitPanelNode && (
          <div className="kanban-git-panel">
            {gitPanelNode}
          </div>
        )}
      </div>

      {onToggleTerminal && (
        <div className="kanban-terminal-bar">
          <button
            className={`kanban-terminal-btn${terminalOpen ? " is-active" : ""}`}
            type="button"
            onClick={onToggleTerminal}
            aria-label={t("common.terminal")}
          >
            <Terminal size={14} aria-hidden />
            <span>{t("common.terminal")}</span>
          </button>
        </div>
      )}

      <TaskCreateModal
        isOpen={createModalOpen}
        workspaceId={workspace.path}
        workspaceBackendId={workspace.id}
        panelId={panel.id}
        defaultStatus={createDefaultStatus}
        engineStatuses={engineStatuses}
        onSubmit={handleCreateTask}
        onCancel={() => {
          setCreateModalOpen(false);
          setEditingTask(null);
        }}
        editingTask={editingTask ?? undefined}
        onUpdate={handleUpdateTask}
      />
    </div>
  );
}
