import { randomUUID } from "crypto";

import { recordSearchSession } from "@/lib/db/events";
import { createSearchPolicyEngine } from "@/lib/policy/engine";
import { recordPolicyDecisions, dbPolicySnapshotStore } from "@/lib/policy/store";
import type { SearchPolicyEngine } from "@/lib/policy/types";

import { buildClarificationPrompt } from "./clarification";
import { buildEvidenceBundle } from "./evidence";
import {
  buildHypotheses,
  buildHypothesisCandidates,
  refineHypothesesFromResults,
} from "./hypotheses";
import { searchReferenceIndex } from "./reference-index";
import { deriveCandidatesFromResults, rerankResults } from "./rerank";
import { runSearchAgent, type SearchAgentDependencies } from "./agent";
import { interpretWithHeuristics, mergeCandidates } from "./heuristics";
import { buildPromptPlan } from "./prompt";
import { buildHandoffUrls, fetchGoogleCustomSearch, fetchNaverResults } from "./providers";
import { dedupeStrings, normalizeSearchText } from "./query";
import type { EntityCandidate, SearchInput, SearchResponse } from "./types";
import { interpretWithVision } from "./vision";

type SearchDependencies = {
  googleSearch?: typeof fetchGoogleCustomSearch;
  naverSearch?: typeof fetchNaverResults;
  policyEngine?: SearchPolicyEngine;
  persistPolicyDecisions?: typeof recordPolicyDecisions;
  persistSession?: typeof recordSearchSession;
  referenceSearch?: typeof searchReferenceIndex;
  reasoningAgent?: SearchAgentDependencies["reasoningAgent"];
  searchAgent?: typeof runSearchAgent;
  visionInterpreter?: typeof interpretWithVision;
};

function matchesRejectedEntity(candidate: EntityCandidate, rejectedEntities: string[]) {
  if (!rejectedEntities.length) {
    return false;
  }

  const candidateTerms = [
    candidate.label,
    candidate.query,
    ...candidate.queryVariants,
  ]
    .map((value) => normalizeSearchText(value))
    .filter(Boolean);

  return rejectedEntities.some((rejectedEntity) => {
    const normalizedRejected = normalizeSearchText(rejectedEntity);

    return candidateTerms.some(
      (term) =>
        term === normalizedRejected ||
        term.includes(normalizedRejected) ||
        normalizedRejected.includes(term),
    );
  });
}

function excludeRejectedCandidates(
  candidates: EntityCandidate[],
  rejectedEntities: string[],
) {
  if (!rejectedEntities.length) {
    return candidates;
  }

  const filtered = candidates.filter(
    (candidate) => !matchesRejectedEntity(candidate, rejectedEntities),
  );

  return filtered.length ? filtered : candidates;
}

