import type { ReactNode } from "react";

type MainTopbarProps = {
  leftNode: ReactNode;
  actionsNode?: ReactNode;
  className?: string;
};

export function MainTopbar({ leftNode, actionsNode, className }: MainTopbarProps) {
  const classNames = ["main-topbar", className].filter(Boolean).join(" ");
  return (
    <div className={classNames} data-tauri-drag-region>
      <div className="main-topbar-left">{leftNode}</div>
      <div className="actions">{actionsNode ?? null}</div>
    </div>
  );
}
