import { add, vec, type Vec3 } from "../core/vec";

export type KioskSpot = {
  id: string;
  position: Vec3;
  stand: Vec3;
  companionAnchor: Vec3;
};

export type Layout = {
  entrance: Vec3;
  exit: Vec3;
  kiosks: KioskSpot[];
  queueSlots: Vec3[];
  waitSpots: Vec3[];
  pickupSpots: Vec3[];
};

export const FLOOR = { width: 16, depth: 12 };

const MEMBER_OFFSETS: Vec3[] = [
  vec(0, 0, 0),
  vec(0.42, 0, 0.3),
  vec(-0.42, 0, 0.3),
  vec(0.28, 0, -0.36),
  vec(-0.28, 0, -0.36),
  vec(0, 0, 0.62),
];

export function memberOffset(index: number): Vec3 {
  return MEMBER_OFFSETS[index % MEMBER_OFFSETS.length];
}

export function createLayout(kioskCount: number): Layout {
  const n = Math.min(5, Math.max(1, Math.round(kioskCount)));
  const spacing = 1.65;
  const total = (n - 1) * spacing;
  const startX = -total / 2 + 0.3;

  const kiosks: KioskSpot[] = Array.from({ length: n }, (_, i) => {
    const position = vec(startX + i * spacing, 0, 4.55);
    return {
      id: `k-${i + 1}`,
      position,
      stand: vec(position.x, 0, 3.5),
      companionAnchor: vec(position.x, 0, 2.7),
    };
  });

  const queueSlots = Array.from({ length: 16 }, (_, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    return vec(-6.35 + col * 0.8, 0, 3.05 - row * 0.92);
  });

  const waitSpots = Array.from({ length: 12 }, (_, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    return vec(-2.15 + col * 1.15, 0, 0.85 - row * 1.1);
  });

  const pickupSpots = Array.from({ length: 6 }, (_, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    return vec(3.55 + col * 1.05, 0, -1.15 - row * 0.7);
  });

  return {
    entrance: vec(-7.15, 0, 4.45),
    exit: vec(-7.15, 0, -4.45),
    kiosks,
    queueSlots,
    waitSpots,
    pickupSpots,
  };
}

export function slotPosition(slots: Vec3[], index: number): Vec3 {
  if (slots.length === 0) return vec(0, 0, 0);
  const base = slots[Math.min(Math.max(index, 0), slots.length - 1)];
  const overflow = Math.max(0, index - (slots.length - 1));
  return add(base, vec((overflow % 3) * 0.35, 0, -Math.floor(overflow / 3) * 0.35));
}
