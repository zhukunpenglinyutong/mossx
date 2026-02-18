import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomCommandOption, DebugEntry } from "../../../types";
import { getClaudeCommandsList, getOpenCodeCommandsList } from "../../../services/tauri";
import type { EngineType } from "../../../types";

type UseCustomCommandsOptions = {
  onDebug?: (entry: DebugEntry) => void;
  activeEngine?: EngineType;
};

export function useCustomCommands({ onDebug, activeEngine }: UseCustomCommandsOptions) {
  const [commands, setCommands] = useState<CustomCommandOption[]>([]);
  const inFlight = useRef(false);

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

  const refreshCommands = useCallback(async () => {
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
      const response =
        activeEngine === "opencode"
          ? await getOpenCodeCommandsList()
          : await getClaudeCommandsList();
      onDebug?.({
        id: `${Date.now()}-server-commands-list`,
        timestamp: Date.now(),
        source: "server",
        label: "commands/list response",
        payload: response,
      });
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
      const data: CustomCommandOption[] = rawCommands
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

          return {
            name: normalizedName,
            path: String(item.path ?? ""),
            description: item.description ? String(item.description) : undefined,
            argumentHint,
            content: String(item.content ?? ""),
          };
        })
        .filter((entry) => entry.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      setCommands(data);
    } catch (error) {
      logCommandError("client-commands-list-error", "commands/list error", error);
    } finally {
      inFlight.current = false;
    }
  }, [activeEngine, logCommandError, onDebug]);

  useEffect(() => {
    refreshCommands();
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
