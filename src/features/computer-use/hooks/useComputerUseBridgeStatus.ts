import { useCallback, useEffect, useState } from "react";
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

  const refresh = useCallback(async () => {
    if (!enabled) {
      setStatus(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const nextStatus = await getComputerUseBridgeStatus();
      setStatus(nextStatus);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, isLoading, error, refresh };
}
