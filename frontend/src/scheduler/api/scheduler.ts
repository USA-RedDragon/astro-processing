import { api, query } from './client'
import type { AfStatus } from '../autofocus'

export type Reachability = 'unknown' | 'online' | 'offline' | 'unconfigured'

export type SchedulerState = 'imaging' | 'waiting' | 'paused' | 'idle' | 'stopped' | 'calibrating'

export type SchedulerActivity =
  | 'preparing'
  | 'slewing'
  | 'centering'
  | 'focusing'
  | 'guiding'
  | 'dithering'
  | 'meridian_flip'
  | 'switching_filter'
  | 'waiting'
  | 'starting_exposure'
  | 'exposing'
  | 'downloading'
  | 'saving'
  | 'busy'

export interface RuleScore {
  rule: string
  weight: number
  score: number
}

export interface SchedulerExposure {
  plan_id?: number
  filter: string
  seconds: number
  started_at?: string
  ends_at?: string
  number?: number
  abort_blocked?: string
  sync_clients?: boolean
}

export interface SchedulerTarget {
  project_id: number
  project_name: string
  project_guid?: string
  target_id: number
  target_name: string
  target_guid?: string
  priority?: number
  is_mosaic?: boolean
  ra_hours?: number
  dec_degrees?: number
  rotation?: number
  picked_at?: string
  minimum_time_end?: string
  hard_stop?: string
}

export interface SchedulerSkip {
  scope: 'target' | 'project'
  target_id?: number
  project_id?: number
  name?: string
  until?: string
}

export interface SchedulerStatus {
  reachable: Reachability
  last_answer?: string
  since?: string
  live?: boolean
  error?: string
  version?: string
  time?: string
  web_editing?: boolean
  api?: boolean
  state?: SchedulerState | string
  paused?: boolean
  pause_requested?: boolean
  pause?: { mount?: string; resume_at?: string } | null
  target?: SchedulerTarget | null
  exposure?: SchedulerExposure | null
  wait?: { until?: string; target_name?: string } | null
  activity?: SchedulerActivity | string | null
  activity_detail?: string | null
  activity_since?: string | null
  scores?: RuleScore[] | null
  score_total?: number | null
  score_note?: string | null
  skips?: SchedulerSkip[] | null
  pending?: { id: string; kind: string; received_at?: string }[] | null
  last_plan_at?: string
  autofocus?: AfStatus | null
  calibration?: CalibrationStatus | null
}

export type CalibrationKind = 'cooling' | 'darks' | 'bias' | 'flats' | 'done'
export type CalibrationPlacement = 'before_wait' | 'while_unsafe' | 'end_of_night' | 'flats'
export type CalibrationFrameKind = 'darks' | 'bias' | 'flats'

export interface CalibrationCooling {
  target?: number | null
  from?: number | null
  started_at?: string | null
  ends_at?: string | null
  rate_c_per_min?: number | null
  source?: 'sequence' | 'darks' | string | null
}

export interface CalibrationSetup {
  combo_key?: string | null
  exposure?: number | null
  gain?: number | null
  offset?: number | null
  binning?: number | null
  readout_mode?: string | null
  set_temp?: number | null
  filter?: string | null
  target_name?: string | null
}

export interface CalibrationSet extends CalibrationSetup {
  target_id?: number | null
  session_date?: string | null
  rotation?: number | null
  panel_brightness?: number | null
  frames_total?: number | null
  frames_before?: number | null
  frames_done?: number | null
  index?: number | null
  count?: number | null
  started_at?: string | null
  ends_at?: string | null
}

export interface CalibrationFrame {
  number?: number | null
  seconds?: number | null
  started_at?: string | null
  ends_at?: string | null
}

export type CalibrationQueueStatus = 'taking' | 'next' | 'done' | 'skipped' | 'waiting'

export interface CalibrationQueueItem extends CalibrationSetup {
  kind?: CalibrationFrameKind | null
  frames_total?: number | null
  frames_have?: number | null
  remaining?: number | null
  lights_blocked?: number | null
  lights_scaled?: number | null
  status?: CalibrationQueueStatus | string | null
  reason_code?: string | null
  reason?: string | null
  planned_start?: string | null
  planned_end?: string | null
  fit_frames?: number | null
}

export interface CalibrationTaken extends CalibrationSetup {
  kind?: CalibrationFrameKind | null
  frames?: number | null
  started_at?: string | null
  ended_at?: string | null
}

export interface CalibrationStatus {
  kind?: CalibrationKind | string | null
  placement?: CalibrationPlacement | string | null
  purpose?: 'darks' | 'imaging' | string | null
  since?: string | null
  updated_at?: string | null
  camera?: {
    connected?: boolean | null
    temperature?: number | null
    setpoint?: number | null
    cooler_power?: number | null
  } | null
  ambient?: number | null
  sun_limit_at?: string | null
  sun_limit_degrees?: number | null
  cooling?: CalibrationCooling | null
  set?: CalibrationSet | null
  frame?: CalibrationFrame | null
  queue?: CalibrationQueueItem[] | null
  taken?: CalibrationTaken[] | null
  stop?: { at?: string | null; code?: string | null; reason?: string | null } | null
  log?: { at?: string | null; text?: string | null }[] | null
}

