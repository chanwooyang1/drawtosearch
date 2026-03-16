import { describe, expect, it } from "vitest";

import { buildClarificationPrompt } from "./clarification";
import type { EvidenceBundle, RerankedResult, SearchInput } from "./types";
import type { SearchHypothesis } from "./hypotheses";

function createSearchInput(userText: string): SearchInput {
  return {
    clarificationAnswers: null,
    hasDrawing: true,
    locale: "ko-KR",
    retryContext: null,
    sketchDataUrl: "data:image/png;base64,ZmFrZQ==",
    sketchSummary: {
      aspectBucket: "square",
      complexity: "minimal",
      dominantGeometry: "round",
      elementCount: 2,
      hasClosedShapes: true,
      repeatedMarks: false,
      typeCounts: {
        arrow: 0,
        diamond: 0,
        ellipse: 1,
        freedraw: 0,
        line: 0,
        rectangle: 1,
        text: 0,
      },
    },
    userText,
  };
}

function createEvidenceBundle(overrides?: Partial<EvidenceBundle>): EvidenceBundle {
  return {
    binaryDescriptorText: "원형 폐곡선 형태 simple icon",
    clarificationTokens: [],
    colorTokens: ["blue", "white"],
    contextTokens: ["service", "icon"],
    ocrTokens: [],
    rasterDescriptorText: "원형 blue white rough raster",
    shapeTokens: ["원형", "폐곡선 형태", "simple icon"],
    sketchDescriptorText: "원형 simple icon",
    textDescriptorText: "파란색 흰색 서비스 아이콘",
    ...overrides,
  };
}

function createHypotheses(): SearchHypothesis[] {
  return [
    {
      confidence: 0.72,
      id: "service-1",
      label: "서비스 아이콘 또는 소프트웨어 심볼",
      query: "파란색 흰색 원형 서비스 심볼 reference",
      surface: "service_icon",
      tags: ["service", "icon"],
    },
    {
      confidence: 0.68,
      id: "logo-1",
      label: "실제 로고 또는 심볼",
      query: "파란색 흰색 원형 로고 reference",
      surface: "logo_symbol",
      tags: ["logo", "symbol"],
    },
  ];
}

function createResult(input: Partial<RerankedResult>): RerankedResult {
  return {
    baseScore: 0.6,
    category: "logo_icon",
    dominantColors: ["blue", "white"],
    id: "result-1",
    imageSimilarity: 0.6,
    link: "https://example.com/result",
    query: "파란색 흰색 원형 서비스 심볼 reference",
    rank: 1,
    rerankFeatures: {
      colorMatch: 0.5,
      contextMatch: 0.5,
      shapeMatch: 0.5,
      sketchImageSimilarity: 0.5,
      sourceConsensus: 0.2,
      textImageSimilarity: 0.5,
      titleQueryOverlap: 0.4,
      totalScore: 0.6,
    },
    shapeTags: ["round"],
    source: "mock",
    tags: ["service", "icon"],
    textSimilarity: 0.6,
    thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
    title: "Blue service icon",
    ...input,
  };
}

describe("buildClarificationPrompt", () => {
  it("asks a palette question when user colors and top results disagree on palette", async () => {
    const prompt = await buildClarificationPrompt({
      evidence: createEvidenceBundle(),
      hypotheses: createHypotheses(),
      results: [
        createResult({
          dominantColors: ["blue", "white"],
          id: "result-blue",
          title: "Blue white round service mark",
        }),
        createResult({
          dominantColors: ["blue", "green", "yellow", "red"],
          id: "result-multicolor",
          title: "Multicolor browser icon",
        }),
      ],
      searchInput: createSearchInput("파란색과 흰색이 보이는 둥근 서비스 마크 같아요"),
    });

    expect(prompt.id).toBe("color_palette");
    expect(prompt.question).toContain("색");
  });

  it("asks about text when sketch evidence includes OCR-like marks", async () => {
    const prompt = await buildClarificationPrompt({
      evidence: createEvidenceBundle({
        ocrTokens: ["TV"],
        shapeTokens: ["원형", "text-like marks"],
      }),
      hypotheses: createHypotheses(),
      results: [
        createResult({
          id: "result-wordmark",
          ocrTokens: ["TV"],
          shapeTags: ["text_mark"],
          title: "TV wordmark logo",
        }),
        createResult({
          id: "result-symbol",
          title: "Blue round service symbol",
        }),
      ],
      searchInput: createSearchInput("원 안에 무언가 글자처럼 보이는 마크였어요"),
    });

    expect(prompt.id).toBe("text_in_mark");
    expect(prompt.question).toContain("글자");
  });
});
