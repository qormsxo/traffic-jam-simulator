import { AGE_BANDS, KIOSK_PHASES, type Customer, type CustomerGroup, type Order, type QueueSample, type Stats } from "./types";

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function kioskWaitOf(customer: Customer, now: number): number | null {
  if (!customer.isOrderer) return null;
  if (customer.kioskWait != null) return customer.kioskWait;
  if (customer.queueJoinedAt != null && customer.kioskStartedAt == null && customer.state !== "COMPLETED") {
    return Math.max(0, now - customer.queueJoinedAt);
  }
  return null;
}

export function computeStats(input: {
  time: number;
  customers: Customer[];
  groups: CustomerGroup[];
  orders: Order[];
  queueHistory: QueueSample[];
}): Stats {
  const { time, customers, groups, orders, queueHistory } = input;
  const arrived = customers.filter((customer) => customer.enteredAt != null);
  const inStore = arrived.filter((customer) => customer.state !== "COMPLETED");
  const waiting = inStore.filter((customer) => customer.state === "WAITING_FOR_KIOSK");
  const kioskUsers = inStore.filter(
    (customer) => customer.isOrderer && KIOSK_PHASES.includes(customer.state),
  );
  const completed = arrived.filter((customer) => customer.exitedAt != null);
  const orderers = arrived.filter((customer) => customer.isOrderer);

  const waits = orderers
    .map((customer) => kioskWaitOf(customer, time))
    .filter((value): value is number => value != null);
  const uses = orderers
    .filter((customer) => customer.kioskStartedAt != null && customer.orderedAt != null)
    .map((customer) => customer.orderedAt! - customer.kioskStartedAt!);
  const decisions = orderers
    .filter((customer) => customer.orderedAt != null)
    .map((customer) => customer.decisionTime);
  const foodWaits = orders
    .filter((order) => order.status === "ready" || order.status === "picked-up")
    .map((order) => order.preparationTime);
  const dwells = completed.map((customer) => customer.exitedAt! - customer.enteredAt);
  const preps = orders.map((order) => order.preparationTime);

  const soloCustomers = groups.filter((group) => group.size === 1).reduce((sum, group) => sum + group.size, 0);
  const multi = groups.filter((group) => group.size >= 2);
  const groupCustomers = multi.reduce((sum, group) => sum + group.size, 0);

  const byAge = AGE_BANDS.map((band) => {
    const members = orderers.filter(
      (customer) => customer.ageBand === band.id && customer.kioskStartedAt != null && customer.orderedAt != null,
    );
    return {
      band: band.id,
      label: band.label,
      customers: arrived.filter((customer) => customer.ageBand === band.id).length,
      avgUse: mean(members.map((customer) => customer.orderedAt! - customer.kioskStartedAt!)),
    };
  });

  return {
    inStore: inStore.length,
    waiting: waiting.length,
    kioskUsers: kioskUsers.length,
    preparingOrders: orders.filter((order) => order.status === "preparing" || order.status === "queued").length,
    readyOrders: orders.filter((order) => order.status === "ready").length,
    avgKioskWait: mean(waits),
    avgKioskUse: mean(uses),
    avgDecision: mean(decisions),
    avgFoodWait: mean(foodWaits),
    avgDwell: mean(dwells),
    maxKioskWait: waits.length ? Math.max(...waits) : null,
    avgPrep: mean(preps),
    avgQueue: mean(queueHistory.map((sample) => sample.waiting)),
    completedCustomers: completed.length,
    throughputPerHour: time > 0 ? completed.length / (time / 3600) : null,
    soloCustomers,
    groupCustomers,
    avgGroupSize: mean(multi.map((group) => group.size)),
    arrivedCustomers: arrived.length,
    byAge,
  };
}
