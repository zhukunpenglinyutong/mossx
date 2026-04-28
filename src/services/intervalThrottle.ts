/**
 * intervalThrottle.ts - 全局 setInterval 节流拦截器
 * 
 * 修复 Issue #429: Windows 高 CPU 占用
 * 
 * 策略：monkey-patch window.setInterval，当文档不可见时自动跳过高频回调
 * 这样无需修改压缩后的 SpecHubPresentationalImpl.tsx 中的定时器
 * 
 * 使用方式：在 app 入口文件最顶部 import 即可
 *   import './services/intervalThrottle';
 */

// 配置
const THROTTLE_CONFIG = {
  /** 低于此间隔（ms）的 setInterval 在后台会被跳过 */
  highFrequencyThresholdMs: 2000,
  /** 后台检查间隔（ms），每 N 毫秒检查一次是否应该跳过 */
  backgroundCheckIntervalMs: 5000,
  /** 是否启用（默认生产环境启用） */
  enabled: typeof document !== 'undefined',
};

const originalSetInterval = window.setInterval;
const originalClearInterval = window.clearInterval;

// 存储所有被拦截的定时器信息
const trackedTimers = new Map<number, {
  callback: (...args: unknown[]) => void;
  intervalMs: number;
  isHighFrequency: boolean;
  lastFireAt: number;
}>();

// 在入口加载时就记录是否可见
let isVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';

// 监听可见性变化
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    isVisible = document.visibilityState === 'visible';
  });
}

window.setInterval = function patchedSetInterval(
  callback: (...args: unknown[]) => void,
  intervalMs?: number | undefined,
  ...args: unknown[]
): number {
  const ms = typeof intervalMs === 'number' ? intervalMs : 0;
  const isHighFrequency = ms > 0 && ms < THROTTLE_CONFIG.highFrequencyThresholdMs;

  if (!THROTTLE_CONFIG.enabled || !isHighFrequency) {
    // 不拦截低频定时器
    return originalSetInterval.call(window, callback, intervalMs, ...args);
  }

  // 创建包装回调：在后台时跳过执行
  const wrappedCallback = (...innerArgs: unknown[]) => {
    if (!isVisible) {
      // 后台：跳过高频回调
      return;
    }
    callback(...innerArgs);
  };

  const id = originalSetInterval.call(window, wrappedCallback, intervalMs, ...args);

  if (typeof id === 'number') {
    trackedTimers.set(id, {
      callback,
      intervalMs: ms,
      isHighFrequency: true,
      lastFireAt: Date.now(),
    });
  }

  return id;
} as typeof window.setInterval;

window.clearInterval = function patchedClearInterval(id: number | NodeJS.Timeout | undefined): void {
  if (typeof id === 'number') {
    trackedTimers.delete(id);
  }
  originalClearInterval.call(window, id);
} as typeof window.clearInterval;

// 清理函数（用于测试）
export function getThrottleStats() {
  const total = trackedTimers.size;
  const highFreq = Array.from(trackedTimers.values()).filter(t => t.isHighFrequency).length;
  return {
    totalTracked: total,
    highFrequency: highFreq,
    isVisible,
  };
}

// 开发模式下暴露到 window 以便调试
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as Record<string, unknown>).__intervalThrottleStats = getThrottleStats;
}
