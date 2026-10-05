import { dist2d, type Vec3 } from "../core/vec";
import type { Rng } from "../core/rng";
import type { Kiosk, KioskStrategy } from "./types";

export type KioskChoice = Kiosk & {
  stand: Vec3;
  companionAnchor: Vec3;
  queueLength: number;
};

/**
 * Picks an idle kiosk.
 * `shortest-queue` is ready for per-kiosk lines; with one shared queue
 * every idle kiosk has length 0 and the tie breaks by distance.
 */
export function pickKiosk(
  strategy: KioskStrategy,
  kiosks: KioskChoice[],
  from: Vec3,
  rng: Rng,
): KioskChoice | null {
  const idle = kiosks.filter((kiosk) => kiosk.status === "idle");
  if (idle.length === 0) return null;

  if (strategy === "random") {
    return idle[Math.floor(rng.next() * idle.length)] ?? null;
  }

  if (strategy === "shortest-queue") {
    const shortest = Math.min(...idle.map((kiosk) => kiosk.queueLength));
    const candidates = idle.filter((kiosk) => kiosk.queueLength === shortest);
    return nearest(candidates, from);
  }

  return nearest(idle, from);
}

function nearest(kiosks: KioskChoice[], from: Vec3): KioskChoice {
  return kiosks.reduce((best, kiosk) =>
    dist2d(from, kiosk.stand) < dist2d(from, best.stand) ? kiosk : best,
  );
}
