import { dist2d, type Vec3 } from "./vec";

export const ARRIVE_DISTANCE = 0.16;

/** 목표를 향해 직선으로 한 칸 이동함. 순간이동은 하지 않음. */
export function moveToward(position: Vec3, target: Vec3, speed: number, dt: number): boolean {
  const dx = target.x - position.x;
  const dz = target.z - position.z;
  const dist = Math.hypot(dx, dz);

  if (dist <= ARRIVE_DISTANCE) {
    position.x = target.x;
    position.z = target.z;

    return true;
  }

  const step = Math.min(dist, Math.max(0, speed) * dt);
  position.x += (dx / dist) * step;
  position.z += (dz / dist) * step;

  return dist - step <= ARRIVE_DISTANCE;
}

/** 목표 지점에 도착했는지 확인함. */
export function hasArrived(position: Vec3, target: Vec3): boolean {
  return dist2d(position, target) <= ARRIVE_DISTANCE;
}
