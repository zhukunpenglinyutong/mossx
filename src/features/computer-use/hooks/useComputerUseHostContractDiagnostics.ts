import { useCallback, useEffect, useRef, useState } from "react";
import { runComputerUseHostContractDiagnostics } from "../../../services/tauri";
import type { ComputerUseHostContractDiagnosticsResult } from "../../../types";

type UseComputerUseHostContractDiagnosticsOptions = {
  enabled: boolean;
};

type UseComputerUseHostContractDiagnosticsResult = {
  result: ComputerUseHostContractDiagnosticsResult | null;
  isRunning: boolean;
  error: string | null;
  diagnose: () => Promise<void>;
  reset: () => void;
};

export function useComputerUseHostContractDiagnostics({
  enabled,
}: UseComputerUseHostContractDiagnosticsOptions): UseComputerUseHostContractDiagnosticsResult {
  const [result, setResult] =
    useState<ComputerUseHostContractDiagnosticsResult | null>(null);
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

  const diagnose = useCallback(async () => {
    if (!enabled || activeRequestIdRef.current !== null) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeRequestIdRef.current = requestId;
    setIsRunning(true);
    setError(null);
    try {
      const nextResult = await runComputerUseHostContractDiagnostics();
      if (mountedRef.current && requestIdRef.current === requestId) {
        setResult(nextResult);
      }
    } catch (diagnosticsError) {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setError(
          diagnosticsError instanceof Error
            ? diagnosticsError.message
            : String(diagnosticsError),
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

  return { result, isRunning, error, diagnose, reset };
}
