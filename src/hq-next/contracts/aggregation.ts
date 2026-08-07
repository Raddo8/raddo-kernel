/** HQ-NEXT · AGGREGATION CONTRACT
 * Typed end to end. Mirrors the single JSON object returned by the
 * argument-free Postgres RPC `hq_progress_bar_me`, which resolves the
 * caller's own tenant server side. The browser never supplies a cid.
 *
 * BINDING: every number rendered by the panel comes from this payload.
 * There is no client side arithmetic and there is no overdue posture. */

export type AggregationState = 'planning' | 'proving' | 'cadence' | 'complete' | 'not_started';
export type AggregationConfidence = 'counted' | 'partial' | 'early' | 'none';
export type NextRunPosture = 'ready' | 'resting' | 'complete' | 'not_started';

export interface AggregationSegments {
  read: number | null;
  known_remaining: number | null;
  known_total: number | null;
  sources_connected_not_yet_sized: number | null;
  sources_available_not_connected: number | null;
  tail_is_indeterminate: boolean;
}

export interface AggregationSource {
  label: string;
  kind: string;
  connect_state: string;
  discovery_state: string;
  estimated_items: number | null;
  items_done: number | null;
  basis: string | null;
}

export interface UnattendedSurface {
  surface: string;
  label: string | null;
  why: string | null;
}

export interface AggregationSchedule {
  state: string;
  enabled: boolean;
  surface: string | null;
  surface_label: string | null;
  surface_note: string | null;
  window: string | null;
  minutes: number | null;
  last_confirmed_run: string | null;
  headline: string;
  body: string;
  unattended_surfaces: UnattendedSurface[];
  not_for_unattended: UnattendedSurface[];
}

export interface LastRun {
  claims_added: number | null;
  entities_added: number | null;
  dated_items_added: number | null;
  minutes: number | null;
  headline: string | null;
  ran_at: string | null;
}

export interface NextRunProgress {
  percent: number | null;
  runs_done: number | null;
  runs_remaining: number | null;
  hours_remaining: number | null;
}

export interface NextRun {
  posture: NextRunPosture;
  headline: string;
  body: string;
  why_it_matters: string | null;
  promise: string | null;
  horizon_line: string | null;
  items_this_run: number | null;
  last_run: LastRun | null;
  progress: NextRunProgress | null;
  action: string | null;
  action_label: string | null;
}

export interface AggregationPayload {
  state: AggregationState;
  percent: number | null;
  confidence: AggregationConfidence;
  line: string;
  segments: AggregationSegments;
  sources: AggregationSource[];
  runs_done: number | null;
  runs_remaining: number | null;
  hours_remaining: number | null;
  full_read_horizon: string | null;
  ordering_note: string | null;
  schedule: AggregationSchedule;
  next_run: NextRun;
  never_overdue: true;
}

/** Small caps label for the confidence word. Never a warning tone. */
export const CONFIDENCE_LABEL: Record<AggregationConfidence, string> = {
  counted: 'counted',
  partial: 'partial estimate',
  early: 'early',
  none: 'not sized yet',
};
