import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  MAX_PINS_SOFT_LIMIT,
  STORAGE_KEY_CUSTOM_NAMES,
  STORAGE_KEY_PINNED_THREADS,
  type CustomNamesMap,
  type PinnedThreadsMap,
  type ThreadActivityMap,
  loadCustomNames,
  loadPinnedThreads,
  loadThreadActivity,
  makeCustomNameKey,
  makePinKey,
  savePinnedThreads,
  saveThreadActivity,
} from "../utils/threadStorage";

export type UseThreadStorageResult = {
  customNamesRef: MutableRefObject<CustomNamesMap>;
  pinnedThreadsRef: MutableRefObject<PinnedThreadsMap>;
  threadActivityRef: MutableRefObject<ThreadActivityMap>;
  pinnedThreadsVersion: number;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  recordThreadActivity: (
    workspaceId: string,
    threadId: string,
    timestamp?: number,
  ) => void;
  pinThread: (workspaceId: string, threadId: string) => boolean;
  unpinThread: (workspaceId: string, threadId: string) => void;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  getPinTimestamp: (workspaceId: string, threadId: string) => number | null;
  markAutoTitlePending: (workspaceId: string, threadId: string) => void;
  clearAutoTitlePending: (workspaceId: string, threadId: string) => void;
  isAutoTitlePending: (workspaceId: string, threadId: string) => boolean;
  getAutoTitlePendingStartedAt: (
    workspaceId: string,
    threadId: string,
  ) => number | null;
  renameAutoTitlePendingKey: (
    workspaceId: string,
    oldThreadId: string,
    newThreadId: string,
  ) => void;
  autoTitlePendingVersion: number;
};

type AutoTitlePendingMap = Record<string, number>;

const AUTO_TITLE_PENDING_EXPIRE_MS = 20_000;

