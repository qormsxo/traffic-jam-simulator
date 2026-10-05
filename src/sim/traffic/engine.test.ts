import { describe, expect, it } from "vitest";
import { ROAD_LENGTH } from "./constants";
import { idmAcceleration } from "./carFollowing";
import { TrafficSimulation, runSimulation } from "./engine";
import { buildNetwork } from "./network";
import { samplePolyline } from "./path";
import { defaultConfig, normalizeConfig } from "./presets";
import { buildArrivals, pickLane } from "./schedule";
import { phasePlan, shouldStop, signalAt } from "./signals";
import type { SimConfig } from "./types";

/** 기본 설정에 테스트용 값만 덮어씀 */
function config(patch: Partial<SimConfig> = {}): SimConfig {
  return normalizeConfig({ ...defaultConfig, ...patch });
}

describe("arrivals", () => {
  it("keeps the same vehicles when only lanes or the signal change", () => {
    const left = buildArrivals(config({ laneCount: 2, signalCycle: 45, maxSpeed: 40, seed: 5 }));
    const right = buildArrivals(config({ laneCount: 4, signalCycle: 90, maxSpeed: 70, safetyDistance: 4, seed: 5 }));
    expect(left).toEqual(right);
    expect(left.length).toBeGreaterThan(10);
  });

  it("changes the list when the seed changes", () => {
    const a = buildArrivals(config({ seed: 1, duration: 120 }));
    const b = buildArrivals(config({ seed: 2, duration: 120 }));
    expect(a.map((item) => item.time)).not.toEqual(b.map((item) => item.time));
  });
});

describe("lanes", () => {
  it("spreads cars across every lane of the one-way road", () => {
    expect(pickLane("straight", 3, 0)).toBe(0);
    expect(pickLane("straight", 3, 1)).toBe(1);
    expect(pickLane("straight", 3, 2)).toBe(2);
    expect(pickLane("straight", 4, 3)).toBe(3);
    expect(pickLane("straight", 3, 4)).toBe(1);
  });
});

describe("car following", () => {
  it("accelerates in free flow and brakes when the gap collapses", () => {
    const free = idmAcceleration({
      speed: 6,
      desiredSpeed: 14,
      gap: Number.POSITIVE_INFINITY,
      leaderSpeed: 14,
      minGap: 2,
      maxAccel: 2,
      brake: 3,
    });

    const blocked = idmAcceleration({
      speed: 12,
      desiredSpeed: 14,
      gap: 3,
      leaderSpeed: 2,
      minGap: 2,
      maxAccel: 2,
      brake: 3,
    });

    expect(free).toBeGreaterThan(0);
    expect(blocked).toBeLessThan(0);
  });
});

describe("signals", () => {
  it("covers the cycle without giving both axes green together", () => {
    const plan = phasePlan(60);
    const total = plan.reduce((sum, phase) => sum + phase.green + phase.yellow, 0);
    expect(total).toBeCloseTo(60, 5);
    const opening = signalAt(0, 60);
    expect(opening.eastbound.through).toBe("green");
    expect(opening.westbound.through).toBe("green");
    expect(opening.northbound.through).toBe("red");
    expect(opening.eastbound.left).toBe("red");
    expect(shouldStop("red", 20, 10, 3)).toBe(true);
    expect(shouldStop("green", 20, 10, 3)).toBe(false);
  });
});

describe("network", () => {
  it("builds one eastbound road with a lane for each slot", () => {
    const network = buildNetwork(3);
    expect(network.laneCount).toBe(3);
    expect(network.segments.size).toBe(3);
    expect(network.poles).toHaveLength(0);
    const lane0 = network.segments.get("lane-0");
    const lane1 = network.segments.get("lane-1");
    expect(lane0 && lane1).toBeTruthy();
    expect(lane0!.length).toBeCloseTo(ROAD_LENGTH, 1);
    const start = samplePolyline(lane0!.polyline, 0).position;
    const end = samplePolyline(lane0!.polyline, lane0!.length).position;
    expect(start.x).toBeLessThan(end.x);
    expect(start.z).not.toBeCloseTo(samplePolyline(lane1!.polyline, 0).position.z, 1);
  });
});

