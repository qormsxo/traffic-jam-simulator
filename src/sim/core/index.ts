/**
 * 화면과 분리된 공통 부품
 * 시드 난수, 직선 이동, 대기열만 둠 양보와 신호 규칙은 각 시뮬레이션에 둠
 */
export { add, clamp, dist2d, lerp, vec, type Vec3 } from "./vec";

export { mulberry32, type Rng } from "./rng";

export { ARRIVE_DISTANCE, hasArrived, moveToward } from "./movement";

export { Fifo } from "./queue";
