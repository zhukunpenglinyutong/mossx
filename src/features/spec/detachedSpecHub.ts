import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getClientStoreSync, writeClientStoreValue } from "../../services/clientStorage";
import { isMacPlatform } from "../../utils/platform";

export const DETACHED_SPEC_HUB_WINDOW_LABEL = "spec-hub";
export const DETACHED_SPEC_HUB_SESSION_EVENT = "detached-spec-hub:session";
export const DETACHED_SPEC_HUB_SESSION_STORAGE_KEY = "detachedSpecHubSession";
const DETACHED_SPEC_HUB_CREATE_TIMEOUT_MS = 4_000;

export type DetachedSpecHubArtifactType =
  | "proposal"
  | "design"
  | "specs"
  | "tasks"
  | "verification";

export type DetachedSpecHubSession = {
  workspaceId: string;
  workspaceName: string;
  files: string[];
  directories: string[];
  changeId?: string | null;
  artifactType?: DetachedSpecHubArtifactType | null;
  specSourcePath?: string | null;
  updatedAt: number;
};

const DETACHED_SPEC_HUB_ARTIFACT_TYPES = new Set<DetachedSpecHubArtifactType>([
  "proposal",
  "design",
  "specs",
  "tasks",
  "verification",
]);

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean);
}

function normalizeArtifactType(value: unknown): DetachedSpecHubArtifactType | null {
  return typeof value === "string" && DETACHED_SPEC_HUB_ARTIFACT_TYPES.has(value as DetachedSpecHubArtifactType)
    ? (value as DetachedSpecHubArtifactType)
    : null;
}

export function normalizeDetachedSpecHubSession(value: unknown): DetachedSpecHubSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const workspaceId = normalizeString(candidate.workspaceId);
  const workspaceName = normalizeString(candidate.workspaceName);
  const files = normalizeStringArray(candidate.files);
  const directories = normalizeStringArray(candidate.directories);
  const changeId = normalizeString(candidate.changeId);
  const artifactType = normalizeArtifactType(candidate.artifactType);
  const specSourcePath = normalizeString(candidate.specSourcePath);
  const updatedAt =
    typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
      ? candidate.updatedAt
      : Date.now();
  if (!workspaceId || !workspaceName) {
    return null;
  }
  return {
    workspaceId,
    workspaceName,
    files,
    directories,
    changeId: changeId || null,
    artifactType,
    specSourcePath: specSourcePath || null,
    updatedAt,
  };
}

export function buildDetachedSpecHubSession(input: {
  workspaceId: string;
  workspaceName: string;
  files: string[];
  directories: string[];
  changeId?: string | null;
  artifactType?: DetachedSpecHubArtifactType | null;
  specSourcePath?: string | null;
}): DetachedSpecHubSession {
  return {
    workspaceId: input.workspaceId.trim(),
    workspaceName: input.workspaceName.trim(),
    files: normalizeStringArray(input.files),
    directories: normalizeStringArray(input.directories),
    changeId: normalizeString(input.changeId) || null,
    artifactType: normalizeArtifactType(input.artifactType),
    specSourcePath: normalizeString(input.specSourcePath) || null,
    updatedAt: Date.now(),
  };
}

export function readDetachedSpecHubSessionSnapshot(): DetachedSpecHubSession | null {
  return normalizeDetachedSpecHubSession(
    getClientStoreSync("app", DETACHED_SPEC_HUB_SESSION_STORAGE_KEY),
  );
}

export function writeDetachedSpecHubSessionSnapshot(session: DetachedSpecHubSession): void {
  writeClientStoreValue("app", DETACHED_SPEC_HUB_SESSION_STORAGE_KEY, session, {
    immediate: true,
  });
}

export function buildDetachedSpecHubWindowTitle(
  session: Pick<DetachedSpecHubSession, "workspaceName">,
): string {
  return `${session.workspaceName} · Spec Hub`;
}

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

export async function hasDetachedSpecHubWindow(): Promise<boolean> {
  const existing = await WebviewWindow.getByLabel(DETACHED_SPEC_HUB_WINDOW_LABEL);
  return existing !== null;
}

export async function openOrFocusDetachedSpecHub(
  session: DetachedSpecHubSession,
): Promise<"created" | "focused"> {
  writeDetachedSpecHubSessionSnapshot(session);
  const existing = await WebviewWindow.getByLabel(DETACHED_SPEC_HUB_WINDOW_LABEL);
  if (existing) {
    await existing.show().catch(() => {});
    await existing.setFocus().catch(() => {});
    await existing.setTitle(buildDetachedSpecHubWindowTitle(session)).catch(() => {});
    await emitTo(
      DETACHED_SPEC_HUB_WINDOW_LABEL,
      DETACHED_SPEC_HUB_SESSION_EVENT,
      session,
    ).catch(() => {});
    return "focused";
  }

  const rootUrl = new URL("/", window.location.href).toString();
  const detachedWindow = new WebviewWindow(DETACHED_SPEC_HUB_WINDOW_LABEL, {
    url: rootUrl,
    title: buildDetachedSpecHubWindowTitle(session),
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
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
        reject(new Error("Timed out while opening detached Spec Hub"));
      });
    }, DETACHED_SPEC_HUB_CREATE_TIMEOUT_MS);

    detachedWindow.once("tauri://error", (event) => {
      const message = normalizeWindowErrorMessage(event.payload);
      console.error("[detached-spec-hub] create window failed", message);
      settle(() => {
        reject(new Error(message));
      });
    });

    detachedWindow.once("tauri://created", () => {
      void (async () => {
        await emitTo(
          DETACHED_SPEC_HUB_WINDOW_LABEL,
          DETACHED_SPEC_HUB_SESSION_EVENT,
          session,
        ).catch(() => {});
        await detachedWindow.setFocus().catch(() => {});
        settle(() => {
          resolve("created");
        });
      })();
    });
  });
}
