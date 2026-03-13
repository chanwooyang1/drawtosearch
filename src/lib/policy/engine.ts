import { createHash } from "crypto";

import { buildPolicyBucket } from "./context";
import { createNeutralSnapshot, PLAN_POLICY_ACTIONS, REFINE_POLICY_ACTIONS } from "./constants";
import type {
  PlanPolicyAction,
  PolicyActionName,
  PolicyFamily,
  PolicySelectionResult,
  PolicySnapshot,
  PolicySnapshotStore,
  PosteriorParams,
  RefinePolicyAction,
  SearchPolicyContext,
  SearchPolicyEngine,
} from "./types";

const NEUTRAL_DIRECTIVES = {
  plan:
    "Keep the initial search strategy broad and evidence-first. Treat every named entity as a temporary hypothesis until search evidence confirms it.",
  refine:
    "Refine only from observed evidence. Discard current hypotheses when colors, shape, or viewing context do not match the results.",
} as const;

const PLAN_DIRECTIVES: Record<PlanPolicyAction, string> = {
  broad_reference:
    "Start with broad real-world reference categories. Prefer generic entities until the results reveal a consistent target.",
  literal_text:
    "Stay close to the user's literal wording. Do not add named entities unless the wording itself strongly implies one.",
  logo_symbol:
    "Prioritize logo or symbol interpretations. Search for official mark, emblem, or brand-symbol references before products or screenshots.",
  object_reference:
    "Prioritize ordinary real-world objects and physical references over apps or brands unless later evidence contradicts that.",
  product_visual:
    "Prioritize product, packaging, or brand-visual hypotheses. Search for product photos and branded visuals rather than abstract illustrations.",
  service_icon:
    "Prioritize service, app, and software-icon hypotheses, but do not assume a famous app from one generic clue.",
};

const REFINE_DIRECTIVES: Record<RefinePolicyAction, string> = {
  accept_first_pass:
    "Keep the first-pass direction if the evidence is already coherent. Only rewrite when the result set clearly conflicts with the input evidence.",
  refine_by_context:
    "Use viewing context and usage situation first when rewriting the query. Treat where the user saw it as a narrowing signal.",
  refine_by_result_entity:
    "Use repeated entity names or salient tokens from the first-pass results to narrow toward the most repeated real-world target.",
  refine_by_visual_tokens:
    "Use visual evidence first when rewriting. Colors, shapes, repeated marks, and visible text tokens should drive the next query.",
};

type RandomSource = () => number;

function clampProbability(value: number) {
  return Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, value));
}

