import { useEffect, useRef } from 'react';
import { createTextFragment } from '../utils/selectionUtils.js';
import { insertFilePathReferences } from '../utils/filePathReferences.js';

interface UseGlobalCallbacksOptions {
  editableRef: React.RefObject<HTMLDivElement | null>;
  pathMappingRef: React.MutableRefObject<Map<string, string>>;
  getTextContent: () => string;
  adjustHeight: () => void;
  renderFileTags: () => void;
  setHasContent: (hasContent: boolean) => void;
  onInput?: (content: string) => void;
  fileCompletion: { close: () => void };
  commandCompletion: { close: () => void };
  focusInput: () => void;
}

/**
 * useGlobalCallbacks - Register global callback functions for Java interop
 *
 * Registers window functions that Java can call to:
 * - Insert file paths into the input
 * - Insert code snippets at cursor position
 */
export function useGlobalCallbacks({
  editableRef,
  pathMappingRef,
  getTextContent,
  adjustHeight,
  renderFileTags,
  setHasContent,
  onInput,
  fileCompletion,
  commandCompletion,
  focusInput,
}: UseGlobalCallbacksOptions): void {
  const hasAutoFocusedRef = useRef(false);

  // Register global function to receive file path from Java
  useEffect(() => {
    window.handleFilePathFromJava = (filePathInput: string | string[]) => {
      if (!editableRef.current) return;

      // Normalize input to string array.
      // Java side (v0.1.9+) passes a JS array directly via executeJavaScript,
      // so Array.isArray branch is the primary path.
      // The string branch is kept for backward compatibility with older Java
      // versions that passed a single string. It can be removed once v0.1.8
      // support is no longer needed.
      let filePaths: string[];
      if (Array.isArray(filePathInput)) {
        filePaths = filePathInput;
      } else if (typeof filePathInput === 'string') {
        try {
          const parsed: unknown = JSON.parse(filePathInput);
          filePaths = Array.isArray(parsed) ? parsed : [filePathInput];
        } catch {
          filePaths = [filePathInput];
        }
      } else {
        return;
      }

      insertFilePathReferences({
        editableRef,
        pathMappingRef,
        filePaths,
        getTextContent,
        adjustHeight,
        renderFileTags,
        setHasContent,
        onInput,
        fileCompletion,
        commandCompletion,
      });
    };

    // Initial focus: run once only, and never steal focus while file-tree drag is active.
    if (!hasAutoFocusedRef.current && window.__fileTreeDragActive !== true) {
      const active = document.activeElement;
      const isOtherInputFocused = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable && active !== editableRef.current);
      if (!isOtherInputFocused) {
        focusInput();
      }
      hasAutoFocusedRef.current = true;
    }

    // Cleanup function
    return () => {
      delete window.handleFilePathFromJava;
    };
  }, [
    editableRef,
    pathMappingRef,
    getTextContent,
    adjustHeight,
    renderFileTags,
    setHasContent,
    onInput,
    fileCompletion,
    commandCompletion,
    focusInput,
  ]);

  // Register global method: insert code snippet at cursor position
  useEffect(() => {
    window.insertCodeSnippetAtCursor = (selectionInfo: string) => {
      if (!editableRef.current) return;

      // Ensure input box has focus
      editableRef.current.focus();

      // Insert text at cursor position
      const selection = window.getSelection();
      if (
        selection &&
        selection.rangeCount > 0 &&
        editableRef.current.contains(selection.anchorNode)
      ) {
        // Cursor inside input box, insert at cursor position
        const range = selection.getRangeAt(0);
        range.deleteContents();
        // Use <br> elements for newlines to ensure proper ArrowUp/Down cursor navigation
        const fragment = createTextFragment(selectionInfo + ' ');
        const lastChild = fragment.lastChild;
        range.insertNode(fragment);

        // Move cursor after inserted content
        if (lastChild) {
          range.setStartAfter(lastChild);
        }
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        // Cursor not inside input box, append to end
        const fragment = createTextFragment(selectionInfo + ' ');
        const lastChild = fragment.lastChild;
        editableRef.current.appendChild(fragment);

        // Move cursor to end
        if (lastChild) {
          const range = document.createRange();
          range.setStartAfter(lastChild);
          range.collapse(true);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }

      // Trigger state update
      const newText = getTextContent();
      setHasContent(!!newText.trim());
      adjustHeight();
      onInput?.(newText);

      // Immediately render file tags
      setTimeout(() => {
        renderFileTags();
        // Re-focus after rendering
        editableRef.current?.focus();
      }, 50);
    };

    return () => {
      delete window.insertCodeSnippetAtCursor;
    };
  }, [editableRef, getTextContent, renderFileTags, adjustHeight, onInput, setHasContent]);
}
