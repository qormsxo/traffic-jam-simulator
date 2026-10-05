import { clamp } from "../core/vec";

export const TIME_HEADWAY = 1.15;

/** 앞차와의 간격으로 가속도를 계산함. 앞차가 없으면 희망 속도까지 가속함. */
export function idmAcceleration(input: {
  speed: number;
  desiredSpeed: number;
  gap: number;
  leaderSpeed: number;
  minGap: number;
  maxAccel: number;
  brake: number;
}): number {
  const desired = Math.max(input.desiredSpeed, 0.5);
  const free = 1 - (input.speed / desired) ** 4;

  if (!Number.isFinite(input.gap)) {
    return clamp(input.maxAccel * free, -input.brake, input.maxAccel);
  }

  if (input.gap < 0.35) return -input.brake;
  const dv = input.speed - input.leaderSpeed;
  const denom = 2 * Math.sqrt(Math.max(0.1, input.maxAccel) * Math.max(0.1, input.brake * 0.7));
  const desiredGap = input.minGap + Math.max(0, input.speed * TIME_HEADWAY + (input.speed * dv) / denom);
  const accel = input.maxAccel * (free - (desiredGap / input.gap) ** 2);

  return clamp(accel, -input.brake, input.maxAccel);
}