export interface Twilight {
  sunset?: string | null
  civil_dusk?: string | null
  nautical_dusk?: string | null
  astronomical_dusk?: string | null
  astronomical_dawn?: string | null
  nautical_dawn?: string | null
  civil_dawn?: string | null
  sunrise?: string | null
}

export interface PlanBlock {
  start: string
  end: string
  wait: boolean
  project_id?: number
  project_name?: string
  target_id?: number
  target_name?: string
  filter?: string
  exposure_seconds?: number
  count?: number
  picked?: boolean
  scores?: RuleScore[] | null
  total?: number | null
  runner_up?: { target_name: string; total: number } | null
  reason?: string
  held?: string | null
}

export interface LeftOutReason {
  reason: string
  from: string
  until: string
  minutes: number
}

export interface LeftOut {
  project_id?: number
  project_name?: string
  target_id?: number
  target_name?: string
  reason?: string
  at?: string
  until?: string
  winner_name?: string
  winner_total?: number
  total?: number
  after_night?: boolean
  reasons?: LeftOutReason[] | null
}

export interface PreviewAssumption {
  key: string
  text: string
}

export interface Preview {
  start?: string
  end?: string
  generated_at?: string
  twilight?: Twilight | null
  blocks?: PlanBlock[] | null
  left_out?: LeftOut[] | null
  skips?: SchedulerSkip[] | null
  stop_reason?: string
  error?: string
  assumptions?: PreviewAssumption[] | null
  override_kinds?: string[] | null
}

export type OverrideField = 'priority' | 'state' | 'minimumtime'

export interface Override {
  entity: 'project'
  id: number
  field: OverrideField
  value: number
}

// A skip the plugin's simulation applies when the running exposure ends, as a
// skip sent now would; value is minutes, or 0 for the rest of the night.
export interface SkipOverride {
  entity: 'skip'
  id: number
  field: 'target' | 'project'
  value: number
}

export interface SchedPlan {
  id: number
  guid: string | null
  filter: string | null
  template: string | null
  exposure: number | null
  exposureSource?: 'plan' | 'template'
  planExposure: number | null
  defaultExposure: number | null
  desired: number | null
  acquired: number | null
  accepted: number | null
  enabled: boolean | null
}

export interface SchedTarget {
  id: number
  guid: string | null
  name: string
  active: boolean
  ra: number | null
  dec: number | null
  rotation: number | null
  plans: SchedPlan[]
}

export interface SchedProject {
  id: number
  guid: string | null
  name: string
  state: number | null
  priority: number | null
  minimumtime: number | null
  isMosaic: boolean
  targets: SchedTarget[]
  lastImage?: string
}

export interface TonightSub {
  id: number
  time: string
  project_id: number
  project: string
  target_id: number
  target: string
  filter: string
  exposure?: number
  hfr?: number
  stars?: number
  guiding_rms?: number
  guiding_rms_ra?: number
  guiding_rms_dec?: number
  grading: 'accepted' | 'rejected' | 'pending'
  file?: string
  verdict?: string
  score?: number
  weight?: number
  gain?: number
  ccd_temp?: number
  processed_at?: string
  uploaded_at?: string
  preview_url?: string
  calibrated_url?: string
  calibrated_note?: string
  width?: number | null
  height?: number | null
  indexed?: boolean
}

export interface GraderHfrSettings {
  project_grading: boolean
  enabled: boolean
  sigma_factor: number
  auto_accept_level?: number
  accept_improvement: boolean
  max_sample_size: number
  delay_threshold_percent: number
  mode: 'immediate' | 'delayed'
}

export type GraderPlanState =
  | 'limit'
  | 'project_grading_off'
  | 'hfr_grading_off'
  | 'no_images'
  | 'too_few_samples'
  | 'invalid_samples'

export interface GraderPlanLimit {
  plan_id: number
  filter: string
  exposure_seconds: number
  state: GraderPlanState
  acquired: number
  matching: number
  samples: number
  reference_image_id?: number
  reference_at?: string
  reference_exposure?: number
  gain?: number
  offset?: number
  binning?: string
  roi?: number
  mean?: number
  sd?: number
  lower?: number
  upper?: number
  reject_above?: number
  reject_below?: number
  zero_rejected?: boolean
  invalid_samples?: number
  population_rule?: string
}

export interface GraderReport {
  generated_at?: string
  project_id: number
  target_id: number
  target_name: string
  hfr?: GraderHfrSettings
  plans: GraderPlanLimit[]
}

export interface GraderTarget {
  target_id: number
  source: 'plugin' | 'last_known'
  fetched_at: string
  error?: string
  report: GraderReport | null
}

export interface GraderSummary {
  state: 'ok' | 'unsupported' | 'unreachable' | 'unconfigured' | 'error'
  note?: string
  version?: string
  targets: GraderTarget[]
}

