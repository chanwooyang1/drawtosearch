import { randomUUID } from "crypto";

import { createNeutralSnapshot, PLAN_POLICY_ACTIONS, REFINE_POLICY_ACTIONS } from "./constants";
import type {
  CompletedPolicyTrainingSample,
  PlanPolicyAction,
  PolicyActionName,
  PolicyFamily,
  PolicySnapshot,
  PolicySnapshotParameters,
  PosteriorParams,
  RefinePolicyAction,
} from "./types";

function clonePosterior(posterior: PosteriorParams): PosteriorParams {
  return {
    alpha: posterior.alpha,
    beta: posterior.beta,
  };
}

function cloneParameters<TAction extends string>(
  parameters: PolicySnapshotParameters<TAction>,
): PolicySnapshotParameters<TAction> {
  return {
    bucketPriors: Object.fromEntries(
      Object.entries(parameters.bucketPriors).map(([bucket, priors]) => [
        bucket,
        Object.fromEntries(
          Object.entries(priors).map(([action, posterior]) => [
            action,
            clonePosterior(posterior as PosteriorParams),
          ]),
        ),
      ]),
    ) as PolicySnapshotParameters<TAction>["bucketPriors"],
    defaultPriors: Object.fromEntries(
      Object.entries(parameters.defaultPriors).map(([action, posterior]) => [
        action,
        clonePosterior(posterior as PosteriorParams),
      ]),
    ) as PolicySnapshotParameters<TAction>["defaultPriors"],
  };
}

function rewardToSuccessWeight(reward: number) {
  if (reward >= 0.4) {
    return 1;
  }

  if (reward <= -0.4) {
    return 0;
  }

  return (reward + 0.4) / 0.8;
}

function resolveActionSet(policyFamily: PolicyFamily) {
  return policyFamily === "plan_policy"
    ? PLAN_POLICY_ACTIONS
    : REFINE_POLICY_ACTIONS;
}

function buildBaseSnapshot<TAction extends string>(
  policyFamily: PolicyFamily,
  baseSnapshot?: PolicySnapshot<TAction>,
) {
  if (baseSnapshot) {
    return {
      ...baseSnapshot,
      parameters: cloneParameters(baseSnapshot.parameters),
    };
  }

  if (policyFamily === "plan_policy") {
    return createNeutralSnapshot<PlanPolicyAction>(
      policyFamily,
      PLAN_POLICY_ACTIONS,
    ) as PolicySnapshot<TAction>;
  }

  return createNeutralSnapshot<RefinePolicyAction>(
    policyFamily,
    REFINE_POLICY_ACTIONS,
  ) as PolicySnapshot<TAction>;
}

export function trainPolicySnapshot<TAction extends PolicyActionName>(input: {
  baseSnapshot?: PolicySnapshot<TAction>;
  now?: Date;
  policyFamily: PolicyFamily;
  samples: CompletedPolicyTrainingSample[];
  trainingWindowEnd?: Date;
  trainingWindowStart?: Date;
  version?: string;
}) {
  const now = input.now ?? new Date();
  const trainedAt = input.samples.length
    ? new Date(
        Math.max(...input.samples.map((sample) => sample.reward.finalizedAt.getTime())),
      )
    : now;
  const base = buildBaseSnapshot<TAction>(input.policyFamily, input.baseSnapshot);
  const parameters = cloneParameters(base.parameters);
  const actions = new Set<string>(resolveActionSet(input.policyFamily));
  let rewardSum = 0;

  for (const sample of input.samples) {
    const action = sample.decision.actionName as TAction;

    if (!actions.has(action) || sample.decision.policyFamily !== input.policyFamily) {
      continue;
    }

    const bucket = sample.decision.contextBucket;
    const bucketPriors = parameters.bucketPriors[bucket] ?? {};
    const posterior =
      bucketPriors[action] ??
      parameters.defaultPriors[action] ?? {
        alpha: 1,
        beta: 1,
      };
    const successWeight = rewardToSuccessWeight(sample.reward.rewardValue);

    bucketPriors[action] = {
      alpha: posterior.alpha + successWeight,
      beta: posterior.beta + (1 - successWeight),
    };
    parameters.bucketPriors[bucket] = bucketPriors;
    rewardSum += sample.reward.rewardValue;
  }

  return {
    createdAt: now,
    id: randomUUID(),
    offlineMetrics: {
      bucketCount: Object.keys(parameters.bucketPriors).length,
      expectedReward:
        input.samples.length > 0 ? Number((rewardSum / input.samples.length).toFixed(4)) : 0,
      sampleCount: input.samples.length,
    },
    parameters,
    policyFamily: input.policyFamily,
    status: "draft",
    trainingWindowEnd:
      input.trainingWindowEnd ??
      (input.samples.length ? trainedAt : now),
    trainingWindowStart:
      input.trainingWindowStart ??
      (input.samples.length
        ? new Date(
            Math.min(...input.samples.map((sample) => sample.decision.createdAt.getTime())),
          )
        : now),
    version:
      input.version ??
      `${input.policyFamily}-${now.toISOString().slice(0, 10)}`,
  } satisfies PolicySnapshot<TAction>;
}
