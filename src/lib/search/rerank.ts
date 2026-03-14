import { normalizeSearchText, scoreTokenOverlap } from "./query";
import { inferResultCategory } from "./reference-index";
import type {
  EntityCandidate,
  EvidenceBundle,
  RetrievalCandidate,
  RerankedResult,
  RerankFeatureVector,
  SearchImageResult,
} from "./types";
import type { SearchHypothesis } from "./hypotheses";

function dedupeResults(results: SearchImageResult[]) {
  return Array.from(new Map(results.map((result) => [result.link, result])).values());
}

function overlapRate(left: string[], right: string[]) {
  if (!left.length || !right.length) {
    return 0;
  }

  const rightSet = new Set(right.map((value) => normalizeSearchText(value)));
  const matches = left.filter((value) => rightSet.has(normalizeSearchText(value))).length;

  return matches / Math.max(left.length, right.length);
}

function buildFeatureVector(input: {
  candidateEntities: EntityCandidate[];
  evidence: EvidenceBundle;
  localSignals: RetrievalCandidate[];
  result: SearchImageResult;
  topHypotheses: SearchHypothesis[];
}): RerankFeatureVector {
  const searchableText = `${input.result.title} ${input.result.query} ${(input.result.tags ?? []).join(" ")}`;
  const localConsensus = input.localSignals.some(
    (localResult) =>
      scoreTokenOverlap(localResult.title, input.result.title) >= 0.34 ||
      scoreTokenOverlap(localResult.query, input.result.query) >= 0.34,
  )
    ? 1
    : 0;
  const shapeMatch = overlapRate(
    input.evidence.shapeTokens,
    input.result.shapeTags ?? tokenizeResult(searchableText),
  );
  const colorMatch = overlapRate(
    input.evidence.colorTokens,
    input.result.dominantColors ?? tokenizeResult(searchableText),
  );
  const contextMatch = Math.max(
    overlapRate(input.evidence.contextTokens, input.result.tags ?? tokenizeResult(searchableText)),
    Math.max(
      ...input.topHypotheses.map((hypothesis) => scoreTokenOverlap(hypothesis.query, searchableText)),
      0,
    ),
  );
  const titleQueryOverlap = Math.max(
    ...input.candidateEntities.flatMap((candidate) => [
      scoreTokenOverlap(candidate.label, searchableText),
      scoreTokenOverlap(candidate.query, searchableText),
    ]),
    0,
  );
  const sketchImageSimilarity =
    input.result.source === "local"
      ? (input.result as RetrievalCandidate).imageSimilarity
      : Math.max(
          scoreTokenOverlap(input.evidence.sketchDescriptorText, searchableText),
          scoreTokenOverlap(input.evidence.binaryDescriptorText, searchableText),
        );
  const textImageSimilarity =
    input.result.source === "local"
      ? (input.result as RetrievalCandidate).textSimilarity
      : scoreTokenOverlap(input.evidence.textDescriptorText, searchableText);
  const sourceConsensus =
    input.result.source === "local"
      ? Math.max(localConsensus, 0.5)
      : localConsensus;
  const totalScore =
    0.3 * sketchImageSimilarity +
    0.2 * textImageSimilarity +
    0.15 * titleQueryOverlap +
    0.1 * shapeMatch +
    0.1 * colorMatch +
    0.1 * contextMatch +
    0.05 * sourceConsensus;

  return {
    colorMatch,
    contextMatch,
    shapeMatch,
    sketchImageSimilarity,
    sourceConsensus,
    textImageSimilarity,
    titleQueryOverlap,
    totalScore,
  };
}

function tokenizeResult(text: string) {
  return normalizeSearchText(text)
    .split(" ")
    .filter(Boolean);
}

export function rerankResults(input: {
  candidateEntities: EntityCandidate[];
  evidence: EvidenceBundle;
  localResults: RetrievalCandidate[];
  topHypotheses: SearchHypothesis[];
  webResults: SearchImageResult[];
}) {
  const merged = dedupeResults([...input.localResults, ...input.webResults]);
  const ranked = merged
    .map((result) => {
      const rerankFeatures = buildFeatureVector({
        candidateEntities: input.candidateEntities,
        evidence: input.evidence,
        localSignals: input.localResults,
        result,
        topHypotheses: input.topHypotheses,
      });

      return {
        baseScore:
          "baseScore" in result && typeof result.baseScore === "number"
            ? result.baseScore
            : rerankFeatures.totalScore,
        ...result,
        category:
          result.category ?? inferResultCategory({ resultQuery: result.query, resultTitle: result.title }),
        imageSimilarity:
          "imageSimilarity" in result && typeof result.imageSimilarity === "number"
            ? result.imageSimilarity
            : rerankFeatures.sketchImageSimilarity,
        rank: 0,
        rerankFeatures,
        textSimilarity:
          "textSimilarity" in result && typeof result.textSimilarity === "number"
            ? result.textSimilarity
            : rerankFeatures.textImageSimilarity,
      } satisfies RerankedResult;
    })
    .sort(
      (left, right) =>
        (right.rerankFeatures?.totalScore ?? 0) -
        (left.rerankFeatures?.totalScore ?? 0),
    )
    .map((result, index) => ({
      ...result,
      rank: index + 1,
    }));

  const topScore = ranked[0]?.rerankFeatures?.totalScore ?? 0;
  const secondScore = ranked[1]?.rerankFeatures?.totalScore ?? 0;
  const topFiveCategories = new Set(ranked.slice(0, 5).map((result) => result.category));

  return {
    ambiguous:
      topScore < 0.78 ||
      topScore - secondScore < 0.12 ||
      topFiveCategories.size >= 3,
    clarificationNeeded:
      topScore < 0.68 ||
      topScore - secondScore < 0.08,
    results: ranked.slice(0, 8),
    topScore,
    topScoreGap: topScore - secondScore,
    topFiveCategoryDisagreement: topFiveCategories.size,
  };
}

export function deriveCandidatesFromResults(input: {
  existing: EntityCandidate[];
  results: RerankedResult[];
  userText: string;
}) {
  const mapped = input.results.slice(0, 4).map((result) => ({
    confidence: Math.min(0.96, Math.max(0.38, result.rerankFeatures?.totalScore ?? 0.4)),
    id: result.id,
    label: result.title.length > 50 ? result.title.slice(0, 50) : result.title,
    query: result.query,
    queryVariants: [result.title, result.query, input.userText].filter(Boolean),
    rationale:
      result.source === "local"
        ? "로컬 reference index와 입력 증거의 일치도가 높아 상위 후보로 반영했습니다."
        : "웹 검색 결과 제목과 입력 증거의 일치도가 높아 상위 후보로 반영했습니다.",
    source: "merged" as const,
  }));

  return Array.from(
    new Map(
      [...mapped, ...input.existing].map((candidate) => [
        normalizeSearchText(candidate.label || candidate.query),
        candidate,
      ]),
    ).values(),
  ).slice(0, 6);
}
