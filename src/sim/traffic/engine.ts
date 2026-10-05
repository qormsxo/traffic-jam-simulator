import { mulberry32, type Rng } from "../core/rng";
import { clamp } from "../core/vec";
import { idmAcceleration } from "./carFollowing";
import { VEHICLE_LENGTH } from "./constants";
import { buildNetwork, buildRoute, laneSegmentId, type Network, type Segment } from "./network";
import { samplePolyline } from "./path";
import { kmhToMps, normalizeConfig } from "./presets";
import { buildArrivals, pickLane, type Arrival } from "./schedule";
import { lightFor, shouldStop, signalAt } from "./signals";
import { computeStats, flowSample } from "./stats";
import {
  APPROACH_LABEL,
  APPROACH_ORDER,
  laneLabel,
  type ApproachId,
  type FlowSample,
  type LaneCount,
  type SignalView,
  type SimConfig,
  type SimEvent,
  type SimSnapshot,
  type Vehicle,
  type VehicleState,
} from "./types";

type SimVehicle = {
  id: string;
  approach: ApproachId;
  movement: Arrival["movement"];
  laneIndex: number;
  route: string[];
  routeIndex: number;
  s: number;
  speed: number;
  maxSpeed: number;
  maxAccel: number;
  brake: number;
  minGap: number;
  acceleration: number;
  position: Vehicle["position"];
  heading: number;
  laneId: string;
  state: VehicleState;
  enteredAt: number;
  waitTime: number;
  distance: number;
  leaderGap: number;
  brakeUntil: number;
  shift: number;
  shiftFrom: string | null;
  cutReadyAt: number;
};

type LeaderGap = {
  gap: number;
  leaderSpeed: number;
};

type LaneSlot = {
  front: number;
  rear: number;
};

/**
 * React 없이 돌아가는 교통 시계
 * step으로 차를 넣고 앞차를 따라가게 함 급정거는 뒤차까지 느려지게 함
 */
export class TrafficSimulation {
  private config: SimConfig;
  private network: Network;
  private arrivals: Record<ApproachId, Arrival[]> = emptyArrivals();
  private cursor: Record<ApproachId, number> = emptyCursor();
  private time = 0;
  private vehicles: SimVehicle[] = [];
  private seq = 1;
  private travelTimes: number[] = [];
  private waitTimes: number[] = [];
  private history: FlowSample[] = [];
  private lastSampleSec = 0;
  private maxQueue = 0;
  private signal: SignalView = signalAt(0, 60);
  private behaviorRng: Rng = mulberry32(1);
  private cutIns = 0;
  private hardBrakes = 0;
  private events: SimEvent[] = [];
  private nextAutoCut = 0;
  private nextAutoBrake = 0;
  private cached: SimSnapshot | null = null;

  /** 설정을 넣고 시뮬레이션을 비움 */
  constructor(config: SimConfig) {
    this.config = normalizeConfig(config);
    this.network = buildNetwork(this.config.laneCount);
    this.reset(config);
  }

  /** 시간과 차량을 처음 상태로 되돌림 자동 사건은 6초 뒤부터 셈 */
  reset(config: SimConfig): void {
    this.config = normalizeConfig(config);
    this.network = buildNetwork(this.config.laneCount);
    const arrivals = buildArrivals(this.config);
    this.arrivals = emptyArrivals();

    for (const arrival of arrivals) this.arrivals[arrival.approach].push(arrival);
    this.cursor = emptyCursor();
    this.time = 0;
    this.vehicles = [];
    this.seq = 1;
    this.travelTimes = [];
    this.waitTimes = [];
    this.lastSampleSec = 0;
    this.maxQueue = 0;
    this.signal = signalAt(0, this.config.signalCycle);
    this.behaviorRng = mulberry32((this.config.seed + 17) >>> 0);
    this.cutIns = 0;
    this.hardBrakes = 0;
    this.events = [];
    this.nextAutoCut = 6;
    this.nextAutoBrake = 6;
    this.history = [flowSample(0, [])];
    this.cached = null;
  }

  /** 지정한 차를 2.8초 동안 급정거시킴 없으면 실패함 */
  hardBrake(id: string): boolean {
    const vehicle = this.vehicles.find((item) => item.id === id);

    if (!vehicle) return false;
    vehicle.brakeUntil = this.time + 2.8;
    vehicle.shift = 0;
    vehicle.shiftFrom = null;
    vehicle.state = "BRAKING";
    this.hardBrakes += 1;
    this.log(`${vehicle.id} 급정거`);
    this.cached = null;

    return true;
  }

