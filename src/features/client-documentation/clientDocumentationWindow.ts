import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isMacPlatform } from "../../utils/platform";
import {
  CLIENT_DOCUMENTATION_WINDOW_LABEL,
  CLIENT_DOCUMENTATION_WINDOW_TITLE,
} from "./clientDocumentationData";

const CLIENT_DOCUMENTATION_CREATE_TIMEOUT_MS = 4_000;
let pendingClientDocumentationWindowOpen: Promise<"created" | "focused"> | null = null;

function normalizeWindowErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return JSON.stringify(payload ?? "unknown error");
}

export async function hasClientDocumentationWindow(): Promise<boolean> {
  const existing = await WebviewWindow.getByLabel(CLIENT_DOCUMENTATION_WINDOW_LABEL);
  return existing !== null;
}

async function createOrFocusClientDocumentationWindow(): Promise<"created" | "focused"> {
  const existing = await WebviewWindow.getByLabel(CLIENT_DOCUMENTATION_WINDOW_LABEL);
  if (existing) {
    await existing.show().catch(() => {});
    await existing.setFocus().catch(() => {});
    await existing.setTitle(CLIENT_DOCUMENTATION_WINDOW_TITLE).catch(() => {});
    return "focused";
  }

  const rootUrl = new URL("/", window.location.href).toString();
  const documentationWindow = new WebviewWindow(CLIENT_DOCUMENTATION_WINDOW_LABEL, {
    url: rootUrl,
    title: CLIENT_DOCUMENTATION_WINDOW_TITLE,
    width: 1180,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    center: true,
    resizable: true,
    focus: true,
    ...(isMacPlatform()
      ? {
          titleBarStyle: "overlay",
          hiddenTitle: true,
          transparent: false,
        }
      : {}),
  });

  return await new Promise<"created">((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = globalThis.setTimeout(() => {
      settle(() => {
        reject(new Error("Timed out while opening client documentation"));
      });
    }, CLIENT_DOCUMENTATION_CREATE_TIMEOUT_MS);

    documentationWindow.once("tauri://error", (event) => {
      const message = normalizeWindowErrorMessage(event.payload);
      console.error("[client-documentation] create window failed", message);
      settle(() => {
        reject(new Error(message));
      });
    });

    documentationWindow.once("tauri://created", () => {
      void (async () => {
        await documentationWindow.setFocus().catch(() => {});
        settle(() => {
          resolve("created");
        });
      })();
    });
  });
}

export async function openOrFocusClientDocumentationWindow(): Promise<"created" | "focused"> {
  if (pendingClientDocumentationWindowOpen) {
    return pendingClientDocumentationWindowOpen;
  }

  pendingClientDocumentationWindowOpen = createOrFocusClientDocumentationWindow().finally(() => {
    pendingClientDocumentationWindowOpen = null;
  });
  return pendingClientDocumentationWindowOpen;
}
