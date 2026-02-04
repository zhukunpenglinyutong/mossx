import { useEffect, useRef } from "react";
import { subscribeOpenPaths } from "../../../services/events";
import { getPendingOpenPaths } from "../../../services/tauri";

type UseOpenPathsOptions = {
  onOpenPaths: (paths: string[]) => void;
};

export function useOpenPaths({ onOpenPaths }: UseOpenPathsOptions) {
  const callbackRef = useRef(onOpenPaths);

  useEffect(() => {
    callbackRef.current = onOpenPaths;
  }, [onOpenPaths]);

  // Subscribe to real-time open-paths events (for when app is already running)
  useEffect(() => {
    const unsubscribe = subscribeOpenPaths((paths) => {
      callbackRef.current(paths);
    });
    return unsubscribe;
  }, []);

  // Check for pending paths on mount (for paths passed during app launch)
  useEffect(() => {
    const checkPendingPaths = async () => {
      try {
        const paths = await getPendingOpenPaths();
        if (paths.length > 0) {
          callbackRef.current(paths);
        }
      } catch {
        // Ignore errors (e.g., if running in browser without Tauri)
      }
    };
    checkPendingPaths();
  }, []);
}
