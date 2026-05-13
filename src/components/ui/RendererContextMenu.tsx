import { useEffect, useRef } from "react";

export type RendererContextMenuItem =
  | {
      type: "item";
      id: string;
      label: string;
      disabled?: boolean;
      tone?: "default" | "danger";
      onSelect: () => void | Promise<void>;
    }
  | {
      type: "label";
      id: string;
      label: string;
    }
  | {
      type: "separator";
      id: string;
    };

export type RendererContextMenuState = {
  x: number;
  y: number;
  label: string;
  items: RendererContextMenuItem[];
};

type RendererContextMenuProps = {
  menu: RendererContextMenuState;
  onClose: () => void;
  className?: string;
};

export function RendererContextMenu({
  menu,
  onClose,
  className = "renderer-context-menu",
}: RendererContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const handleBlur = () => onClose();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
    };
  }, [onClose]);

  return (
    <div
      className="renderer-context-menu-backdrop"
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        className={className}
        role="menu"
        aria-label={menu.label}
        style={{ left: menu.x, top: menu.y }}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {menu.items.map((item) => {
          if (item.type === "separator") {
            return (
              <div
                key={item.id}
                className="renderer-context-menu-separator"
                aria-hidden
              />
            );
          }
          if (item.type === "label") {
            return (
              <div key={item.id} className="renderer-context-menu-label">
                {item.label}
              </div>
            );
          }
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`renderer-context-menu-item${
                item.tone === "danger" ? " is-danger" : ""
              }`}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) {
                  return;
                }
                onClose();
                void item.onSelect();
              }}
            >
              <span className="renderer-context-menu-item-label">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function clampRendererContextMenuPosition(
  x: number,
  y: number,
  options?: {
    width?: number;
    height?: number;
    padding?: number;
  },
) {
  const width = options?.width ?? 280;
  const height = options?.height ?? 420;
  const padding = options?.padding ?? 12;
  if (typeof window === "undefined") {
    return { x, y };
  }
  const maxX = Math.max(padding, window.innerWidth - width - padding);
  const maxY = Math.max(padding, window.innerHeight - height - padding);
  return {
    x: Math.min(Math.max(x, padding), maxX),
    y: Math.min(Math.max(y, padding), maxY),
  };
}
