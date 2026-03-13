import { describe, expect, it, vi } from "vitest";

import { runSearchAgent } from "./agent";
import { buildQueryVariants } from "./query";
import { resolveReasoningGateway } from "./upstage-agent";
import type { SearchReasoningAgent } from "./agent";
import type { EntityCandidate, SearchInput } from "./types";

function createBrowserInput(): SearchInput {
  return {
    hasDrawing: true,
    locale: "ko-KR",
    sketchDataUrl: "data:image/png;base64,ZmFrZQ==",
    sketchSummary: {
      aspectBucket: "square",
      complexity: "medium",
      dominantGeometry: "round",
      elementCount: 4,
      hasClosedShapes: true,
      repeatedMarks: false,
      typeCounts: {
        arrow: 0,
        diamond: 0,
        ellipse: 3,
        freedraw: 0,
        line: 0,
        rectangle: 1,
        text: 0,
      },
    },
    userText:
      "인터넷 브라우저에서 봤고 흰색 파란색 초록색 노란색이 있는 동그란 마크 같아요",
  };
}

function createSeedCandidates(): EntityCandidate[] {
  return [
    {
      confidence: 0.88,
      id: "chrome-seed",
      label: "구글 크롬",
      query: "구글 크롬 로고 아이콘",
      queryVariants: buildQueryVariants({
        label: "구글 크롬",
        query: "구글 크롬 로고 아이콘",
        userText:
          "인터넷 브라우저에서 봤고 흰색 파란색 초록색 노란색이 있는 동그란 마크 같아요",
      }),
      rationale:
        "브라우저 맥락과 원형의 다색 아이콘 단서가 구글 크롬을 시사합니다.",
      source: "heuristic",
    },
  ];
}

function createReasoningAgent(): SearchReasoningAgent {
  return {
    assessResults: vi.fn().mockResolvedValue({
      candidateEntities: [
        {
          confidence: 0.93,
          label: "구글 크롬",
          query: "Google Chrome app icon official",
          rationale: "검색 결과 제목에서 Chrome과 icon 단서가 반복됩니다.",
        },
      ],
      observations: [
        "Chrome 문자열이 반복되어 후보가 명확해졌습니다.",
        "브라우저 아이콘 맥락이 강합니다.",
      ],
      outcome: "refine",
      resultFocus: ["chrome", "app icon", "browser"],
      searchQueries: [
        "Google Chrome app icon official",
        "구글 크롬 브라우저 로고 아이콘",
      ],
    }),
    planSearch: vi.fn().mockResolvedValue({
      candidateEntities: [
        {
          confidence: 0.91,
          label: "구글 크롬",
          query: "구글 크롬 브라우저 로고 아이콘",
          rationale: "브라우저와 원형 다색 아이콘 단서가 구글 크롬과 가장 잘 맞습니다.",
        },
      ],
      observations: [
        "브라우저에서 본 원형 아이콘입니다.",
        "파랑, 초록, 노랑 계열 색 단서가 있습니다.",
      ],
      searchIntent: "실제 브라우저 아이콘을 찾기 위한 이미지 검색",
      searchQueries: [
        "구글 크롬 브라우저 로고 아이콘",
        "google chrome browser icon official",
      ],
    }),
    selectBest: vi.fn().mockResolvedValue({
      candidateEntities: [
        {
          confidence: 0.95,
          label: "구글 크롬",
          query: "Google Chrome app icon official",
          rationale: "원형 4색 브라우저 아이콘 단서와 검색 결과 제목이 구글 크롬과 일치합니다.",
        },
      ],
      observations: ["원형 브라우저 아이콘과 검색 결과가 일치합니다."],
      resultFocus: ["chrome", "browser icon", "official"],
      summary: "브라우저 아이콘 단서와 검색 결과를 종합하면 구글 크롬이 가장 유력합니다.",
      topQuery: "Google Chrome app icon official",
    }),
  };
}