  /** 지정한 차를 옆 차선으로 넣음 간격이 없거나 1차선이면 실패함 */
  cutIn(id: string): boolean {
    const vehicle = this.vehicles.find((item) => item.id === id);

    if (!vehicle || vehicle.shift > 0 || this.network.laneCount < 2) return false;
    const lane = this.pickCutLane(vehicle, true);

    if (lane == null) return false;
    this.beginCut(vehicle, lane);
    this.syncPose(vehicle);
    this.syncState(vehicle, this.segment(vehicle));

    return true;
  }

  /** 뒤차가 있는 주행 차를 우선으로 골라 급정거시킴 없으면 null을 돌려줌 */
  hardBrakeRandom(): string | null {
    const moving = this.vehicles.filter((vehicle) => vehicle.speed > 1.5 && vehicle.brakeUntil <= this.time);
    const withFollower = moving.filter((vehicle) => this.followerNearby(vehicle));
    const pick = this.pickRandom(withFollower.length > 0 ? withFollower : moving);

    if (!pick) return null;
    this.hardBrake(pick.id);

    return pick.id;
  }

  /** 끼어들 간격이 있는 차 하나를 골라 끼어들게 함 없으면 null을 돌려줌 */
  cutInRandom(): string | null {
    const pool = this.shuffled(this.vehicles);

    for (const vehicle of pool) {
      if (this.cutIn(vehicle.id)) return vehicle.id;
    }

    return null;
  }

  /** 분당 횟수를 도로를 지우지 않고 바꿈 다시 켜면 6초 뒤부터 셈 */
  setIncidentRates(cutInsPerMinute: number, brakesPerMinute: number): void {
    const cut = Math.max(0, cutInsPerMinute);
    const brake = Math.max(0, brakesPerMinute);

    if (cut > 0 && this.config.cutInsPerMinute <= 0) this.nextAutoCut = Math.max(this.time, 6);

    if (brake > 0 && this.config.brakesPerMinute <= 0) this.nextAutoBrake = Math.max(this.time, 6);
    this.config = { ...this.config, cutInsPerMinute: cut, brakesPerMinute: brake };
  }

  /** 0.1초 단위로 dt만큼 진행함 시간이 움직였으면 true를 돌려줌 */
  step(dt: number): boolean {
    if (this.time >= this.config.duration) return false;
    let moved = false;
    let left = Math.max(0, dt);

    while (left > 1e-6 && this.time < this.config.duration) {
      const h = Math.min(0.1, left, this.config.duration - this.time);
      this.time += h;
      this.integrate(h);
      left -= h;
      moved = true;
    }

    if (moved) this.cached = null;

    return moved;
  }

  /** 화면용 상태를 돌려줌 바뀌기 전에는 같은 객체를 재사용함 */
  getSnapshot(): SimSnapshot {
    if (!this.cached) this.cached = this.buildSnapshot();

    return this.cached;
  }

  /** 한 서브스텝에서 생성, 주행, 표본을 처리함 */
  private integrate(dt: number): void {
    this.spawnDue();
    this.drive(dt);
    this.sample();
  }

  /** 도착 시각이 된 차를 도로에 넣음 앞이 막히면 그 방향은 이번 스텝을 건너뜀 */
  private spawnDue(): void {
    for (const approach of APPROACH_ORDER) {
      const list = this.arrivals[approach];

      while (this.cursor[approach] < list.length && list[this.cursor[approach]].time <= this.time) {
        const arrival = list[this.cursor[approach]];

        if (!this.canEnter(arrival)) break;
        this.spawn(arrival);
        this.cursor[approach] += 1;
      }
    }
  }

  /** 진입점 앞이 비었는지 확인해 새 차를 허용함 */
  private canEnter(arrival: Arrival): boolean {
    const lane = pickLane(arrival.movement, this.network.laneCount, arrival.ordinal);
    const segId = buildRoute(arrival.approach, lane, arrival.movement)[0];
    let nearest = Number.POSITIVE_INFINITY;

    for (const vehicle of this.vehicles) {
      if (vehicle.route[vehicle.routeIndex] !== segId) continue;

      if (vehicle.s < nearest) nearest = vehicle.s;
    }

    const minGap = this.config.safetyDistance * arrival.gapFactor;

    return nearest > VEHICLE_LENGTH + minGap + 1.5;
  }

