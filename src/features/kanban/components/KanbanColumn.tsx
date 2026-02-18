import { useTranslation } from "react-i18next";
import { Droppable } from "@hello-pangea/dnd";
import { Plus } from "lucide-react";
import type { KanbanColumnDef, KanbanTask } from "../types";
import { KanbanCard } from "./KanbanCard";

type KanbanColumnProps = {
  column: KanbanColumnDef;
  tasks: KanbanTask[];
  selectedTaskId: string | null;
  taskProcessingMap: Record<string, { isProcessing: boolean; startedAt: number | null }>;
  onAddTask: () => void;
  onDeleteTask: (taskId: string) => void;
  onSelectTask: (task: KanbanTask) => void;
  onEditTask?: (task: KanbanTask) => void;
};

export function KanbanColumn({
  column,
  tasks,
  selectedTaskId,
  taskProcessingMap,
  onAddTask,
  onDeleteTask,
  onSelectTask,
  onEditTask,
}: KanbanColumnProps) {
  const { t } = useTranslation();

  return (
    <div className="kanban-column">
      <div className="kanban-column-header">
        <div className="kanban-column-header-left">
          <span
            className="kanban-column-dot"
            style={{ backgroundColor: column.color }}
          />
          <span className="kanban-column-name">{t(column.labelKey)}</span>
          {tasks.length > 0 && (
            <span className="kanban-column-count">{tasks.length}</span>
          )}
        </div>
        <button
          className="kanban-icon-btn"
          onClick={onAddTask}
          aria-label={t("kanban.board.addTask")}
        >
          <Plus size={16} />
        </button>
      </div>
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            className={`kanban-column-body${snapshot.isDraggingOver ? " is-dragging-over" : ""}`}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {tasks.map((task, index) => (
              <KanbanCard
                key={task.id}
                task={task}
                index={index}
                isSelected={task.id === selectedTaskId}
                isProcessing={taskProcessingMap[task.id]?.isProcessing ?? false}
                processingStartedAt={taskProcessingMap[task.id]?.startedAt ?? null}
                onSelect={() => onSelectTask(task)}
                onDelete={() => onDeleteTask(task.id)}
                onEdit={onEditTask ? () => onEditTask(task) : undefined}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
