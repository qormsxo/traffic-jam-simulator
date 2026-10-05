import type { SimSnapshot } from "../sim/cafe/types";
import { formatCount, formatSeconds } from "./format";
import { QueueChart } from "./QueueChart";

export function StatsPanel({ snapshot }: { snapshot: SimSnapshot | null }) {
  const stats = snapshot?.stats;
  return (
    <aside className="panel stats">
      <h2>실시간 통계</h2>
      {!stats || !snapshot ? (
        <p className="muted">시뮬레이션을 준비하는 중입니다.</p>
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="매장 안" value={`${stats.inStore}명`} />
            <Stat label="키오스크 대기" value={`${stats.waiting}명`} />
            <Stat label="키오스크 사용" value={`${stats.kioskUsers}명`} />
            <Stat label="완료" value={`${stats.completedCustomers}명`} />
          </div>
          <ul className="metric-list">
            <Metric label="평균 대기" value={formatSeconds(stats.avgKioskWait)} />
            <Metric label="평균 체류" value={formatSeconds(stats.avgDwell)} />
            <Metric label="시간당 처리" value={stats.throughputPerHour == null ? "—" : `${formatCount(stats.throughputPerHour)}명`} />
          </ul>
          <h3>대기열</h3>
          <QueueChart history={snapshot.queueHistory} />
        </>
      )}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <li>
      <span>{label}</span>
      <strong>{value}</strong>
    </li>
  );
}