  /** 도착 정보로 차량을 만듦 */
  private spawn(arrival: Arrival): void {
    const lane = pickLane(arrival.movement, this.network.laneCount, arrival.ordinal);
    const maxSpeed = kmhToMps(this.config.maxSpeed) * arrival.speedFactor;

    const vehicle: SimVehicle = {
      id: `v-${this.seq++}`,
      approach: arrival.approach,
      movement: arrival.movement,
      laneIndex: lane,
      route: buildRoute(arrival.approach, lane, arrival.movement),
      routeIndex: 0,
      s: 0,
      speed: Math.min(maxSpeed * 0.35, 6),
      maxSpeed,
      maxAccel: arrival.maxAccel,
      brake: arrival.brake,
      minGap: this.config.safetyDistance * arrival.gapFactor,
      acceleration: 0,
      position: { x: 0, y: 0, z: 0 },
      heading: 0,
      laneId: `${arrival.approach}-${lane}`,
      state: "ENTERING",
      enteredAt: this.time,
      waitTime: 0,
      distance: 0,
      leaderGap: Number.POSITIVE_INFINITY,
      brakeUntil: 0,
      shift: 0,
      shiftFrom: null,
      cutReadyAt: 0,
    };

    this.syncPose(vehicle);
    this.vehicles.push(vehicle);
  }

  /** 앞차와 신호를 보고 속도와 위치를 갱신함 */
  private drive(dt: number): void {
    this.signal = signalAt(this.time, this.config.signalCycle);
    this.considerIncidents();
    const buckets = this.buckets();

    for (const vehicle of this.vehicles) {
      const seg = this.segment(vehicle);
      const leader = this.leaderConstraint(vehicle, seg, buckets);
      vehicle.leaderGap = leader.gap;
      let accel = this.accel(vehicle, leader.gap, leader.leaderSpeed);

      if (seg.kind === "approach") {
        const gapToLine = seg.length - vehicle.s;
        const color = lightFor(this.signal, vehicle.approach, vehicle.movement);

        if (shouldStop(color, gapToLine, vehicle.speed, vehicle.brake)) {
          const stopGap = seg.length - 0.7 - vehicle.s;
          accel = Math.min(accel, this.accel(vehicle, stopGap, 0, 0.5));
        }
      }

      if (vehicle.shift <= 0.05) {
        const conflict = this.conflictConstraint(vehicle);

        if (conflict) accel = Math.min(accel, this.accel(vehicle, conflict.gap, conflict.leaderSpeed));
      }

      if (vehicle.brakeUntil > this.time) accel = Math.min(accel, -6.5);
      vehicle.acceleration = accel;
      vehicle.speed = clamp(vehicle.speed + accel * dt, 0, vehicle.maxSpeed);

      if (vehicle.brakeUntil > this.time && vehicle.speed < 0.35) vehicle.speed = 0;
      else if (vehicle.speed < 0.05 && accel <= 0) vehicle.speed = 0;

      // 교차로 안에 들어온 차는 서로 막히지 않게 천천히 빠져나감
      if (
        seg.kind === "connector" &&
        vehicle.brakeUntil <= this.time &&
        vehicle.leaderGap > vehicle.minGap + 1 &&
        vehicle.speed < 2
      ) {
        vehicle.speed = Math.min(vehicle.maxSpeed, 3);
        vehicle.acceleration = Math.max(vehicle.acceleration, 1.2);
      }

      if (vehicle.shift > 0) vehicle.shift = Math.max(0, vehicle.shift - dt / 1.6);
      const ds = vehicle.speed * dt;
      vehicle.s += ds;
      vehicle.distance += ds;

      if (vehicle.speed < 1) vehicle.waitTime += dt;
      this.holdAtLine(vehicle, seg);
    }

    for (const vehicle of this.vehicles) this.advance(vehicle);
    this.separate();

    for (const vehicle of this.vehicles) this.advance(vehicle);

    const done: SimVehicle[] = [];

    for (const vehicle of this.vehicles) {
      const seg = this.segment(vehicle);
      this.syncPose(vehicle);
      this.syncState(vehicle, seg);

      if (vehicle.routeIndex >= vehicle.route.length - 1 && vehicle.s >= seg.length - 0.2) done.push(vehicle);
    }

    if (done.length > 0) {
      const drop = new Set(done.map((vehicle) => vehicle.id));

      for (const vehicle of done) {
        this.travelTimes.push(Math.max(0, this.time - vehicle.enteredAt));
        this.waitTimes.push(vehicle.waitTime);
      }

      this.vehicles = this.vehicles.filter((vehicle) => !drop.has(vehicle.id));
    }

    this.maxQueue = Math.max(this.maxQueue, this.measureQueue());
  }

