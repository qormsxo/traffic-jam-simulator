export { TrafficSimulation, runSimulation } from "./engine";

export { buildNetwork } from "./network";

export { buildArrivals, lanesForMovement, pickLane } from "./schedule";

export { defaultConfig, kmhToMps, normalizeConfig } from "./presets";

export { idmAcceleration } from "./carFollowing";

export { phasePlan, shouldStop, signalAt } from "./signals";

export { ARM_LENGTH, LANE_WIDTH, VEHICLE_LENGTH } from "./constants";

export {
  APPROACH_LABEL,
  APPROACH_ORDER,
  MOVEMENT_LABEL,
  STATE_LABEL,
  laneLabel,
  type ApproachId,
  type Movement,
  type SimConfig,
  type SimSnapshot,
  type Stats,
  type Vehicle,
  type VehicleState,
} from "./types";
