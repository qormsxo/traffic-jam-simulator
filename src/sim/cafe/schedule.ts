import { clamp, lerp } from "../core/vec";
import type { Rng } from "../core/rng";
import { AGE_BANDS, type AgeBand, type AgeWeights, type MemberBlueprint, type PartyBlueprint, type SimConfig } from "./types";
import { ageSpeedFactor, baseOperationSeconds, sampleAgeScaledDuration } from "./timing";
import { normalizeConfig } from "./presets";

export function sampleBand(weights: AgeWeights, rng: Rng): AgeBand {
  const entries = AGE_BANDS.map((band) => [band.id, Math.max(0, weights[band.id])] as const);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0) || 1;
  let roll = rng.next() * total;
  for (const [id, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return id;
  }
  return "40s";
}

function createMember(config: SimConfig, rng: Rng): MemberBlueprint {
  const ageBand = sampleBand(config.ageWeights, rng);
  const range = AGE_BANDS.find((band) => band.id === ageBand)!;
  const age = range.min + Math.floor(rng.next() * (range.max - range.min + 1));
  const operationTime = baseOperationSeconds(ageBand) * (0.75 + rng.next() * 0.5);
  const movementSpeed = config.movementSpeed * (0.85 + rng.next() * 0.3) * ageSpeedFactor(ageBand);
  const decisionTime = sampleAgeScaledDuration(config.decisionTime.min, config.decisionTime.max, ageBand, rng);
  const paymentTime = sampleAgeScaledDuration(config.paymentTime.min, config.paymentTime.max, ageBand, rng);
  return { age, ageBand, movementSpeed, decisionTime, paymentTime, operationTime };
}

/**
 * Builds the arrival list before the store opens.
 * Kiosk count is intentionally unused so two runs that share a seed
 * compare the same people under different equipment.
 * Menu and payment times stay inside the configured range, short through the 30s and longer from the 40s up.
 */
export function buildSchedule(config: SimConfig, rng: Rng): PartyBlueprint[] {
  const normalized = normalizeConfig(config);
  const sizes: number[] = [];
  let remaining = normalized.customerCount;

  while (remaining > 0) {
    const canGroup = remaining >= 2;
    const grouped = canGroup && rng.next() < normalized.groupRatio;
    if (!grouped) {
      sizes.push(1);
      remaining -= 1;
      continue;
    }
    const maxSize = Math.min(6, remaining);
    const jitter = (rng.next() - 0.5) * 2.4;
    const size = clamp(Math.round(normalized.avgGroupSize + jitter), 2, maxSize);
    sizes.push(size);
    remaining -= size;
  }

  const times = sizes.map(() => rng.next() * normalized.duration * 0.9);
  times.sort((a, b) => a - b);

  return sizes.map((size, index) => {
    const members = Array.from({ length: size }, () => createMember(normalized, rng));
    return {
      id: `p-${index + 1}`,
      arrivalTime: times[index],
      members,
      ordererIndex: Math.floor(rng.next() * size),
      preparationTime: lerp(normalized.prepTime.min, normalized.prepTime.max, rng.next()),
    };
  });
}
