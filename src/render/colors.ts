import type { AgeBand, CustomerState } from "../sim/cafe/types";

export const AGE_COLOR: Record<AgeBand, string> = {
  "10s": "#3d8bfd",
  "20s": "#2fbf71",
  "30s": "#e2b43a",
  "40s": "#ef8a34",
  "50s": "#e15b3a",
  "60s": "#d45d9d",
  "70s": "#8d78d8",
};

export const STATE_COLOR: Record<CustomerState, string> = {
  ENTERING: "#8ec5ff",
  WAITING_FOR_KIOSK: "#ffb020",
  USING_KIOSK: "#ffe14a",
  DECIDING_MENU: "#ff8bd2",
  PAYING: "#c9a0ff",
  WAITING_FOR_FOOD: "#5ad7c6",
  PICKING_UP: "#8be07a",
  EXITING: "#ece7e1",
  COMPLETED: "#666666",
};
