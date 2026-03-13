import { randomUUID } from "crypto";

import { buildPromptPlan } from "./prompt";
import { dedupeStrings, normalizeSearchText, scoreTokenOverlap, tokenizeSearchText } from "./query";
import type {
  SearchAgentDependencies,
  SearchAgentResult,
  SearchAgentTrace,
} from "./agent-types";
import type {
  EntityCandidate,
  SearchImageResult,
  SearchInput,
} from "./types";

const RESULT_TOKEN_STOPWORDS = new Set([
  "official",
  "store",
  "brand",
  "logo",
  "image",
  "images",
  "photo",
  "photos",
  "product",
  "products",
  "online",
  "korea",
  "kr",
  "com",
  "shop",
  "shopping",
  "review",
  "bag",
  "bags",
  "news",
  "naver",
  "google",
  "사진",
  "이미지",
  "브랜드",
  "로고",
  "제품",
  "상품",
  "공식",
  "정품",
  "구매",
  "판매",
  "쇼핑",
  "스토어",
  "관련",
  "유사",
  "같은",
  "예요",
]);

function scoreCandidateWithResults(
  candidate: EntityCandidate,
  results: SearchImageResult[],
) {
  const normalizedLabel = normalizeSearchText(candidate.label);
  const normalizedQuery = normalizeSearchText(candidate.query);
  const combined = `${candidate.label} ${candidate.query} ${candidate.queryVariants.join(" ")}`;

  let score = candidate.confidence;
  let matchedTitles = 0;

  for (const result of results) {
    const normalizedTitle = normalizeSearchText(result.title);
    const overlap = scoreTokenOverlap(combined, result.title);

    if (normalizedLabel && normalizedTitle.includes(normalizedLabel)) {
      score += 0.22;
      matchedTitles += 1;
      continue;
    }

    if (normalizedQuery && normalizedTitle.includes(normalizedQuery)) {
      score += 0.18;
      matchedTitles += 1;
      continue;
    }

    if (overlap > 0.26) {
      score += overlap * 0.24;
      matchedTitles += 1;
    }
  }

  return score + Math.min(0.12, matchedTitles * 0.03);
}

function extractResultEvidenceTokens(
  input: SearchInput,
  results: SearchImageResult[],
  candidates: EntityCandidate[],
) {
  const reservedTokens = new Set(
    tokenizeSearchText(
      [
        input.userText,
        ...candidates.flatMap((candidate) => [candidate.label, candidate.query]),
      ].join(" "),
    ),
  );

  const counts = new Map<string, number>();
  const uppercaseTokens = new Set<string>();

  for (const result of results) {
    for (const token of tokenizeSearchText(result.title)) {
      if (token.length < 2 || RESULT_TOKEN_STOPWORDS.has(token) || reservedTokens.has(token)) {
        continue;
      }

      counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    for (const token of result.title.match(/\b[A-Z0-9][A-Z0-9-]{1,}\b/g) ?? []) {
      if (token.length >= 2) {
        uppercaseTokens.add(token);
      }
    }
  }

  const frequentTokens = Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([token, count]) => (count >= 2 ? token : ""))
    .filter(Boolean)
    .slice(0, 5);

  return dedupeStrings([...uppercaseTokens, ...frequentTokens]).slice(0, 6);
}

function deriveResultCandidates(
  input: SearchInput,
  seedCandidates: EntityCandidate[],
  results: SearchImageResult[],
  evidenceTokens: string[],
) {
  const reranked = seedCandidates
    .map((candidate) => ({
      ...candidate,
      confidence: Math.min(0.96, scoreCandidateWithResults(candidate, results)),
      rationale:
        scoreCandidateWithResults(candidate, results) > candidate.confidence + 0.08
          ? `${candidate.rationale} 실제 검색 결과 제목과도 연결점이 있어 우선순위를 높였습니다.`
          : candidate.rationale,
    }))
    .sort((left, right) => right.confidence - left.confidence);

  const evidenceCandidates = evidenceTokens.slice(0, 2).map((token, index) => ({
    confidence: Math.max(0.42, 0.56 - index * 0.06),
    id: randomUUID(),
    label: token,
    query: dedupeStrings([token, input.userText, "reference image"]).join(" ").trim(),
    queryVariants: dedupeStrings([token, `${token} reference image`, input.userText]).filter(Boolean),
    rationale: `1차 검색 결과 제목에서 ${token} 단서가 반복적으로 보여 보조 후보로 추가했습니다.`,
    source: "merged" as const,
  }));

  return dedupeByNormalizedLabel([...reranked, ...evidenceCandidates]).slice(0, 6);
}

function buildRefinedPrompts(
  input: SearchInput,
  candidates: EntityCandidate[],
  evidenceTokens: string[],
  previousPrompts: string[],
) {
  const bestCandidate = candidates[0];
  const evidencePhrase = evidenceTokens.join(" ");

  return dedupeStrings([
    `${bestCandidate?.query ?? ""} ${evidencePhrase} reference image`,
    `${bestCandidate?.label ?? ""} ${evidencePhrase} official product photo`,
    `${bestCandidate?.label ?? ""} ${input.userText} ${evidencePhrase}`.trim(),
    `${input.userText} ${evidencePhrase} visual reference`.trim(),
    ...previousPrompts,
  ])
    .filter(Boolean)
    .slice(0, 6);
}