function createStableRandom(seed: string): RandomSource {
  let state = Number.parseInt(
    createHash("sha256").update(seed).digest("hex").slice(0, 8),
    16,
  );

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleNormal(random: RandomSource) {
  const u1 = clampProbability(random());
  const u2 = clampProbability(random());

  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function sampleGamma(shape: number, random: RandomSource): number {
  if (shape <= 0) {
    return Number.EPSILON;
  }

  if (shape < 1) {
    const u = clampProbability(random());
    return sampleGamma(shape + 1, random) * Math.pow(u, 1 / shape);
  }

  if (shape === 1) {
    return -Math.log(clampProbability(random()));
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    const x = sampleNormal(random);
    const v = Math.pow(1 + c * x, 3);

    if (v <= 0) {
      continue;
    }

    const u = clampProbability(random());

    if (u < 1 - 0.0331 * Math.pow(x, 4)) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

function sampleBeta(alpha: number, beta: number, random: RandomSource) {
  const gammaA = sampleGamma(alpha, random);
  const gammaB = sampleGamma(beta, random);

  return gammaA / (gammaA + gammaB);
}

function buildNeutralSelection<TAction extends PolicyActionName>(
  context: SearchPolicyContext,
  policyFamily: PolicyFamily,
): PolicySelectionResult<TAction> {
  void context;

  return {
    actionName: "neutral" as TAction,
    contextBucket: buildPolicyBucket(context),
    directiveText: policyFamily === "plan_policy" ? NEUTRAL_DIRECTIVES.plan : NEUTRAL_DIRECTIVES.refine,
    explorationScore: 0,
    policyVersion: "neutral-v1",
  };
}

function resolvePosterior<TAction extends string>(
  snapshot: PolicySnapshot<TAction>,
  contextBucket: string,
  action: TAction,
): PosteriorParams {
  return (
    snapshot.parameters.bucketPriors[contextBucket]?.[action] ??
    snapshot.parameters.defaultPriors[action] ?? {
      alpha: 1,
      beta: 1,
    }
  );
}

function isNeutralSnapshot(snapshot: PolicySnapshot<string>) {
  return snapshot.version === "neutral-v1" || snapshot.id.startsWith("neutral-");
}

function selectAction<TAction extends Exclude<PolicyActionName, "neutral">>(input: {
  actions: readonly TAction[];
  context: SearchPolicyContext;
  directives: Record<TAction, string>;
  policyFamily: PolicyFamily;
  randomFactory: (seed: string) => RandomSource;
  sessionId: string;
  snapshot: PolicySnapshot<TAction>;
}): PolicySelectionResult<TAction | "neutral"> {
  const contextBucket = buildPolicyBucket(input.context);

  if (isNeutralSnapshot(input.snapshot)) {
    return buildNeutralSelection<TAction | "neutral">(input.context, input.policyFamily);
  }

  const random = input.randomFactory(
    `${input.sessionId}:${input.policyFamily}:${contextBucket}:${input.snapshot.version}`,
  );

  let bestAction: TAction | null = null;
  let bestScore = -1;

  for (const action of input.actions) {
    const posterior = resolvePosterior(input.snapshot, contextBucket, action);
    const sample = sampleBeta(posterior.alpha, posterior.beta, random);

    if (sample > bestScore) {
      bestAction = action;
      bestScore = sample;
    }
  }

  if (!bestAction) {
    return buildNeutralSelection<TAction | "neutral">(input.context, input.policyFamily);
  }

  return {
    actionName: bestAction,
    contextBucket,
    directiveText: input.directives[bestAction],
    explorationScore: Number(bestScore.toFixed(6)),
    policyVersion: input.snapshot.version,
  };
}

type PolicyEngineOptions = {
  randomFactory?: (seed: string) => RandomSource;
  snapshotStore?: PolicySnapshotStore;
};

const neutralStore: PolicySnapshotStore = {
  async getActiveSnapshot<TAction extends string = string>(policyFamily: PolicyFamily) {
    if (policyFamily === "plan_policy") {
      return createNeutralSnapshot(policyFamily, PLAN_POLICY_ACTIONS) as PolicySnapshot<TAction>;
    }

    return createNeutralSnapshot(policyFamily, REFINE_POLICY_ACTIONS) as PolicySnapshot<TAction>;
  },
};

export function createSearchPolicyEngine(
  options: PolicyEngineOptions = {},
): SearchPolicyEngine {
  const snapshotStore = options.snapshotStore ?? neutralStore;
  const randomFactory = options.randomFactory ?? createStableRandom;

  return {
    async selectPlanPolicy({ context, sessionId }) {
      const snapshot =
        await snapshotStore.getActiveSnapshot<PlanPolicyAction>("plan_policy");

      return selectAction({
        actions: PLAN_POLICY_ACTIONS,
        context,
        directives: PLAN_DIRECTIVES,
        policyFamily: "plan_policy",
        randomFactory,
        sessionId,
        snapshot,
      });
    },
    async selectRefinePolicy({ context, sessionId }) {
      const snapshot =
        await snapshotStore.getActiveSnapshot<RefinePolicyAction>("refine_policy");

      return selectAction({
        actions: REFINE_POLICY_ACTIONS,
        context,
        directives: REFINE_DIRECTIVES,
        policyFamily: "refine_policy",
        randomFactory,
        sessionId,
        snapshot,
      });
    },
  };
}