  /** IDM으로 가속도를 계산함 */
  private accel(vehicle: SimVehicle, gap: number, leaderSpeed: number, minGap = vehicle.minGap): number {
    return idmAcceleration({
      speed: vehicle.speed,
      desiredSpeed: vehicle.maxSpeed,
      gap,
      leaderSpeed,
      minGap,
      maxAccel: vehicle.maxAccel,
      brake: vehicle.brake,
    });
  }

  /** 서야 하는 차를 정지선 앞에 붙잡아 둠 */
  private holdAtLine(vehicle: SimVehicle, seg: Segment): void {
    if (seg.kind !== "approach") return;
    const gapToLine = seg.length - vehicle.s;
    const color = lightFor(this.signal, vehicle.approach, vehicle.movement);

    if (!shouldStop(color, gapToLine, vehicle.speed, vehicle.brake)) return;
    const limit = seg.length - 0.7;

    if (vehicle.s > limit) {
      vehicle.s = limit;
      vehicle.speed = 0;
    }
  }

  /** 같은 경로의 바로 앞차까지 간격과 속도를 계산함 */
  private leaderConstraint(
    vehicle: SimVehicle,
    seg: Segment,
    buckets: Map<string, SimVehicle[]>,
  ): LeaderGap {
    const mates = buckets.get(seg.id) ?? [];

    for (const other of mates) {
      if (other.s > vehicle.s + 0.05) {
        return { gap: other.s - vehicle.s - VEHICLE_LENGTH, leaderSpeed: other.speed };
      }
    }

    const nextId = vehicle.route[vehicle.routeIndex + 1];

    if (!nextId) return { gap: Number.POSITIVE_INFINITY, leaderSpeed: vehicle.maxSpeed };
    const nexts = buckets.get(nextId) ?? [];

    if (nexts.length === 0) return { gap: Number.POSITIVE_INFINITY, leaderSpeed: vehicle.maxSpeed };
    const first = nexts[0];

    return {
      gap: seg.length - vehicle.s + first.s - VEHICLE_LENGTH,
      leaderSpeed: first.speed,
    };
  }

  /** 진행 방향 앞에 있는 다른 차를 앞차로 봄 교차로 안에서는 건너뜀 */
  private conflictConstraint(vehicle: SimVehicle): LeaderGap | null {
    const seg = this.segment(vehicle);

    // 교차로 안에서는 교차 차량끼리 서로 세우지 않음 같은 차선 앞차는 그대로 따라감
    if (seg.kind === "connector") return null;

    if (seg.kind === "depart" && vehicle.s > 10) return null;
    const fx = Math.sin(vehicle.heading);
    const fz = Math.cos(vehicle.heading);
    let best: LeaderGap | null = null;

    for (const other of this.vehicles) {
      if (other.id === vehicle.id) continue;
      const dx = other.position.x - vehicle.position.x;
      const dz = other.position.z - vehicle.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 16 || dist < 0.01) continue;
      const along = dx * fx + dz * fz;

      if (along < 1.1) continue;
      const lateral = Math.abs(dx * fz - dz * fx);

      if (lateral > 2.05) continue;
      const gap = dist - VEHICLE_LENGTH;

      if (!best || gap < best.gap) best = { gap, leaderSpeed: other.speed };
    }

