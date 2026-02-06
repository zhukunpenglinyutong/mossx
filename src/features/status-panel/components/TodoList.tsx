import { memo } from "react";
import Circle from "lucide-react/dist/esm/icons/circle";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import type { TodoItem } from "../types";

interface TodoListProps {
  todos: TodoItem[];
}

const STATUS_ICON = {
  pending: Circle,
  in_progress: Loader2,
  completed: CheckCircle2,
} as const;

export const TodoList = memo(function TodoList({ todos }: TodoListProps) {
  if (todos.length === 0) {
    return <div className="sp-empty">暂无任务</div>;
  }
  return (
    <div className="sp-todo-list">
      {todos.map((todo, index) => {
        const Icon = STATUS_ICON[todo.status] ?? Circle;
        return (
          <div
            key={`${todo.content}-${index}`}
            className={`sp-todo-item sp-todo-${todo.status}`}
          >
            <span className="sp-todo-icon">
              <Icon size={14} />
            </span>
            <span className="sp-todo-text">{todo.content}</span>
          </div>
        );
      })}
    </div>
  );
});
