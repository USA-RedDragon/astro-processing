export interface Project {
  id: number;
  name: string;
  description?: string;
  state?: ProjectState;
  priority?: ProjectPriority;
  create_date?: number;
  active_date?: number;
  inactive_date?: number;
  minimum_time?: number;
  minimum_altitude?: number;
  use_custom_horizon?: boolean;
  horizon_offset?: number;
  meridian_window?: number;
  filter_switch_frequency?: number;
  dither_every?: number;
  enable_grader?: boolean;
  is_mosaic: boolean;
  flats_handling?: boolean;
  maximum_altitude?: number;
  smart_exposure_order?: number;
}

export interface ListProjectsResponse {
  projects: Project[];
}

export interface ProjectWithStats extends Project {
  stats?: Stats;
}

export interface Stats {
  desired_images: number;
  accepted_images: number;
  rejected_images: number;
  acquired_images: number;
}

export const PROJECT_STATE_DRAFT = "Draft";
export const PROJECT_STATE_ACTIVE = "Active";
export const PROJECT_STATE_INACTIVE = "Inactive";
export const PROJECT_STATE_CLOSED = "Closed";

export const PROJECT_PRIORITY_LOW = "Low";
export const PROJECT_PRIORITY_NORMAL = "Normal";
export const PROJECT_PRIORITY_HIGH = "High";

export type ProjectState =
  | typeof PROJECT_STATE_DRAFT
  | typeof PROJECT_STATE_ACTIVE
  | typeof PROJECT_STATE_INACTIVE
  | typeof PROJECT_STATE_CLOSED;

export type ProjectPriority =
  | typeof PROJECT_PRIORITY_LOW
  | typeof PROJECT_PRIORITY_NORMAL
  | typeof PROJECT_PRIORITY_HIGH;