function rankResults(
  results: SearchImageResult[],
  candidates: EntityCandidate[],
  evidenceTokens: string[],
) {
  const anchor = candidates[0];
  const evidencePhrase = evidenceTokens.join(" ");
  const anchorLabel = normalizeSearchText(anchor?.label ?? "");

  return [...results].sort((left, right) => {
    const leftScore =
      scoreTokenOverlap(`${anchor?.label ?? ""} ${anchor?.query ?? ""} ${evidencePhrase}`, left.title) +
      scoreTokenOverlap(evidencePhrase, left.title) +
      (anchorLabel && normalizeSearchText(left.query).includes(anchorLabel) ? 0.18 : 0);
    const rightScore =
      scoreTokenOverlap(`${anchor?.label ?? ""} ${anchor?.query ?? ""} ${evidencePhrase}`, right.title) +
      scoreTokenOverlap(evidencePhrase, right.title) +
      (anchorLabel && normalizeSearchText(right.query).includes(anchorLabel) ? 0.18 : 0);

    return rightScore - leftScore;
  });
}

function dedupeByNormalizedLabel(candidates: EntityCandidate[]) {
  return Array.from(
    new Map(
      candidates.map((candidate) => [normalizeSearchText(candidate.label || candidate.query), candidate]),
    ).values(),
  );
}

export async function runRuleBasedSearchAgent(
  input: SearchInput,
  seedCandidates: EntityCandidate[],
  dependencies: SearchAgentDependencies,
): Promise<SearchAgentResult> {
  const trace: SearchAgentTrace[] = [];
  const firstPromptPlan = buildPromptPlan(input, seedCandidates);

  trace.push({
    detail: {
      prompts: firstPromptPlan.searchPrompts.slice(0, 3),
      seedCandidates: seedCandidates.slice(0, 3).map((candidate) => candidate.label),
    },
    stage: "seed",
    summary: "초기 후보와 텍스트 검색 프롬프트를 구성했습니다.",
  });

  const firstPass = await dependencies.naverSearch(firstPromptPlan.searchPrompts, seedCandidates);
  const firstPassResults = firstPass.items.slice(0, 8);
  const evidenceTokens = extractResultEvidenceTokens(input, firstPassResults, seedCandidates);
  const resultAwareCandidates = deriveResultCandidates(
    input,
    seedCandidates,
    firstPassResults,
    evidenceTokens,
  );

  trace.push({
    detail: {
      evidenceTokens,
      titles: firstPassResults.slice(0, 4).map((result) => result.title),
    },
    stage: "observe",
    summary: "1차 검색 결과 제목에서 반복 단서와 더 강한 후보를 추출했습니다.",
  });

  const refinedPrompts = buildRefinedPrompts(
    input,
    resultAwareCandidates,
    evidenceTokens,
    firstPromptPlan.searchPrompts,
  );

  const shouldRefine =
    evidenceTokens.length > 0 &&
    normalizeSearchText(refinedPrompts[0] ?? "") !==
      normalizeSearchText(firstPromptPlan.searchPrompts[0] ?? "");

  let secondPassResults: SearchImageResult[] = [];
  let providerMode = firstPass.mode;

  if (shouldRefine) {
    const secondPass = await dependencies.naverSearch(refinedPrompts, resultAwareCandidates);
    secondPassResults = secondPass.items.slice(0, 8);
    providerMode = secondPass.mode === "live" ? "live" : providerMode;

    trace.push({
      detail: {
        prompts: refinedPrompts.slice(0, 3),
        titles: secondPassResults.slice(0, 4).map((result) => result.title),
      },
      stage: "refine",
      summary: "검색 결과 단서를 반영해 2차 검색어를 다시 만들고 재검색했습니다.",
    });
  }

  const googleResults = await dependencies.googleSearch(
    refinedPrompts[0] ?? firstPromptPlan.searchPrompts[0] ?? "",
  );
  const finalCandidates = deriveResultCandidates(
    input,
    resultAwareCandidates,
    [...firstPassResults, ...secondPassResults, ...googleResults],
    evidenceTokens,
  );
  const mergedResults = Array.from(
    new Map(
      [...firstPassResults, ...secondPassResults, ...googleResults].map((result) => [result.link, result]),
    ).values(),
  );
  const rankedResults = rankResults(mergedResults, finalCandidates, evidenceTokens).slice(0, 8);
  const finalPrompts = shouldRefine ? refinedPrompts : firstPromptPlan.searchPrompts;

  trace.push({
    detail: {
      finalPrompt: finalPrompts[0] ?? null,
      finalTopEntity: finalCandidates[0]?.label ?? null,
      resultCount: rankedResults.length,
    },
    stage: "select",
    summary: "최종 후보와 결과를 다시 정렬해 가장 가능성 높은 이미지부터 선택했습니다.",
  });

  return {
    candidateEntities: finalCandidates,
    engine: "rule-based",
    policyDecisions: [],
    providerMode,
    searchPrompts: finalPrompts,
    searchTrace: trace,
    topQuery: finalPrompts[0] ?? firstPromptPlan.searchPrompts[0] ?? "스케치 이미지 검색",
    totalResults: rankedResults,
  };
}
