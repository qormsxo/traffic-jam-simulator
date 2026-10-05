import { useCallback, useEffect, useRef, useState } from "react";
import { CafeSimulation } from "../sim/cafe/engine";
import { normalizeConfig } from "../sim/cafe/presets";
import type { SimConfig, SimSnapshot } from "../sim/cafe/types";

export function useCafeSim(config: SimConfig, speed: number, running: boolean, runId: number) {
  const simRef = useRef<CafeSimulation | null>(null);
  const speedRef = useRef(speed);
  const runningRef = useRef(running);
  const [snap, setSnap] = useState<SimSnapshot | null>(null);
  const configKey = JSON.stringify(normalizeConfig(config));

  speedRef.current = speed;
  runningRef.current = running;

  useEffect(() => {
    const sim = new CafeSimulation(config);
    simRef.current = sim;
    setSnap(sim.getSnapshot());
    let frame = 0;
    let last = performance.now();

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const current = simRef.current;
      if (!current || !runningRef.current) {
        last = now;
        return;
      }
      const wall = Math.min(0.5, (now - last) / 1000);
      last = now;
      if (wall <= 0) return;
      if (current.step(wall * speedRef.current)) {
        setSnap(current.getSnapshot());
      }
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [configKey, runId, config]);

  const skip = useCallback((seconds: number) => {
    const sim = simRef.current;
    if (!sim) return;
    if (sim.step(seconds)) setSnap(sim.getSnapshot());
  }, []);

  return { snap, skip };
}
