import { randomUUID } from "crypto";

import { recordSearchSession } from "@/lib/db/events";

import { runSearchAgent } from "./agent";
import { interpretWithHeuristics, mergeCandidates } from "./heuristics";
import { buildPromptPlan } from "./prompt";
import { buildHandoffUrls, fetchGoogleCustomSearch, fetchNaverResults } from "./providers";
import { dedupeStrings, normalizeSearchText } from "./query";
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

  const allCandidates = [
    ...heuristic.candidates,
    ...visionCandidates,
  ];
  const labelSources = new Map<string, Set<EntityCandidate["source"]>>();

  for (const candidate of allCandidates) {
    const key = normalizeSearchText(candidate.label || candidate.query);
    const existingSources = labelSources.get(key) ?? new Set<EntityCandidate["source"]>();
    existingSources.add(candidate.source);
    labelSources.set(key, existingSources);
  }

  const candidateEntities = mergeCandidates(allCandidates).map((candidate) => {
    const key = normalizeSearchText(candidate.label || candidate.query);
    const matchingSources = labelSources.get(key);

    return {
      ...candidate,
      source: matchingSources && matchingSources.size > 1 ? "merged" : candidate.source,
    };
  });

  const queryVariants = dedupeStrings(
    candidateEntities.flatMap((candidate) => candidate.queryVariants),
  ).slice(0, 6);
  const promptPlan = buildPromptPlan(input, candidateEntities);
  const agentResult = await runSearchAgent(input, candidateEntities, {
    googleSearch,
    naverSearch,
  });
  const finalCandidates = agentResult.candidateEntities.length
    ? agentResult.candidateEntities
    : candidateEntities;
  const topQuery = agentResult.topQuery;
  const topCandidate = finalCandidates[0];
  const sessionId = randomUUID();
  const imageAssistMode =
    visionCandidates.length > 0
      ? "hybrid-vision"
      : input.hasDrawing
        ? "sketch-structure"
        : "text-only";

  if (agentResult.searchTrace.length) {
    console.info(
      "[drawtosearch-agent]",
      JSON.stringify({
        sessionId,
        trace: agentResult.searchTrace,
      }),
    );
  }

  await persistSession({
    candidateEntities: finalCandidates,
    confidence: topCandidate?.confidence ?? 0,
    locale: input.locale,
    providerMode: agentResult.providerMode,
    queryVariants: agentResult.searchPrompts,
    sessionId,
    topEntity: topCandidate?.label ?? "이미지 후보",
    topQuery,
    userText: input.userText,
  });

  return {
    candidateEntities: finalCandidates,
    handoffUrls: buildHandoffUrls(topQuery),
    imageAssistMode,
    naverResults: agentResult.totalResults,
    providerMode: agentResult.providerMode,
    queryVariants,
    regenerationPrompt: promptPlan.regenerationPrompt,
    reasoning: [...heuristic.reasoning, ...promptPlan.promptReasoning, ...visionReasoning],
    searchPrompts: agentResult.searchPrompts,
    sessionId,
  };
}
