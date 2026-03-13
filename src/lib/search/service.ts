import { randomUUID } from "crypto";

import { recordSearchSession } from "@/lib/db/events";

import { interpretWithHeuristics, mergeCandidates } from "./heuristics";
import { buildHandoffUrls, fetchGoogleCustomSearch, fetchNaverResults } from "./providers";
import { dedupeStrings, summarizeTopQuery } from "./query";
import type { EntityCandidate, SearchInput, SearchResponse } from "./types";
import { interpretWithVision } from "./vision";

type SearchDependencies = {
  googleSearch?: typeof fetchGoogleCustomSearch;
  naverSearch?: typeof fetchNaverResults;
  persistSession?: typeof recordSearchSession;
  visionInterpreter?: typeof interpretWithVision;
};

export async function searchSketch(
  input: SearchInput,
  dependencies: SearchDependencies = {},
): Promise<SearchResponse> {
  const googleSearch = dependencies.googleSearch ?? fetchGoogleCustomSearch;
  const naverSearch = dependencies.naverSearch ?? fetchNaverResults;
  const persistSession = dependencies.persistSession ?? recordSearchSession;
  const visionInterpreter = dependencies.visionInterpreter ?? interpretWithVision;
  const heuristic = interpretWithHeuristics(input);
  let visionReasoning: string[] = [];
  let visionCandidates: EntityCandidate[] = [];

  try {
    const visionResult = await visionInterpreter(input);
    visionCandidates = visionResult?.candidates ?? [];
    visionReasoning = visionResult?.reasoning ?? [];
  } catch {
    visionReasoning = ["무료 비전 추론이 응답하지 않아 텍스트 중심 탐색으로 fallback 했습니다."];
  }

  const candidateEntities = mergeCandidates([
    ...heuristic.candidates,
    ...visionCandidates,
  ]).map((candidate) => ({
    ...candidate,
    source:
      candidate.source === "vision" && heuristic.candidates.some((item) => item.label === candidate.label)
        ? "merged"
        : candidate.source,
  }));

  const queryVariants = dedupeStrings(
    candidateEntities.flatMap((candidate) => candidate.queryVariants),
  ).slice(0, 6);

  const naverResult = await naverSearch(queryVariants, candidateEntities);
  const googleFeatureResult = await googleSearch(queryVariants[0] ?? "");

  const mergedResults =
    googleFeatureResult.length && naverResult.mode === "live"
      ? [...naverResult.items, ...googleFeatureResult].slice(0, 8)
      : naverResult.items.slice(0, 8);

  const topQuery = summarizeTopQuery(candidateEntities, input.userText);
  const topCandidate = candidateEntities[0];
  const sessionId = randomUUID();

  await persistSession({
    candidateEntities,
    confidence: topCandidate?.confidence ?? 0,
    locale: input.locale,
    providerMode: naverResult.mode,
    queryVariants,
    sessionId,
    topEntity: topCandidate?.label ?? "이미지 후보",
    topQuery,
    userText: input.userText,
  });

  return {
    candidateEntities,
    handoffUrls: buildHandoffUrls(topQuery),
    naverResults: mergedResults,
    providerMode: naverResult.mode,
    queryVariants,
    reasoning: [...heuristic.reasoning, ...visionReasoning],
    sessionId,
  };
}
