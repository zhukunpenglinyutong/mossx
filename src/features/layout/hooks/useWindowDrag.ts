import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useWindowDrag(targetId: string) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) {
      return;
    }

    const handler = (event: MouseEvent) => {
      if (event.buttons !== 1) {
        return;
      }
      getCurrentWindow().startDragging();
    };

    el.addEventListener("mousedown", handler);
    return () => {
      el.removeEventListener("mousedown", handler);
    };
  }, [targetId]);
}
