import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomCommandOption, DebugEntry } from "../../../types";
import { getClaudeCommandsList, getOpenCodeCommandsList } from "../../../services/tauri";
import type { EngineType } from "../../../types";
import { startupOrchestrator } from "../../startup-orchestration/utils/startupOrchestrator";

type UseCustomCommandsOptions = {
  onDebug?: (entry: DebugEntry) => void;
  activeEngine?: EngineType;
  workspaceId?: string | null;
};

const EMPTY_CLAUDE_COMMANDS_RETRY_COOLDOWN_MS = 15_000;

type CommandRefreshPhase = "idle-prewarm" | "on-demand";

function normalizeCommandsPayload(response: unknown): CustomCommandOption[] {
  const responsePayload = response as any;
  let rawCommands: any[] = [];
  if (Array.isArray(response)) {
    rawCommands = response;
  } else if (Array.isArray(responsePayload?.commands)) {
    rawCommands = responsePayload.commands;
  } else if (Array.isArray(responsePayload?.result?.commands)) {
    rawCommands = responsePayload.result.commands;
  } else if (Array.isArray(responsePayload?.result)) {
    rawCommands = responsePayload.result;
  }
  return rawCommands
    .map((item: any) => {
      let argumentHint: string | undefined;
      if (item.argumentHint) {
        argumentHint = String(item.argumentHint);
      } else if (item.argument_hint) {
        argumentHint = String(item.argument_hint);
      }

      const rawName = String(item.name ?? "");
      const trimmedName = rawName.trim();
      const normalizedName = trimmedName.startsWith("/")
        ? trimmedName.slice(1)
        : trimmedName;
      const source = item.source ? String(item.source) : undefined;

      return {
        name: normalizedName,
        path: String(item.path ?? ""),
        description: item.description ? String(item.description) : undefined,
        argumentHint,
        content: String(item.content ?? ""),
        ...(source ? { source } : {}),
      };
    })
    .filter((entry) => entry.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useCustomCommands({
  onDebug,
  activeEngine,
  workspaceId = null,
}: UseCustomCommandsOptions) {
  const [commands, setCommands] = useState<CustomCommandOption[]>([]);
  const inFlight = useRef(false);
  const lastEmptyBurstByWorkspaceRef = useRef<Map<string, number>>(new Map());

  const logCommandError = useCallback(
    (idSuffix: string, label: string, error: unknown) => {
      const timestamp = Date.now();
      onDebug?.({
        id: `${timestamp}-${idSuffix}`,
        timestamp,
        source: "error",
        label,
        payload: error instanceof Error ? error.message : String(error),
      });
    },
    [onDebug],
  );

  const refreshCommands = useCallback(async (phase: CommandRefreshPhase = "on-demand") => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    onDebug?.({
      id: `${Date.now()}-client-commands-list`,
      timestamp: Date.now(),
      source: "client",
      label: "commands/list",
      payload: {},
    });
    try {
      const isOpenCode = activeEngine === "opencode";
      const commandLabel = isOpenCode ? "opencode_commands_list" : "claude_commands_list";
      const workspaceScope = workspaceId ? { workspaceId } : "global";
      const data = await startupOrchestrator.run<CustomCommandOption[]>({
        id: `${commandLabel}:${workspaceId ?? "global"}`,
        phase,
        priority: phase === "on-demand" ? 80 : 25,
        dedupeKey: `${commandLabel}:${workspaceId ?? "global"}`,
        concurrencyKey: "catalog",
        timeoutMs: 5_000,
        workspaceScope,
        cancelPolicy: workspaceId ? "soft-ignore" : "yield-only",
        traceLabel: "commands/list",
        commandLabel,
        run: async () => {
          const response = isOpenCode
            ? await getOpenCodeCommandsList()
            : await getClaudeCommandsList(workspaceId);
          onDebug?.({
            id: `${Date.now()}-server-commands-list`,
            timestamp: Date.now(),
            source: "server",
            label: "commands/list response",
            payload: response,
          });
          let data = normalizeCommandsPayload(response);
          if (
            activeEngine !== "opencode"
            && workspaceId
            && data.length === 0
          ) {
            const now = Date.now();
            const lastBurstAt = lastEmptyBurstByWorkspaceRef.current.get(workspaceId) ?? 0;
            const canRetryBurst =
              now - lastBurstAt >= EMPTY_CLAUDE_COMMANDS_RETRY_COOLDOWN_MS;

            if (canRetryBurst) {
              lastEmptyBurstByWorkspaceRef.current.set(workspaceId, now);
              const retryResponse = await getClaudeCommandsList(workspaceId);
              onDebug?.({
                id: `${Date.now()}-server-commands-list-retry`,
                timestamp: Date.now(),
                source: "server",
                label: "commands/list retry response",
                payload: retryResponse,
              });
              data = normalizeCommandsPayload(retryResponse);

              if (data.length === 0) {
                const globalFallbackResponse = await getClaudeCommandsList(null);
                onDebug?.({
                  id: `${Date.now()}-server-commands-list-global-fallback`,
                  timestamp: Date.now(),
                  source: "server",
                  label: "commands/list global fallback response",
                  payload: globalFallbackResponse,
                });
                data = normalizeCommandsPayload(globalFallbackResponse);
              }
            } else {
              onDebug?.({
                id: `${Date.now()}-server-commands-list-retry-skipped`,
                timestamp: Date.now(),
                source: "client",
                label: "commands/list retry skipped by cooldown",
                payload: {
                  workspaceId,
                  cooldownMs: EMPTY_CLAUDE_COMMANDS_RETRY_COOLDOWN_MS,
                  elapsedMs: now - lastBurstAt,
                },
              });
            }
          }
          return data;
        },
        fallback: () => [],
      });
      if (workspaceId && data.length > 0) {
        lastEmptyBurstByWorkspaceRef.current.delete(workspaceId);
      }
      setCommands(data);
    } catch (error) {
      logCommandError("client-commands-list-error", "commands/list error", error);
    } finally {
      inFlight.current = false;
    }
  }, [activeEngine, logCommandError, onDebug, workspaceId]);

  useEffect(() => {
    refreshCommands("idle-prewarm");
  }, [refreshCommands]);

  const commandOptions = useMemo(
    () => commands.filter((command) => command.name),
    [commands],
  );

  return {
    commands: commandOptions,
    refreshCommands,
  };
}
