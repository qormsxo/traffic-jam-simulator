import type { Rng } from "../core/rng";
import { mulberry32 } from "../core/rng";
import type { ApproachId, Movement, SimConfig } from "./types";

export type Arrival = {
  time: number;
  approach: ApproachId;
  movement: Movement;
  ordinal: number;
  speedFactor: number;
  maxAccel: number;
  brake: number;
  gapFactor: number;
};

/** 총 대수는 생성량과 시간으로 고정함 들어올 때만 무리 크기와 간격을 섞음 */
export function buildArrivals(config: SimConfig, rng: Rng = mulberry32(config.seed)): Arrival[] {
  const count = Math.max(1, Math.round((config.spawnPerHour * config.duration) / 3600));
  const gaps = bunchGaps(rng, count);
  const span = gaps.reduce((sum, gap) => sum + gap, 0);
  const scale = (config.duration * 0.97) / Math.max(span, 1e-6);
  const arrivals: Arrival[] = [];
  let time = 0;

  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    time += gaps[ordinal] * scale;

    if (time >= config.duration) break;

    arrivals.push({
      time,
      approach: "eastbound",
      movement: "straight",
      ordinal,
      speedFactor: 0.78 + rng.next() * 0.34,
      maxAccel: 1.35 + rng.next() * 1.7,
      brake: 2.5 + rng.next() * 1.8,
      gapFactor: 0.82 + rng.next() * 0.4,
    });
  }

  return arrivals;
}

/** 한 방향 도로라 모든 차선을 직진 차선으로 돌려줌 */
export function lanesForMovement(_movement: Movement, laneCount: number): number[] {
  const count = Math.max(1, Math.round(laneCount));
  const lanes: number[] = [];

  for (let lane = 0; lane < count; lane += 1) lanes.push(lane);

  return lanes;
}

/** 도착 순서로 차선을 나눠 배정함 */
export function pickLane(movement: Movement, laneCount: number, ordinal: number): number {
  const lanes = lanesForMovement(movement, laneCount);

  return lanes[ordinal % lanes.length];
}

/** 한 무리는 바짝 붙이고, 다음 무리 전에 긴 간격을 둠 총 대수는 바꾸지 않음 */
function bunchGaps(rng: Rng, count: number): number[] {
  const gaps: number[] = [];
  let left = count;

  while (left > 0) {
    const size = Math.min(left, 1 + Math.floor(rng.next() * 5));

    for (let index = 0; index < size; index += 1) {
      if (gaps.length === 0) gaps.push(0.6 + rng.next() * 1.4);
      else if (index === 0) gaps.push(3.5 + rng.next() * 9);
      else gaps.push(0.2 + rng.next() * 0.45);
    }

    left -= size;
  }

  return gaps;
}