export function useThreadStorage(): UseThreadStorageResult {
  const threadActivityRef = useRef<ThreadActivityMap>(loadThreadActivity());
  const pinnedThreadsRef = useRef<PinnedThreadsMap>(loadPinnedThreads());
  const autoTitlePendingRef = useRef<AutoTitlePendingMap>({});
  const [pinnedThreadsVersion, setPinnedThreadsVersion] = useState(0);
  const [autoTitlePendingVersion, setAutoTitlePendingVersion] = useState(0);
  const customNamesRef = useRef<CustomNamesMap>({});

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    customNamesRef.current = loadCustomNames();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY_CUSTOM_NAMES) {
        customNamesRef.current = loadCustomNames();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const pending = autoTitlePendingRef.current;
      const keys = Object.keys(pending);
      if (keys.length === 0) {
        return;
      }
      const now = Date.now();
      const expired = keys.filter(
        (key) => now - pending[key] >= AUTO_TITLE_PENDING_EXPIRE_MS,
      );
      if (expired.length === 0) {
        return;
      }
      const next = { ...pending };
      for (const key of expired) {
        delete next[key];
      }
      autoTitlePendingRef.current = next;
      setAutoTitlePendingVersion((v) => v + 1);
    }, 5_000);
    return () => clearInterval(intervalId);
  }, []);

  const getCustomName = useCallback((workspaceId: string, threadId: string) => {
    const key = makeCustomNameKey(workspaceId, threadId);
    return customNamesRef.current[key];
  }, []);

  const recordThreadActivity = useCallback(
    (workspaceId: string, threadId: string, timestamp = Date.now()) => {
      const nextForWorkspace = {
        ...(threadActivityRef.current[workspaceId] ?? {}),
        [threadId]: timestamp,
      };
      const next = {
        ...threadActivityRef.current,
        [workspaceId]: nextForWorkspace,
      };
      threadActivityRef.current = next;
      saveThreadActivity(next);
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    pinnedThreadsRef.current = loadPinnedThreads();
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY_PINNED_THREADS) {
        return;
      }
      pinnedThreadsRef.current = loadPinnedThreads();
      setPinnedThreadsVersion((version) => version + 1);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const pinThread = useCallback((workspaceId: string, threadId: string): boolean => {
    const key = makePinKey(workspaceId, threadId);
    if (key in pinnedThreadsRef.current) {
      return false;
    }
    const currentPinsForWorkspace = Object.keys(pinnedThreadsRef.current).filter(
      (entry) => entry.startsWith(`${workspaceId}:`),
    ).length;
    if (currentPinsForWorkspace >= MAX_PINS_SOFT_LIMIT) {
      console.warn(
        `Pin limit reached (${MAX_PINS_SOFT_LIMIT}). Consider unpinning some threads.`,
      );
    }
    const next = { ...pinnedThreadsRef.current, [key]: Date.now() };
    pinnedThreadsRef.current = next;
    savePinnedThreads(next);
    setPinnedThreadsVersion((version) => version + 1);
    return true;
  }, []);

  const unpinThread = useCallback((workspaceId: string, threadId: string) => {
    const key = makePinKey(workspaceId, threadId);
    if (!(key in pinnedThreadsRef.current)) {
      return;
    }
    const { [key]: _removed, ...rest } = pinnedThreadsRef.current;
    pinnedThreadsRef.current = rest;
    savePinnedThreads(rest);
    setPinnedThreadsVersion((version) => version + 1);
  }, []);

  const isThreadPinned = useCallback(
    (workspaceId: string, threadId: string): boolean => {
      const key = makePinKey(workspaceId, threadId);
      return key in pinnedThreadsRef.current;
    },
    [],
  );

  const getPinTimestamp = useCallback(
    (workspaceId: string, threadId: string): number | null => {
      const key = makePinKey(workspaceId, threadId);
      return pinnedThreadsRef.current[key] ?? null;
    },
    [],
  );

  const markAutoTitlePending = useCallback(
    (workspaceId: string, threadId: string) => {
      const key = makeCustomNameKey(workspaceId, threadId);
      if (autoTitlePendingRef.current[key]) {
        return;
      }
      const next: AutoTitlePendingMap = {
        ...autoTitlePendingRef.current,
        [key]: Date.now(),
      };
      autoTitlePendingRef.current = next;
      setAutoTitlePendingVersion((v) => v + 1);
    },
    [],
  );

  const clearAutoTitlePending = useCallback(
    (workspaceId: string, threadId: string) => {
      const key = makeCustomNameKey(workspaceId, threadId);
      if (!autoTitlePendingRef.current[key]) {
        return;
      }
      const { [key]: _removed, ...rest } = autoTitlePendingRef.current;
      autoTitlePendingRef.current = rest;
      setAutoTitlePendingVersion((v) => v + 1);
    },
    [],
  );

  const isAutoTitlePending = useCallback(
    (workspaceId: string, threadId: string): boolean => {
      const key = makeCustomNameKey(workspaceId, threadId);
      const startedAt = autoTitlePendingRef.current[key];
      if (!startedAt) {
        return false;
      }
      if (Date.now() - startedAt >= AUTO_TITLE_PENDING_EXPIRE_MS) {
        const { [key]: _expired, ...rest } = autoTitlePendingRef.current;
        autoTitlePendingRef.current = rest;
        setAutoTitlePendingVersion((v) => v + 1);
        return false;
      }
      return true;
    },
    [],
  );

  const getAutoTitlePendingStartedAt = useCallback(
    (workspaceId: string, threadId: string): number | null => {
      const key = makeCustomNameKey(workspaceId, threadId);
      return autoTitlePendingRef.current[key] ?? null;
    },
    [],
  );

  const renameAutoTitlePendingKey = useCallback(
    (workspaceId: string, oldThreadId: string, newThreadId: string) => {
      const fromKey = makeCustomNameKey(workspaceId, oldThreadId);
      if (!autoTitlePendingRef.current[fromKey]) {
        return;
      }
      const toKey = makeCustomNameKey(workspaceId, newThreadId);
      const next: AutoTitlePendingMap = { ...autoTitlePendingRef.current };
      delete next[fromKey];
      next[toKey] = autoTitlePendingRef.current[fromKey];
      autoTitlePendingRef.current = next;
    },
    [],
  );

  return {
    customNamesRef,
    pinnedThreadsRef,
    threadActivityRef,
    pinnedThreadsVersion,
    getCustomName,
    recordThreadActivity,
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    markAutoTitlePending,
    clearAutoTitlePending,
    isAutoTitlePending,
    getAutoTitlePendingStartedAt,
    renameAutoTitlePendingKey,
    autoTitlePendingVersion,
  };
}
