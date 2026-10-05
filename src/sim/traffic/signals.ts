import type { ApproachId, ApproachLights, LightColor, Movement, PhaseId, SignalView } from "./types";

export type PhaseSlice = {
  id: PhaseId;
  green: number;
  yellow: number;
};

const PHASE_LABEL: Record<PhaseId, string> = {
  "ew-through": "동서 직진",
  "ew-left": "동서 좌회전",
  "ns-through": "남북 직진",
  "ns-left": "남북 좌회전",
};

const PHASES: PhaseId[] = ["ew-through", "ew-left", "ns-through", "ns-left"];

/** 한 주기를 직진과 좌회전 네 현시로 나눔 */
export function phasePlan(cycle: number): PhaseSlice[] {
  const safe = Math.max(20, cycle);
  const yellow = Math.min(3, safe / 10);
  const greenBudget = safe - yellow * 4;
  const weights = [0.34, 0.16, 0.34, 0.16];
  const greens = weights.map((weight) => greenBudget * weight);
  greens[greens.length - 1] += greenBudget - greens.reduce((sum, value) => sum + value, 0);

  return PHASES.map((id, index) => ({ id, green: greens[index], yellow }));
}

/** 시각에 해당하는 현시와 등 색을 계산함 */
export function signalAt(time: number, cycle: number): SignalView {
  const plan = phasePlan(cycle);
  const total = plan.reduce((sum, phase) => sum + phase.green + phase.yellow, 0);
  let cursor = ((time % total) + total) % total;

  for (let i = 0; i < plan.length; i += 1) {
    const phase = plan[i];
    const span = phase.green + phase.yellow;

    if (cursor < span || i === plan.length - 1) {
      const color: LightColor = cursor < phase.green ? "green" : "yellow";

      return viewFor(phase.id, color, total);
    }

    cursor -= span;
  }

  return viewFor(plan[0].id, "green", total);
}

/** 좌회전은 좌회전 등, 직진과 우회전은 직진 등을 봄 */
export function lightFor(signal: SignalView, approach: ApproachId, movement: Movement): LightColor {
  const head = signal[approach];

  return movement === "left" ? head.left : head.through;
}

/** 정지선을 지나기 전이면 빨간불에 멈춤 노란불은 제동 거리 안에 설 수 있을 때만 멈춤 */
export function shouldStop(color: LightColor, gapToLine: number, speed: number, brake: number): boolean {
  if (gapToLine < -0.35) return false;

  if (color === "green") return false;

  if (color === "red") return true;
  const stoppingDistance = (speed * speed) / (2 * Math.max(0.8, brake));

  return stoppingDistance <= gapToLine + 0.5;
}

/** 한 현시의 네 방향 등 상태를 만듦 */
function viewFor(phase: PhaseId, color: LightColor, cycle: number): SignalView {
  /** 직진 등과 좌회전 등을 모두 빨간불로 만듦 */
  const red = (): ApproachLights => ({ through: "red", left: "red" });

  const lights: Record<ApproachId, ApproachLights> = {
    eastbound: red(),
    westbound: red(),
    northbound: red(),
    southbound: red(),
  };

  /** 지정한 방향의 등 하나만 현재 색으로 바꿈 */
  const paint = (approaches: ApproachId[], field: keyof ApproachLights) => {
    for (const approach of approaches) {
      lights[approach] = { ...lights[approach], [field]: color };
    }
  };

  if (phase === "ew-through") paint(["eastbound", "westbound"], "through");

  if (phase === "ew-left") paint(["eastbound", "westbound"], "left");

  if (phase === "ns-through") paint(["northbound", "southbound"], "through");

  if (phase === "ns-left") paint(["northbound", "southbound"], "left");
  const tone = color === "yellow" ? "황색" : "녹색";

  return {
    cycle,
    phase,
    phaseLabel: `${PHASE_LABEL[phase]} ${tone}`,
    color,
    eastbound: lights.eastbound,
    westbound: lights.westbound,
    northbound: lights.northbound,
    southbound: lights.southbound,
  };
}
