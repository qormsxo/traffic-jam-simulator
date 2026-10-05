import { Fifo } from "../core/queue";
import { mulberry32 } from "../core/rng";
import { add, type Vec3 } from "../core/vec";
import { hasArrived, moveToward } from "../core/movement";
import { createLayout, memberOffset, slotPosition, type KioskSpot, type Layout } from "./layout";
import { normalizeConfig } from "./presets";
import { buildSchedule } from "./schedule";
import { computeStats } from "./stats";
import { pickKiosk, type KioskChoice } from "./strategies";
import type {
  Customer,
  CustomerGroup,
  Kiosk,
  Order,
  PartyBlueprint,
  QueueSample,
  SimConfig,
  SimSnapshot,
} from "./types";

/**
 * Cafe clock. React and Three.js are not imported here.
 * `step(dt)` is the only way time moves. A future elevator or traffic
 * model can keep the same shape: seed a schedule, tick kinematics,
 * resolve queues, then publish a plain snapshot.
 *
 * MVP groups share one order. The orderer field is the extension point
 * for per-member orders later.
 */
export class CafeSimulation {
  private config: SimConfig;
  private layout: Layout;
  private schedule: PartyBlueprint[] = [];
  private cursor = 0;
  private strategyRng = mulberry32(1);
  private time = 0;
  private customers: Customer[] = [];
  private groups: CustomerGroup[] = [];
  private kiosks: KioskChoice[] = [];
  private orders: Order[] = [];
  private queue = new Fifo<string>();
  private queueHistory: QueueSample[] = [];
  private byId = new Map<string, Customer>();
  private groupById = new Map<string, CustomerGroup>();
  private kioskById = new Map<string, KioskChoice>();
  private customerSeq = 1;
  private groupSeq = 1;
  private orderSeq = 1;
  private waitCursor = 0;
  private lastSampleSec = 0;
  private cached: SimSnapshot | null = null;

  constructor(config: SimConfig) {
    this.config = normalizeConfig(config);
    this.layout = createLayout(this.config.kioskCount);
    this.reset(config);
  }

  reset(config: SimConfig): void {
    this.config = normalizeConfig(config);
    this.layout = createLayout(this.config.kioskCount);
    this.schedule = buildSchedule(this.config, mulberry32(this.config.seed));
    this.strategyRng = mulberry32((this.config.seed + 7919) >>> 0);
    this.cursor = 0;
    this.time = 0;
    this.customers = [];
    this.groups = [];
    this.orders = [];
    this.queue.clear();
    this.byId.clear();
    this.groupById.clear();
    this.kioskById.clear();
    this.customerSeq = 1;
    this.groupSeq = 1;
    this.orderSeq = 1;
    this.waitCursor = 0;
    this.lastSampleSec = 0;
    this.kiosks = this.layout.kiosks.map((spot) => this.makeKiosk(spot));
    for (const kiosk of this.kiosks) this.kioskById.set(kiosk.id, kiosk);
    this.queueHistory = [{ t: 0, waiting: 0, inStore: 0 }];
    this.cached = null;
  }

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

  getSnapshot(): SimSnapshot {
    if (!this.cached) this.cached = this.buildSnapshot();
    return this.cached;
  }

  private makeKiosk(spot: KioskSpot): KioskChoice {
    return {
      id: spot.id,
      position: { ...spot.position },
      stand: { ...spot.stand },
      companionAnchor: { ...spot.companionAnchor },
      status: "idle",
      queueLength: 0,
    };
  }

  private integrate(dt: number): void {
    this.spawnDue();
    this.advanceOrders();
    for (const group of this.groups) {
      if (group.state === "COMPLETED") continue;
      this.updateGroup(group, dt);
    }
    this.sample();
  }

  private spawnDue(): void {
    while (this.cursor < this.schedule.length && this.schedule[this.cursor].arrivalTime <= this.time) {
      this.spawn(this.schedule[this.cursor]);
      this.cursor += 1;
    }
  }

  private spawn(party: PartyBlueprint): void {
    const groupId = `g-${this.groupSeq++}`;
    const customerIds: string[] = [];

    party.members.forEach((member, index) => {
      const id = `c-${this.customerSeq++}`;
      customerIds.push(id);
      const position = add(this.layout.entrance, memberOffset(index));
      const customer: Customer = {
        id,
        age: member.age,
        ageBand: member.ageBand,
        position: { ...position },
        target: { ...position },
        state: "ENTERING",
        groupId,
        groupSize: party.members.length,
        isOrderer: index === party.ordererIndex,
        decisionTime: member.decisionTime,
        paymentTime: member.paymentTime,
        operationTime: member.operationTime,
        movementSpeed: member.movementSpeed,
        enteredAt: this.time,
      };
      this.customers.push(customer);
      this.byId.set(id, customer);
    });

    const group: CustomerGroup = {
      id: groupId,
      size: party.members.length,
      customerIds,
      ordererId: customerIds[party.ordererIndex],
      arrivalTime: party.arrivalTime,
      state: "ENTERING",
      queueIndex: -1,
      waitIndex: 0,
      phaseRemaining: 0,
      preparationTime: party.preparationTime,
    };
    this.groups.push(group);
    this.groupById.set(groupId, group);

    const kioskFree = this.kiosks.some((kiosk) => kiosk.status === "idle");
    if (kioskFree && this.queue.length === 0) {
      this.assignKiosk(group);
      this.setGroupState(group, "ENTERING");
      return;
    }

    this.queue.enqueue(group.id);
    const orderer = this.byId.get(group.ordererId);
    if (orderer) orderer.queueJoinedAt = this.time;
    this.syncQueueIndices();
    this.setGroupState(group, "WAITING_FOR_KIOSK");
  }

