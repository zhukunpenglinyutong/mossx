import { useCallback, useMemo, useRef } from "react";
import type { DebugEntry } from "../../../types";
import { playNotificationSoundBySelection } from "../../../utils/notificationSounds";
import { useAppServerEvents } from "../../app/hooks/useAppServerEvents";

type SoundNotificationOptions = {
  enabled: boolean;
  soundId?: string | null;
  customSoundPath?: string | null;
  onDebug?: (entry: DebugEntry) => void;
};

function buildThreadKey(workspaceId: string, threadId: string) {
  return `${workspaceId}:${threadId}`;
}

export function useAgentSoundNotifications({
  enabled,
  soundId,
  customSoundPath,
  onDebug,
}: SoundNotificationOptions) {
  const lastPlayedAtByThread = useRef(new Map<string, number>());

  const playSound = useCallback(
    () => {
      playNotificationSoundBySelection({
        soundId,
        customSoundPath,
        label: "notification",
        onDebug,
      });
    },
    [customSoundPath, onDebug, soundId],
  );

  const shouldPlaySound = useCallback(
    (threadKey: string) => {
      if (!enabled) {
        return false;
      }
      const lastPlayedAt = lastPlayedAtByThread.current.get(threadKey);
      if (lastPlayedAt && Date.now() - lastPlayedAt < 1500) {
        return false;
      }
      lastPlayedAtByThread.current.set(threadKey, Date.now());
      return true;
    },
    [enabled],
  );

  const handleTurnCompleted = useCallback(
    (workspaceId: string, threadId: string) => {
      const threadKey = buildThreadKey(workspaceId, threadId);
      if (!shouldPlaySound(threadKey)) {
        return;
      }
      playSound();
    },
    [playSound, shouldPlaySound],
  );

  const handleAgentMessageCompleted = useCallback(
    (event: { workspaceId: string; threadId: string }) => {
      const threadKey = buildThreadKey(event.workspaceId, event.threadId);
      if (!shouldPlaySound(threadKey)) {
        return;
      }
      playSound();
    },
    [playSound, shouldPlaySound],
  );

  const handlers = useMemo(
    () => ({
      onTurnCompleted: handleTurnCompleted,
      onAgentMessageCompleted: handleAgentMessageCompleted,
    }),
    [
      handleAgentMessageCompleted,
      handleTurnCompleted,
    ],
  );

  useAppServerEvents(handlers);
}
