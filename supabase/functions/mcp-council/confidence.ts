// supabase/functions/mcp-council/confidence.ts
//
// Shared completion-loop engine. Every council tool runs its produce step
// through this so confidence (ε epistemic, ρ rigor) is the gate, not chance.
//
// Rules:
//   · Never inflate ε/ρ between iterations — only a fresh produce pass updates.
//   · Stop on done · capped (external info needed) · escalate (caller convenes)
//     · max_iters · budget_calls · diminishing returns (Δε < min_eps_delta).

import { ROUTING_CONFIG } from "./routing-config.ts";

export type ClosingAction =
  | "none"
  | "gather_context"
  | "add_lens"
  | "re_reason"
  | "escalate_panel"
  | "needs_external_info";

export type ProduceResult<T> = {
  output: T;
  epsilon: number;
  rho: number;
  closing_action: ClosingAction;
  gap?: string;
  // Hint about what lens to add when closing_action === "add_lens".
  add_lens_hint?: string;
};

export type ConfidenceOpts<T, S> = {
  state: S;
  eps_min?: number;
  rho_min?: number;
  max_iters?: number;
  budget_calls?: number;
  min_eps_delta?: number;
  // Mutate the state in response to an internally-executable closing_action.
  apply?: (state: S, result: ProduceResult<T>) => S;
  // Increment per produce call (default 1). Used to attribute model-call cost.
  callCost?: (result: ProduceResult<T>) => number;
};

export type ConfidenceResult<T> = {
  output: T;
  epsilon: number;
  rho: number;
  done: boolean;
  capped: boolean;
  escalate: boolean;
  gap?: string;
  closing_action: ClosingAction;
  iters: number;
  calls: number;
};

export async function runWithConfidenceFloor<T, S>(
  produce: (state: S) => Promise<ProduceResult<T>>,
  opts: ConfidenceOpts<T, S>,
): Promise<ConfidenceResult<T>> {
  const eps_min = opts.eps_min ?? ROUTING_CONFIG.floor.eps_min;
  const rho_min = opts.rho_min ?? ROUTING_CONFIG.floor.rho_min;
  const max_iters = opts.max_iters ?? ROUTING_CONFIG.max_iters;
  const budget_calls = opts.budget_calls ?? ROUTING_CONFIG.budget_calls;
  const min_eps_delta = opts.min_eps_delta ?? ROUTING_CONFIG.min_eps_delta;

  let state = opts.state;
  let iters = 0;
  let calls = 0;
  let prevEps = -1;
  let last: ProduceResult<T> | null = null;

  // Always produce at least once.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const r = await produce(state);
    last = r;
    calls += opts.callCost?.(r) ?? 1;

    if (r.epsilon >= eps_min && r.rho >= rho_min) {
      return {
        output: r.output, epsilon: r.epsilon, rho: r.rho,
        done: true, capped: false, escalate: false,
        closing_action: "none", iters, calls,
      };
    }

    if (r.closing_action === "escalate_panel") {
      return {
        output: r.output, epsilon: r.epsilon, rho: r.rho,
        done: false, capped: false, escalate: true,
        gap: r.gap, closing_action: "escalate_panel", iters, calls,
      };
    }

    if (r.closing_action === "needs_external_info") {
      return {
        output: r.output, epsilon: r.epsilon, rho: r.rho,
        done: false, capped: true, escalate: false,
        gap: r.gap, closing_action: "needs_external_info", iters, calls,
      };
    }

    // Diminishing returns: stop capped.
    if (prevEps >= 0 && r.epsilon - prevEps < min_eps_delta) {
      return {
        output: r.output, epsilon: r.epsilon, rho: r.rho,
        done: false, capped: true, escalate: false,
        gap: r.gap ?? "diminishing_returns", closing_action: r.closing_action,
        iters, calls,
      };
    }
    prevEps = r.epsilon;

    // Internal closing actions: apply and loop.
    if (
      r.closing_action === "gather_context" ||
      r.closing_action === "add_lens" ||
      r.closing_action === "re_reason"
    ) {
      if (iters >= max_iters || calls >= budget_calls) {
        return {
          output: r.output, epsilon: r.epsilon, rho: r.rho,
          done: false, capped: true, escalate: false,
          gap: r.gap ?? "budget_exhausted", closing_action: r.closing_action,
          iters, calls,
        };
      }
      if (opts.apply) state = opts.apply(state, r);
      iters++;
      continue;
    }

    // closing_action === "none" but floor not met → cap.
    return {
      output: r.output, epsilon: r.epsilon, rho: r.rho,
      done: false, capped: true, escalate: false,
      gap: r.gap ?? "below_floor_no_action", closing_action: "none",
      iters, calls,
    };
  }
}
