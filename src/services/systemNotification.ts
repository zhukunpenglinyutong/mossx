import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

let permissionCached: boolean | null = null;
let actionListenerRegistered = false;

type NotificationActionHandler = (extra: Record<string, unknown>) => void;
let actionHandler: NotificationActionHandler | null = null;

async function ensurePermission(): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }
  if (permissionCached !== null) {
    return permissionCached;
  }
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === "granted";
    }
    // Only cache positive results; denied permission can be changed in system settings
    if (granted) {
      permissionCached = granted;
    }
    return granted;
  } catch {
    return false;
  }
}

function registerActionListener() {
  if (actionListenerRegistered || !isTauri()) {
    return;
  }
  actionListenerRegistered = true;
  void onAction(async (notification) => {
    // Focus the main window when notification is clicked
    try {
      const window = getCurrentWindow();
      await window.show();
      await window.setFocus();
    } catch {
      // Ignore window focus errors
    }
    if (actionHandler && notification.extra) {
      actionHandler(notification.extra);
    }
  });
}

export function setNotificationActionHandler(handler: NotificationActionHandler) {
  actionHandler = handler;
}

export async function sendSystemNotification(options: {
  title: string;
  body: string;
  extra?: Record<string, unknown>;
}): Promise<void> {
  const granted = await ensurePermission();
  if (!granted) {
    return;
  }
  registerActionListener();
  try {
    sendNotification({
      title: options.title,
      body: options.body,
      extra: options.extra,
    });
  } catch {
    // Silently ignore notification failures
  }
}

// Reset module state on HMR to prevent stale listeners
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    permissionCached = null;
    actionListenerRegistered = false;
    actionHandler = null;
  });
}
