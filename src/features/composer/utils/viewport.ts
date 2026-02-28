/**
 * Simplified viewport utility for codemoss (Tauri environment)
 * No JCEF zoom compensation needed.
 */
export function getAppViewport(): {
  width: number;
  height: number;
  top: number;
  left: number;
  fixedPosDivisor: number;
} {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    top: 0,
    left: 0,
    fixedPosDivisor: 1,
  };
}
