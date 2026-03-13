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
      "원격 지원 프로그램 화면에서 봤고 흰색이랑 파란색이 보이는 동그란 로고 같아요",
  };
}

function createSeedCandidates(): EntityCandidate[] {
  return [
    {
      confidence: 0.68,
      id: "generic-service-seed",
      label: "앱 아이콘 또는 서비스 심볼",
      query: "앱 아이콘 또는 서비스 로고 reference",
      queryVariants: buildQueryVariants({
        label: "앱 아이콘 또는 서비스 심볼",
        query: "앱 아이콘 또는 서비스 로고 reference",
        userText: "원격 지원 프로그램 화면에서 봤고 흰색이랑 파란색이 보이는 동그란 로고 같아요",
      }),
      rationale:
        "서비스나 앱 화면에서 본 심볼일 가능성을 넓게 두는 초기 가설입니다.",
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
          label: "팀뷰어",
          query: "TeamViewer logo icon official",
          rationale: "검색 결과 제목에서 TeamViewer와 원격 지원 단서가 반복됩니다.",
        },
      ],
      observations: [
        "TeamViewer 문자열이 반복되어 후보가 명확해졌습니다.",
        "원격 지원 프로그램 맥락이 강합니다.",
      ],
      outcome: "refine",
      resultFocus: ["teamviewer", "remote support", "logo"],
      searchQueries: [
        "TeamViewer logo icon official",
        "팀뷰어 로고 아이콘",
      ],
    }),
    planSearch: vi.fn().mockResolvedValue({
      candidateEntities: [
        {
          confidence: 0.91,
          label: "팀뷰어",
          query: "팀뷰어 로고 아이콘",
          rationale: "파란색과 흰색, 원형에 가까운 서비스 로고 단서가 팀뷰어와 잘 맞습니다.",
        },
      ],
      observations: [
        "원격 지원 프로그램에서 본 서비스 로고입니다.",
        "파랑과 흰색 계열 색 단서가 있습니다.",
      ],
      searchIntent: "실제 서비스 로고를 찾기 위한 이미지 검색",
      searchQueries: [
        "팀뷰어 로고 아이콘",
        "teamviewer logo icon official",
      ],
    }),
    selectBest: vi.fn().mockResolvedValue({
      candidateEntities: [
        {
          confidence: 0.95,
          label: "팀뷰어",
          query: "TeamViewer logo icon official",
          rationale: "파란색/흰색 서비스 로고 단서와 검색 결과 제목이 팀뷰어와 일치합니다.",
        },
      ],
      observations: ["원격 지원 프로그램 로고와 검색 결과가 일치합니다."],
      resultFocus: ["teamviewer", "remote support", "official"],
      summary: "색상과 서비스 맥락을 종합하면 팀뷰어가 가장 유력합니다.",
      topQuery: "TeamViewer logo icon official",
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
            id: "teamviewer-1",
            link: "https://example.com/teamviewer-1",
            query: "팀뷰어 로고 아이콘",
            source: "mock",
            thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
            title: "TeamViewer logo icon png",
          },
          {
            id: "teamviewer-2",
            link: "https://example.com/teamviewer-2",
            query: "팀뷰어 로고 아이콘",
            source: "mock",
            thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
            title: "TeamViewer remote support official icon",
          },
        ],
        mode: "mock",
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "teamviewer-3",
            link: "https://example.com/teamviewer-3",
            query: "TeamViewer logo icon official",
            source: "mock",
            thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
            title: "TeamViewer logo icon official svg",
          },
        ],
        mode: "mock",
      });

    const result = await runSearchAgent(createBrowserInput(), createSeedCandidates(), {
      googleSearch: vi.fn().mockResolvedValue([
        {
          id: "teamviewer-google",
          link: "https://example.com/teamviewer-google",
          query: "TeamViewer logo icon official",
          source: "google",
          thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
          title: "TeamViewer logo mark pack",
        },
      ]),
      naverSearch,
      reasoningAgent: createReasoningAgent(),
    });

    expect(result.engine).toBe("langgraph-upstage");
    expect(result.candidateEntities[0]?.label).toBe("팀뷰어");
    expect(result.searchPrompts[0]?.toLowerCase()).toContain("teamviewer");
    expect(result.searchPrompts.join(" ")).not.toMatch(/크롬|chrome/i);
    expect(result.searchPrompts.join(" ")).not.toMatch(/손그림|스케치|drawing|sketch/i);
    expect(result.topQuery).toBe("TeamViewer logo icon official");
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
    expect(result.searchPrompts.join(" ")).not.toMatch(/구글 크롬|chrome/i);
  });
});
