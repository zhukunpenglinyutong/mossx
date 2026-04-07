type PromptCreationScope = "workspace" | "global";

export type PromptCreationRequest = {
  scope: PromptCreationScope;
};

const CUSTOM_PROMPTS_CHANGED_EVENT = "mossx:custom-prompts-changed";
const PROMPT_CREATION_REQUEST_EVENT = "mossx:prompt-creation-request";

let pendingPromptCreationRequest: PromptCreationRequest | null = null;

export function dispatchCustomPromptsChanged(workspaceId: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(CUSTOM_PROMPTS_CHANGED_EVENT, {
      detail: { workspaceId },
    }),
  );
}

export function subscribeCustomPromptsChanged(
  listener: (workspaceId: string) => void,
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleEvent = (event: Event) => {
    const workspaceId =
      (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId ?? null;
    if (workspaceId) {
      listener(workspaceId);
    }
  };

  window.addEventListener(CUSTOM_PROMPTS_CHANGED_EVENT, handleEvent);
  return () => {
    window.removeEventListener(CUSTOM_PROMPTS_CHANGED_EVENT, handleEvent);
  };
}

export function requestPromptCreation(request: PromptCreationRequest) {
  pendingPromptCreationRequest = request;
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(PROMPT_CREATION_REQUEST_EVENT, {
      detail: request,
    }),
  );
}

export function consumePendingPromptCreationRequest() {
  const request = pendingPromptCreationRequest;
  pendingPromptCreationRequest = null;
  return request;
}

export function subscribePromptCreationRequests(
  listener: (request: PromptCreationRequest) => void,
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleEvent = (event: Event) => {
    const request =
      (event as CustomEvent<PromptCreationRequest | undefined>).detail ?? null;
    if (request) {
      listener(request);
    }
  };

  window.addEventListener(PROMPT_CREATION_REQUEST_EVENT, handleEvent);
  return () => {
    window.removeEventListener(PROMPT_CREATION_REQUEST_EVENT, handleEvent);
  };
}
