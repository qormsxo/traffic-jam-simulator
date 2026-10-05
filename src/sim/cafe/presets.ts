import { clamp } from "../core/vec";
import { AGE_BANDS, type AgeWeights, type SimConfig } from "./types";

export const BALANCED_AGES: AgeWeights = {
  "10s": 10,
  "20s": 22,
  "30s": 22,
  "40s": 18,
  "50s": 14,
  "60s": 9,
  "70s": 5,
};

export const YOUNG_AGES: AgeWeights = {
  "10s": 28,
  "20s": 34,
  "30s": 22,
  "40s": 8,
  "50s": 4,
  "60s": 3,
  "70s": 1,
};

export const OLDER_AGES: AgeWeights = {
  "10s": 2,
  "20s": 5,
  "30s": 8,
  "40s": 14,
  "50s": 20,
  "60s": 26,
  "70s": 25,
};

export const defaultConfig: SimConfig = {
  customerCount: 40,
  kioskCount: 2,
  groupRatio: 0.28,
  avgGroupSize: 3,
  ageWeights: { ...BALANCED_AGES },
  decisionTime: { min: 4, max: 40 },
  paymentTime: { min: 3, max: 30 },
  movementSpeed: 1.15,
  prepTime: { min: 20, max: 55 },
  duration: 600,
  seed: 42,
  kioskStrategy: "nearest",
};

function sanitizeRange(range: { min: number; max: number }, lo: number, hi: number) {
  let min = clamp(range.min, lo, hi);
  let max = clamp(range.max, lo, hi);
  if (min > max) [min, max] = [max, min];
  return { min, max };
}

export function normalizeConfig(input: SimConfig): SimConfig {
  const weights = {} as AgeWeights;
  for (const band of AGE_BANDS) {
    weights[band.id] = Math.max(0, input.ageWeights?.[band.id] ?? 0);
  }
  const weightSum = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (weightSum <= 0) Object.assign(weights, BALANCED_AGES);

  const strategy = input.kioskStrategy ?? "nearest";

  return {
    customerCount: clamp(Math.round(input.customerCount), 1, 300),
    kioskCount: clamp(Math.round(input.kioskCount), 1, 5),
    groupRatio: clamp(input.groupRatio, 0, 1),
    avgGroupSize: clamp(input.avgGroupSize, 2, 6),
    ageWeights: weights,
    decisionTime: sanitizeRange(input.decisionTime, 1, 120),
    paymentTime: sanitizeRange(input.paymentTime, 1, 60),
    movementSpeed: clamp(input.movementSpeed, 0.4, 4),
    prepTime: sanitizeRange(input.prepTime, 1, 300),
    duration: clamp(input.duration, 30, 3600),
    seed: Number.isFinite(input.seed) ? Math.round(input.seed) : 1,
    kioskStrategy: strategy === "random" || strategy === "shortest-queue" ? strategy : "nearest",
  };
}

export type DayKind = "weekday" | "dayoff";
export type DaypartId = "morning" | "lunch" | "afternoon" | "evening" | "close";

export type SituationPatch = Pick<
  SimConfig,
  "customerCount" | "groupRatio" | "avgGroupSize" | "ageWeights" | "decisionTime" | "paymentTime" | "prepTime"
>;

export type Daypart = {
  id: DaypartId;
  label: string;
  hours: string;
};

export const DAY_KINDS: { id: DayKind; label: string }[] = [
  { id: "weekday", label: "평일" },
  { id: "dayoff", label: "쉬는날" },
];

export const DAYPARTS: Daypart[] = [
  { id: "morning", label: "오전", hours: "8–11시" },
  { id: "lunch", label: "점심", hours: "11–14시" },
  { id: "afternoon", label: "오후", hours: "14–17시" },
  { id: "evening", label: "저녁", hours: "17–20시" },
  { id: "close", label: "마감", hours: "20–22시" },
];

