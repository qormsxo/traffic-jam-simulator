import { clamp } from "../core/vec";
import type { SimConfig } from "./types";

export const defaultConfig: SimConfig = {
  spawnPerHour: 4000,
  laneCount: 1,
  maxSpeed: 50,
  safetyDistance: 2,
  signalCycle: 60,
  duration: 180,
  seed: 1,
  cutInsPerMinute: 4,
  brakesPerMinute: 2,
};

/** km/h를 m/s로 바꿈 */
export function kmhToMps(kmh: number): number {
  return kmh / 3.6;
}

/** 설정을 허용 범위 안으로 자름 */
export function normalizeConfig(input: SimConfig): SimConfig {
  const laneCount = clamp(Math.round(input.laneCount), 1, 4);
  const maxSpeed = clamp(input.maxSpeed, 20, 80);
  const safetyDistance = clamp(input.safetyDistance, 1, 6);
  const signalCycle = clamp(input.signalCycle, 30, 150);
  const duration = clamp(input.duration, 60, 900);

  return {
    spawnPerHour: clamp(Math.round(input.spawnPerHour), 200, 6000),
    laneCount,
    maxSpeed,
    safetyDistance,
    signalCycle,
    duration,
    seed: Math.max(1, Math.round(input.seed) || 1),
    cutInsPerMinute: clamp(Math.round(input.cutInsPerMinute ?? 4), 0, 12),
    brakesPerMinute: clamp(Math.round(input.brakesPerMinute ?? 2), 0, 12),
  };
}
