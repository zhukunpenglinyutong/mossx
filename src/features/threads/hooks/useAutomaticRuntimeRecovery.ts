import { useCallback, useRef } from "react";

const AUTOMATIC_RUNTIME_RECOVERY_COOLDOWN_MS = 1_500;

export type AutomaticRuntimeRecoverySource =
  | "thread-list-live"
  | "workspace-restore"
  | "focus-refresh"
  | "web-service-reconnected";

type AutomaticRuntimeRecoveryGuardState = "leader" | "waiter" | "cooldown";

type AutomaticRuntimeRecoveryGuardEntry = {
  promise: Promise<void> | null;
  cooldownUntilMs: number;
  lastSource: AutomaticRuntimeRecoverySource | null;
  lastState: AutomaticRuntimeRecoveryGuardState | null;
};

export function useAutomaticRuntimeRecovery(
  connectWorkspace: (workspaceId: string, recoverySource?: string) => Promise<void>,
) {
  const automaticRuntimeRecoveryRef = useRef<
    Record<string, AutomaticRuntimeRecoveryGuardEntry>
  >({});

  const getAutomaticRuntimeRecoveryEntry = useCallback(
    (workspaceId: string): AutomaticRuntimeRecoveryGuardEntry => {
      const existing = automaticRuntimeRecoveryRef.current[workspaceId];
      if (existing) {
        return existing;
      }
      const created: AutomaticRuntimeRecoveryGuardEntry = {
        promise: null,
        cooldownUntilMs: 0,
        lastSource: null,
        lastState: null,
      };
      automaticRuntimeRecoveryRef.current[workspaceId] = created;
      return created;
    },
    [],
  );

  const getAutomaticRuntimeRecoveryPartialSource = useCallback(
    (workspaceId: string): string | null => {
      const entry = automaticRuntimeRecoveryRef.current[workspaceId];
      if (!entry) {
        return null;
      }
      if (entry.promise) {
        return "startup-pending";
      }
      if (entry.cooldownUntilMs > Date.now()) {
        return "automatic-recovery-cooldown";
      }
      return null;
    },
    [],
  );

  const beginAutomaticRuntimeRecovery = useCallback(
    (
      workspaceId: string,
      source: AutomaticRuntimeRecoverySource,
    ):
      | { kind: "leader"; promise: Promise<void> }
      | { kind: "waiter" }
      | { kind: "cooldown" } => {
      const entry = getAutomaticRuntimeRecoveryEntry(workspaceId);
      const now = Date.now();
      if (entry.promise) {
        entry.lastSource = source;
        entry.lastState = "waiter";
        return { kind: "waiter" };
      }
      if (entry.cooldownUntilMs > now) {
        entry.lastSource = source;
        entry.lastState = "cooldown";
        return { kind: "cooldown" };
      }
      const promise = connectWorkspace(workspaceId, source).finally(() => {
        const current = automaticRuntimeRecoveryRef.current[workspaceId];
        if (!current || current.promise !== promise) {
          return;
        }
        current.promise = null;
        current.cooldownUntilMs = Date.now() + AUTOMATIC_RUNTIME_RECOVERY_COOLDOWN_MS;
        current.lastSource = source;
        current.lastState = "cooldown";
      });
      entry.promise = promise;
      entry.cooldownUntilMs = 0;
      entry.lastSource = source;
      entry.lastState = "leader";
      return { kind: "leader", promise };
    },
    [connectWorkspace, getAutomaticRuntimeRecoveryEntry],
  );

  return {
    beginAutomaticRuntimeRecovery,
    getAutomaticRuntimeRecoveryPartialSource,
  };
}