  private assignKiosk(group: CustomerGroup): boolean {
    const orderer = this.byId.get(group.ordererId);
    if (!orderer) return false;
    const kiosk = pickKiosk(this.config.kioskStrategy, this.kiosks, orderer.position, this.strategyRng);
    if (!kiosk) return false;
    kiosk.status = "occupied";
    kiosk.currentCustomerId = orderer.id;
    group.kioskId = kiosk.id;
    return true;
  }

  private serveNext(): void {
    while (this.queue.length > 0) {
      const nextId = this.queue.peek();
      if (!nextId) break;
      const group = this.groupById.get(nextId);
      if (!group) {
        this.queue.dequeue();
        continue;
      }
      if (!this.assignKiosk(group)) break;
      this.queue.dequeue();
    }
    this.syncQueueIndices();
  }

  private syncQueueIndices(): void {
    const queued = this.queue.toArray();
    const ids = new Set(queued);
    for (const group of this.groups) {
      if (!ids.has(group.id)) group.queueIndex = -1;
    }
    queued.forEach((id, index) => {
      const group = this.groupById.get(id);
      if (group) group.queueIndex = index;
    });
  }

  private setGroupState(group: CustomerGroup, state: CustomerGroup["state"]): void {
    group.state = state;
    for (const id of group.customerIds) {
      const customer = this.byId.get(id);
      if (customer && customer.state !== "COMPLETED") customer.state = state;
    }
  }

  private desiredTarget(customer: Customer, group: CustomerGroup): Vec3 {
    const offset = memberOffset(Math.max(0, group.customerIds.indexOf(customer.id)));
    const atKiosk =
      group.state === "ENTERING" ||
      group.state === "WAITING_FOR_KIOSK" ||
      group.state === "USING_KIOSK" ||
      group.state === "DECIDING_MENU" ||
      group.state === "PAYING";

    if (atKiosk && group.kioskId) {
      const kiosk = this.kioskById.get(group.kioskId);
      if (kiosk) {
        if (customer.id === group.ordererId) return { ...kiosk.stand };
        return add(kiosk.companionAnchor, offset);
      }
    }

    if (group.state === "ENTERING" || group.state === "WAITING_FOR_KIOSK") {
      return add(slotPosition(this.layout.queueSlots, Math.max(0, group.queueIndex)), offset);
    }
    if (group.state === "WAITING_FOR_FOOD") {
      return add(slotPosition(this.layout.waitSpots, group.waitIndex), offset);
    }
    if (group.state === "PICKING_UP") {
      return add(slotPosition(this.layout.pickupSpots, group.waitIndex), offset);
    }
    return add(this.layout.exit, offset);
  }

  private updateGroup(group: CustomerGroup, dt: number): void {
    let ordererArrived = false;
    for (const id of group.customerIds) {
      const customer = this.byId.get(id);
      if (!customer || customer.state === "COMPLETED") continue;
      const target = this.desiredTarget(customer, group);
      customer.target = target;
      const arrived = moveToward(customer.position, target, customer.movementSpeed, dt);
      if (id === group.ordererId) ordererArrived = arrived;
    }

    const orderer = this.byId.get(group.ordererId);
    if (!orderer) return;

    switch (group.state) {
      case "ENTERING":
      case "WAITING_FOR_KIOSK":
        if (group.kioskId && ordererArrived) this.beginKiosk(group, orderer);
        break;
      case "USING_KIOSK":
        group.phaseRemaining -= dt;
        if (group.phaseRemaining <= 0) {
          this.setGroupState(group, "DECIDING_MENU");
          group.phaseRemaining = orderer.decisionTime;
        }
        break;
      case "DECIDING_MENU":
        group.phaseRemaining -= dt;
        if (group.phaseRemaining <= 0) {
          this.setGroupState(group, "PAYING");
          group.phaseRemaining = orderer.paymentTime;
        }
        break;
      case "PAYING":
        group.phaseRemaining -= dt;
        if (group.phaseRemaining <= 0) this.finishPayment(group);
        break;
      case "WAITING_FOR_FOOD": {
        const order = this.orders.find((item) => item.id === group.orderId);
        if (order?.status === "ready") {
          this.setGroupState(group, "PICKING_UP");
          group.phaseRemaining = 1.6;
        }
        break;
      }
      case "PICKING_UP":
        if (ordererArrived) {
          group.phaseRemaining -= dt;
          if (group.phaseRemaining <= 0) {
            const order = this.orders.find((item) => item.id === group.orderId);
            if (order) order.status = "picked-up";
            for (const id of group.customerIds) {
              const customer = this.byId.get(id);
              if (customer) customer.pickedUpAt = this.time;
            }
            this.setGroupState(group, "EXITING");
          }
        }
        break;
      case "EXITING": {
        const everyone = group.customerIds.every((id) => {
          const customer = this.byId.get(id);
          return customer ? hasArrived(customer.position, customer.target) : true;
        });
        if (everyone) this.completeGroup(group);
        break;
      }
      default:
        break;
    }
  }

