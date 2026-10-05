import { useEffect, useMemo, useState } from "react";
import { useCafeSim } from "./hooks/useCafeSim";
import { defaultConfig, normalizeConfig } from "./sim/cafe/presets";
import type { SimConfig } from "./sim/cafe/types";
import { CafeScene, stateHeadline } from "./render/CafeScene";
import { AGE_COLOR, STATE_COLOR } from "./render/colors";
import { Controls } from "./ui/Controls";
import { StatsPanel } from "./ui/StatsPanel";
import { formatClock, formatSeconds } from "./ui/format";
import { STATE_LABEL } from "./sim/cafe/types";

export function App() {
  const [draft, setDraft] = useState<SimConfig>(defaultConfig);
  const [applied, setApplied] = useState<SimConfig>(defaultConfig);
  const [speed, setSpeed] = useState(4);
  const [running, setRunning] = useState(true);
  const [runId, setRunId] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { snap, skip } = useCafeSim(applied, speed, running, runId);

  useEffect(() => {
    setSelectedId(null);
  }, [runId]);

  const dirty = useMemo(
    () => JSON.stringify(normalizeConfig(draft)) !== JSON.stringify(normalizeConfig(applied)),
    [draft, applied],
  );
  const selected = snap?.customers.find((customer) => customer.id === selectedId) ?? null;

  const restart = () => {
    setApplied(normalizeConfig(draft));
    setRunId((value) => value + 1);
    setRunning(true);
  };

  return (
    <div className="app">
      <main className="viewport">
        {snap && <CafeScene snapshot={snap} selectedId={selectedId} onSelect={setSelectedId} />}
        <div className="hud">
          <div className="clock">
            <strong>{snap ? formatClock(snap.time) : "00:00"}</strong>
            <span>/ {formatClock(applied.duration)}</span>
            {snap?.finished && <em>시간 종료</em>}
          </div>
          <p className="drag-hint">드래그로 둘러보고, 휠로 가까이 봅니다. 손님을 누르면 상태가 나옵니다.</p>
          <Legend />
        </div>
        {selected && (
          <article className="inspector">
            <header>
              <strong>{selected.id}</strong>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="고객 정보 닫기">닫기</button>
            </header>
            <p>{stateHeadline(selected)}</p>
            <dl>
              <div><dt>상태</dt><dd>{STATE_LABEL[selected.state]}</dd></div>
              <div><dt>조작시간</dt><dd>{formatSeconds(selected.operationTime)}</dd></div>
              <div><dt>고민시간</dt><dd>{formatSeconds(selected.decisionTime)}</dd></div>
              <div><dt>결제시간</dt><dd>{formatSeconds(selected.paymentTime)}</dd></div>
              <div><dt>제조시간</dt><dd>{selected.order ? formatSeconds(selected.order.preparationTime) : "—"}</dd></div>
              <div><dt>주문 상태</dt><dd>{selected.order?.status ?? "없음"}</dd></div>
            </dl>
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
      />
      <StatsPanel snapshot={snap} />
      {/* 조건 비교는 화면에 올리지 않습니다. 구현은 src/ui/ComparePanel.tsx 에 남겨 둡니다. */}
    </div>
  );
}

function Legend() {
  const ages = [
    ["10대", AGE_COLOR["10s"]],
    ["20대", AGE_COLOR["20s"]],
    ["30대", AGE_COLOR["30s"]],
    ["40대", AGE_COLOR["40s"]],
    ["50대", AGE_COLOR["50s"]],
    ["60대", AGE_COLOR["60s"]],
    ["70+", AGE_COLOR["70s"]],
  ] as const;
  const states = [
    ["대기", STATE_COLOR.WAITING_FOR_KIOSK],
    ["조작", STATE_COLOR.USING_KIOSK],
    ["고민", STATE_COLOR.DECIDING_MENU],
    ["결제", STATE_COLOR.PAYING],
    ["음식", STATE_COLOR.WAITING_FOR_FOOD],
    ["픽업", STATE_COLOR.PICKING_UP],
  ] as const;
  return (
    <div className="legend">
      <p>몸 색은 연령, 머리 위 점은 단계입니다.</p>
      <div>
        {ages.map(([label, color]) => (
          <span key={label}><i style={{ background: color }} />{label}</span>
        ))}
      </div>
      <div>
        {states.map(([label, color]) => (
          <span key={label}><i style={{ background: color }} />{label}</span>
        ))}
      </div>
    </div>
  );
}
