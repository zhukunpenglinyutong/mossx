import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

type UseComposerInsertArgs = {
  activeThreadId: string | null;
  draftText: string;
  onDraftChange: (next: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export function useComposerInsert({
  activeThreadId,
  draftText,
  onDraftChange,
  textareaRef,
}: UseComposerInsertArgs) {
  const latestTextRef = useRef(draftText ?? "");
  const latestSelectionRef = useRef<number | null>(null);

  useEffect(() => {
    latestTextRef.current = draftText ?? "";
  }, [draftText]);

  return useCallback(
    (insertText: string) => {
      if (!activeThreadId) {
        return;
      }
      const textarea = textareaRef.current;
      const currentText = latestTextRef.current;
      const isTextareaActive =
        textarea !== null &&
        typeof document !== "undefined" &&
        document.activeElement === textarea;
      const hasLiveSelection =
        isTextareaActive &&
        typeof textarea.selectionStart === "number" &&
        typeof textarea.selectionEnd === "number";
      const start = hasLiveSelection
        ? textarea.selectionStart
        : latestSelectionRef.current ?? currentText.length;
      const end = hasLiveSelection ? textarea.selectionEnd : start;
      const before = currentText.slice(0, start);
      const after = currentText.slice(end);
      const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
      const needsSpaceAfter = after.length > 0 && !/^\s/.test(after);
      const prefix = needsSpaceBefore ? " " : "";
      const suffix = needsSpaceAfter ? " " : "";
      const nextText = `${before}${prefix}${insertText}${suffix}${after}`;
      const cursor =
        before.length +
        prefix.length +
        insertText.length +
        (needsSpaceAfter ? 1 : 0);
      const safeCursor = Math.min(cursor, nextText.length);
      latestTextRef.current = nextText;
      latestSelectionRef.current = safeCursor;
      onDraftChange(nextText);
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) {
          return;
        }
        node.focus();
        const nextCursor = Math.min(safeCursor, node.value.length);
        node.setSelectionRange(nextCursor, nextCursor);
        latestSelectionRef.current = nextCursor;
        node.dispatchEvent(new Event("select", { bubbles: true }));
      });
    },
    [activeThreadId, onDraftChange, textareaRef],
  );
}
