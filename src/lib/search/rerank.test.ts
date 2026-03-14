import { describe, expect, it } from "vitest";

import { rerankResults } from "./rerank";
import type { EvidenceBundle, EntityCandidate, RetrievalCandidate } from "./types";
import type { SearchHypothesis } from "./hypotheses";

function createEvidence(): EvidenceBundle {
  return {
    binaryDescriptorText: "round arrows simple icon",
    clarificationTokens: [],
    colorTokens: ["blue", "white"],
    contextTokens: ["service", "icon"],
    ocrTokens: [],
    rasterDescriptorText: "round arrows blue white rough raster",
    shapeTokens: ["round", "arrows", "simple icon"],
    sketchDescriptorText: "round arrows simple icon",
    textDescriptorText: "blue white service icon remote support",
  };
}

function createCandidates(): EntityCandidate[] {
  return [
    {
      confidence: 0.74,
      id: "candidate-1",
      label: "서비스 아이콘 또는 소프트웨어 심볼",
      query: "blue white service icon remote support",
      queryVariants: ["service icon", "remote support logo"],
      rationale: "broad service icon hypothesis",
      source: "heuristic",
    },
  ];
}

function createHypotheses(): SearchHypothesis[] {
  return [
    {
      confidence: 0.76,
      id: "hypothesis-1",
      label: "서비스 아이콘 또는 소프트웨어 심볼",
      query: "blue white service icon remote support",
      surface: "service_icon",
      tags: ["service", "icon", "remote support"],
    },
  ];
}

describe("rerankResults", () => {
  it("downranks color and context mismatches against evidence-matching results", () => {
    const localResult: RetrievalCandidate = {
      baseScore: 0.92,
      category: "logo_icon",
      dominantColors: ["blue", "white"],
      id: "teamviewer-local",
      imageSimilarity: 0.94,
      link: "https://www.teamviewer.com/",
      query: "TeamViewer logo icon official",
      shapeTags: ["round", "arrows"],
      source: "local",
      sourceId: "teamviewer-logo",
      sourceUrl: "https://www.teamviewer.com/",
      tags: ["service", "icon", "remote support"],
      textSimilarity: 0.93,
      thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
      title: "TeamViewer logo",
    };

    const reranked = rerankResults({
      candidateEntities: createCandidates(),
      evidence: createEvidence(),
      localResults: [localResult],
      topHypotheses: createHypotheses(),
      webResults: [
        {
          dominantColors: ["red", "yellow", "green"],
          id: "chrome-web",
          link: "https://example.com/chrome",
          query: "browser icon official",
          shapeTags: ["round"],
          source: "mock",
          tags: ["browser", "icon"],
          thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
          title: "Chrome browser icon official",
        },
      ],
    });

    expect(reranked.results[0]?.title).toBe("TeamViewer logo");
    expect(reranked.results[0]?.rerankFeatures?.colorMatch).toBeGreaterThan(
      reranked.results[1]?.rerankFeatures?.colorMatch ?? 0,
    );
    expect(reranked.results[0]?.rerankFeatures?.contextMatch).toBeGreaterThan(
      reranked.results[1]?.rerankFeatures?.contextMatch ?? 0,
    );
  });

  it("triggers clarification when top scores remain too close and weak", () => {
    const reranked = rerankResults({
      candidateEntities: createCandidates(),
      evidence: createEvidence(),
      localResults: [],
      topHypotheses: createHypotheses(),
      webResults: [
        {
          dominantColors: ["blue", "white"],
          id: "web-1",
          link: "https://example.com/1",
          query: "blue white round service mark",
          shapeTags: ["round"],
          source: "mock",
          tags: ["service", "logo"],
          thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
          title: "Blue white round service mark",
        },
        {
          dominantColors: ["blue", "white"],
          id: "web-2",
          link: "https://example.com/2",
          query: "blue white app icon",
          shapeTags: ["round"],
          source: "mock",
          tags: ["service", "icon"],
          thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
          title: "Round blue white app icon",
        },
      ],
    });

    expect(reranked.ambiguous).toBeTruthy();
    expect(reranked.clarificationNeeded).toBeTruthy();
    expect(
      reranked.topScore < 0.68 || reranked.topScoreGap < 0.08,
    ).toBeTruthy();
  });
});
