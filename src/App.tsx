import { useEffect, useMemo, useState } from "react";
import { useTrafficSim } from "./hooks/useTrafficSim";
import { defaultConfig, normalizeConfig } from "./sim/traffic/presets";
import type { SimConfig } from "./sim/traffic/types";
import { TrafficScene, vehicleDetail, vehicleHeadline } from "./render/TrafficScene";
import { Controls } from "./ui/Controls";
import { formatClock } from "./ui/format";

/** 도로 화면과 조작 패널을 붙임. */
export function App() {
  const [draft, setDraft] = useState<SimConfig>(defaultConfig);
  const [applied, setApplied] = useState<SimConfig>(defaultConfig);
  const [speed, setSpeed] = useState(4);
  const [running, setRunning] = useState(true);
  const [runId, setRunId] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { snap, skip, hardBrake, cutIn, hardBrakeRandom, cutInRandom } = useTrafficSim(
    applied,
    speed,
    running,
    runId,
    draft.cutInsPerMinute,
    draft.brakesPerMinute,
  );

  useEffect(() => {
    setSelectedId(null);
    setNotice(null);
  }, [runId]);

  const dirty = useMemo(() => {
    const left = normalizeConfig(draft);
    const right = normalizeConfig(applied);
    // 분당 횟수는 바로 적용되므로 다시 시작 경고에서 뺌.
    left.cutInsPerMinute = 0;
    left.brakesPerMinute = 0;
    right.cutInsPerMinute = 0;
    right.brakesPerMinute = 0;

    return JSON.stringify(left) !== JSON.stringify(right);
  }, [draft, applied]);

  const selected = snap?.vehicles.find((vehicle) => vehicle.id === selectedId) ?? null;

  /** 초안 설정으로 시뮬레이션을 처음부터 다시 시작함. */
  const restart = () => {
    setApplied(normalizeConfig(draft));
    setRunId((value) => value + 1);
    setRunning(true);
  };

  /** 차 하나를 골라 급정거나 끼어들기를 시킴. 설명창은 열지 않음. */
  const triggerRandom = (kind: "brake" | "cut") => {
    if (kind === "cut" && (snap?.laneCount ?? 1) < 2) {
      setNotice("2차로 이상이어야 끼어들 수 있습니다.");

      return;
    }

    const id = kind === "brake" ? hardBrakeRandom() : cutInRandom();

    if (!id) {
      setNotice(kind === "brake" ? "달리고 있는 차가 없습니다." : "끼어들 간격이 있는 차가 없습니다.");

      return;
    }

    setNotice(kind === "brake" ? `${id}가 급브레이크를 밟습니다. 뒤차가 따라 느려집니다.` : `${id}가 옆 차선으로 끼어듭니다.`);
  };

  return (
    <div className="app">
      <main className="viewport">
        {snap && <TrafficScene snapshot={snap} selectedId={selectedId} onSelect={setSelectedId} />}
        <div className="hud">
          <div className="clock">
            <strong>{snap ? formatClock(snap.time) : "00:00"}</strong>
            <span>/ {formatClock(applied.duration)}</span>
            {snap?.finished && <em>시간 종료</em>}
          </div>
          <p className="drag-hint">드래그로 둘러보고, 휠로 가까이 봅니다. 차량을 누르면 상태가 나옵니다.</p>
          <Legend />
        </div>
        {selected && (
          <article className="inspector">
            <header>
              <strong>{selected.id}</strong>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="차량 정보 닫기">닫기</button>
            </header>
            <p>{vehicleHeadline(selected)}</p>
            <dl>
              {vehicleDetail(selected).map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <div className="row-buttons inspector-actions">
              <button type="button" onClick={() => hardBrake(selected.id)}>급브레이크</button>
              <button
                type="button"
                disabled={(snap?.laneCount ?? 1) < 2}
                onClick={() => setNotice(cutIn(selected.id) ? "옆 차선으로 끼어듭니다." : "옆 차선에 들어갈 간격이 없습니다.")}
              >
                끼어들기
              </button>
            </div>
            {notice && <p className="hint">{notice}</p>}
          </article>
        )}
      </main>
      <Controls
        draft={draft}
        dirty={dirty}
        speed={speed}
        running={running}
        onChange={setDraft}
        onSpeed={setSpeed}
        onRunning={setRunning}
        onRestart={restart}
        onSkip={skip}
        notice={notice}
        onRandomBrake={() => triggerRandom("brake")}
        onRandomCut={() => triggerRandom("cut")}
      />
    </div>
  );
}

/** 속도 색 범례를 보여 줌. */
function Legend() {
  const speeds = [
    ["주행", "#3ecf8e"],
    ["감속", "#f0a202"],
    ["정체", "#e24b4b"],
  ] as const;

  return (
    <div className="legend">
      <p>차체 색은 현재 속도입니다. 노란 고리는 끼어들기, 빨간 고리는 급브레이크입니다.</p>
      <div>
        {speeds.map(([label, color]) => (
          <span key={label}><i style={{ background: color }} />{label}</span>
        ))}
      </div>
    </div>
  );
}
