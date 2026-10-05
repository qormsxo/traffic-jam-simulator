import { clamp } from "../sim/core/vec";
import type { LightColor } from "../sim/traffic/types";

export const LIGHT_COLOR: Record<LightColor, string> = {
  red: "#ff4d3a",
  yellow: "#ffd60a",
  green: "#3ddc6e",
};

/** 속도 비율로 차 색을 고름 느리면 빨강, 빠르면 초록임 */
export function vehicleColor(id: string, speed: number, maxSpeed: number): string {
  const ratio = clamp(speed / Math.max(maxSpeed, 0.1), 0, 1);
  const hash = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;

  if (ratio < 0.15) return ["#d63b3b", "#e24b4b", "#c43232"][hash];

  if (ratio < 0.48) return ["#e8941a", "#f0a202", "#d98412"][hash];

  return ["#2fce7a", "#3ecf8e", "#27b86c"][hash];
}
