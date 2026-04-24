import { useCallback, useEffect, useRef, useState } from "react";
import { runComputerUseActivationProbe } from "../../../services/tauri";
import type { ComputerUseActivationResult } from "../../../types";

type UseComputerUseActivationOptions = {
  enabled: boolean;
};

type UseComputerUseActivationResult = {
  result: ComputerUseActivationResult | null;
  isRunning: boolean;
  error: string | null;
  activate: () => Promise<void>;
  reset: () => void;
};

export function useComputerUseActivation({
  enabled,
}: UseComputerUseActivationOptions): UseComputerUseActivationResult {
  const [result, setResult] = useState<ComputerUseActivationResult | null>(null);
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

  const activate = useCallback(async () => {
    if (!enabled || activeRequestIdRef.current !== null) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestIdRef.current = requestId;
    setIsRunning(true);
    setError(null);
    try {
      const nextResult = await runComputerUseActivationProbe();
      if (mountedRef.current && requestIdRef.current === requestId) {
        setResult(nextResult);
      }
    } catch (activationError) {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setError(
          activationError instanceof Error
            ? activationError.message
            : String(activationError),
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
  }, [enabled]);

  return { result, isRunning, error, activate, reset };
}