export interface TonightSubs {
  since: string
  since_basis?: string
  subs: TonightSub[]
  latest?: TonightSub
  latest_preview?: TonightSub
  grader?: GraderSummary
}

export type ConditionSource = 'none' | 'error' | 'prometheus' | 'symmetricds'

export interface SourceState {
  source: ConditionSource
  error?: string
}

export interface WeatherReport extends SourceState {
  connected?: boolean
  cloud_cover?: number
  rain_rate?: number
  wind_speed?: number
  wind_gust?: number
  humidity?: number
  dew_point?: number
  temperature?: number
  sky_temperature?: number
  sky_brightness_lux?: number
  pressure?: number
}

export interface SafetyReport extends SourceState {
  connected?: boolean
  safe?: boolean
}

export interface MountReport extends SourceState {
  connected?: boolean
  tracking?: boolean
  parked?: boolean
  slewing?: boolean
  at_home?: boolean
  altitude?: number
  flip_hours?: number
}

export interface CameraReport extends SourceState {
  connected?: boolean
  temperature?: number
  target_temperature?: number
  cooler_on?: boolean
  cooler_power?: number
  sensor_width?: number
  sensor_height?: number
  bin_x?: number
  bin_y?: number
  gain?: number
  pixel_size?: number
  offset?: number
  is_exposing?: boolean
  at_target?: boolean
}

export interface FlatDeviceReport extends SourceState {
  connected?: boolean
  light_on?: boolean
  brightness?: number
  brightness_max?: number
}

export interface FilterWheelReport extends SourceState {
  connected?: boolean
  selected_id?: number
}

export interface LastImageReport extends SourceState {
  exposure?: number
  median_adu?: number
  mean_adu?: number
  stdev_adu?: number
  max_adu?: number
  gain?: number
  offset?: number
  temperature?: number
}

export interface RotatorReport extends SourceState {
  connected?: boolean
  position?: number
  mechanical_position?: number
}

export interface PowerReport extends SourceState {
  model?: string
  charge?: number
  input_voltage?: number
  flags?: string[]
  on_battery?: boolean
  low_battery?: boolean
  on_battery_seconds?: number
  runtime_seconds?: number
  charge_low?: number
  runtime_low_seconds?: number
  last_on_battery?: string
  battery_history_from?: string
}

export interface SyncReport extends SourceState {
  node?: string
  heartbeat?: string
  last_batch?: string
  lag_seconds?: number
  errors?: number
}

export interface Conditions {
  at: string
  weather: WeatherReport
  safety: SafetyReport
  mount: MountReport
  camera?: CameraReport
  rotator?: RotatorReport
  power: PowerReport
  sync: SyncReport
  flat_device?: FlatDeviceReport
  filter_wheel?: FilterWheelReport
  last_image?: LastImageReport
}

export interface CameraHistoryPoint {
  t: string
  temperature?: number | null
  setpoint?: number | null
  cooler_power?: number | null
}

export interface CameraHistory {
  step_seconds?: number
  points: CameraHistoryPoint[] | null
}

export interface RecentCalibrationRun {
  kind: CalibrationFrameKind | string
  started_at?: string | null
  ended_at?: string | null
  target_name?: string | null
  filter?: string | null
  exposure?: number | null
  gain?: number | null
  offset?: number | null
  binning?: number | null
  set_temp?: number | null
  frames?: number | null
  clean?: number | null
  leak?: number | null
  unchecked?: number | null
}

export interface RecentCalibration {
  from?: string
  to?: string
  newest_indexed?: string | null
  runs: RecentCalibrationRun[] | null
}

export interface MoonNight {
  samples: { t: string; alt: number }[]
  illumination: number
  age: number
  waxing: boolean
  rises: string[]
  sets: string[]
  next_new: string
  next_full: string
}

export type Night = 'tonight' | 'tomorrow'

export const getSchedulerStatus = () => api.get<SchedulerStatus>('/scheduler/status')

export const getPreview = (night: Night = 'tonight', fresh = false) =>
  api.get<Preview>('/scheduler/preview' + query({ night, fresh: fresh ? 1 : undefined }))

export const postPreview = (
  night: Night,
  overrides: (Override | SkipOverride)[],
  weights: Record<string, number> = {},
) => api.post<Preview>('/scheduler/preview', { night, overrides, weights })

export const getProjects = () => api.get<SchedProject[]>('/scheduler/projects')

export const getTonightSubs = (since?: string) =>
  api.get<TonightSubs>('/scheduler/tonight-subs' + query({ since }))

export const getConditions = () => api.get<Conditions>('/scheduler/conditions')

export const getCameraHistory = (minutes = 60) =>
  api.get<CameraHistory>('/scheduler/conditions/camera-history' + query({ minutes }))

export const getRecentCalibration = (hours = 24) =>
  api.get<RecentCalibration>('/scheduler/calibration/recent' + query({ hours }))

export const getMoon = (start: string, end: string) =>
  api.get<MoonNight>('/scheduler/moon' + query({ start, end }))
