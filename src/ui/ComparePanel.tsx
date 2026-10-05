import { useState } from "react";
import { runSimulation } from "../sim/cafe/engine";
import { normalizeConfig, weightsForProfile, type AgeProfile } from "../sim/cafe/presets";
import type { SimConfig, Stats } from "../sim/cafe/types";
import { formatCount, formatSeconds } from "./format";

type Scenario = {
  kioskCount: number;
  groupRatio: number;
  profile: AgeProfile;
  decisionMax: number;
  prepMax: number;
};

type Row = {
  label: string;
  read: (stats: Stats) => string;
  score: (stats: Stats) => number | null;
  better: "lower" | "higher";
};

const ROWS: Row[] = [
  { label: "평균 대기시간", read: (stats) => formatSeconds(stats.avgKioskWait), score: (stats) => stats.avgKioskWait, better: "lower" },
  { label: "평균 체류시간", read: (stats) => formatSeconds(stats.avgDwell), score: (stats) => stats.avgDwell, better: "lower" },
  { label: "처리 고객 수", read: (stats) => `${stats.completedCustomers}명`, score: (stats) => stats.completedCustomers, better: "higher" },
  { label: "시간당 처리", read: (stats) => (stats.throughputPerHour == null ? "—" : `${formatCount(stats.throughputPerHour)}명`), score: (stats) => stats.throughputPerHour, better: "higher" },
];

const defaultA: Scenario = { kioskCount: 2, groupRatio: 0.2, profile: "young", decisionMax: 22, prepMax: 55 };
const defaultB: Scenario = { kioskCount: 4, groupRatio: 0.2, profile: "young", decisionMax: 22, prepMax: 55 };

function resolve(base: SimConfig, scenario: Scenario): SimConfig {
  return normalizeConfig({
    ...base,
    kioskCount: scenario.kioskCount,
    groupRatio: scenario.groupRatio,
    ageWeights: weightsForProfile(scenario.profile),
    decisionTime: { min: Math.min(base.decisionTime.min, scenario.decisionMax), max: scenario.decisionMax },
    prepTime: { min: Math.min(base.prepTime.min, scenario.prepMax), max: scenario.prepMax },
  });
}

export function ComparePanel({ base }: { base: SimConfig }) {
  const [open, setOpen] = useState(true);
  const [a, setA] = useState<Scenario>(defaultA);
  const [b, setB] = useState<Scenario>(defaultB);
  const [result, setResult] = useState<{ a: Stats; b: Stats } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    window.setTimeout(() => {
      const left = runSimulation(resolve(base, a));
      const right = runSimulation(resolve(base, b));
      setResult({ a: left.stats, b: right.stats });
      setBusy(false);
    }, 30);
  };

  return (
    <section className="compare">
      <div className="compare-head">
        <div>
          <h2>조건 비교</h2>
          <p>
            시드 {base.seed}, 고객 {base.customerCount}명,{" "}
            {base.duration % 60 === 0 ? `${base.duration / 60}분` : `${base.duration}초`}. 같은 시드면 같은 손님이
            들어옵니다.
          </p>
        </div>
        <button type="button" className="fold" onClick={() => setOpen((value) => !value)}>
          {open ? "접기" : "펼치기"}
        </button>
      </div>
      {open && (
        <>
          <div className="scenario-grid">
            <ScenarioForm title="실험 A" value={a} onChange={setA} />
            <ScenarioForm title="실험 B" value={b} onChange={setB} />
          </div>
          <button type="button" className="primary" onClick={run} disabled={busy}>
            {busy ? "비교 실행 중" : "A/B 비교 실행"}
          </button>
          {result && (
            <table className="compare-table">
              <thead>
                <tr>
                  <th>지표</th>
                  <th>A</th>
                  <th>B</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => {
                  const left = row.score(result.a);
                  const right = row.score(result.b);
                  const leftBetter = isBetter(left, right, row.better);
                  const rightBetter = isBetter(right, left, row.better);
                  return (
                    <tr key={row.label}>
                      <th>{row.label}</th>
                      <td className={leftBetter ? "better" : ""}>{row.read(result.a)}</td>
                      <td className={rightBetter ? "better" : ""}>{row.read(result.b)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

function isBetter(value: number | null, other: number | null, direction: "lower" | "higher"): boolean {
  if (value == null || other == null || value === other) return false;
  return direction === "lower" ? value < other : value > other;
}

function ScenarioForm({
  title,
  value,
  onChange,
}: {
  title: string;
  value: Scenario;
  onChange: (value: Scenario) => void;
}) {
  const set = (patch: Partial<Scenario>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="scenario">
      <legend>{title}</legend>
      <label>
        키오스크
        <input
          type="number"
          min={1}
          max={5}
          value={value.kioskCount}
          onChange={(event) => set({ kioskCount: Number(event.target.value) })}
        />
      </label>
      <label>
        단체 비율 %
        <input
          type="number"
          min={0}
          max={100}
          value={Math.round(value.groupRatio * 100)}
          onChange={(event) => set({ groupRatio: Number(event.target.value) / 100 })}
        />
      </label>
      <label>
        연령
        <select value={value.profile} onChange={(event) => set({ profile: event.target.value as AgeProfile })}>
          <option value="young">젊은 고객</option>
          <option value="balanced">균형</option>
          <option value="older">고령 고객</option>
        </select>
      </label>
      <label>
        고민 최대 초
        <input
          type="number"
          min={1}
          max={120}
          value={value.decisionMax}
          onChange={(event) => set({ decisionMax: Number(event.target.value) })}
        />
      </label>
      <label>
        제조 최대 초
        <input
          type="number"
          min={1}
          max={300}
          value={value.prepMax}
          onChange={(event) => set({ prepMax: Number(event.target.value) })}
        />
      </label>
    </fieldset>
  );
}
