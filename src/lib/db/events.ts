import { randomUUID } from "crypto";

import { finalizePolicyRewardForSession } from "@/lib/policy/reward";

import { getDb } from "./client";
import { resultEvents, searchCandidates, searchSessions } from "./schema";

type SessionPayload = {
  candidateEntities: Array<{
    confidence: number;
    id: string;
    label: string;
    query: string;
    queryVariants: string[];
    rationale: string;
    source: string;
  }>;
  confidence: number;
  locale: string;
  providerMode: string;
  queryVariants: string[];
  sessionId: string;
  topEntity: string;
  topQuery: string;
  userText: string;
};

export async function recordSearchSession(payload: SessionPayload) {
  const db = getDb();

  if (!db) {
    return;
  }

  try {
    await db.insert(searchSessions).values({
      confidence: payload.confidence,
      id: payload.sessionId,
      locale: payload.locale,
      providerMode: payload.providerMode,
      queryVariants: payload.queryVariants,
      topEntity: payload.topEntity,
      topQuery: payload.topQuery,
      userText: payload.userText,
    });

    if (payload.candidateEntities.length) {
      await db.insert(searchCandidates).values(
        payload.candidateEntities.map((candidate, index) => ({
          confidence: candidate.confidence,
          id: randomUUID(),
          label: candidate.label,
          queryText: candidate.query,
          queryVariants: candidate.queryVariants,
          rank: index + 1,
          rationale: candidate.rationale,
          sessionId: payload.sessionId,
          source: candidate.source,
        })),
      );
    }
  } catch (error) {
    console.error("Failed to persist search session", error);
  }
}

export async function recordResultEvent(payload: {
  eventType: string;
  feedback?: string;
  sessionId: string;
  target: string;
  targetRank?: number;
}) {
  const db = getDb();

  if (!db) {
    return;
  }

  try {
    await db.insert(resultEvents).values({
      eventType: payload.eventType,
      feedback: payload.feedback,
      id: randomUUID(),
      sessionId: payload.sessionId,
      target: payload.target,
      targetRank: payload.targetRank,
    });
    await finalizePolicyRewardForSession(payload.sessionId);
  } catch (error) {
    console.error("Failed to persist search event", error);
  }
}
