import { describe, expect, it } from "vitest";
import { mulberry32 } from "../core/rng";
import { CafeSimulation, runSimulation } from "./engine";
import { defaultConfig, normalizeConfig, OLDER_AGES, YOUNG_AGES } from "./presets";
import { buildSchedule } from "./schedule";
import { baseOperationSeconds, sampleAgeScaledDuration } from "./timing";
import type { AgeWeights, SimConfig } from "./types";

function onlyBand(band: keyof AgeWeights): AgeWeights {
  return {
    "10s": 0,
    "20s": 0,
    "30s": 0,
    "40s": 0,
    "50s": 0,
    "60s": 0,
    "70s": 0,
    [band]: 1,
  };
}

function config(patch: Partial<SimConfig>): SimConfig {
  return normalizeConfig({ ...defaultConfig, ...patch });
}

describe("schedule", () => {
  it("keeps the same people when only the kiosk count changes", () => {
    const left = buildSchedule(config({ kioskCount: 1, seed: 5, customerCount: 24 }), mulberry32(5));
    const right = buildSchedule(config({ kioskCount: 5, seed: 5, customerCount: 24 }), mulberry32(5));
    expect(left).toEqual(right);
    expect(left.reduce((sum, party) => sum + party.members.length, 0)).toBe(24);
  });

  it("changes age mix without moving arrival times", () => {
    const young = buildSchedule(config({ ageWeights: YOUNG_AGES, seed: 8, customerCount: 30 }), mulberry32(8));
    const older = buildSchedule(config({ ageWeights: OLDER_AGES, seed: 8, customerCount: 30 }), mulberry32(8));
    expect(young.map((party) => party.arrivalTime)).toEqual(older.map((party) => party.arrivalTime));
    expect(young.map((party) => party.members.length)).toEqual(older.map((party) => party.members.length));
    const meanAge = (parties: typeof young) => {
      const ages = parties.flatMap((party) => party.members.map((member) => member.age));
      return ages.reduce((sum, age) => sum + age, 0) / ages.length;
    };
    expect(meanAge(young)).toBeLessThan(meanAge(older));
  });

  it("draws menu time inside the configured range for every age", () => {
    const parties = buildSchedule(
      config({ decisionTime: { min: 5, max: 9 }, customerCount: 20, seed: 2 }),
      mulberry32(2),
    );
    for (const party of parties) {
      for (const member of party.members) {
        expect(member.decisionTime).toBeGreaterThanOrEqual(5);
        expect(member.decisionTime).toBeLessThanOrEqual(9);
      }
    }
  });
});

