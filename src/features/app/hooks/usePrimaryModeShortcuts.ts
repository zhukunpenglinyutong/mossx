import { useEffect } from "react";
import {
  isEditableShortcutTarget,
  matchesShortcutForPlatform,
} from "../../../utils/shortcuts";
import { registerKeydownHandler } from "./keyboardDispatcher";

type UsePrimaryModeShortcutsOptions = {
  isEnabled: boolean;
  openChatShortcut: string | null;
  openKanbanShortcut: string | null;
  onOpenChat: () => void;
  onOpenKanban: () => void;
};

export function usePrimaryModeShortcuts({
  isEnabled,
  openChatShortcut,
  openKanbanShortcut,
  onOpenChat,
  onOpenKanban,
}: UsePrimaryModeShortcutsOptions) {
  useEffect(() => {
    if (!isEnabled) {
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
      const matchesChatShortcut = matchesShortcutForPlatform(
        event,
        openChatShortcut,
      );
      const matchesKanbanShortcut = matchesShortcutForPlatform(
        event,
        openKanbanShortcut,
      );
      if (!matchesChatShortcut && !matchesKanbanShortcut) {
        return;
      }
      event.preventDefault();
      if (matchesChatShortcut) {
        onOpenChat();
        return;
      }
      onOpenKanban();
    };

    return registerKeydownHandler(handleKeyDown);
  }, [isEnabled, onOpenChat, onOpenKanban, openChatShortcut, openKanbanShortcut]);
}