describe("simulation", () => {
  it("moves vehicles without exceeding their own max speed", () => {
    const sim = new TrafficSimulation(config({ seed: 3, duration: 90, spawnPerHour: 1800 }));
    sim.step(8);
    const snap = sim.getSnapshot();
    expect(snap.vehicles.length).toBeGreaterThan(0);
    expect(snap.vehicles.some((vehicle) => vehicle.distance > 2 || vehicle.speed > 1)).toBe(true);

    for (const vehicle of snap.vehicles) {
      expect(vehicle.speed).toBeLessThanOrEqual(vehicle.maxSpeed + 0.05);
      expect(vehicle.position.y).toBe(0);
    }
  });

  it("keeps followers from overlapping on the same lane", () => {
    const sim = new TrafficSimulation(config({ seed: 4, laneCount: 3, duration: 70, spawnPerHour: 1600 }));

    for (let i = 0; i < 40; i += 1) {
      sim.step(0.5);
      const snap = sim.getSnapshot();

      for (let a = 0; a < snap.vehicles.length; a += 1) {
        for (let b = a + 1; b < snap.vehicles.length; b += 1) {
          const left = snap.vehicles[a];
          const right = snap.vehicles[b];

          if (left.laneId !== right.laneId) continue;
          const gap = Math.hypot(left.position.x - right.position.x, left.position.z - right.position.z);
          expect(gap).toBeGreaterThan(3);
        }
      }
    }
  });

  it("repeats a run exactly and sends every car east", () => {
    const shared = { seed: 9, spawnPerHour: 2600, duration: 80, signalCycle: 60, maxSpeed: 45, safetyDistance: 2 };
    const once = runSimulation(config(shared));
    const twice = runSimulation(config(shared));
    expect(once.stats.completed).toBe(twice.stats.completed);
    expect(once.vehicles.map((vehicle) => vehicle.position)).toEqual(twice.vehicles.map((vehicle) => vehicle.position));
    expect(once.stats.completed).toBeGreaterThan(0);
    expect(once.vehicles.every((vehicle) => vehicle.approach === "eastbound")).toBe(true);
  }, 20000);
});

describe("recovery", () => {
  it("keeps cars leaving the east end instead of freezing on the road", () => {
    const sim = new TrafficSimulation(config({ duration: 120, seed: 1, spawnPerHour: 4000, laneCount: 3 }));
    sim.step(40);
    const before = sim.getSnapshot().stats.completed;
    sim.step(40);
    expect(sim.getSnapshot().stats.completed).toBeGreaterThan(before);
  });
});