export async function searchSketch(
  input: SearchInput,
  dependencies: SearchDependencies = {},
): Promise<SearchResponse> {
  const googleSearch = dependencies.googleSearch ?? fetchGoogleCustomSearch;
  const naverSearch = dependencies.naverSearch ?? fetchNaverResults;
  const policyEngine =
    dependencies.policyEngine ??
    createSearchPolicyEngine({
      snapshotStore: dbPolicySnapshotStore,
    });
  const persistPolicyDecisions =
    dependencies.persistPolicyDecisions ?? recordPolicyDecisions;
  const persistSession = dependencies.persistSession ?? recordSearchSession;
  const referenceSearch = dependencies.referenceSearch ?? searchReferenceIndex;
  const reasoningAgent = dependencies.reasoningAgent;
  const searchAgent = dependencies.searchAgent ?? runSearchAgent;
  const visionInterpreter = dependencies.visionInterpreter ?? interpretWithVision;
  const sessionId = randomUUID();
  const rejectedEntities = input.retryContext?.rejectedEntities ?? [];
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

  const candidateEntities = excludeRejectedCandidates(
    mergeCandidates(allCandidates).map((candidate) => {
      const key = normalizeSearchText(candidate.label || candidate.query);
      const matchingSources = labelSources.get(key);

      return {
        ...candidate,
        source: matchingSources && matchingSources.size > 1 ? "merged" : candidate.source,
      };
    }),
    rejectedEntities,
  );
  const evidence = buildEvidenceBundle({
    input,
    visionCandidates,
  });
  const hypotheses = buildHypotheses({
    evidence,
    seedCandidates: candidateEntities,
  });
  const hypothesisCandidates = buildHypothesisCandidates(hypotheses, input.userText);
  const initialCandidates = excludeRejectedCandidates(
    mergeCandidates([...candidateEntities, ...hypothesisCandidates]),
    rejectedEntities,
  );
  const promptPlan = buildPromptPlan(input, initialCandidates);
  const localResultsPass1 = await referenceSearch({
    evidence,
    hypotheses,
    limit: 20,
  });
  const agentResultPass1 = await searchAgent(input, initialCandidates, {
    googleSearch,
    naverSearch,
    policyEngine,
    reasoningAgent,
    sessionId,
    visionCandidates,
  });
  let activeHypotheses = hypotheses;
  let activeCandidates = initialCandidates;
  let activeAgentResult = agentResultPass1;
  let activeLocalResults = localResultsPass1;
  let searchPrompts = agentResultPass1.searchPrompts;
  let policyDecisions = [...agentResultPass1.policyDecisions];
  let reranked = rerankResults({
    candidateEntities: initialCandidates,
    evidence,
    localResults: localResultsPass1,
    topHypotheses: hypotheses,
    webResults: agentResultPass1.totalResults,
  });

  if (reranked.ambiguous) {
    const refinedHypotheses = refineHypothesesFromResults({
      baseHypotheses: hypotheses,
      topLabels: reranked.results.slice(0, 2).map((result) => result.title),
    });
    const refinedCandidates = excludeRejectedCandidates(
      mergeCandidates([
        ...buildHypothesisCandidates(refinedHypotheses, input.userText),
        ...deriveCandidatesFromResults({
          existing: initialCandidates,
          results: reranked.results,
          userText: input.userText,
        }),
      ]),
      rejectedEntities,
    );
    const localResultsPass2 = await referenceSearch({
      evidence,
      hypotheses: refinedHypotheses,
      limit: 20,
    });
    const agentResultPass2 = await searchAgent(input, refinedCandidates, {
      googleSearch,
      naverSearch,
      policyEngine,
      reasoningAgent,
      sessionId,
      visionCandidates,
    });

    activeHypotheses = refinedHypotheses;
    activeCandidates = refinedCandidates;
    activeAgentResult = agentResultPass2;
    activeLocalResults = localResultsPass2;
    searchPrompts = dedupeStrings([
      ...agentResultPass1.searchPrompts,
      ...agentResultPass2.searchPrompts,
    ]).slice(0, 8);
    policyDecisions = [...policyDecisions, ...agentResultPass2.policyDecisions];
    reranked = rerankResults({
      candidateEntities: refinedCandidates,
      evidence,
      localResults: localResultsPass2,
      topHypotheses: refinedHypotheses,
      webResults: agentResultPass2.totalResults,
    });
  }

  const clarification =
    !input.clarificationAnswers?.length && reranked.clarificationNeeded
      ? buildClarificationPrompt({
          evidence,
          hypotheses: activeHypotheses,
          results: reranked.results,
        })
      : null;
  const resultMode = clarification ? "needs_clarification" : "resolved";
  const finalCandidates = excludeRejectedCandidates(
    deriveCandidatesFromResults({
      existing: activeAgentResult.candidateEntities.length
        ? activeAgentResult.candidateEntities
        : activeCandidates,
      results: reranked.results,
      userText: input.userText,
    }),
    rejectedEntities,
  );
  const queryVariants = dedupeStrings(
    finalCandidates.flatMap((candidate) => candidate.queryVariants),
  ).slice(0, 8);
  const topQuery =
    finalCandidates[0]?.query ??
    reranked.results[0]?.query ??
    activeAgentResult.topQuery;
  const topCandidate = finalCandidates[0];
  const imageAssistMode =
    visionCandidates.length > 0
      ? "hybrid-vision"
      : input.hasDrawing
        ? "sketch-structure"
        : "text-only";
  const reasoning = dedupeStrings([
    ...heuristic.reasoning,
    ...promptPlan.promptReasoning,
    ...visionReasoning,
    activeLocalResults[0]
      ? `로컬 reference index가 ${activeLocalResults[0].title} 같은 근접 레퍼런스를 우선 후보로 찾았습니다.`
      : "",
    clarification
      ? "자동 재검색 뒤에도 ambiguity가 남아 확인 질문 1회를 준비했습니다."
      : "자동 재검색 범위 안에서 결과를 resolve했습니다.",
  ]);
  const combinedTrace = activeAgentResult.searchTrace;

  if (combinedTrace.length) {
    console.info(
      "[drawtosearch-agent]",
      JSON.stringify({
        sessionId,
        engine: activeAgentResult.engine,
        trace: combinedTrace,
      }),
    );
  }

  await persistSession({
    candidateEntities: finalCandidates,
    confidence: topCandidate?.confidence ?? 0,
    locale: input.locale,
    providerMode: activeAgentResult.providerMode,
    queryVariants: searchPrompts,
    sessionId,
    topEntity: topCandidate?.label ?? "이미지 후보",
    topQuery,
    userText: input.userText,
  });

  await persistPolicyDecisions(policyDecisions);

  return {
    candidateEntities: finalCandidates,
    handoffUrls: buildHandoffUrls(topQuery),
    imageAssistMode,
    naverResults: reranked.results,
    providerMode: activeAgentResult.providerMode,
    queryVariants,
    clarification,
    regenerationPrompt: promptPlan.regenerationPrompt,
    resultMode,
    reasoning,
    searchPrompts,
    sessionId,
  };
}
