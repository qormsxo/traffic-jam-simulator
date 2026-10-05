import { vec, type Vec3 } from "../core/vec";
import { LANE_WIDTH, ROAD_LENGTH } from "./constants";
import { makePolyline, type Polyline } from "./path";
import type { ApproachId, Movement } from "./types";

export type SegmentKind = "approach" | "connector" | "depart";

export type Segment = {
  id: string;
  kind: SegmentKind;
  approach: ApproachId;
  laneIndex: number;
  movement?: Movement;
  length: number;
  polyline: Polyline;
};

export type Slab = {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
};

export type Marking = {
  from: Vec3;
  to: Vec3;
  color: string;
  width: number;
};

export type SignalPole = {
  approach: ApproachId;
  position: Vec3;
  rotation: number;
};

export type RoadLabel = {
  text: string;
  position: Vec3;
};

export type Network = {
  laneCount: number;
  laneWidth: number;
  armLength: number;
  half: number;
  segments: Map<string, Segment>;
  slabs: Slab[];
  markings: Marking[];
  poles: SignalPole[];
  labels: RoadLabel[];
};

/** 차선 구간 id를 만듦. 끼어들기는 이 id만 바꿈. */
export function laneSegmentId(laneIndex: number): string {
  return `lane-${laneIndex}`;
}

/** 한 방향이라 경로는 그 차선 하나임. 방향과 회전은 경로에 쓰지 않음. */
export function buildRoute(approach: ApproachId, laneIndex: number, movement: Movement): string[] {
  void approach;
  void movement;

  return [laneSegmentId(laneIndex)];
}

/** 서쪽→동쪽 도로를 만듦. 정지선은 없고 끼어들기와 급정거만 줄을 만듦. */
export function buildNetwork(laneCount: number): Network {
  const count = Math.max(1, Math.min(4, Math.round(laneCount)));
  const width = count * LANE_WIDTH;
  const half = width / 2;
  const segments = new Map<string, Segment>();

  for (let lane = 0; lane < count; lane += 1) {
    const z = laneOffset(lane, count);

    const polyline = makePolyline([
      vec(-ROAD_LENGTH / 2, 0, z),
      vec(ROAD_LENGTH / 2, 0, z),
    ]);

    const id = laneSegmentId(lane);
    segments.set(id, {
      id,
      kind: "depart",
      approach: "eastbound",
      laneIndex: lane,
      movement: "straight",
      length: polyline.length,
      polyline,
    });
  }

  return {
    laneCount: count,
    laneWidth: LANE_WIDTH,
    armLength: ROAD_LENGTH / 2,
    half,
    segments,
    slabs: slabs(half),
    markings: markings(count),
    poles: [],
    labels: [
      { text: "진입", position: vec(-ROAD_LENGTH / 2 + 10, 0, half + 3.2) },
      { text: "진출", position: vec(ROAD_LENGTH / 2 - 10, 0, half + 3.2) },
    ],
  };
}

/** 0번 차선이 가장 왼쪽이 되도록 도로 중심에 맞춤. */
function laneOffset(laneIndex: number, laneCount: number): number {
  return (laneIndex - (laneCount - 1) / 2) * LANE_WIDTH;
}

/** 도로 포장과 연석 상자를 만듦. */
function slabs(half: number): Slab[] {
  const asphalt = "#3c434a";
  const curb = "#667068";

  return [
    { position: [0, 0.012, 0], size: [ROAD_LENGTH + 1.6, 0.04, half * 2 + 2.2], color: curb },
    { position: [0, 0.04, 0], size: [ROAD_LENGTH, 0.05, half * 2], color: asphalt },
  ];
}

/** 가장자리 실선과 차선 사이 점선을 만듦. */
function markings(laneCount: number): Marking[] {
  const half = (laneCount * LANE_WIDTH) / 2;
  const x0 = -ROAD_LENGTH / 2;
  const x1 = ROAD_LENGTH / 2;

  const lines: Marking[] = [
    solid(vec(x0, 0, -half), vec(x1, 0, -half), "#e7edf2", 0.14),
    solid(vec(x0, 0, half), vec(x1, 0, half), "#e7edf2", 0.14),
  ];

  for (let lane = 0; lane < laneCount - 1; lane += 1) {
    const z = -half + (lane + 1) * LANE_WIDTH;
    lines.push(...dashes(vec(x0 + 1.2, 0, z), vec(x1 - 1.2, 0, z), "#f4f7fb", 0.12));
  }

  return lines;
}

/** 실선 하나를 만듦. */
function solid(from: Vec3, to: Vec3, color: string, width: number): Marking {
  return { from, to, color, width };
}

/** 점선으로 나눈 선 목록을 만듦. */
function dashes(from: Vec3, to: Vec3, color: string, width: number): Marking[] {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);

  if (length < 0.8) return [];
  const ux = dx / length;
  const uz = dz / length;
  const dash = 3;
  const gap = 2.4;
  const out: Marking[] = [];
  let cursor = 0;

  while (cursor < length - 0.3) {
    const end = Math.min(length, cursor + dash);
    out.push({
      from: vec(from.x + ux * cursor, 0, from.z + uz * cursor),
      to: vec(from.x + ux * end, 0, from.z + uz * end),
      color,
      width,
    });
    cursor += dash + gap;
  }

  return out;
}
