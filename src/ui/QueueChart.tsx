import type { QueueSample } from "../sim/cafe/types";

export function QueueChart({ history }: { history: QueueSample[] }) {
  const width = 280;
  const height = 78;
  if (history.length < 2) {
    return <p className="muted">손님이 줄을 서면 대기 인원 그래프가 채워집니다.</p>;
  }
  const maxT = Math.max(1, history[history.length - 1]?.t ?? 1);
  const maxY = Math.max(1, ...history.map((sample) => sample.waiting));
  const line = history
    .map((sample) => {
      const x = (sample.t / maxT) * width;
      const y = height - 6 - (sample.waiting / maxY) * (height - 12);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = history[history.length - 1];

  return (
    <div className="chart">
      <div className="chart-meta">
        <span>대기 인원</span>
        <strong>{last?.waiting ?? 0}명</strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="시간별 키오스크 대기 인원">
        <polyline fill="none" stroke="#e6a15c" strokeWidth="2.4" points={line} />
      </svg>
    </div>
  );
}
