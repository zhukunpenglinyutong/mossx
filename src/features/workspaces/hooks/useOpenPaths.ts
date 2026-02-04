import { useEffect, useRef } from "react";
import { subscribeOpenPaths } from "../../../services/events";

type UseOpenPathsOptions = {
  onOpenPaths: (paths: string[]) => void;
};

export function useOpenPaths({ onOpenPaths }: UseOpenPathsOptions) {
  const callbackRef = useRef(onOpenPaths);

  useEffect(() => {
    callbackRef.current = onOpenPaths;
  }, [onOpenPaths]);

  useEffect(() => {
    const unsubscribe = subscribeOpenPaths((paths) => {
      callbackRef.current(paths);
    });
    return unsubscribe;
  }, []);
}
