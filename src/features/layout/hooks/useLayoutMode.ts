import { useEffect, useState } from "react";

export type LayoutMode = "desktop" | "tablet" | "phone";

const TABLET_MAX_WIDTH = 1100;
const PHONE_MAX_WIDTH = 520;

function getLayoutMode(width: number): LayoutMode {
  if (width <= PHONE_MAX_WIDTH) {
    return "phone";
  }
  if (width <= TABLET_MAX_WIDTH) {
    return "tablet";
  }
  return "desktop";
}

export function useLayoutMode() {
  const [mode, setMode] = useState<LayoutMode>(() =>
    getLayoutMode(window.innerWidth),
  );

  useEffect(() => {
    function handleResize() {
      setMode(getLayoutMode(window.innerWidth));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return mode;
}
