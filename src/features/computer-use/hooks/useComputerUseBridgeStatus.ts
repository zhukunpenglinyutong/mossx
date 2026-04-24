import { useCallback, useEffect, useRef, useState } from "react";
import type { ComputerUseBridgeStatus } from "../../../types";
import { getComputerUseBridgeStatus } from "../../../services/tauri";

type UseComputerUseBridgeStatusOptions = {
  enabled: boolean;
};

type UseComputerUseBridgeStatusResult = {
  status: ComputerUseBridgeStatus | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useComputerUseBridgeStatus({
  enabled,
}: UseComputerUseBridgeStatusOptions): UseComputerUseBridgeStatusResult {
  const [status, setStatus] = useState<ComputerUseBridgeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      requestIdRef.current += 1;
      setStatus(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);
    try {
      const nextStatus = await getComputerUseBridgeStatus();
      if (mountedRef.current && requestIdRef.current === requestId) {
        setStatus(nextStatus);
      }
    } catch (loadError) {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, isLoading, error, refresh };
}
