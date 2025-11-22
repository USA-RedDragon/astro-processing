export interface Target {
  id: number;
  name: string;
  active: boolean;
  ra: number | null;
  dec: number | null;
  epoch_code: string;
  rotation: number;
  region_of_interest: number;
  project_id: number | null;
  project?: Project;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
}

export interface TargetImageStats {
  desired_images: number;
  accepted_images: number;
  rejected_images: number;
  acquired_images: number;
}

export interface TargetImageStatsResponse {
  total: TargetImageStats;
  filters: Record<string, TargetImageStats>;
}

export interface ListTargetsResponse {
  targets: Target[];
}

export interface TargetWithStats extends Target {
  stats?: TargetImageStatsResponse;
}
