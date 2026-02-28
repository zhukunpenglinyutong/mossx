import { debugError, debugLog, debugWarn } from '../../../utils/debug.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type LoadingState = 'idle' | 'loading' | 'success' | 'failed';

export interface BridgeProviderConfig<T> {
  /** Provider name for debug logging */
  name: string;
  /** Bridge event name to request data refresh */
  bridgeEvent: string;
  /** Window callback key name */
  windowCallbackKey: string;
  /** Parse JSON response into typed items */
  parseResponse: (json: string) => T[];
  /** Send bridge event function */
  sendBridgeEvent: (event: string) => boolean;
  /** Loading timeout in ms */
  loadingTimeout?: number;
  /** Minimum refresh interval in ms */
  minRefreshInterval?: number;
  /** Maximum retry count */
  maxRetryCount?: number;
  /** Maximum pending waiters */
  maxPendingWaiters?: number;
}

export interface BridgeProviderInstance<T> {
  /** Get cached items */
  getCached: () => T[];
  /** Get current loading state */
  getLoadingState: () => LoadingState;
  /** Reset all state */
  reset: () => void;
  /** Setup window callback */
  setupCallback: () => void;
  /** Wait for data to load */
  waitForData: (signal: AbortSignal, timeoutMs?: number) => Promise<void>;
  /** Request data refresh from backend */
  requestRefresh: () => boolean;
  /** Force refresh (reset + request) */
  forceRefresh: () => void;
  /** Get current retry count */
  getRetryCount: () => number;
  /** Get max retry count */
  getMaxRetryCount: () => number;
  /** Get last refresh timestamp */
  getLastRefreshTime: () => number;
  /** Manually set loading state (for timeout handling in business logic) */
  setLoadingState: (state: LoadingState) => void;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createBridgeProvider<T>(config: BridgeProviderConfig<T>): BridgeProviderInstance<T> {
  const {
    name,
    bridgeEvent,
    windowCallbackKey,
    parseResponse,
    sendBridgeEvent,
    loadingTimeout = 3000,
    minRefreshInterval = 2000,
    maxRetryCount = 2,
    maxPendingWaiters = 10,
  } = config;

  // Module-level state
  let cachedItems: T[] = [];
  let loadingState: LoadingState = 'idle';
  let lastRefreshTime = 0;
  let callbackRegistered = false;
  let retryCount = 0;
  let pendingWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];

  function reset() {
    cachedItems = [];
    loadingState = 'idle';
    lastRefreshTime = 0;
    retryCount = 0;
    pendingWaiters.forEach(w => w.reject(new Error(`${name} state reset`)));
    pendingWaiters = [];
    debugLog(`[${name}] State reset`);
  }

  function setupCallback() {
    if (typeof window === 'undefined') return;
    if (callbackRegistered && (window as unknown as Record<string, unknown>)[windowCallbackKey]) return;

    const handler = (json: string) => {
      debugLog(`[${name}] Received data from backend, length=${json.length}`);

      try {
        const items = parseResponse(json);
        cachedItems = items;
        loadingState = 'success';
        retryCount = 0;
        pendingWaiters.forEach(w => w.resolve());
        pendingWaiters = [];
        debugLog(`[${name}] Successfully loaded ${items.length} items`);
      } catch (error) {
        loadingState = 'failed';
        pendingWaiters.forEach(w => w.reject(error));
        pendingWaiters = [];
        debugError(`[${name}] Failed to parse data:`, error);
      }
    };

    const originalHandler = (window as unknown as Record<string, unknown>)[windowCallbackKey] as
      | ((json: string) => void)
      | undefined;

    (window as unknown as Record<string, unknown>)[windowCallbackKey] = (json: string) => {
      handler(json);
      originalHandler?.(json);
    };

    callbackRegistered = true;
    debugLog(`[${name}] Callback registered`);
  }

  function waitForData(signal: AbortSignal, timeoutMs?: number): Promise<void> {
    if (loadingState === 'success') return Promise.resolve();

    const timeout = timeoutMs ?? loadingTimeout;

    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      const waiter = { resolve: () => {}, reject: (_error: unknown) => {} } as {
        resolve: () => void;
        reject: (error: unknown) => void;
      };

      const cleanup = () => {
        pendingWaiters = pendingWaiters.filter(w => w !== waiter);
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };

      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error(`${name} loading timeout`));
      }, timeout);

      signal.addEventListener('abort', onAbort, { once: true });

      waiter.resolve = () => {
        cleanup();
        resolve();
      };
      waiter.reject = (error: unknown) => {
        cleanup();
        reject(error);
      };

      // Evict oldest waiters if limit exceeded
      if (pendingWaiters.length >= maxPendingWaiters) {
        const evicted = pendingWaiters.splice(0, pendingWaiters.length - maxPendingWaiters + 1);
        evicted.forEach(w => w.reject(new Error('Too many pending waiters')));
      }

      pendingWaiters.push(waiter);
    });
  }

  function requestRefreshFn(): boolean {
    const now = Date.now();

    if (now - lastRefreshTime < minRefreshInterval) {
      debugLog(`[${name}] Skipping refresh (too soon)`);
      return false;
    }

    if (retryCount >= maxRetryCount) {
      debugWarn(`[${name}] Max retry count reached, giving up`);
      loadingState = 'failed';
      return false;
    }

    const attempt = retryCount + 1;
    const sent = sendBridgeEvent(bridgeEvent);
    if (!sent) {
      debugLog(`[${name}] Bridge not available yet, refresh not sent`);
      return false;
    }

    lastRefreshTime = now;
    loadingState = 'loading';
    retryCount = attempt;

    debugLog(`[${name}] Requesting refresh (attempt ${retryCount}/${maxRetryCount})`);
    return true;
  }

  function forceRefresh() {
    debugLog(`[${name}] Force refresh requested`);
    loadingState = 'idle';
    lastRefreshTime = 0;
    retryCount = 0;
    pendingWaiters.forEach(w => w.reject(new Error(`${name} refresh requested`)));
    pendingWaiters = [];
    requestRefreshFn();
  }

  return {
    getCached: () => cachedItems,
    getLoadingState: () => loadingState,
    getRetryCount: () => retryCount,
    getMaxRetryCount: () => maxRetryCount,
    getLastRefreshTime: () => lastRefreshTime,
    setLoadingState: (state: LoadingState) => { loadingState = state; },
    reset,
    setupCallback,
    waitForData,
    requestRefresh: requestRefreshFn,
    forceRefresh,
  };
}
