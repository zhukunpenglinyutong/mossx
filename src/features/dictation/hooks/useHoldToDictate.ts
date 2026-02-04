import { useEffect, useRef } from "react";
import { matchesHoldKey } from "../../../utils/keys";
import type { DictationSessionState } from "../../../types";

type UseHoldToDictateArgs = {
  enabled: boolean;
  ready: boolean;
  state: DictationSessionState;
  preferredLanguage: string | null;
  holdKey: string;
  startDictation: (preferredLanguage: string | null) => void | Promise<void>;
  stopDictation: () => void | Promise<void>;
  cancelDictation: () => void | Promise<void>;
};

const HOLD_STOP_GRACE_MS = 1500;

export function useHoldToDictate({
  enabled,
  ready,
  state,
  preferredLanguage,
  holdKey,
  startDictation,
  stopDictation,
  cancelDictation,
}: UseHoldToDictateArgs) {
  const holdDictationActive = useRef(false);
  const holdDictationStopPending = useRef(false);
  const holdDictationStopTimeout = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  const readyRef = useRef(ready);
  const stateRef = useRef(state);
  const preferredLanguageRef = useRef(preferredLanguage);
  const holdKeyRef = useRef(holdKey.toLowerCase());
  const startDictationRef = useRef(startDictation);
  const stopDictationRef = useRef(stopDictation);
  const cancelDictationRef = useRef(cancelDictation);

  useEffect(() => {
    enabledRef.current = enabled;
    readyRef.current = ready;
    stateRef.current = state;
    preferredLanguageRef.current = preferredLanguage;
    holdKeyRef.current = holdKey.toLowerCase();
    startDictationRef.current = startDictation;
    stopDictationRef.current = stopDictation;
    cancelDictationRef.current = cancelDictation;
  }, [
    cancelDictation,
    enabled,
    holdKey,
    preferredLanguage,
    ready,
    startDictation,
    state,
    stopDictation,
  ]);

  useEffect(() => {
    if (holdDictationStopPending.current && state === "listening") {
      holdDictationStopPending.current = false;
      if (holdDictationStopTimeout.current !== null) {
        window.clearTimeout(holdDictationStopTimeout.current);
        holdDictationStopTimeout.current = null;
      }
      try {
        void Promise.resolve(stopDictationRef.current()).catch(() => {
          // Errors are surfaced through dictation events.
        });
      } catch {
        // Errors are surfaced through dictation events.
      }
    }
  }, [state]);

  useEffect(() => {
    const safeInvoke = (action: () => void | Promise<void>) => {
      try {
        void Promise.resolve(action()).catch(() => {
          // Errors are surfaced through dictation events.
        });
      } catch {
        // Errors are surfaced through dictation events.
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const normalizedHoldKey = holdKeyRef.current;
      if (!normalizedHoldKey || !matchesHoldKey(event, normalizedHoldKey) || event.repeat) {
        return;
      }
      if (!enabledRef.current || !readyRef.current) {
        return;
      }
      if (stateRef.current !== "idle") {
        return;
      }
      holdDictationActive.current = true;
      holdDictationStopPending.current = false;
      if (holdDictationStopTimeout.current !== null) {
        window.clearTimeout(holdDictationStopTimeout.current);
        holdDictationStopTimeout.current = null;
      }
      safeInvoke(() => startDictationRef.current(preferredLanguageRef.current));
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const normalizedHoldKey = holdKeyRef.current;
      if (!normalizedHoldKey || !matchesHoldKey(event, normalizedHoldKey)) {
        return;
      }
      if (!holdDictationActive.current) {
        return;
      }
      holdDictationActive.current = false;
      holdDictationStopPending.current = true;
      if (holdDictationStopTimeout.current !== null) {
        window.clearTimeout(holdDictationStopTimeout.current);
      }
      holdDictationStopTimeout.current = window.setTimeout(() => {
        holdDictationStopPending.current = false;
        holdDictationStopTimeout.current = null;
      }, HOLD_STOP_GRACE_MS);
      if (stateRef.current === "listening") {
        holdDictationStopPending.current = false;
        if (holdDictationStopTimeout.current !== null) {
          window.clearTimeout(holdDictationStopTimeout.current);
          holdDictationStopTimeout.current = null;
        }
        safeInvoke(stopDictationRef.current);
      }
    };

    const handleBlur = () => {
      if (!holdDictationActive.current) {
        return;
      }
      holdDictationActive.current = false;
      holdDictationStopPending.current = false;
      if (holdDictationStopTimeout.current !== null) {
        window.clearTimeout(holdDictationStopTimeout.current);
        holdDictationStopTimeout.current = null;
      }
      if (stateRef.current === "listening") {
        safeInvoke(cancelDictationRef.current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      if (holdDictationStopTimeout.current !== null) {
        window.clearTimeout(holdDictationStopTimeout.current);
        holdDictationStopTimeout.current = null;
      }
    };
  }, []);
}
