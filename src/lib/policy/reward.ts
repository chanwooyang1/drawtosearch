import { randomUUID } from "crypto";

import { and, eq, lte } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { resultEvents } from "@/lib/db/schema";

import { upsertPolicyReward } from "./store";
import type { PolicyRewardRecord, RewardBreakdown, SessionOutcomeLabel } from "./types";

export const POLICY_REWARD_WINDOW_MINUTES = 30;

type PolicyEvent = {
  createdAt?: Date;
  eventType: string;
  feedback?: string | null;
  targetRank?: number | null;
};

function normalizeExplicitFeedback(events: PolicyEvent[]) {
  const feedbackEvents = [...events]
    .filter((event) => event.eventType === "feedback" && event.feedback)
    .sort((left, right) => {
      const leftTime = left.createdAt?.getTime() ?? 0;
      const rightTime = right.createdAt?.getTime() ?? 0;
      return rightTime - leftTime;
    });

  const latest = feedbackEvents[0]?.feedback;

  if (latest === "match" || latest === "miss") {
    return latest;
  }

  return null;
}

function sumClickReward(events: PolicyEvent[]) {
  let candidateClicks = 0;
  let handoffClicks = 0;
  let lowerRankClicks = 0;
  let resultClickReward = 0;
  let topRankClicks = 0;

  for (const event of events) {
    if (event.eventType === "candidate_click") {
      candidateClicks += 1;
      continue;
    }

    if (event.eventType === "handoff_click") {
      handoffClicks += 1;
      continue;
    }

    if (event.eventType !== "result_click") {
      continue;
    }

    if (event.targetRank && event.targetRank >= 1 && event.targetRank <= 3) {
      topRankClicks += 1;
      resultClickReward += 0.15;
      continue;
    }

    if (event.targetRank && event.targetRank >= 4 && event.targetRank <= 8) {
      lowerRankClicks += 1;
      resultClickReward += 0.1;
    }
  }

  const handoffReward = handoffClicks * 0.05;
  const uncappedClickReward = resultClickReward + handoffReward;

  return {
    candidateClicks,
    handoffClicks,
    handoffReward,
    lowerRankClicks,
    resultClickReward,
    topRankClicks,
    uncappedClickReward,
  };
}

export function computePolicyReward(input: {
  events: PolicyEvent[];
  windowMinutes?: number;
}): {
  outcomeLabel: SessionOutcomeLabel;
  rewardBreakdown: RewardBreakdown;
  rewardValue: number;
} {
  const windowMinutes = input.windowMinutes ?? POLICY_REWARD_WINDOW_MINUTES;
  const explicitFeedback = normalizeExplicitFeedback(input.events);
  const clickSummary = sumClickReward(input.events);
  const cappedClickReward =
    explicitFeedback === null
      ? Math.min(0.35, clickSummary.uncappedClickReward)
      : clickSummary.uncappedClickReward;
  const feedbackReward =
    explicitFeedback === "match" ? 1 : explicitFeedback === "miss" ? -1 : 0;

  let totalReward = cappedClickReward + feedbackReward;

  if (explicitFeedback === "miss") {
    totalReward = -1;
  }

  const outcomeLabel: SessionOutcomeLabel =
    explicitFeedback === "match"
      ? "match"
      : explicitFeedback === "miss"
        ? "miss"
        : totalReward > 0
          ? "weak_positive"
          : "neutral";

  const rewardBreakdown: RewardBreakdown = {
    candidateClicks: clickSummary.candidateClicks,
    cappedClickReward,
    explicitFeedback,
    feedbackReward,
    handoffClicks: clickSummary.handoffClicks,
    handoffReward: clickSummary.handoffReward,
    lowerRankClicks: clickSummary.lowerRankClicks,
    resultClickReward: clickSummary.resultClickReward,
    topRankClicks: clickSummary.topRankClicks,
    totalReward,
    uncappedClickReward: clickSummary.uncappedClickReward,
    windowMinutes,
  };

  return {
    outcomeLabel,
    rewardBreakdown,
    rewardValue: totalReward,
  };
}

export async function finalizePolicyRewardForSession(
  sessionId: string,
  now = new Date(),
) {
  const db = getDb();

  if (!db) {
    return null;
  }

  try {
    const session = await db.query.searchSessions.findFirst({
      where: (table, operators) => operators.eq(table.id, sessionId),
    });

    if (!session) {
      return null;
    }

    const windowEnd = new Date(
      session.createdAt.getTime() + POLICY_REWARD_WINDOW_MINUTES * 60 * 1000,
    );
    const effectiveEnd = now.getTime() < windowEnd.getTime() ? now : windowEnd;
    const events = await db
      .select()
      .from(resultEvents)
      .where(
        and(
          eq(resultEvents.sessionId, sessionId),
          lte(resultEvents.createdAt, effectiveEnd),
        ),
      );

    const computed = computePolicyReward({
      events,
      windowMinutes: POLICY_REWARD_WINDOW_MINUTES,
    });

    const reward: PolicyRewardRecord = {
      finalizedAt: effectiveEnd,
      id: randomUUID(),
      outcomeLabel: computed.outcomeLabel,
      rewardBreakdown: computed.rewardBreakdown,
      rewardValue: computed.rewardValue,
      sessionId,
    };

    await upsertPolicyReward(reward);

    return reward;
  } catch (error) {
    console.error("Failed to finalize policy reward", error);
    return null;
  }
}
