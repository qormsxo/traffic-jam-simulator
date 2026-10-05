export { CafeSimulation, runSimulation } from "./engine";
export { buildSchedule, sampleBand } from "./schedule";
export { baseOperationSeconds } from "./timing";
export { computeStats } from "./stats";
export { createLayout } from "./layout";
export {
  BALANCED_AGES,
  OLDER_AGES,
  YOUNG_AGES,
  defaultConfig,
  normalizeConfig,
  weightsForProfile,
} from "./presets";
export type { AgeProfile } from "./presets";
export {
  AGE_BANDS,
  STATE_LABEL,
  type AgeBand,
  type Customer,
  type CustomerGroup,
  type CustomerState,
  type Kiosk,
  type KioskStrategy,
  type Order,
  type SimConfig,
  type SimSnapshot,
  type Stats,
} from "./types";