describe("runSearchAgent", () => {
  it("prefers LiteLLM when a proxy base is configured", () => {
    const gateway = resolveReasoningGateway({
      LITELLM_API_BASE: "http://127.0.0.1:4000",
      LITELLM_API_KEY: "proxy-secret",
      LITELLM_MODEL: "drawtosearch-reasoner",
      UPSTAGE_API_KEY: "upstage-direct",
      UPSTAGE_MODEL: "solar-pro2",
    });

    expect(gateway).toEqual({
      apiKey: "proxy-secret",
      baseURL: "http://127.0.0.1:4000",
      engine: "langgraph-litellm",
      model: "drawtosearch-reasoner",
    });
  });

  it("falls back to direct Upstage when LiteLLM is not configured", () => {
    const gateway = resolveReasoningGateway({
      LITELLM_API_BASE: undefined,
      LITELLM_API_KEY: undefined,
      LITELLM_MODEL: "drawtosearch-reasoner",
      UPSTAGE_API_KEY: "upstage-direct",
      UPSTAGE_MODEL: "solar-pro2",
    });

    expect(gateway).toEqual({
      apiKey: "upstage-direct",
      baseURL: "https://api.upstage.ai/v1/solar",
      engine: "langgraph-upstage",
      model: "solar-pro2",
    });
  });

  it("uses LangGraph reasoning to refine toward the real-world target", async () => {
    const naverSearch = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            id: "chrome-1",
            link: "https://example.com/chrome-1",
            query: "구글 크롬 브라우저 로고 아이콘",
            source: "mock",
            thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
            title: "Google Chrome browser icon png",
          },
          {
            id: "chrome-2",
            link: "https://example.com/chrome-2",
            query: "구글 크롬 브라우저 로고 아이콘",
            source: "mock",
            thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
            title: "Google Chrome logo official icon",
          },
        ],
        mode: "mock",
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "chrome-3",
            link: "https://example.com/chrome-3",
            query: "Google Chrome app icon official",
            source: "mock",
            thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
            title: "Google Chrome app icon official svg",
          },
        ],
        mode: "mock",
      });

    const result = await runSearchAgent(createBrowserInput(), createSeedCandidates(), {
      googleSearch: vi.fn().mockResolvedValue([
        {
          id: "chrome-google",
          link: "https://example.com/chrome-google",
          query: "Google Chrome app icon official",
          source: "google",
          thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
          title: "Google Chrome browser icon pack",
        },
      ]),
      naverSearch,
      reasoningAgent: createReasoningAgent(),
    });

    expect(result.engine).toBe("langgraph-upstage");
    expect(result.candidateEntities[0]?.label).toBe("구글 크롬");
    expect(result.searchPrompts[0]).toContain("Chrome");
    expect(result.searchPrompts.join(" ")).not.toMatch(/손그림|스케치|drawing|sketch/i);
    expect(result.topQuery).toBe("Google Chrome app icon official");
    expect(result.searchTrace.map((item) => item.stage)).toEqual([
      "plan",
      "search",
      "assess",
      "refine",
      "select",
    ]);
    expect(naverSearch).toHaveBeenCalledTimes(2);
  });

  it("falls back to the rule-based agent when LangGraph reasoning fails", async () => {
    const result = await runSearchAgent(createBrowserInput(), createSeedCandidates(), {
      googleSearch: vi.fn().mockResolvedValue([]),
      naverSearch: vi.fn().mockResolvedValue({
        items: [],
        mode: "mock",
      }),
      reasoningAgent: {
        assessResults: vi.fn(),
        planSearch: vi.fn().mockRejectedValue(new Error("upstage unavailable")),
        selectBest: vi.fn(),
      },
    });

    expect(result.engine).toBe("rule-based");
    expect(result.searchTrace[0]?.stage).toBe("fallback");
    expect(result.searchPrompts[0]).toContain("구글 크롬");
  });
});
