import { useCallback, useEffect, useState } from "react";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";

const DEFAULT_HEIGHT = 80;
const MIN_HEIGHT = 20;
const MAX_HEIGHT = 400;

export function useComposerEditorState() {
  const [textareaHeight, setTextareaHeight] = useState(() => {
    const stored = getClientStoreSync<number>("composer", "textareaHeight");
    if (stored !== undefined && Number.isFinite(stored) && stored >= MIN_HEIGHT && stored <= MAX_HEIGHT) {
      return stored;
    }
    return DEFAULT_HEIGHT;
  });

  useEffect(() => {
    writeClientStoreValue("composer", "textareaHeight", textareaHeight);
  }, [textareaHeight]);

  const handleHeightChange = useCallback((height: number) => {
    setTextareaHeight(height);
  }, []);

  return { textareaHeight, onTextareaHeightChange: handleHeightChange };
}
