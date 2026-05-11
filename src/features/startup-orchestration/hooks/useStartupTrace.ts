import { useSyncExternalStore } from "react";
import {
  getStartupTraceSnapshot,
  subscribeStartupTrace,
} from "../utils/startupTrace";

export function useStartupTraceSnapshot() {
  return useSyncExternalStore(
    subscribeStartupTrace,
    getStartupTraceSnapshot,
    getStartupTraceSnapshot,
  );
}
