import type { ReactNode } from "react";
import type { SimConfig } from "../sim/traffic/types";

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
  onRandomBrake: () => void;
  onRandomCut: () => void;
  notice: string | null;
};

const SPEEDS = [1, 2, 4, 8, 16];

/** 왼쪽 조작 패널을 보여 줌. */
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
  onRandomBrake,
  onRandomCut,
  notice,
}: Props) {
  /** 초안 설정 일부만 바꿈. */
  const set = (patch: Partial<SimConfig>) => onChange({ ...draft, ...patch });

  return (
    <aside className="panel controls">
      <h1>교통체증</h1>
      <p className="hint">한 방향 도로입니다. 기본은 1차선이고, 차량은 실제 위치와 속도로 움직입니다. 앞차가 느려지면 뒤차가 감속합니다.</p>
      <div className="row-buttons incident-buttons">
        <button type="button" className="brake" onClick={onRandomBrake}>급브레이크</button>
        <button type="button" className="cut" onClick={onRandomCut}>끼어들기</button>
      </div>
      <p className="hint">버튼을 누르면 지금 도로 위의 차 중 하나가 그 행동을 합니다. 급정거는 뒤차까지 감속이 이어지고, 끼어들기는 옆 차선으로 들어갑니다.</p>
      {notice && <p className="dirty">{notice}</p>}

      <Section title="교통량">
        <Slider
          label="차량 생성량"
          min={200}
          max={5000}
          step={50}
          value={draft.spawnPerHour}
          suffix=" 대/시"
          onChange={(spawnPerHour) => set({ spawnPerHour })}
        />
        <p className="hint">서쪽 끝에서 들어옵니다. 같은 시드면 같은 차가 같은 시각에 도착합니다.</p>
      </Section>

      <Section title="도로">
        <Slider label="차선 수" min={1} max={4} step={1} value={draft.laneCount} suffix=" 차로" onChange={(laneCount) => set({ laneCount })} />
        <p className="hint">기본은 1차로입니다. 2차로부터 점선 사이로 끼어들 수 있습니다.</p>
      </Section>

      <Section title="차량">
        <Slider
          label="최대 속도"
          min={20}
          max={80}
          step={1}
          value={draft.maxSpeed}
          suffix=" km/h"
          onChange={(maxSpeed) => set({ maxSpeed })}
        />
        <Slider
          label="안전거리"
          min={1}
          max={6}
          step={0.1}
          value={draft.safetyDistance}
          suffix=" m"
          onChange={(safetyDistance) => set({ safetyDistance })}
        />
        <p className="hint">안전거리는 멈췄을 때의 최소 간격입니다. 달릴 때는 속도에 맞춰 더 벌어집니다. 차량마다 속도 성향이 조금 다릅니다.</p>
      </Section>

      <Section title="돌발">
        <Slider
          label="끼어들기"
          min={0}
          max={12}
          step={1}
          value={draft.cutInsPerMinute}
          suffix=" 회/분"
          onChange={(cutInsPerMinute) => set({ cutInsPerMinute })}
        />
        <Slider
          label="급브레이크"
          min={0}
          max={12}
          step={1}
          value={draft.brakesPerMinute}
          suffix=" 회/분"
          onChange={(brakesPerMinute) => set({ brakesPerMinute })}
        />
        <p className="hint">시뮬레이션 시간 기준입니다. 0이면 위 버튼으로만 일어납니다. 숫자를 바꾸면 바로 적용됩니다.</p>
      </Section>

      <Section title="시뮬레이션">
        <Slider
          label="시뮬레이션 시간"
          min={1}
          max={15}
          step={1}
          value={Math.round(draft.duration / 60)}
          suffix="분"
          onChange={(minutes) => set({ duration: minutes * 60 })}
        />
        <Slider label="시드" min={1} max={9999} step={1} value={draft.seed} onChange={(seed) => set({ seed })} />
        <div className="field">
          <span>배속</span>
          <div className="speed-row">
            {SPEEDS.map((value) => (
              <button key={value} type="button" className={speed === value ? "active" : ""} onClick={() => onSpeed(value)}>
                {value}x
              </button>
            ))}
          </div>
        </div>
      </Section>

      <div className="control-actions">
        {dirty && <p className="dirty">바꾼 조건은 다시 시작해야 반영됩니다. 배속만 바로 적용됩니다.</p>}
        <button type="button" className="primary" onClick={onRestart}>
          시뮬레이션 다시 시작
        </button>
        <div className="row-buttons">
          <button type="button" onClick={() => onRunning(!running)}>{running ? "일시정지" : "재생"}</button>
          <button type="button" onClick={() => onSkip(30)}>30초 진행</button>
        </div>
      </div>
    </aside>
  );
}

/** 패널 안의 소제목 묶음을 보여 줌. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="block">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** 숫자 슬라이더 하나를 보여 줌. */
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
  const shown = Number.isInteger(step) ? String(Math.round(value)) : value.toFixed(1);

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
