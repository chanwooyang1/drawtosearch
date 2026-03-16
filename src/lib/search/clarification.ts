import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

import { env } from "@/lib/env";

import { resolveReasoningGateway } from "./upstage-agent";
import type { SearchHypothesis } from "./hypotheses";
import type {
  ClarificationPrompt,
  EvidenceBundle,
  RerankedResult,
  SearchInput,
} from "./types";

const clarificationIdSchema = z.enum([
  "app_icon_simple",
  "color_palette",
  "directional_shape",
  "geometry_round",
  "pattern_repeat",
  "text_in_mark",
]);

type ClarificationId = z.infer<typeof clarificationIdSchema>;

const clarificationSchema = z.object({
  id: clarificationIdSchema,
  question: z.string().trim().min(1).max(120),
});

const OPTION_SETS: Record<ClarificationId, string[]> = {
  app_icon_simple: [
    "네, 앱 아이콘처럼 단순했어요",
    "아니요, 더 복잡한 로고나 마크였어요",
    "잘 모르겠어요",
  ],
  color_palette: [
    "네, 파란색/흰색처럼 적은 색 위주였어요",
    "아니요, 여러 색이 함께 보였어요",
    "잘 모르겠어요",
  ],
  directional_shape: [
    "네, 방향성 있는 화살표나 삼각형 느낌이 있었어요",
    "아니요, 그런 방향성은 없었어요",
    "잘 모르겠어요",
  ],
  geometry_round: [
    "네, 원형이나 배지처럼 감싸진 느낌이었어요",
    "아니요, 각지거나 열린 형태였어요",
    "잘 모르겠어요",
  ],
  pattern_repeat: [
    "네, 같은 무늬가 반복되는 느낌이었어요",
    "아니요, 하나의 마크나 심볼에 가까웠어요",
    "잘 모르겠어요",
  ],
  text_in_mark: [
    "네, 글자나 이니셜처럼 보이는 요소가 있었어요",
    "아니요, 글자는 없었어요",
    "잘 모르겠어요",
  ],
};

function hasRoundSignal(result: RerankedResult) {
  return (
    result.shapeTags?.includes("round") ||
    result.shapeTags?.includes("simple_icon") ||
    /round|circle|oval|badge|원형|배지/i.test(`${result.title} ${result.query}`)
  );
}

function hasAngularSignal(result: RerankedResult) {
  return (
    result.shapeTags?.includes("angular") ||
    /angular|triangle|arrow|각진|기하학/i.test(`${result.title} ${result.query}`)
  );
}

function hasDirectionalSignal(result: RerankedResult) {
  return (
    result.shapeTags?.includes("arrows") ||
    /arrow|arrows|direction|remote support|화살표|마주보는/i.test(
      `${result.title} ${result.query} ${(result.tags ?? []).join(" ")}`,
    )
  );
}

function hasTextSignal(result: RerankedResult) {
  return (
    Boolean(result.ocrTokens?.length) ||
    result.shapeTags?.includes("text_mark") ||
    /wordmark|initial|text|letter|글자|이니셜|워드마크/i.test(
      `${result.title} ${result.query}`,
    )
  );
}

function hasPatternSignal(result: RerankedResult) {
  return (
    result.shapeTags?.includes("repeated_pattern") ||
    result.category === "product_visual" ||
    /pattern|monogram|repeat|패턴|반복|모노그램/i.test(
      `${result.title} ${result.query} ${(result.tags ?? []).join(" ")}`,
    )
  );
}

function hasSimpleIconSignal(result: RerankedResult) {
  return (
    result.shapeTags?.includes("simple_icon") ||
    /app icon|service icon|simple icon|앱 아이콘|단순한 아이콘/i.test(
      `${result.title} ${result.query} ${(result.tags ?? []).join(" ")}`,
    )
  );
}

function hasLimitedPaletteSignal(result: RerankedResult) {
  return (
    (result.dominantColors?.length ?? 0) > 0 &&
    (result.dominantColors?.length ?? 0) <= 2
  );
}

function hasMultiColorSignal(result: RerankedResult) {
  return (
    (result.dominantColors?.length ?? 0) >= 3 ||
    ["red", "yellow", "green"].some((color) => result.dominantColors?.includes(color))
  );
}