const SITUATIONS: Record<DayKind, Record<DaypartId, { note: string; patch: SituationPatch }>> = {
  weekday: {
    morning: {
      note: "출근 시간이라 직장인이 혼자 많이 들어옵니다.",
      patch: {
        customerCount: 80,
        groupRatio: 0.12,
        avgGroupSize: 2,
        ageWeights: { "10s": 1, "20s": 12, "30s": 28, "40s": 30, "50s": 22, "60s": 5, "70s": 2 },
        decisionTime: { min: 2, max: 10 },
        paymentTime: { min: 2, max: 10 },
        prepTime: { min: 10, max: 28 },
      },
    },
    lunch: {
      note: "점심이라 직장인 무리가 몰립니다.",
      patch: {
        customerCount: 100,
        groupRatio: 0.42,
        avgGroupSize: 3,
        ageWeights: { "10s": 1, "20s": 10, "30s": 28, "40s": 32, "50s": 22, "60s": 5, "70s": 2 },
        decisionTime: { min: 3, max: 12 },
        paymentTime: { min: 3, max: 10 },
        prepTime: { min: 25, max: 65 },
      },
    },
    afternoon: {
      note: "점심 이후라 한산하고, 주문은 짧게 끝냅니다.",
      patch: {
        customerCount: 32,
        groupRatio: 0.16,
        avgGroupSize: 2,
        ageWeights: { "10s": 1, "20s": 10, "30s": 26, "40s": 28, "50s": 22, "60s": 8, "70s": 5 },
        decisionTime: { min: 4, max: 15 },
        paymentTime: { min: 3, max: 12 },
        prepTime: { min: 15, max: 40 },
      },
    },
    evening: {
      note: "퇴근 뒤라 동료끼리 들어오고, 평일 중에는 주문이 가장 깁니다.",
      patch: {
        customerCount: 64,
        groupRatio: 0.4,
        avgGroupSize: 3,
        ageWeights: { "10s": 2, "20s": 12, "30s": 28, "40s": 30, "50s": 20, "60s": 6, "70s": 2 },
        decisionTime: { min: 8, max: 25 },
        paymentTime: { min: 6, max: 18 },
        prepTime: { min: 22, max: 55 },
      },
    },
    close: {
      note: "평일 마감은 손님이 줄고 젊은 비중이 높습니다.",
      patch: {
        customerCount: 22,
        groupRatio: 0.22,
        avgGroupSize: 2,
        ageWeights: { "10s": 4, "20s": 38, "30s": 30, "40s": 14, "50s": 8, "60s": 4, "70s": 2 },
        decisionTime: { min: 3, max: 12 },
        paymentTime: { min: 3, max: 10 },
        prepTime: { min: 12, max: 30 },
      },
    },
  },
  dayoff: {
    morning: {
      note: "쉬는날 오전은 하루 중 가장 한산합니다.",
      patch: {
        customerCount: 40,
        groupRatio: 0.18,
        avgGroupSize: 2,
        ageWeights: { "10s": 8, "20s": 12, "30s": 14, "40s": 16, "50s": 18, "60s": 18, "70s": 14 },
        decisionTime: { min: 12, max: 40 },
        paymentTime: { min: 8, max: 30 },
        prepTime: { min: 12, max: 35 },
      },
    },
    lunch: {
      note: "쉬는날 점심은 가족 손님이 가장 많이 몰립니다.",
      patch: {
        customerCount: 160,
        groupRatio: 0.5,
        avgGroupSize: 4,
        ageWeights: { "10s": 20, "20s": 14, "30s": 22, "40s": 20, "50s": 12, "60s": 8, "70s": 4 },
        decisionTime: { min: 12, max: 40 },
        paymentTime: { min: 8, max: 30 },
        prepTime: { min: 25, max: 60 },
      },
    },
    afternoon: {
      note: "쉬는날 오후도 손님이 많고, 메뉴를 오래 봅니다.",
      patch: {
        customerCount: 140,
        groupRatio: 0.35,
        avgGroupSize: 3,
        ageWeights: { "10s": 14, "20s": 22, "30s": 20, "40s": 16, "50s": 12, "60s": 10, "70s": 6 },
        decisionTime: { min: 15, max: 40 },
        paymentTime: { min: 10, max: 30 },
        prepTime: { min: 18, max: 45 },
      },
    },
    evening: {
      note: "쉬는날 저녁도 가족 손님이 많고 제조가 길어집니다.",
      patch: {
        customerCount: 150,
        groupRatio: 0.55,
        avgGroupSize: 4,
        ageWeights: { "10s": 18, "20s": 12, "30s": 22, "40s": 20, "50s": 14, "60s": 8, "70s": 6 },
        decisionTime: { min: 12, max: 40 },
        paymentTime: { min: 8, max: 30 },
        prepTime: { min: 28, max: 70 },
      },
    },
    close: {
      note: "쉬는날 마감은 젊은 손님이 남습니다.",
      patch: {
        customerCount: 36,
        groupRatio: 0.3,
        avgGroupSize: 2,
        ageWeights: { "10s": 8, "20s": 36, "30s": 26, "40s": 14, "50s": 8, "60s": 5, "70s": 3 },
        decisionTime: { min: 10, max: 35 },
        paymentTime: { min: 8, max: 28 },
        prepTime: { min: 12, max: 35 },
      },
    },
  },
};

export function situationOf(kind: DayKind, daypart: DaypartId): { note: string; patch: SituationPatch } {
  return SITUATIONS[kind][daypart];
}

export type AgeProfile = "young" | "balanced" | "older";

export function weightsForProfile(profile: AgeProfile): AgeWeights {
  if (profile === "young") return { ...YOUNG_AGES };
  if (profile === "older") return { ...OLDER_AGES };
  return { ...BALANCED_AGES };
}