describe("age assumption", () => {
  it("keeps young decision times short and lets older bands approach the max", () => {
    const meanFor = (band: "20s" | "40s" | "70s", seed: number) => {
      const rng = mulberry32(seed);
      const values = Array.from({ length: 40 }, () => sampleAgeScaledDuration(4, 40, band, rng));
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    const young = meanFor("20s", 1);
    const mid = meanFor("40s", 1);
    const older = meanFor("70s", 1);
    expect(young).toBeLessThan(12);
    expect(mid).toBeGreaterThan(young);
    expect(older).toBeGreaterThan(mid);
    expect(older).toBeGreaterThan(32);
  });

  it("gives older bands a longer base kiosk time", () => {
    expect(baseOperationSeconds("20s")).toBeLessThan(baseOperationSeconds("40s"));
    expect(baseOperationSeconds("40s")).toBeLessThan(baseOperationSeconds("50s"));
    expect(baseOperationSeconds("50s")).toBeLessThan(baseOperationSeconds("60s"));
    expect(baseOperationSeconds("60s")).toBeLessThan(baseOperationSeconds("70s"));
  });
});

describe("lifecycle", () => {
  it("walks one customer from entry to exit", () => {
    const snap = runSimulation(
      config({
        customerCount: 1,
        kioskCount: 1,
        groupRatio: 0,
        ageWeights: onlyBand("10s"),
        decisionTime: { min: 1, max: 1 },
        paymentTime: { min: 1, max: 1 },
        prepTime: { min: 2, max: 2 },
        movementSpeed: 3,
        duration: 90,
        seed: 3,
      }),
      0.1,
    );
    expect(snap.stats.completedCustomers).toBe(1);
    expect(snap.orders).toHaveLength(1);
    expect(snap.orders[0]?.status).toBe("picked-up");
    const customer = snap.customers[0];
    expect(customer?.state).toBe("COMPLETED");
    expect(customer?.exitedAt).toBeGreaterThan(customer?.enteredAt ?? 0);
  });

  it("places a group on a single order", () => {
    const snap = runSimulation(
      config({
        customerCount: 4,
        kioskCount: 1,
        groupRatio: 1,
        avgGroupSize: 4,
        ageWeights: onlyBand("20s"),
        decisionTime: { min: 1, max: 1 },
        paymentTime: { min: 1, max: 1 },
        prepTime: { min: 2, max: 2 },
        movementSpeed: 3,
        duration: 90,
        seed: 4,
      }),
      0.1,
    );
    expect(snap.orders.length).toBe(snap.groups.length);
    expect(snap.orders.length).toBeLessThan(4);
    expect(snap.groups.some((group) => group.size >= 2)).toBe(true);
    expect(snap.stats.completedCustomers).toBe(4);
    expect(snap.stats.arrivedCustomers).toBe(4);
  });

  it("queues customers when the only kiosk is busy", () => {
    const sim = new CafeSimulation(
      config({
        customerCount: 10,
        kioskCount: 1,
        groupRatio: 0,
        ageWeights: onlyBand("70s"),
        decisionTime: { min: 8, max: 8 },
        paymentTime: { min: 4, max: 4 },
        prepTime: { min: 20, max: 20 },
        movementSpeed: 3,
        duration: 80,
        seed: 9,
      }),
    );
    sim.step(25);
    const snap = sim.getSnapshot();
    expect(snap.stats.kioskUsers).toBe(1);
    expect(snap.stats.waiting).toBeGreaterThan(0);
    expect(snap.kiosks[0]?.status).toBe("occupied");
  });

  it("finishes more visits and shortens the line when kiosks increase", () => {
    const shared = {
      customerCount: 24,
      groupRatio: 0,
      ageWeights: onlyBand("60s"),
      decisionTime: { min: 8, max: 8 },
      paymentTime: { min: 3, max: 3 },
      prepTime: { min: 6, max: 6 },
      movementSpeed: 2.4,
      duration: 160,
      seed: 11,
      avgGroupSize: 3,
    } satisfies Partial<SimConfig>;
    const few = runSimulation(config({ ...shared, kioskCount: 1 }));
    const many = runSimulation(config({ ...shared, kioskCount: 4 }));
    expect(many.stats.completedCustomers).toBeGreaterThan(few.stats.completedCustomers);
    expect(many.stats.avgKioskWait ?? 0).toBeLessThan(few.stats.avgKioskWait ?? 0);
  });

  it("serves a young crowd faster than an older crowd on the same seed", () => {
    const shared = {
      customerCount: 18,
      kioskCount: 2,
      groupRatio: 0,
      decisionTime: { min: 4, max: 4 },
      paymentTime: { min: 3, max: 3 },
      prepTime: { min: 5, max: 5 },
      movementSpeed: 2.2,
      duration: 140,
      seed: 15,
    } satisfies Partial<SimConfig>;
    const young = runSimulation(config({ ...shared, ageWeights: onlyBand("20s") }));
    const older = runSimulation(config({ ...shared, ageWeights: onlyBand("70s") }));
    expect(young.stats.completedCustomers).toBeGreaterThan(older.stats.completedCustomers);
    expect(young.stats.avgKioskUse ?? 0).toBeLessThan(older.stats.avgKioskUse ?? 0);
  });

  it("repeats the same result for the same seed", () => {
    const cfg = config({ seed: 21, customerCount: 12, duration: 100 });
    const a = runSimulation(cfg);
    const b = runSimulation(cfg);
    expect(a.stats).toEqual(b.stats);
    expect(a.customers.map((customer) => customer.id)).toEqual(b.customers.map((customer) => customer.id));
  });
});