function mixedSignalScore(results: RerankedResult[], predicate: (result: RerankedResult) => boolean) {
  const topResults = results.slice(0, 4);

  if (topResults.length < 2) {
    return 0;
  }

  const positiveCount = topResults.filter(predicate).length;
  const negativeCount = topResults.length - positiveCount;

  if (!positiveCount || !negativeCount) {
    return 0;
  }

  return Math.min(positiveCount, negativeCount) / topResults.length;
}

function surfaceSplitScore(hypotheses: SearchHypothesis[], surface: SearchHypothesis["surface"]) {
  const hasSurface = hypotheses.some((hypothesis) => hypothesis.surface === surface);
  const hasOtherSurface = hypotheses.some((hypothesis) => hypothesis.surface !== surface);

  return hasSurface && hasOtherSurface ? 0.25 : 0;
}

function normalizeQuestion(question: string, fallback: string) {
  const trimmed = question.trim();

  if (!trimmed) {
    return fallback;
  }

  if (/[?？]$/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}?`;
}

function defaultQuestionText(id: ClarificationId) {
  switch (id) {
    case "color_palette":
      return "기억나는 색감이 파란색과 흰색처럼 적은 색 위주였나요?";
    case "directional_shape":
      return "가운데나 양쪽에 방향성 있는 화살표 같은 모양이 있었나요?";
    case "geometry_round":
      return "전체 외곽이 원형 배지처럼 감싸진 느낌에 가까웠나요?";
    case "pattern_repeat":
      return "하나의 심볼보다 같은 무늬가 반복되는 패턴에 가까웠나요?";
    case "text_in_mark":
      return "마크 안쪽에 글자나 이니셜처럼 보이는 요소가 있었나요?";
    case "app_icon_simple":
    default:
      return "전체 느낌이 단순한 앱 아이콘에 더 가까웠나요?";
  }
}

function buildFallbackClarificationPrompt(input: {
  evidence: EvidenceBundle;
  hypotheses: SearchHypothesis[];
  results: RerankedResult[];
}): ClarificationPrompt {
  const topResults = input.results.slice(0, 4);
  const evidenceHasRound =
    input.evidence.shapeTokens.includes("원형") ||
    input.evidence.shapeTokens.includes("폐곡선 형태");
  const evidenceHasDirectional = input.evidence.shapeTokens.includes("arrows");
  const evidenceHasText =
    input.evidence.ocrTokens.length > 0 ||
    input.evidence.shapeTokens.includes("text-like marks");
  const evidenceHasPattern =
    input.evidence.shapeTokens.includes("반복 패턴") ||
    input.evidence.shapeTokens.includes("repeated marks");
  const evidenceHasSimpleIcon = input.evidence.shapeTokens.includes("simple icon");
  const evidenceHasColorHint = input.evidence.colorTokens.length >= 2;

  const scoredCandidates = [
    {
      id: "color_palette" as const,
      score:
        (evidenceHasColorHint ? 0.55 : 0) +
        mixedSignalScore(topResults, hasLimitedPaletteSignal) +
        mixedSignalScore(topResults, hasMultiColorSignal) * 0.8,
    },
    {
      id: "directional_shape" as const,
      score:
        (evidenceHasDirectional ? 0.75 : 0) +
        mixedSignalScore(topResults, hasDirectionalSignal),
    },
    {
      id: "text_in_mark" as const,
      score:
        (evidenceHasText ? 0.65 : 0) +
        mixedSignalScore(topResults, hasTextSignal),
    },
    {
      id: "pattern_repeat" as const,
      score:
        (evidenceHasPattern ? 0.75 : 0) +
        mixedSignalScore(topResults, hasPatternSignal),
    },
    {
      id: "geometry_round" as const,
      score:
        (evidenceHasRound ? 0.45 : 0) +
        mixedSignalScore(topResults, hasRoundSignal) +
        mixedSignalScore(topResults, hasAngularSignal) * 0.8,
    },
    {
      id: "app_icon_simple" as const,
      score:
        (evidenceHasSimpleIcon ? 0.35 : 0) +
        surfaceSplitScore(input.hypotheses, "service_icon") +
        mixedSignalScore(topResults, hasSimpleIconSignal),
    },
  ].sort((left, right) => right.score - left.score);

  const winner = scoredCandidates[0]?.id ?? "app_icon_simple";

  return {
    id: winner,
    options: OPTION_SETS[winner],
    question: defaultQuestionText(winner),
  };
}

function formatEvidenceSummary(input: {
  evidence: EvidenceBundle;
  hypotheses: SearchHypothesis[];
  searchInput: SearchInput;
  results: RerankedResult[];
}) {
  const resultLines = input.results
    .slice(0, 4)
    .map((result, index) => {
      const colors = result.dominantColors?.join(", ") || "(none)";
      const shapes = result.shapeTags?.join(", ") || "(none)";
      const tags = result.tags?.join(", ") || "(none)";

      return `${index + 1}. ${result.title} | colors=${colors} | shapes=${shapes} | tags=${tags}`;
    })
    .join("\n");

  return [
    `User text hint: ${input.searchInput.userText || "(none)"}`,
    `Sketch-derived shape signals: ${input.evidence.shapeTokens.join(", ") || "(none)"}`,
    `Sketch-derived color signals: ${input.evidence.colorTokens.join(", ") || "(none)"}`,
    `Sketch-derived OCR-like signals: ${input.evidence.ocrTokens.join(", ") || "(none)"}`,
    `Context signals: ${input.evidence.contextTokens.join(", ") || "(none)"}`,
    `Current hypotheses: ${input.hypotheses.map((hypothesis) => `${hypothesis.surface}:${hypothesis.label}`).join(" | ") || "(none)"}`,
    "Top competing results:",
    resultLines || "(none)",
  ].join("\n");
}

async function buildLlmClarificationPrompt(input: {
  evidence: EvidenceBundle;
  hypotheses: SearchHypothesis[];
  searchInput: SearchInput;
  results: RerankedResult[];
}) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return null;
  }

  const gateway = resolveReasoningGateway(env);

  if (!gateway) {
    return null;
  }

  const model = new ChatOpenAI({
    apiKey: gateway.apiKey,
    configuration: {
      baseURL: gateway.baseURL,
    },
    maxTokens: 220,
    model: gateway.model,
    temperature: 0.1,
    timeout: 15_000,
  }).withStructuredOutput(clarificationSchema, {
    name: "draw_to_search_clarification",
  });

  const response = await model.invoke([
    new SystemMessage([
      "You design a single clarification question for DrawToSearch.",
      "You do not see the raw sketch image.",
      "Instead, use only the extracted visual evidence from the sketch plus the user's text hint and the top competing search results.",
      "Choose the most discriminative next question that can separate the current top candidates.",
      "Do not anchor on a single famous app or brand unless the evidence strongly supports it.",
      "Prefer questions about palette, geometry, directionality, repeated pattern, text inside the mark, or simple app-icon feel.",
      "Return Korean wording.",
      "Choose exactly one id from the allowed ids.",
      "The question must match that id semantically and stay concise.",
    ].join(" ")),
    new HumanMessage([
      "Allowed ids:",
      "- color_palette: ask whether the remembered image was mostly a limited blue/white style palette or had many colors",
      "- directional_shape: ask whether there was a directional arrow or opposing-arrow feel",
      "- geometry_round: ask whether it felt enclosed like a round badge versus angular/open",
      "- text_in_mark: ask whether there were letters or initials inside the mark",
      "- pattern_repeat: ask whether it was a repeated pattern rather than one symbol",
      "- app_icon_simple: ask whether it felt like a simple app icon rather than a more complex logo/mark",
      "",
      formatEvidenceSummary(input),
    ].join("\n")),
  ]);

  return {
    id: response.id,
    options: OPTION_SETS[response.id],
    question: normalizeQuestion(response.question, defaultQuestionText(response.id)),
  } satisfies ClarificationPrompt;
}

export async function buildClarificationPrompt(input: {
  evidence: EvidenceBundle;
  hypotheses: SearchHypothesis[];
  results: RerankedResult[];
  searchInput: SearchInput;
}): Promise<ClarificationPrompt> {
  const fallbackPrompt = buildFallbackClarificationPrompt(input);

  try {
    const llmPrompt = await buildLlmClarificationPrompt(input);
    return llmPrompt ?? fallbackPrompt;
  } catch {
    return fallbackPrompt;
  }
}
