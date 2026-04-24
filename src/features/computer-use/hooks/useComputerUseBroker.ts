import { useCallback, useEffect, useRef, useState } from "react";
import { runComputerUseCodexBroker } from "../../../services/tauri";
import type {
  ComputerUseBrokerRequest,
  ComputerUseBrokerResult,
} from "../../../types";

type UseComputerUseBrokerOptions = {
  enabled: boolean;
};

type UseComputerUseBrokerResult = {
  result: ComputerUseBrokerResult | null;
  isRunning: boolean;
  error: string | null;
  run: (request: ComputerUseBrokerRequest) => Promise<void>;
  reset: () => void;
};

export function useComputerUseBroker({
  enabled,
}: UseComputerUseBrokerOptions): UseComputerUseBrokerResult {
  const [result, setResult] = useState<ComputerUseBrokerResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const activeRequestIdRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    activeRequestIdRef.current = null;
    setResult(null);
    setError(null);
    setIsRunning(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      activeRequestIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      reset();
    }
  }, [enabled, reset]);

  const run = useCallback(
    async (request: ComputerUseBrokerRequest) => {
      if (!enabled || activeRequestIdRef.current !== null) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      activeRequestIdRef.current = requestId;
      setIsRunning(true);
      setError(null);
      try {
        const nextResult = await runComputerUseCodexBroker(request);
        if (mountedRef.current && requestIdRef.current === requestId) {
          setResult(nextResult);
        }
      } catch (brokerError) {
        if (mountedRef.current && requestIdRef.current === requestId) {
          setError(
            brokerError instanceof Error
              ? brokerError.message
              : String(brokerError),
          );
        }
      } finally {
        if (activeRequestIdRef.current === requestId) {
          activeRequestIdRef.current = null;
        }
        if (mountedRef.current && requestIdRef.current === requestId) {
          setIsRunning(false);
        }
      }
    },
    [enabled],
  );

  return { result, isRunning, error, run, reset };
}