  private beginKiosk(group: CustomerGroup, orderer: Customer): void {
    this.setGroupState(group, "USING_KIOSK");
    group.phaseRemaining = orderer.operationTime;
    for (const id of group.customerIds) {
      const customer = this.byId.get(id);
      if (!customer) continue;
      customer.kioskStartedAt = this.time;
      if (customer.isOrderer) {
        customer.kioskWait = customer.queueJoinedAt != null ? this.time - customer.queueJoinedAt : 0;
      }
    }
  }

  private finishPayment(group: CustomerGroup): void {
    const orderer = this.byId.get(group.ordererId);
    if (!orderer) return;
    const order: Order = {
      id: `o-${this.orderSeq++}`,
      customerId: orderer.id,
      groupId: group.id,
      orderedAt: this.time,
      preparationTime: group.preparationTime,
      status: "preparing",
    };
    this.orders.push(order);
    group.orderId = order.id;
    group.waitIndex = this.waitCursor;
    this.waitCursor += 1;
    for (const id of group.customerIds) {
      const customer = this.byId.get(id);
      if (!customer) continue;
      customer.orderedAt = this.time;
      customer.order = order;
    }
    if (group.kioskId) {
      const kiosk = this.kioskById.get(group.kioskId);
      if (kiosk) {
        kiosk.status = "idle";
        kiosk.currentCustomerId = undefined;
      }
      group.kioskId = undefined;
    }
    this.setGroupState(group, "WAITING_FOR_FOOD");
    this.serveNext();
  }

  private completeGroup(group: CustomerGroup): void {
    group.state = "COMPLETED";
    for (const id of group.customerIds) {
      const customer = this.byId.get(id);
      if (!customer) continue;
      customer.state = "COMPLETED";
      customer.exitedAt = this.time;
    }
  }

  private advanceOrders(): void {
    for (const order of this.orders) {
      if (order.status !== "preparing" && order.status !== "queued") continue;
      if (this.time < order.orderedAt + order.preparationTime) continue;
      order.status = "ready";
      const group = order.groupId ? this.groupById.get(order.groupId) : undefined;
      if (!group) continue;
      for (const id of group.customerIds) {
        const customer = this.byId.get(id);
        if (customer) customer.foodReadyAt = this.time;
      }
    }
  }

  private sample(): void {
    const sec = Math.floor(this.time);
    while (this.lastSampleSec < sec) {
      this.lastSampleSec += 1;
      this.queueHistory.push({
        t: this.lastSampleSec,
        waiting: this.customers.filter((customer) => customer.state === "WAITING_FOR_KIOSK").length,
        inStore: this.customers.filter((customer) => customer.state !== "COMPLETED").length,
      });
    }
  }

  private buildSnapshot(): SimSnapshot {
    const customers = this.customers.map((customer) => ({
      ...customer,
      position: { ...customer.position },
      target: { ...customer.target },
      order: customer.order ? { ...customer.order } : undefined,
    }));
    const groups = this.groups.map((group) => ({
      ...group,
      customerIds: [...group.customerIds],
    }));
    const kiosks: Kiosk[] = this.kiosks.map((kiosk) => ({
      id: kiosk.id,
      position: { ...kiosk.position },
      status: kiosk.status,
      currentCustomerId: kiosk.currentCustomerId,
    }));
    const orders = this.orders.map((order) => ({ ...order }));
    const queueHistory = this.queueHistory.map((sample) => ({ ...sample }));
    return {
      time: this.time,
      duration: this.config.duration,
      finished: this.time >= this.config.duration - 1e-6,
      customers,
      groups,
      kiosks,
      orders,
      queueGroupIds: this.queue.toArray(),
      stats: computeStats({ time: this.time, customers, groups, orders, queueHistory }),
      queueHistory,
    };
  }
}

export function runSimulation(config: SimConfig, dt = 0.1): SimSnapshot {
  const sim = new CafeSimulation(config);
  const guard = Math.ceil(config.duration / dt) + 5;
  for (let i = 0; i < guard; i += 1) {
    if (!sim.step(dt) && sim.getSnapshot().finished) break;
  }
  return sim.getSnapshot();
}
