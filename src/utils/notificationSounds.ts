import { convertFileSrc } from "@tauri-apps/api/core";
import bellSoundUrl from "../assets/sounds/bell.wav";
import chimeSoundUrl from "../assets/sounds/chime.wav";
import dingSoundUrl from "../assets/sounds/ding.wav";
import defaultSoundUrl from "../assets/sounds/success.wav";
import successSoundUrl from "../assets/sounds/task-complete.wav";
import type { DebugEntry } from "../types";

type DebugLogger = (entry: DebugEntry) => void;

export type NotificationSoundId =
  | "default"
  | "chime"
  | "bell"
  | "ding"
  | "success"
  | "custom";

type NotificationSoundLabel = "notification" | "test";

type PlayNotificationSoundBySelectionParams = {
  soundId?: string | null;
  customSoundPath?: string | null;
  label: NotificationSoundLabel;
  onDebug?: DebugLogger;
};

const CUSTOM_SOUND_FILE_PATTERN = /\.(wav|mp3|aiff)$/i;

const BUILTIN_SOUND_URLS: Record<Exclude<NotificationSoundId, "custom">, string> = {
  default: defaultSoundUrl,
  chime: chimeSoundUrl,
  bell: bellSoundUrl,
  ding: dingSoundUrl,
  success: successSoundUrl,
};

const KNOWN_NOTIFICATION_SOUND_IDS = new Set<NotificationSoundId>([
  "default",
  "chime",
  "bell",
  "ding",
  "success",
  "custom",
]);

const resolveSoundId = (soundId?: string | null): NotificationSoundId => {
  if (!soundId) {
    return "default";
  }
  return KNOWN_NOTIFICATION_SOUND_IDS.has(soundId as NotificationSoundId)
    ? (soundId as NotificationSoundId)
    : "default";
};

const resolveCustomSoundUrl = (customSoundPath?: string | null): string | null => {
  const rawPath = customSoundPath?.trim() ?? "";
  if (!rawPath) {
    return null;
  }
  const normalizedPath =
    rawPath.length >= 2 && rawPath.startsWith("\"") && rawPath.endsWith("\"")
      ? rawPath.slice(1, -1).trim()
      : rawPath;
  if (!normalizedPath) {
    return null;
  }
  if (/^(https?:\/\/|asset:\/\/|blob:|data:|file:\/\/)/i.test(normalizedPath)) {
    return normalizedPath;
  }
  if (!CUSTOM_SOUND_FILE_PATTERN.test(normalizedPath)) {
    return null;
  }
  return convertFileSrc(normalizedPath);
};

const playNotificationAudioUrl = (
  url: string,
  label: NotificationSoundLabel,
  onDebug?: DebugLogger,
) => {
  try {
    const audio = new Audio(url);
    audio.volume = 0.12;
    audio.preload = "auto";
    audio.addEventListener("error", () => {
      onDebug?.({
        id: `${Date.now()}-audio-${label}-load-error`,
        timestamp: Date.now(),
        source: "error",
        label: `audio/${label} load error`,
        payload: `Failed to load audio: ${url}`,
      });
    });
    void audio.play().catch((error) => {
      onDebug?.({
        id: `${Date.now()}-audio-${label}-play-error`,
        timestamp: Date.now(),
        source: "error",
        label: `audio/${label} play error`,
        payload: error instanceof Error ? error.message : String(error),
      });
    });
  } catch (error) {
    onDebug?.({
      id: `${Date.now()}-audio-${label}-init-error`,
      timestamp: Date.now(),
      source: "error",
      label: `audio/${label} init error`,
      payload: error instanceof Error ? error.message : String(error),
    });
  }
};

export function playNotificationSoundBySelection({
  soundId,
  customSoundPath,
  label,
  onDebug,
}: PlayNotificationSoundBySelectionParams) {
  const resolvedSoundId = resolveSoundId(soundId);
  if (resolvedSoundId === "custom") {
    const customUrl = resolveCustomSoundUrl(customSoundPath);
    if (customUrl) {
      playNotificationAudioUrl(customUrl, label, onDebug);
      return;
    }
    onDebug?.({
      id: `${Date.now()}-audio-${label}-custom-path-invalid`,
      timestamp: Date.now(),
      source: "error",
      label: `audio/${label} custom path invalid`,
      payload: customSoundPath ?? "",
    });
    playNotificationAudioUrl(BUILTIN_SOUND_URLS.default, label, onDebug);
    return;
  }
  playNotificationAudioUrl(BUILTIN_SOUND_URLS[resolvedSoundId], label, onDebug);
}
