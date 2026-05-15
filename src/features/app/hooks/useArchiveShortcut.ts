import { useEffect } from "react";
import {
  isEditableShortcutTarget,
  matchesShortcutForPlatform,
} from "../../../utils/shortcuts";
import { registerKeydownHandler } from "./keyboardDispatcher";

type UseArchiveShortcutOptions = {
  isEnabled: boolean;
  shortcut: string | null;
  onTrigger: () => void;
};

export function useArchiveShortcut({
  isEnabled,
  shortcut,
  onTrigger,
}: UseArchiveShortcutOptions) {
  useEffect(() => {
    if (!isEnabled || !shortcut) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) {
        return;
      }
      if (
        isEditableShortcutTarget(event.target) ||
        isEditableShortcutTarget(document.activeElement)
      ) {
        return;
      }
      if (!matchesShortcutForPlatform(event, shortcut)) {
        return;
      }
      event.preventDefault();
      onTrigger();
    };
    return registerKeydownHandler(handleKeyDown);
  }, [isEnabled, onTrigger, shortcut]);
}
