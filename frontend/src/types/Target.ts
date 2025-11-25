import type { Project, Stats } from "./Project";

export interface Target {
  id: number;
  name: string;
  active: boolean;
  ra: number | null;
  dec: number | null;
  epoch_code: EpochCode;
  rotation: number;
  region_of_interest: number;
  project_id: number | null;
  project?: Project;
}

export const EPOCH_JNOW = "JNOW";
export const EPOCH_B1950 = "B1950";
export const EPOCH_J2000 = "J2000";
export const EPOCH_J2050 = "J2050";

export type EpochCode =
  | typeof EPOCH_JNOW
  | typeof EPOCH_B1950
  | typeof EPOCH_J2000
  | typeof EPOCH_J2050;

export interface TargetImageStatsResponse {
  total: Stats;
  filters: Record<string, Stats>;
  last_image_date: number;
}

export interface ListTargetsResponse {
  targets: Target[];
}

export interface TargetWithStats extends Target {
  stats?: TargetImageStatsResponse;
  last_image_date?: number;
}