describe("shockwave", () => {
  it("stops the chosen vehicle and slows the cars behind it", () => {
    const shared = config({
      cutInsPerMinute: 0, brakesPerMinute: 0,
      laneCount: 3,
      spawnPerHour: 3600,
      duration: 90,
      seed: 4,
      signalCycle: 80,
      maxSpeed: 50,
    });

    const treated = new TrafficSimulation(shared);
    const control = new TrafficSimulation(shared);
    let leadId = "";
    let cohort: string[] = [];

    for (let step = 0; step < 40 && cohort.length === 0; step += 1) {
      treated.step(1);
      control.step(1);
      const snap = treated.getSnapshot();

      for (const lead of snap.vehicles) {
        if (lead.speed < 6) continue;

        const behind = snap.vehicles.filter(
          (vehicle) =>
            vehicle.id !== lead.id &&
            vehicle.approach === lead.approach &&
            vehicle.laneIndex === lead.laneIndex &&
            vehicle.distance < lead.distance &&
            lead.distance - vehicle.distance < 35 &&
            vehicle.speed > 4,
        );

        if (behind.length === 0) continue;
        leadId = lead.id;
        cohort = behind.map((vehicle) => vehicle.id);
        break;
      }
    }

    expect(leadId).not.toBe("");
    expect(treated.hardBrake(leadId)).toBe(true);
    expect(treated.getSnapshot().vehicles.find((vehicle) => vehicle.id === leadId)?.state).toBe("BRAKING");
    treated.step(3);
    control.step(3);
    const lead = treated.getSnapshot().vehicles.find((vehicle) => vehicle.id === leadId);
    expect(lead?.speed ?? 1).toBeLessThan(1);

    const stillThere = cohort.filter((id) => {
      const left = treated.getSnapshot().vehicles.some((vehicle) => vehicle.id === id);
      const right = control.getSnapshot().vehicles.some((vehicle) => vehicle.id === id);

      return left && right;
    });

    expect(stillThere.length).toBeGreaterThan(0);

    /** 같은 차들의 속도를 더함 */
    const sum = (sim: TrafficSimulation) =>
      stillThere.reduce((total, id) => total + (sim.getSnapshot().vehicles.find((vehicle) => vehicle.id === id)?.speed ?? 0), 0);

    expect(sum(treated)).toBeLessThan(sum(control) - 1);
  });

  it("slides a vehicle into the next lane when a gap exists", () => {
    const sim = new TrafficSimulation(
      config({ cutInsPerMinute: 0, brakesPerMinute: 0, laneCount: 2, spawnPerHour: 3200, duration: 70, seed: 6, maxSpeed: 50 }),
    );

    let moved = false;

    for (let step = 0; step < 25 && !moved; step += 1) {
      sim.step(1);

      for (const vehicle of sim.getSnapshot().vehicles) {
        const before = vehicle.laneIndex;

        if (!sim.cutIn(vehicle.id)) continue;
        const after = sim.getSnapshot().vehicles.find((item) => item.id === vehicle.id);
        expect(after?.laneIndex).not.toBe(before);
        expect(after?.state).toBe("CUTTING_IN");
        moved = true;
        break;
      }
    }

    expect(moved).toBe(true);
  });

  it("lets the screen buttons pick a car for a hard brake and a cut-in", () => {
    const sim = new TrafficSimulation(config({ cutInsPerMinute: 0, brakesPerMinute: 0, laneCount: 3, spawnPerHour: 4200, duration: 80, seed: 8 }));
    sim.step(18);
    const cutId = sim.cutInRandom();
    expect(cutId).toBeTruthy();
    expect(sim.getSnapshot().vehicles.find((vehicle) => vehicle.id === cutId)?.state).toBe("CUTTING_IN");
    const brakeId = sim.hardBrakeRandom();
    expect(brakeId).toBeTruthy();
    expect(sim.getSnapshot().vehicles.find((vehicle) => vehicle.id === brakeId)?.state).toBe("BRAKING");
  });

  it("fires cut-ins and hard brakes on the per-minute schedule", () => {
    const busy = new TrafficSimulation(config({
      cutInsPerMinute: 12,
      brakesPerMinute: 12,
      laneCount: 3,
      duration: 70,
      spawnPerHour: 4200,
      seed: 3,
    }));

    busy.step(40);
    expect(busy.getSnapshot().stats.hardBrakes).toBeGreaterThanOrEqual(5);
    expect(busy.getSnapshot().stats.cutIns).toBeGreaterThanOrEqual(3);

    const quiet = new TrafficSimulation(config({
      cutInsPerMinute: 0,
      brakesPerMinute: 0,
      duration: 50,
      spawnPerHour: 4200,
      seed: 3,
    }));

    quiet.step(40);
    expect(quiet.getSnapshot().stats.hardBrakes).toBe(0);
    expect(quiet.getSnapshot().stats.cutIns).toBe(0);
  });
});
