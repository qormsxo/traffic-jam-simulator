import { clamp, lerp } from "../core/vec";
import type { Rng } from "../core/rng";
import type { AgeBand } from "./types";

/**
 * Simulation assumption, not a claim about real people.
 * 10–30s share a short band; time rises sharply from the 40s upward.
 * Callers multiply by a personal factor so the same band still varies.
 */
const BASE_OPERATION_SECONDS: Record<AgeBand, number> = {
  "10s": 6,
  "20s": 7,
  "30s": 8,
  "40s": 14,
  "50s": 22,
  "60s": 34,
  "70s": 48,
};

export function baseOperationSeconds(band: AgeBand): number {
  return BASE_OPERATION_SECONDS[band];
}

export function ageSpeedFactor(band: AgeBand): number {
  if (band === "60s") return 0.9;
  if (band === "70s") return 0.8;
  return 1;
}

/**
 * Where a person sits inside a min–max range.
 * 10s–30s stay near the short end. From the 40s the share climbs, and 70+ nears the max.
 */
const RANGE_POSITION: Record<AgeBand, number> = {
  "10s": 0.06,
  "20s": 0.1,
  "30s": 0.16,
  "40s": 0.42,
  "50s": 0.64,
  "60s": 0.84,
  "70s": 0.96,
};

export function sampleAgeScaledDuration(min: number, max: number, band: AgeBand, rng: Rng): number {
  const spread = 0.16;
  const position = clamp(RANGE_POSITION[band] + (rng.next() - 0.5) * spread, 0, 1);
  return lerp(min, max, position);
}
