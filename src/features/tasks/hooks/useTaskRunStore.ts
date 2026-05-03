import { useEffect, useState } from "react";
import type { TaskRunStoreData } from "../types";
import { loadTaskRunStore } from "../utils/taskRunStorage";

const DEFAULT_REFRESH_INTERVAL_MS = 2_000;

function areTaskRunStoresEqual(left: TaskRunStoreData, right: TaskRunStoreData): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useTaskRunStore(options?: { refreshIntervalMs?: number }): TaskRunStoreData {
  const refreshIntervalMs = options?.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
  const [store, setStore] = useState<TaskRunStoreData>(() => loadTaskRunStore());

  useEffect(() => {
    const refresh = () => {
      const nextStore = loadTaskRunStore();
      setStore((currentStore) =>
        areTaskRunStoresEqual(currentStore, nextStore) ? currentStore : nextStore,
      );
    };

    refresh();

    if (refreshIntervalMs <= 0) {
      return undefined;
    }

    const intervalId = window.setInterval(refresh, refreshIntervalMs);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshIntervalMs]);

  return store;
}
