import type { FlowSample, LaneCount, Stats, Vehicle } from "./types";

/** 평균을 계산함 값이 없으면 null을 돌려줌 */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 현재 차량과 완료 기록으로 통계를 만듦 */
export function computeStats(input: {
  time: number;
  vehicles: Vehicle[];
  travelTimes: number[];
  waitTimes: number[];
  currentQueueLength: number;
  maxQueueLength: number;
  laneCounts: LaneCount[];
  approachCounts: LaneCount[];
  cutIns: number;
  hardBrakes: number;
}): Stats {
  const activeWaits = input.vehicles.map((vehicle) => vehicle.waitTime);
  const speeds = input.vehicles.map((vehicle) => vehicle.speed);
  const completed = input.travelTimes.length;

  return {
    activeVehicles: input.vehicles.length,
    avgSpeed: speeds.length ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length : 0,
    currentQueueLength: input.currentQueueLength,
    maxQueueLength: input.maxQueueLength,
    avgTravelTime: mean(input.travelTimes),
    avgWaitTime: mean([...input.waitTimes, ...activeWaits]),
    completed,
    throughputPerHour: input.time > 1 ? completed / (input.time / 3600) : null,
    laneCounts: input.laneCounts,
    approachCounts: input.approachCounts,
    cutIns: input.cutIns,
    hardBrakes: input.hardBrakes,
  };
}

/** 그 시각의 차량 수와 평균 속도를 한 점으로 만듦 */
export function flowSample(time: number, vehicles: Vehicle[]): FlowSample {
  const avgSpeed = vehicles.length
    ? vehicles.reduce((sum, vehicle) => sum + vehicle.speed, 0) / vehicles.length
    : 0;

  return { t: time, vehicles: vehicles.length, avgSpeed };
}
