import { useState, type ReactNode } from "react";
import { AGE_BANDS, type KioskStrategy, type SimConfig } from "../sim/cafe/types";
import { DAYPARTS, DAY_KINDS, situationOf, type DayKind, type DaypartId } from "../sim/cafe/presets";

type Props = {
  draft: SimConfig;
  dirty: boolean;
  speed: number;
  running: boolean;
  onChange: (config: SimConfig) => void;
  onSpeed: (speed: number) => void;
  onRunning: (running: boolean) => void;
  onRestart: () => void;
  onSkip: (seconds: number) => void;
};

const SPEEDS = [1, 2, 4, 8, 16];

export function Controls({
  draft,
  dirty,
  speed,
  running,
  onChange,
  onSpeed,
  onRunning,
  onRestart,
  onSkip,
}: Props) {
  const [dayKind, setDayKind] = useState<DayKind | null>(null);
  const [daypartId, setDaypartId] = useState<DaypartId | null>(null);
  const situation = dayKind && daypartId ? situationOf(dayKind, daypartId) : null;
  const set = (patch: Partial<SimConfig>) => onChange({ ...draft, ...patch });

  const applySituation = (kind: DayKind | null, part: DaypartId | null) => {
    if (!kind || !part) return;
    const next = situationOf(kind, part);
    onChange({
      ...draft,
      ...next.patch,
      ageWeights: { ...next.patch.ageWeights },
    });
  };

  return (
    <aside className="panel controls">
      <h1>카페 키오스크</h1>

      <div className="kind-row">
        {DAY_KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === dayKind ? "daypart active" : "daypart"}
            onClick={() => {
              setDayKind(item.id);
              applySituation(item.id, daypartId);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="daypart-row">
        {DAYPARTS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === daypartId ? "daypart active" : "daypart"}
            onClick={() => {
              setDaypartId(item.id);
              applySituation(dayKind, item.id);
            }}
          >
            {item.label}
            <small>{item.hours}</small>
          </button>
        ))}
      </div>
      {situation && <p className="hint">{situation.note}</p>}
      {!situation && <p className="hint">평일과 시간대를 모두 고르면 값이 채워집니다.</p>}

      <Section title="매장">
        <Slider label="고객 수" min={1} max={160} step={1} value={draft.customerCount} onChange={(customerCount) => set({ customerCount })} />
        <Slider label="키오스크 수" min={1} max={5} step={1} value={draft.kioskCount} onChange={(kioskCount) => set({ kioskCount })} />
        <Slider
          label="단체 손님 비율"
          min={0}
          max={100}
          step={1}
          value={Math.round(draft.groupRatio * 100)}
          suffix="%"
          onChange={(value) => set({ groupRatio: value / 100 })}
        />
        <Slider label="평균 그룹 크기" min={2} max={6} step={1} value={draft.avgGroupSize} onChange={(avgGroupSize) => set({ avgGroupSize })} />
        <label className="field">
          <span>키오스크 선택</span>
          <select
            value={draft.kioskStrategy}
            onChange={(event) => set({ kioskStrategy: event.target.value as KioskStrategy })}
          >
            <option value="nearest">가장 가까운 빈 키오스크</option>
            <option value="shortest-queue">최단 대기열</option>
            <option value="random">무작위</option>
          </select>
        </label>
        <p className="hint">지금은 대기열이 하나라, 최단 대기열도 비어 있는 키오스크 중 가까운 대를 고릅니다.</p>
      </Section>

      <Section title="고객">
        <div className="age-grid">
          {AGE_BANDS.map((band) => (
            <Slider
              key={band.id}
              label={band.label}
              min={0}
              max={40}
              step={1}
              value={draft.ageWeights[band.id]}
              onChange={(value) =>
                set({ ageWeights: { ...draft.ageWeights, [band.id]: value } })
              }
            />
          ))}
        </div>
        <RangeFields
          label="메뉴 고민시간"
          min={draft.decisionTime.min}
          max={draft.decisionTime.max}
          onChange={(min, max) => set({ decisionTime: { min, max } })}
        />
        <RangeFields
          label="결제시간"
          min={draft.paymentTime.min}
          max={draft.paymentTime.max}
          onChange={(min, max) => set({ paymentTime: { min, max } })}
        />
        <p className="hint">10~30대는 범위의 짧은 쪽을 쓰고, 40대부터는 나이가 높을수록 최대에 가까워집니다.</p>
        <Slider
          label="이동속도"
          min={0.5}
          max={3}
          step={0.05}
          value={draft.movementSpeed}
          suffix=" m/s"
          onChange={(movementSpeed) => set({ movementSpeed })}
        />
      </Section>

      <Section title="주문">
        <RangeFields
          label="제조시간"
          min={draft.prepTime.min}
          max={draft.prepTime.max}
          onChange={(min, max) => set({ prepTime: { min, max } })}
        />
        <p className="hint">주방 인원은 두지 않습니다. 주문마다 제조 타이머만 돌아갑니다.</p>
      </Section>

      <Section title="시뮬레이션">
        <Slider
          label="시뮬레이션 시간"
          min={1}
          max={30}
          step={1}
          value={Math.round(draft.duration / 60)}
          suffix="분"
          onChange={(minutes) => set({ duration: minutes * 60 })}
        />
        <Slider label="시드" min={1} max={9999} step={1} value={draft.seed} onChange={(seed) => set({ seed })} />
        <p className="hint">시드는 손님 명단 번호입니다. 같은 번호면 같은 손님이 같은 순서로 들어옵니다.</p>
        <div className="field">
          <span>배속</span>
          <div className="speed-row">
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                className={speed === value ? "active" : ""}
                onClick={() => onSpeed(value)}
              >
                {value}x
              </button>
            ))}
          </div>
        </div>
      </Section>

      <div className="control-actions">
        {dirty && <p className="dirty">바꾼 조건은 다시 시작해야 반영됩니다.</p>}
        <button type="button" className="primary" onClick={onRestart}>
          시뮬레이션 다시 시작
        </button>
        <div className="row-buttons">
          <button type="button" onClick={() => onRunning(!running)}>{running ? "일시정지" : "재생"}</button>
          <button type="button" onClick={() => onSkip(10)}>10초 진행</button>
        </div>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="block">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  suffix = "",
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const shown = Number.isInteger(step) ? String(Math.round(value)) : value.toFixed(2).replace(/0$/, "");
  return (
    <label className="field">
      <span>
        {label}
        <strong>{shown}{suffix}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function RangeFields({
  label,
  min,
  max,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="range-pair">
        <input
          aria-label={`${label} 최소`}
          type="number"
          min={1}
          value={min}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(next, max);
          }}
        />
        <span>~</span>
        <input
          aria-label={`${label} 최대`}
          type="number"
          min={1}
          value={max}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(min, next);
          }}
        />
        <span>초</span>
      </div>
    </div>
  );
}

