/**
 * useVisibilityThrottledInterval - 可见性感知的节流定时器 Hook
 * 
 * 修复 Issue #429: Windows 高 CPU 占用
 * 
 * 功能:
 *   - 前台活跃时按正常间隔执行
 *   - 窗口/标签页不可见时暂停定时器（节省 CPU）
 *   - 窗口恢复可见时立即执行一次并恢复定时器
 *   - 支持自定义前台/后台间隔
 * 
 * 用法:
 *   useVisibilityThrottledInterval(() => {
 *     setClockNow(Date.now());
 *   }, { intervalMs: 1000, enabled: hasRunningThread });
 */

import { useEffect, useRef, useCallback } from "react";

export interface VisibilityThrottledIntervalOptions {
  /** 前台间隔（毫秒），默认 1000 */
  intervalMs?: number;
  /** 后台间隔（毫秒），默认 30000。设为 0 则完全暂停 */
  backgroundIntervalMs?: number;
  /** 是否启用定时器 */
  enabled?: boolean;
  /** 窗口恢复可见时是否立即触发一次，默认 true */
  fireOnVisible?: boolean;
}

export function useVisibilityThrottledInterval(
  callback: () => void,
  options: VisibilityThrottledIntervalOptions = {},
) {
  const {
    intervalMs = 1000,
    backgroundIntervalMs = 30000,
    enabled = true,
    fireOnVisible = true,
  } = options;

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const timerIdRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const isInBackgroundRef = useRef(false);
  const lastFiredRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timerIdRef.current !== null) {
      window.clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
  }, []);

  const scheduleTimer = useCallback(
    (bg: boolean) => {
      clearTimer();
      if (bg && backgroundIntervalMs === 0) {
        // 后台完全暂停
        return;
      }
      const interval = bg ? backgroundIntervalMs : intervalMs;
      timerIdRef.current = window.setInterval(() => {
        if (isInBackgroundRef.current && backgroundIntervalMs === 0) {
          return;
        }
        lastFiredRef.current = Date.now();
        callbackRef.current();
      }, interval);
    },
    [intervalMs, backgroundIntervalMs, clearTimer],
  );

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      clearTimer();
      return;
    }

    // 立即执行一次
    lastFiredRef.current = Date.now();
    callbackRef.current();

    // 启动前台定时器
    scheduleTimer(false);

    const handleVisibilityChange = () => {
      const hidden = document.visibilityState !== "visible";
      isInBackgroundRef.current = hidden;

      if (hidden) {
        // 切到后台：换为低频间隔
        scheduleTimer(true);
      } else {
        // 切回前台：
        // 1) 如果距离上次执行已超过 intervalMs，立即补一次
        if (
          fireOnVisible &&
          Date.now() - lastFiredRef.current >= intervalMs
        ) {
          lastFiredRef.current = Date.now();
          callbackRef.current();
        }
        // 2) 恢复前台间隔
        scheduleTimer(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimer();
    };
  }, [enabled, intervalMs, backgroundIntervalMs, fireOnVisible, scheduleTimer, clearTimer]);
}
