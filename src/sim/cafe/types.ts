import type { Vec3 } from "../core/vec";

export const AGE_BANDS = [
  { id: "10s", label: "10대", min: 10, max: 19 },
  { id: "20s", label: "20대", min: 20, max: 29 },
  { id: "30s", label: "30대", min: 30, max: 39 },
  { id: "40s", label: "40대", min: 40, max: 49 },
  { id: "50s", label: "50대", min: 50, max: 59 },
  { id: "60s", label: "60대", min: 60, max: 69 },
  { id: "70s", label: "70대 이상", min: 70, max: 85 },
] as const;

export type AgeBand = (typeof AGE_BANDS)[number]["id"];

export type CustomerState =
  | "ENTERING"
  | "WAITING_FOR_KIOSK"
  | "USING_KIOSK"
  | "DECIDING_MENU"
  | "PAYING"
  | "WAITING_FOR_FOOD"
  | "PICKING_UP"
  | "EXITING"
  | "COMPLETED";

export type OrderStatus = "queued" | "preparing" | "ready" | "picked-up";

export type KioskStrategy = "nearest" | "shortest-queue" | "random";

export type Range = {
  min: number;
  max: number;
};

export type AgeWeights = Record<AgeBand, number>;

export type SimConfig = {
  customerCount: number;
  kioskCount: number;
  groupRatio: number;
  avgGroupSize: number;
  ageWeights: AgeWeights;
  decisionTime: Range;
  paymentTime: Range;
  movementSpeed: number;
  prepTime: Range;
  duration: number;
  seed: number;
  kioskStrategy: KioskStrategy;
};

export type Order = {
  id: string;
  customerId: string;
  groupId?: string;
  orderedAt: number;
  preparationTime: number;
  status: OrderStatus;
};

export type Customer = {
  id: string;
  age: number;
  ageBand: AgeBand;
  position: Vec3;
  target: Vec3;
  state: CustomerState;
  groupId?: string;
  groupSize: number;
  isOrderer: boolean;
  decisionTime: number;
  paymentTime: number;
  operationTime: number;
  movementSpeed: number;
  order?: Order;
  enteredAt: number;
  queueJoinedAt?: number;
  kioskStartedAt?: number;
  orderedAt?: number;
  foodReadyAt?: number;
  pickedUpAt?: number;
  exitedAt?: number;
  kioskWait?: number;
};

export type CustomerGroup = {
  id: string;
  size: number;
  customerIds: string[];
  ordererId: string;
  arrivalTime: number;
  state: CustomerState;
  kioskId?: string;
  orderId?: string;
  queueIndex: number;
  waitIndex: number;
  phaseRemaining: number;
  preparationTime: number;
};

export type Kiosk = {
  id: string;
  position: Vec3;
  status: "idle" | "occupied";
  currentCustomerId?: string;
};

export type QueueSample = {
  t: number;
  waiting: number;
  inStore: number;
};

export type AgeStat = {
  band: AgeBand;
  label: string;
  customers: number;
  avgUse: number | null;
};

export type Stats = {
  inStore: number;
  waiting: number;
  kioskUsers: number;
  preparingOrders: number;
  readyOrders: number;
  avgKioskWait: number | null;
  avgKioskUse: number | null;
  avgDecision: number | null;
  avgFoodWait: number | null;
  avgDwell: number | null;
  maxKioskWait: number | null;
  avgPrep: number | null;
  avgQueue: number | null;
  completedCustomers: number;
  throughputPerHour: number | null;
  soloCustomers: number;
  groupCustomers: number;
  avgGroupSize: number | null;
  arrivedCustomers: number;
  byAge: AgeStat[];
};

export type SimSnapshot = {
  time: number;
  duration: number;
  finished: boolean;
  customers: Customer[];
  groups: CustomerGroup[];
  kiosks: Kiosk[];
  orders: Order[];
  queueGroupIds: string[];
  stats: Stats;
  queueHistory: QueueSample[];
};

export type MemberBlueprint = {
  age: number;
  ageBand: AgeBand;
  movementSpeed: number;
  decisionTime: number;
  paymentTime: number;
  operationTime: number;
};

export type PartyBlueprint = {
  id: string;
  arrivalTime: number;
  members: MemberBlueprint[];
  ordererIndex: number;
  preparationTime: number;
};

export const STATE_LABEL: Record<CustomerState, string> = {
  ENTERING: "입장",
  WAITING_FOR_KIOSK: "키오스크 대기",
  USING_KIOSK: "키오스크 조작",
  DECIDING_MENU: "메뉴 고민",
  PAYING: "결제",
  WAITING_FOR_FOOD: "음식 대기",
  PICKING_UP: "픽업",
  EXITING: "퇴장",
  COMPLETED: "완료",
};

export const KIOSK_PHASES: CustomerState[] = ["USING_KIOSK", "DECIDING_MENU", "PAYING"];
