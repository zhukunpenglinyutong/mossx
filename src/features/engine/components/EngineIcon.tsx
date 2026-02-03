import { Claude, Gemini, OpenAI } from "@lobehub/icons";
import type { CSSProperties } from "react";
import type { EngineType } from "../../../types";

type EngineIconProps = {
  engine: EngineType;
  size?: number;
  className?: string;
  style?: CSSProperties;
};

/**
 * Engine icon component using @lobehub/icons
 * Displays brand icons for Claude, Codex (OpenAI), Gemini, and OpenCode
 */
export function EngineIcon({
  engine,
  size = 14,
  className,
  style,
}: EngineIconProps) {
  switch (engine) {
    case "claude":
      return <Claude.Color size={size} className={className} style={style} />;
    case "codex":
      return <OpenAI size={size} className={className} style={style} />;
    case "gemini":
      return <Gemini.Color size={size} className={className} style={style} />;
    case "opencode":
      // OpenCode uses a simple code icon (fallback SVG)
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          style={{ width: size, height: size, flexShrink: 0, ...style }}
        >
          <path
            d="M9 7l-5 5 5 5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M15 7l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return <OpenAI size={size} className={className} style={style} />;
  }
}
