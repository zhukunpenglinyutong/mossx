import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "composerTextareaHeight";
const DEFAULT_HEIGHT = 80;

export function useComposerEditorState() {
  const [textareaHeight, setTextareaHeight] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_HEIGHT;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= 60 && parsed <= 400) {
          return parsed;
        }
      }
      return DEFAULT_HEIGHT;
    } catch {
      return DEFAULT_HEIGHT;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(textareaHeight));
    } catch {
      // Ignore storage failures.
    }
  }, [textareaHeight]);

  const handleHeightChange = useCallback((height: number) => {
    setTextareaHeight(height);
  }, []);

  return { textareaHeight, onTextareaHeightChange: handleHeightChange };
}
