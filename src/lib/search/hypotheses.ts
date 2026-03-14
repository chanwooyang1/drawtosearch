import { randomUUID } from "crypto";

import { buildQueryVariants } from "./query";
import type {
  EntityCandidate,
  EvidenceBundle,
  ReferenceCategory,
} from "./types";

type HypothesisSurface =
  | "generic_object"
  | "logo_symbol"
  | "product_visual"
  | "service_icon"
  | "unknown";

export type SearchHypothesis = {
  confidence: number;
  id: string;
  label: string;
  query: string;
  surface: HypothesisSurface;
  tags: string[];
};

function dedupeHypotheses(hypotheses: SearchHypothesis[]) {
  return Array.from(
    new Map(hypotheses.map((hypothesis) => [hypothesis.label, hypothesis])).values(),
  );
}

function surfaceToReferenceCategory(surface: HypothesisSurface): ReferenceCategory {
  if (surface === "product_visual") {
    return "product_visual";
  }

  if (surface === "generic_object") {
    return "object_reference";
  }

  return "logo_icon";
}

export function buildHypotheses(input: {
  evidence: EvidenceBundle;
  seedCandidates: EntityCandidate[];
}): SearchHypothesis[] {
  const hypotheses: SearchHypothesis[] = [];
  const { evidence } = input;
  const colorPhrase = evidence.colorTokens.join(" ");
  const shapePhrase = evidence.shapeTokens.join(" ");
  const contextPhrase = evidence.contextTokens.join(" ");
  const ocrPhrase = evidence.ocrTokens.join(" ");
  const clarificationPhrase = evidence.clarificationTokens.join(" ");

  const pushHypothesis = (
    label: string,
    surface: HypothesisSurface,
    confidence: number,
    tags: string[],
    queryParts: string[],
  ) => {
    hypotheses.push({
      confidence,
      id: randomUUID(),
      label,
      query: queryParts.filter(Boolean).join(" ").trim(),
      surface,
      tags,
    });
  };

  if (evidence.contextTokens.some((token) => ["service", "app", "browser", "web", "icon"].includes(token))) {
    pushHypothesis(
      "서비스 아이콘 또는 소프트웨어 심볼",
      "service_icon",
      0.74,
      ["service", "icon"],
      [colorPhrase, shapePhrase, contextPhrase, ocrPhrase, "service icon reference"],
    );
  }

  if (
    evidence.contextTokens.some((token) => ["logo", "mark", "symbol", "badge"].includes(token)) ||
    !hypotheses.length
  ) {
    pushHypothesis(
      "실제 로고 또는 심볼",
      "logo_symbol",
      0.7,
      ["logo", "symbol"],
      [colorPhrase, shapePhrase, clarificationPhrase, "official logo symbol reference"],
    );
  }

  if (
    evidence.contextTokens.some((token) => ["luxury", "fashion", "monogram", "pattern", "product"].includes(token)) ||
    evidence.shapeTokens.includes("반복 패턴")
  ) {
    pushHypothesis(
      "제품 비주얼 또는 반복 패턴",
      "product_visual",
      0.72,
      ["product", "pattern"],
      [colorPhrase, shapePhrase, contextPhrase, "product visual reference"],
    );
  }

  if (
    evidence.contextTokens.some((token) => ["object", "device", "remote", "cup"].includes(token)) ||
    !evidence.contextTokens.length
  ) {
    pushHypothesis(
      "일반 사물 또는 물체 기준 이미지",
      "generic_object",
      0.62,
      ["object", "reference"],
      [shapePhrase, colorPhrase, contextPhrase, "object reference image"],
    );
  }

  if (evidence.ocrTokens.length) {
    pushHypothesis(
      `${evidence.ocrTokens[0]} 관련 심볼`,
      "unknown",
      0.58,
      ["ocr", ...evidence.ocrTokens],
      [evidence.ocrTokens.join(" "), colorPhrase, "reference image"],
    );
  }

  for (const candidate of input.seedCandidates.slice(0, 3)) {
    hypotheses.push({
      confidence: Math.min(0.68, candidate.confidence),
      id: randomUUID(),
      label: candidate.label,
      query: candidate.query,
      surface: candidate.label.includes("제품")
        ? "product_visual"
        : candidate.label.includes("사물")
          ? "generic_object"
          : candidate.label.includes("서비스") || candidate.label.includes("아이콘")
            ? "service_icon"
            : "logo_symbol",
      tags: candidate.queryVariants,
    });
  }

  return dedupeHypotheses(hypotheses).slice(0, 5);
}

export function buildHypothesisCandidates(hypotheses: SearchHypothesis[], userText: string) {
  return hypotheses.map((hypothesis) => ({
    confidence: hypothesis.confidence,
    id: hypothesis.id,
    label: hypothesis.label,
    query: hypothesis.query || hypothesis.label,
    queryVariants: buildQueryVariants({
      label: hypothesis.label,
      query: hypothesis.query || hypothesis.label,
      userText,
    }),
    rationale: `${surfaceToReferenceCategory(hypothesis.surface)} 방향의 가설로 시작합니다.`,
    source: "heuristic" as const,
  }));
}

export function refineHypothesesFromResults(input: {
  baseHypotheses: SearchHypothesis[];
  topLabels: string[];
}) {
  const boosted = input.baseHypotheses.map((hypothesis, index) => ({
    ...hypothesis,
    confidence: Math.min(
      0.92,
      hypothesis.confidence +
        (input.topLabels.some((label) =>
          label.toLowerCase().includes(hypothesis.label.toLowerCase()),
        )
          ? 0.08
          : Math.max(0, 0.04 - index * 0.01)),
    ),
  }));

  return boosted
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 2);
}
