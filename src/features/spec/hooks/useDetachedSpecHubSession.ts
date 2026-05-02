import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  DETACHED_SPEC_HUB_SESSION_EVENT,
  type DetachedSpecHubSession,
  normalizeDetachedSpecHubSession,
  readDetachedSpecHubSessionSnapshot,
  writeDetachedSpecHubSessionSnapshot,
} from "../detachedSpecHub";

export function useDetachedSpecHubSession() {
  const [session, setSession] = useState<DetachedSpecHubSession | null>(() =>
    readDetachedSpecHubSessionSnapshot(),
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    try {
      const currentWindow = getCurrentWindow();
      currentWindow
        .listen<DetachedSpecHubSession>(DETACHED_SPEC_HUB_SESSION_EVENT, (event) => {
          const nextSession = normalizeDetachedSpecHubSession(event.payload);
          if (!nextSession) {
            return;
          }
          writeDetachedSpecHubSessionSnapshot(nextSession);
          setSession(nextSession);
        })
        .then((handler) => {
          unlisten = handler;
        })
        .catch(() => {});
    } catch {
      // Non-Tauri test environments fall back to the persisted snapshot only.
    }

    return () => {
      unlisten?.();
    };
  }, []);

  return session;
}
