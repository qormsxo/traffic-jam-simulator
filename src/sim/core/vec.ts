export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

/** 좌표를 만듦 */
export function vec(x: number, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

/** 두 좌표를 더함 */
export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** 지면 위 거리를 계산함 */
export function dist2d(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** min과 max 사이를 t 비율로 보간함 */
export function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

/** 값을 min과 max 사이로 자름 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
