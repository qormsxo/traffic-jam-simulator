import type { Vec3 } from "../core/vec";

export const APPROACH_ORDER = ["eastbound", "westbound", "northbound", "southbound"] as const;

export type ApproachId = (typeof APPROACH_ORDER)[number];

export type Movement = "straight" | "left" | "right";

export type VehicleState =
  | "ENTERING"
  | "DRIVING"
  | "FOLLOWING"
  | "QUEUED"
  | "TURNING"
  | "EXITING"
  | "CUTTING_IN"
  | "BRAKING"
  | "COMPLETED";

/** 화면 속도는 km/h 엔진에서 m/s로 바꿈 */
export type SimConfig = {
  spawnPerHour: number;
  laneCount: number;
  maxSpeed: number;
  safetyDistance: number;
  signalCycle: number;
  duration: number;
  seed: number;
  /** 자동 끼어들기 횟수 0이면 버튼으로만 함 */
  cutInsPerMinute: number;
  /** 자동 급브레이크 횟수 0이면 버튼으로만 함 */
  brakesPerMinute: number;
};

export type Vehicle = {
  id: string;
  position: Vec3;
  speed: number;
  maxSpeed: number;
  acceleration: number;
  laneId: string;
  state: VehicleState;
  heading: number;
  approach: ApproachId;
  movement: Movement;
  laneIndex: number;
  enteredAt: number;
  waitTime: number;
  distance: number;
};

export type LightColor = "red" | "yellow" | "green";

export type PhaseId = "ew-through" | "ew-left" | "ns-through" | "ns-left";

export type ApproachLights = {
  through: LightColor;
  left: LightColor;
};

export type SignalView = {
  cycle: number;
  phase: PhaseId;
  phaseLabel: string;
  color: LightColor;
  eastbound: ApproachLights;
  westbound: ApproachLights;
  northbound: ApproachLights;
  southbound: ApproachLights;
};

export type LaneCount = {
  laneId: string;
  label: string;
  count: number;
};

export type FlowSample = {
  t: number;
  vehicles: number;
  avgSpeed: number;
};

export type Stats = {
  activeVehicles: number;
  avgSpeed: number;
  currentQueueLength: number;
  maxQueueLength: number;
  avgTravelTime: number | null;
  avgWaitTime: number | null;
  completed: number;
  throughputPerHour: number | null;
  laneCounts: LaneCount[];
  approachCounts: LaneCount[];
  cutIns: number;
  hardBrakes: number;
};

export type SimEvent = {
  t: number;
  text: string;
};

export type SimSnapshot = {
  time: number;
  duration: number;
  finished: boolean;
  laneCount: number;
  vehicles: Vehicle[];
  signals: SignalView;
  stats: Stats;
  history: FlowSample[];
  events: SimEvent[];
};

export const STATE_LABEL: Record<VehicleState, string> = {
  ENTERING: "진입",
  DRIVING: "주행",
  FOLLOWING: "차간거리 유지",
  QUEUED: "대기",
  TURNING: "회전",
  EXITING: "이탈",
  CUTTING_IN: "끼어들기",
  BRAKING: "급정거",
  COMPLETED: "완료",
};

export const MOVEMENT_LABEL: Record<Movement, string> = {
  straight: "직진",
  left: "좌회전",
  right: "우회전",
};

export const APPROACH_LABEL: Record<ApproachId, string> = {
  eastbound: "서→동",
  westbound: "동→서",
  northbound: "남→북",
  southbound: "북→남",
};

/** 방향과 차선 번호를 화면 문구로 만듦 */
export function laneLabel(approach: ApproachId, laneIndex: number): string {
  return `${APPROACH_LABEL[approach]} ${laneIndex + 1}차로`;
}
