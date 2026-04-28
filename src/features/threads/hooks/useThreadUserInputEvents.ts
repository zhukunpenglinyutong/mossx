import { useCallback, useRef } from "react";
import type { Dispatch } from "react";
import type { RequestUserInputRequest } from "../../../types";
import type { ThreadAction } from "./useThreadsReducer";

type UseThreadUserInputEventsOptions = {
  dispatch: Dispatch<ThreadAction>;
  resolveClaudeContinuationThreadId?: (
    workspaceId: string,
    threadId: string,
    turnId?: string | null,
  ) => string | null;
};

export function useThreadUserInputEvents({
  dispatch,
  resolveClaudeContinuationThreadId,
}: UseThreadUserInputEventsOptions) {
  const completedRequestKeysRef = useRef<Set<string>>(new Set());

  return useCallback(
    (request: RequestUserInputRequest) => {
      const requestKey = `${request.workspace_id}:${String(request.request_id)}`;
      if (request.params.completed === true) {
        completedRequestKeysRef.current.add(requestKey);
        if (completedRequestKeysRef.current.size > 2048) {
          completedRequestKeysRef.current.clear();
          completedRequestKeysRef.current.add(requestKey);
        }
        dispatch({
          type: "removeUserInputRequest",
          requestId: request.request_id,
          workspaceId: request.workspace_id,
        });
        return;
      }
      if (completedRequestKeysRef.current.has(requestKey)) {
        return;
      }
      const canonicalThreadId =
        resolveClaudeContinuationThreadId?.(
          request.workspace_id,
          request.params.thread_id,
          request.params.turn_id,
        ) ?? request.params.thread_id;
      const normalizedRequest =
        canonicalThreadId !== request.params.thread_id
          ? {
              ...request,
              params: {
                ...request.params,
                thread_id: canonicalThreadId,
              },
            }
          : request;
      dispatch({ type: "addUserInputRequest", request: normalizedRequest });
    },
    [dispatch, resolveClaudeContinuationThreadId],
  );
}
