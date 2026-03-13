import { and, desc, eq, gte, lte } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  searchPolicyDecisions,
  searchPolicyRewards,
  searchPolicySnapshots,
} from "@/lib/db/schema";

import { createNeutralSnapshot, PLAN_POLICY_ACTIONS, REFINE_POLICY_ACTIONS } from "./constants";
import type {
  CompletedPolicyTrainingSample,
  PlanPolicyAction,
  PolicyDecisionRecord,
  PolicyFamily,
  PolicyRewardRecord,
  PolicySnapshot,
  PolicySnapshotStore,
  RefinePolicyAction,
} from "./types";

export const dbPolicySnapshotStore: PolicySnapshotStore = {
  async getActiveSnapshot<TAction extends string = string>(policyFamily: PolicyFamily) {
    const db = getDb();

    if (!db) {
      return createFallbackSnapshot(policyFamily) as PolicySnapshot<TAction>;
    }

    try {
      const snapshot = await db.query.searchPolicySnapshots.findFirst({
        orderBy: (table, operators) => [operators.desc(table.createdAt)],
        where: (table, operators) =>
          operators.and(
            operators.eq(table.policyFamily, policyFamily),
            operators.eq(table.status, "approved"),
          ),
      });

      if (!snapshot) {
        return createFallbackSnapshot(policyFamily) as PolicySnapshot<TAction>;
      }

      return snapshot as PolicySnapshot<TAction>;
    } catch (error) {
      console.error("Failed to load active policy snapshot", error);
      return createFallbackSnapshot(policyFamily) as PolicySnapshot<TAction>;
    }
  },
};

function createFallbackSnapshot(policyFamily: PolicyFamily) {
  if (policyFamily === "plan_policy") {
    return createNeutralSnapshot<PlanPolicyAction>(policyFamily, PLAN_POLICY_ACTIONS);
  }

  return createNeutralSnapshot<RefinePolicyAction>(policyFamily, REFINE_POLICY_ACTIONS);
}

export async function recordPolicyDecisions(decisions: PolicyDecisionRecord[]) {
  const db = getDb();

  if (!db || !decisions.length) {
    return;
  }

  try {
    await db.insert(searchPolicyDecisions).values(
      decisions.map((decision) => ({
        actionName: decision.actionName,
        contextBucket: decision.contextBucket,
        contextFeatures: decision.contextFeatures,
        createdAt: decision.createdAt,
        directiveText: decision.directiveText,
        explorationScore: decision.explorationScore,
        id: decision.id,
        policyFamily: decision.policyFamily,
        policyVersion: decision.policyVersion,
        sessionId: decision.sessionId,
        stage: decision.stage,
      })),
    );
  } catch (error) {
    console.error("Failed to persist policy decisions", error);
  }
}

export async function upsertPolicyReward(reward: PolicyRewardRecord) {
  const db = getDb();

  if (!db) {
    return;
  }

  try {
    await db
      .insert(searchPolicyRewards)
      .values({
        finalizedAt: reward.finalizedAt,
        id: reward.id,
        outcomeLabel: reward.outcomeLabel,
        rewardBreakdown: reward.rewardBreakdown,
        rewardValue: reward.rewardValue,
        sessionId: reward.sessionId,
      })
      .onConflictDoUpdate({
        set: {
          finalizedAt: reward.finalizedAt,
          outcomeLabel: reward.outcomeLabel,
          rewardBreakdown: reward.rewardBreakdown,
          rewardValue: reward.rewardValue,
        },
        target: searchPolicyRewards.sessionId,
      });
  } catch (error) {
    console.error("Failed to persist policy reward", error);
  }
}

export async function persistPolicySnapshot<TAction extends string>(
  snapshot: PolicySnapshot<TAction>,
) {
  const db = getDb();

  if (!db) {
    return;
  }

  try {
    await db.insert(searchPolicySnapshots).values({
      createdAt: snapshot.createdAt,
      id: snapshot.id,
      offlineMetrics: snapshot.offlineMetrics,
      parameters: snapshot.parameters,
      policyFamily: snapshot.policyFamily,
      status: snapshot.status,
      trainingWindowEnd: snapshot.trainingWindowEnd,
      trainingWindowStart: snapshot.trainingWindowStart,
      version: snapshot.version,
    });
  } catch (error) {
    console.error("Failed to persist policy snapshot", error);
  }
}

export async function listCompletedPolicyTrainingSamples(input: {
  policyFamily: PolicyFamily;
  trainingWindowEnd?: Date;
  trainingWindowStart?: Date;
}) {
  const db = getDb();

  if (!db) {
    return [] as CompletedPolicyTrainingSample[];
  }

  try {
    const decisionWhere = [
      eq(searchPolicyDecisions.policyFamily, input.policyFamily),
    ];

    if (input.trainingWindowStart) {
      decisionWhere.push(gte(searchPolicyDecisions.createdAt, input.trainingWindowStart));
    }

    if (input.trainingWindowEnd) {
      decisionWhere.push(lte(searchPolicyDecisions.createdAt, input.trainingWindowEnd));
    }

    const decisions = await db
      .select()
      .from(searchPolicyDecisions)
      .where(and(...decisionWhere))
      .orderBy(desc(searchPolicyDecisions.createdAt));

    if (!decisions.length) {
      return [] as CompletedPolicyTrainingSample[];
    }

    const rewardWhere = [
      ...(input.trainingWindowStart
        ? [gte(searchPolicyRewards.finalizedAt, input.trainingWindowStart)]
        : []),
      ...(input.trainingWindowEnd
        ? [lte(searchPolicyRewards.finalizedAt, input.trainingWindowEnd)]
        : []),
    ];
    const rewards = rewardWhere.length
      ? await db
          .select()
          .from(searchPolicyRewards)
          .where(and(...rewardWhere))
      : await db.select().from(searchPolicyRewards);

    const rewardBySession = new Map(rewards.map((reward) => [reward.sessionId, reward]));

    return decisions
      .map((decision) => {
        const reward = rewardBySession.get(decision.sessionId);

        if (!reward) {
          return null;
        }

        return {
          decision: decision as PolicyDecisionRecord,
          reward: reward as PolicyRewardRecord,
        } satisfies CompletedPolicyTrainingSample;
      })
      .filter((sample): sample is CompletedPolicyTrainingSample => Boolean(sample));
  } catch (error) {
    console.error("Failed to load completed policy training samples", error);
    return [] as CompletedPolicyTrainingSample[];
  }
}
