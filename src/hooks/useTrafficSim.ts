import { useCallback, useEffect, useRef, useState } from "react";
import { TrafficSimulation } from "../sim/traffic/engine";
import { normalizeConfig } from "../sim/traffic/presets";
import type { SimConfig, SimSnapshot } from "../sim/traffic/types";

/** 애니메이션 프레임마다 시뮬레이션을 진행하고 화면 상태를 갱신함. */
export function useTrafficSim(
  config: SimConfig,
  speed: number,
  running: boolean,
  runId: number,
  cutInsPerMinute: number,
  brakesPerMinute: number,
) {
  const simRef = useRef<TrafficSimulation | null>(null);
  const speedRef = useRef(speed);
  const runningRef = useRef(running);
  const ratesRef = useRef({ cutInsPerMinute, brakesPerMinute });
  ratesRef.current = { cutInsPerMinute, brakesPerMinute };
  const [snap, setSnap] = useState<SimSnapshot | null>(null);
  const configKey = JSON.stringify(normalizeConfig(config));

  speedRef.current = speed;
  runningRef.current = running;

  useEffect(() => {
    const sim = new TrafficSimulation(config);
    sim.setIncidentRates(ratesRef.current.cutInsPerMinute, ratesRef.current.brakesPerMinute);
    simRef.current = sim;
    setSnap(sim.getSnapshot());
    let frame = 0;
    let last = performance.now();

    /** 프레임마다 경과 시간만큼 시뮬레이션을 진행함. */
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const current = simRef.current;

      if (!current || !runningRef.current) {
        last = now;

        return;
      }

      const wall = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (wall <= 0) return;

      if (current.step(wall * speedRef.current)) setSnap(current.getSnapshot());
    };

    frame = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(frame);
  }, [configKey, runId, config]);

  // 분당 횟수만 바꿀 때는 도로를 다시 만들지 않음.
  useEffect(() => {
    simRef.current?.setIncidentRates(cutInsPerMinute, brakesPerMinute);
  }, [cutInsPerMinute, brakesPerMinute]);

  /** 지정한 초만큼 시뮬레이션을 한 번에 진행함. */
  const skip = useCallback((seconds: number) => {
    const sim = simRef.current;

    if (!sim) return;

    if (sim.step(seconds)) setSnap(sim.getSnapshot());
  }, []);

  /** 엔진 조작 뒤 화면 상태를 다시 읽음. */
  const refresh = useCallback((apply: (sim: TrafficSimulation) => boolean) => {
    const sim = simRef.current;

    if (!sim) return false;
    const ok = apply(sim);
    setSnap(sim.getSnapshot());

    return ok;
  }, []);

  /** 지정한 차를 급정거시킴. */
  const hardBrake = useCallback((id: string) => refresh((sim) => sim.hardBrake(id)), [refresh]);
  /** 지정한 차를 옆 차선으로 넣음. */
  const cutIn = useCallback((id: string) => refresh((sim) => sim.cutIn(id)), [refresh]);

  /** 엔진이 고른 차 id를 돌려줌. 설명창은 열지 않음. */
  const pick = useCallback((apply: (sim: TrafficSimulation) => string | null) => {
    const sim = simRef.current;

    if (!sim) return null;
    const id = apply(sim);
    setSnap(sim.getSnapshot());

    return id;
  }, []);

  /** 도로 위 차 하나를 골라 급정거시킴. */
  const hardBrakeRandom = useCallback(() => pick((sim) => sim.hardBrakeRandom()), [pick]);
  /** 도로 위 차 하나를 골라 끼어들게 함. */
  const cutInRandom = useCallback(() => pick((sim) => sim.cutInRandom()), [pick]);

  return { snap, skip, hardBrake, cutIn, hardBrakeRandom, cutInRandom };
}
