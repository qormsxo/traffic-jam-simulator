/** 초를 화면 문구로 바꿈 값이 없으면 대시를 돌려줌 */
export function formatSeconds(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";

  if (value < 60) return `${value.toFixed(1)}초`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);

  return `${minutes}분 ${seconds}초`;
}

/** 초를 분:초 시계로 바꿈 */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remain = safe % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

/** 대수를 화면 문구로 바꿈 값이 없으면 대시를 돌려줌 */
export function formatCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";

  if (Math.abs(value) >= 100 || Number.isInteger(value)) return Math.round(value).toString();

  return value.toFixed(1);
}

/** m/s를 km/h 문구로 바꿈 */
export function formatKmh(mps: number | null | undefined): string {
  if (mps == null || Number.isNaN(mps)) return "—";

  return `${(mps * 3.6).toFixed(1)} km/h`;
}

/** 미터 문구로 바꿈 값이 없으면 대시를 돌려줌 */
export function formatMeters(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";

  return `${value.toFixed(1)} m`;
}
