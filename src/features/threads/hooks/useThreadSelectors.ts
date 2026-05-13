import { useMemo } from "react";
import type { ConversationItem } from "../../../types";
import type { ThreadState } from "./useThreadsReducer";

const emptyConversationItems: ConversationItem[] = [];

type UseThreadSelectorsOptions = {
  activeWorkspaceId: string | null;
  activeThreadIdByWorkspace: ThreadState["activeThreadIdByWorkspace"];
  itemsByThread: ThreadState["itemsByThread"];
};

export function useThreadSelectors({
  activeWorkspaceId,
  activeThreadIdByWorkspace,
  itemsByThread,
}: UseThreadSelectorsOptions) {
  const activeThreadId = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }
    return activeThreadIdByWorkspace[activeWorkspaceId] ?? null;
  }, [activeThreadIdByWorkspace, activeWorkspaceId]);
  const activeThreadItems = activeThreadId
    ? itemsByThread[activeThreadId]
    : null;

  const activeItems = useMemo<ConversationItem[]>(
    () => activeThreadItems ?? emptyConversationItems,
    [activeThreadItems],
  );

  return useMemo(
    () => ({ activeThreadId, activeItems }),
    [activeItems, activeThreadId],
  );
}
