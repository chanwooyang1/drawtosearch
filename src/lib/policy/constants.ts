import type {
  PlanPolicyAction,
  PolicySnapshot,
  PolicySnapshotParameters,
  RefinePolicyAction,
} from "./types";

export const PLAN_POLICY_ACTIONS: PlanPolicyAction[] = [
  "broad_reference",
  "logo_symbol",
  "service_icon",
  "product_visual",
  "object_reference",
  "literal_text",
];

export const REFINE_POLICY_ACTIONS: RefinePolicyAction[] = [
  "accept_first_pass",
  "refine_by_context",
  "refine_by_visual_tokens",
  "refine_by_result_entity",
];

function buildDefaultPriors<TAction extends string>(actions: TAction[]) {
  return Object.fromEntries(
    actions.map((action) => [
      action,
      {
        alpha: 1,
        beta: 1,
      },
    ]),
  ) as Record<TAction, { alpha: number; beta: number }>;
}

export function createNeutralSnapshot<TAction extends string>(
  policyFamily: PolicySnapshot<TAction>["policyFamily"],
  actions: TAction[],
): PolicySnapshot<TAction> {
  const now = new Date();

  return {
    createdAt: now,
    id: `neutral-${policyFamily}`,
    offlineMetrics: {
      bucketCount: 0,
      expectedReward: 0,
      sampleCount: 0,
    },
    parameters: {
      bucketPriors: {},
      defaultPriors: buildDefaultPriors(actions),
    } satisfies PolicySnapshotParameters<TAction>,
    policyFamily,
    status: "approved",
    trainingWindowEnd: now,
    trainingWindowStart: now,
    version: "neutral-v1",
  };
}
