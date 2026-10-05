import { clamp, vec, type Vec3 } from "../core/vec";

export type Polyline = {
  points: Vec3[];
  cumulative: number[];
  length: number;
};

/** 너무 가까운 점을 빼고 거리 누적표를 만듦 */
export function makePolyline(points: Vec3[]): Polyline {
  const clean: Vec3[] = [];

  for (const point of points) {
    const prev = clean[clean.length - 1];

    if (!prev || Math.hypot(point.x - prev.x, point.z - prev.z) > 0.04) clean.push(point);
  }

  if (clean.length === 0) clean.push(vec(0, 0, 0));

  if (clean.length === 1) clean.push(vec(clean[0].x + 0.01, 0, clean[0].z));
  const cumulative = [0];

  for (let i = 1; i < clean.length; i += 1) {
    const prev = clean[i - 1];
    const next = clean[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(next.x - prev.x, next.z - prev.z));
  }

  return { points: clean, cumulative, length: cumulative[cumulative.length - 1] };
}

type PolylineSample = {
  position: Vec3;
  heading: number;
};

/** 경로 위 거리 s의 위치와 진행 방향을 계산함 */
export function samplePolyline(path: Polyline, s: number): PolylineSample {
  const dist = clamp(s, 0, path.length);
  let index = 1;

  while (index < path.cumulative.length - 1 && path.cumulative[index] < dist) index += 1;
  const start = path.cumulative[index - 1];
  const end = path.cumulative[index];
  const span = Math.max(1e-6, end - start);
  const t = (dist - start) / span;
  const a = path.points[index - 1];
  const b = path.points[index];

  return {
    position: vec(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t),
    heading: Math.atan2(b.x - a.x, b.z - a.z),
  };
}

/** 베지어 곡선을 점 목록으로 나눔 */
export function cubicBezier(p0: Vec3, c1: Vec3, c2: Vec3, p1: Vec3, steps = 12): Vec3[] {
  const points: Vec3[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push(
      vec(
        u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
        0,
        u * u * u * p0.z + 3 * u * u * t * c1.z + 3 * u * t * t * c2.z + t * t * t * p1.z,
      ),
    );
  }

  return points;
}