    return best;
  }

  /** 구간 끝을 지나면 다음 구간으로 넘김 */
  private advance(vehicle: SimVehicle): void {
    for (let guard = 0; guard < 4 && vehicle.routeIndex < vehicle.route.length - 1; guard += 1) {
      const seg = this.segment(vehicle);

      if (vehicle.s < seg.length) return;
      vehicle.s -= seg.length;
      vehicle.routeIndex += 1;
    }
  }

  /** 같은 차선에서 범퍼가 겹치면 뒷차를 뒤로 당김 */
  private separate(): void {
    for (const list of this.buckets().values()) {
      for (let i = list.length - 1; i > 0; i -= 1) {
        const ahead = list[i];
        const behind = list[i - 1];
        const maxS = ahead.s - VEHICLE_LENGTH - 0.45;

        if (behind.s > maxS) {
          behind.s = Math.max(0, maxS);
          behind.speed = Math.min(behind.speed, ahead.speed);
        }
      }
    }
  }

  /** 분당 횟수에 맞춰 끼어들기와 급정거를 자동으로 시킴 0이면 버튼만 동작함 */
  private considerIncidents(): void {
    if (this.config.cutInsPerMinute > 0 && this.time >= this.nextAutoCut) {
      this.cutInRandom();
      this.nextAutoCut = this.time + 60 / this.config.cutInsPerMinute;
    }

    if (this.config.brakesPerMinute > 0 && this.time >= this.nextAutoBrake) {
      this.hardBrakeRandom();
      this.nextAutoBrake = this.time + 60 / this.config.brakesPerMinute;
    }
  }

  /** 끼어들 옆 차선을 고름 수동이면 빈 차선도 허용함 */
  private pickCutLane(vehicle: SimVehicle, manual: boolean): number | null {
    const seg = this.segment(vehicle);

    if (seg.kind === "connector") return null;

    if (!manual && vehicle.s < 14) return null;

    if (!manual && seg.kind === "approach" && seg.length - vehicle.s < 12) return null;
    const disturb = vehicle.minGap + Math.max(0, vehicle.speed) * 1.15;
    let best: { lane: number; rear: number } | null = null;

    for (const lane of [seg.laneIndex - 1, seg.laneIndex + 1]) {
      if (lane < 0 || lane >= this.network.laneCount) continue;
      const next = this.neighborSegment(seg, lane);

      if (!next) continue;
      const gap = this.slot(next.id, vehicle.s, vehicle.id);

      if (gap.front < 0.8 || gap.rear < 0.8) continue;

      if (!manual && (gap.rear > disturb || gap.rear > 18)) continue;

      if (!best || gap.rear < best.rear) best = { lane, rear: gap.rear };
    }

    return best?.lane ?? null;
  }

  /** 그 위치의 앞뒤 범퍼 간격을 계산함 차가 없으면 40m로 봄 */
  private slot(segmentId: string, s: number, selfId: string): LaneSlot {
    let ahead = Number.POSITIVE_INFINITY;
    let behind = Number.POSITIVE_INFINITY;

    for (const other of this.vehicles) {
      if (other.id === selfId || other.route[other.routeIndex] !== segmentId) continue;
      const delta = other.s - s;

      if (delta >= 0) ahead = Math.min(ahead, delta);
      else behind = Math.min(behind, -delta);
    }

    return {
      front: Number.isFinite(ahead) ? ahead - VEHICLE_LENGTH : 40,
      rear: Number.isFinite(behind) ? behind - VEHICLE_LENGTH : 40,
    };
  }

  /** 옆 차선 구간을 찾음 교차로 연결 구간에서는 끼어들지 않음 */
  private neighborSegment(current: Segment, lane: number): Segment | undefined {
    if (current.kind === "connector") return undefined;

    return this.network.segments.get(laneSegmentId(lane));
  }

  /** 경로를 옆 차선으로 바꾸고 1.6초에 걸쳐 옆으로 옮김 */
  private beginCut(vehicle: SimVehicle, lane: number): void {
    const current = this.segment(vehicle);
    const next = this.neighborSegment(current, lane);

    if (!next) return;
    vehicle.shiftFrom = current.id;
    vehicle.shift = 1;

    if (current.kind === "approach") {
      vehicle.route = buildRoute(vehicle.approach, lane, vehicle.movement);
      vehicle.routeIndex = 0;
    } else {
      vehicle.route[vehicle.routeIndex] = next.id;
    }

    vehicle.laneIndex = lane;
    vehicle.cutReadyAt = this.time + 4;
    this.cutIns += 1;
    this.log(`${vehicle.id} 끼어들기`);
    this.cached = null;
  }

  /** 같은 차선 40m 안에 뒤차가 있는지 확인함 */
  private followerNearby(vehicle: SimVehicle): boolean {
    const seg = vehicle.route[vehicle.routeIndex];

    return this.vehicles.some(
      (other) =>
        other.id !== vehicle.id &&
        other.route[other.routeIndex] === seg &&
        other.s < vehicle.s - 0.5 &&
        vehicle.s - other.s < 40,
    );
  }

  /** 목록에서 시드 난수로 하나를 고름 */
  private pickRandom<T>(items: T[]): T | null {
    if (items.length === 0) return null;

    return items[Math.floor(this.behaviorRng.next() * items.length)] ?? null;
  }

  /** 같은 시드면 같은 순서가 되도록 섞음 */
  private shuffled<T>(items: T[]): T[] {
    const copy = [...items];

    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.behaviorRng.next() * (i + 1));
      const swap = copy[i];
      copy[i] = copy[j];
      copy[j] = swap;
    }

    return copy;
  }

  /** 최근 사건 12개만 남김 */
  private log(text: string): void {
    this.events.push({ t: this.time, text });

    if (this.events.length > 12) this.events.shift();
  }

  /** 거리 s를 좌표와 방향으로 바꿈 끼어드는 중이면 옆으로 섞음 */
  private syncPose(vehicle: SimVehicle): void {
    const seg = this.segment(vehicle);
    const along = Math.min(Math.max(0, vehicle.s), seg.length);
    const pose = samplePolyline(seg.polyline, along);
    let position = pose.position;

    if (vehicle.shift > 0 && vehicle.shiftFrom) {
      const from = this.network.segments.get(vehicle.shiftFrom);

      if (from) {
        const origin = samplePolyline(from.polyline, Math.min(along, from.length)).position;
        const blend = vehicle.shift;
        position = {
          x: pose.position.x + (origin.x - pose.position.x) * blend,
          y: 0,
          z: pose.position.z + (origin.z - pose.position.z) * blend,
        };
      }
    }

    vehicle.position = position;
    vehicle.heading = pose.heading;
    vehicle.laneIndex = seg.laneIndex;
    vehicle.laneId = `${seg.approach}-${seg.laneIndex}`;
  }

  /** 속도와 동작으로 표시 상태를 정함 */
  private syncState(vehicle: SimVehicle, seg: Segment): void {
    if (vehicle.brakeUntil > this.time) vehicle.state = "BRAKING";
    else if (vehicle.shift > 0.02) vehicle.state = "CUTTING_IN";
    else if (seg.kind === "connector" && vehicle.movement !== "straight") vehicle.state = "TURNING";
    else if (seg.kind === "depart" && vehicle.s > seg.length * 0.7) vehicle.state = "EXITING";
    else if (vehicle.speed < 1.15) vehicle.state = "QUEUED";
    else if (vehicle.leaderGap < vehicle.minGap + 10) vehicle.state = "FOLLOWING";
    else if (seg.kind === "approach" && vehicle.s < 10) vehicle.state = "ENTERING";
    else vehicle.state = "DRIVING";
  }

  /** 느린 차가 이어진 줄의 길이를 잼 */
  private measureQueue(): number {
    let best = 0;

    for (const list of this.buckets().values()) {
      let start = -1;

      for (let i = 0; i < list.length; i += 1) {
        if (list[i].speed >= 2) {
          start = -1;
          continue;
        }

        if (start < 0 || list[i].s - list[i - 1].s > VEHICLE_LENGTH + 12) start = i;
        best = Math.max(best, list[i].s - list[start].s + VEHICLE_LENGTH);
      }
    }

    return best;
  }

  /** 같은 구간 차를 앞뒤 순으로 묶음 */
  private buckets(): Map<string, SimVehicle[]> {
    const map = new Map<string, SimVehicle[]>();

    for (const vehicle of this.vehicles) {
      const id = vehicle.route[vehicle.routeIndex];
      const list = map.get(id);

      if (list) list.push(vehicle);
      else map.set(id, [vehicle]);
    }

    for (const list of map.values()) {
      list.sort((a, b) => a.s - b.s || (a.id < b.id ? -1 : 1));
    }

    return map;
  }

  /** 차가 있는 도로 구간을 찾음 없으면 예외를 던짐 */
  private segment(vehicle: SimVehicle): Segment {
    const id = vehicle.route[vehicle.routeIndex];
    const seg = this.network.segments.get(id);

    if (!seg) throw new Error(`missing segment ${id}`);

    return seg;
  }

  /** 1초마다 속도 표본을 남김 */
  private sample(): void {
    const sec = Math.floor(this.time);

    while (this.lastSampleSec < sec) {
      this.lastSampleSec += 1;
      const vehicles = this.vehicles.map((vehicle) => this.toVehicle(vehicle));
      this.history.push(flowSample(this.lastSampleSec, vehicles));
    }
  }

  /** 차선별 차량 수를 만듦 */
  private laneRows(): LaneCount[] {
    const counts = new Map<string, number>();

    for (const vehicle of this.vehicles) {
      counts.set(vehicle.laneId, (counts.get(vehicle.laneId) ?? 0) + 1);
    }

    const rows: LaneCount[] = [];

    for (const approach of APPROACH_ORDER) {
      for (let lane = 0; lane < this.network.laneCount; lane += 1) {
        const laneId = `${approach}-${lane}`;
        rows.push({ laneId, label: laneLabel(approach, lane), count: counts.get(laneId) ?? 0 });
      }
    }

    return rows;
  }

  /** 방향별 차량 수를 만듦 */
  private approachRows(): LaneCount[] {
    const counts = new Map<ApproachId, number>();

    for (const approach of APPROACH_ORDER) counts.set(approach, 0);

    for (const vehicle of this.vehicles) {
      counts.set(vehicle.approach, (counts.get(vehicle.approach) ?? 0) + 1);
    }

    return APPROACH_ORDER.map((approach) => ({
      laneId: approach,
      label: APPROACH_LABEL[approach],
      count: counts.get(approach) ?? 0,
    }));
  }

  /** 내부 차를 화면용 차로 바꿈 */
  private toVehicle(vehicle: SimVehicle): Vehicle {
    return {
      id: vehicle.id,
      position: { ...vehicle.position },
      speed: vehicle.speed,
      maxSpeed: vehicle.maxSpeed,
      acceleration: vehicle.acceleration,
      laneId: vehicle.laneId,
      state: vehicle.state,
      heading: vehicle.heading,
      approach: vehicle.approach,
      movement: vehicle.movement,
      laneIndex: vehicle.laneIndex,
      enteredAt: vehicle.enteredAt,
      waitTime: vehicle.waitTime,
      distance: vehicle.distance,
    };
  }

  /** 현재 시각의 전체 상태를 만듦 */
  private buildSnapshot(): SimSnapshot {
    const vehicles = this.vehicles.map((vehicle) => this.toVehicle(vehicle));
    const currentQueue = this.measureQueue();

    return {
      time: this.time,
      duration: this.config.duration,
      finished: this.time >= this.config.duration - 1e-6,
      laneCount: this.network.laneCount,
      vehicles,
      signals: this.signal,
      stats: computeStats({
        time: this.time,
        vehicles,
        travelTimes: this.travelTimes,
        waitTimes: this.waitTimes,
        currentQueueLength: currentQueue,
        maxQueueLength: Math.max(this.maxQueue, currentQueue),
        laneCounts: this.laneRows(),
        approachCounts: this.approachRows(),
        cutIns: this.cutIns,
        hardBrakes: this.hardBrakes,
      }),
      history: this.history.map((sample) => ({ ...sample })),
      events: this.events.map((event) => ({ ...event })),
    };
  }
}

/** 끝날 때까지 돌려 마지막 상태를 돌려줌 */
export function runSimulation(config: SimConfig, dt = 0.25): SimSnapshot {
  const sim = new TrafficSimulation(config);
  const guard = Math.ceil(config.duration / dt) + 8;

  for (let i = 0; i < guard; i += 1) {
    if (!sim.step(dt) && sim.getSnapshot().finished) break;
  }

  return sim.getSnapshot();
}

/** 네 방향의 빈 도착 목록을 만듦 */
function emptyArrivals(): Record<ApproachId, Arrival[]> {
  return { eastbound: [], westbound: [], northbound: [], southbound: [] };
}

/** 네 방향의 도착 커서를 0으로 만듦 */
function emptyCursor(): Record<ApproachId, number> {
  return { eastbound: 0, westbound: 0, northbound: 0, southbound: 0 };
}
