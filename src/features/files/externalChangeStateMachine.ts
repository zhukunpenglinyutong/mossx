export type ExternalChangeSyncState =
  | "in-sync"
  | "refreshing"
  | "external-changed-clean"
  | "external-changed-dirty";

export type ExternalChangeSyncEvent =
  | { type: "file-loaded" }
  | { type: "external-change-detected-clean" }
  | { type: "refresh-applied" }
  | { type: "external-change-detected-dirty" }
  | { type: "conflict-keep-local" }
  | { type: "conflict-reload" }
  | { type: "notice-cleared" };

export function reduceExternalChangeSyncState(
  current: ExternalChangeSyncState,
  event: ExternalChangeSyncEvent,
): ExternalChangeSyncState {
  switch (event.type) {
    case "file-loaded":
      return "in-sync";
    case "external-change-detected-clean":
      return "refreshing";
    case "refresh-applied":
      if (current === "refreshing" || current === "in-sync") {
        return "external-changed-clean";
      }
      return current;
    case "external-change-detected-dirty":
      return "external-changed-dirty";
    case "conflict-keep-local":
      if (current === "external-changed-dirty") {
        return "in-sync";
      }
      return current;
    case "conflict-reload":
      if (current === "external-changed-dirty") {
        return "external-changed-clean";
      }
      return current;
    case "notice-cleared":
      if (current === "external-changed-clean") {
        return "in-sync";
      }
      return current;
    default:
      return current;
  }
}
