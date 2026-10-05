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

/** 시드와 생성량, 시간만으로 도착 목록을 만듦 모두 서쪽에서 동쪽으로 직진함 */
export function buildArrivals(config: SimConfig, rng: Rng = mulberry32(config.seed)): Arrival[] {
  const rate = config.spawnPerHour / 3600;
  const arrivals: Arrival[] = [];
  let time = exponential(rng, rate);
  let ordinal = 0;

  while (time < config.duration) {
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
    ordinal += 1;
    time += exponential(rng, rate);
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

/** 평균 간격이 1/rate인 다음 도착까지 시간을 뽑음 */
function exponential(rng: Rng, rate: number): number {
  const u = Math.min(0.999999, Math.max(1e-6, rng.next()));

  return -Math.log(u) / Math.max(rate, 1e-6);
}
