import { beforeEach, describe, expect, it, vi } from "vitest";

import { searchSketch } from "./service";

describe("searchSketch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns generic mock results without hardcoded brand assumptions", async () => {
    const result = await searchSketch({
      hasDrawing: true,
      locale: "ko-KR",
      sketchDataUrl: "data:image/png;base64,ZmFrZQ==",
      sketchSummary: null,
      userText: "갈색 바탕에 반복 무늬가 있는 명품 로고 같아요.",
    });

    expect(result.imageAssistMode).toBe("sketch-structure");
    expect(result.providerMode).toBe("mock");
    expect(result.candidateEntities[0]?.label).not.toBe("루이비통");
    expect(result.searchPrompts.join(" ")).not.toMatch(/루이비통|샤넬|나이키|크롬/i);
    expect(result.regenerationPrompt).toContain("갈색");
    expect(result.naverResults.length).toBeGreaterThan(0);
  });

  it("falls back cleanly when vision inference throws", async () => {
    const result = await searchSketch(
      {
        hasDrawing: false,
        locale: "ko-KR",
        sketchDataUrl: null,
        sketchSummary: null,
        userText: "운동화처럼 보이는 실루엣",
      },
      {
        visionInterpreter: vi.fn().mockRejectedValue(new Error("timeout")),
      },
    );

    expect(
      result.reasoning.some((item) => item.includes("fallback")),
    ).toBeTruthy();
    expect(result.searchPrompts.length).toBeGreaterThan(0);
    expect(result.queryVariants.length).toBeGreaterThan(0);
  });

  it("supports injected providers for deterministic ranking", async () => {
    const naverSearch = vi.fn().mockResolvedValue({
      items: [
        {
          id: "mock-result",
          link: "https://example.com/sneaker",
          query: "운동화 제품 이미지",
          source: "mock",
          thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
          title: "운동화 결과",
        },
      ],
      mode: "mock",
    });

    const result = await searchSketch(
      {
        hasDrawing: false,
        locale: "ko-KR",
        sketchDataUrl: null,
        sketchSummary: null,
        userText: "운동화처럼 보이는 실루엣",
      },
      {
        googleSearch: vi.fn().mockResolvedValue([]),
        naverSearch,
        persistSession: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(result.naverResults.length).toBeGreaterThan(0);
    expect(result.searchPrompts[0]).toContain("운동화");
    expect(naverSearch).toHaveBeenCalled();
  });

  it("merges local reference retrieval with web search results", async () => {
    const searchAgent = vi.fn().mockResolvedValue({
      candidateEntities: [
        {
          confidence: 0.71,
          id: "candidate-1",
          label: "서비스 아이콘 또는 소프트웨어 심볼",
          query: "파란색 흰색 서비스 아이콘 reference",
          queryVariants: ["서비스 아이콘", "파란색 흰색 서비스 아이콘 reference"],
          rationale: "broad service hypothesis",
          source: "heuristic",
        },
      ],
      engine: "rule-based",
      policyDecisions: [],
      providerMode: "live",
      searchPrompts: ["파란색 흰색 서비스 아이콘 reference"],
      searchTrace: [],
      topQuery: "파란색 흰색 서비스 아이콘 reference",
      totalResults: [
        {
          dominantColors: ["blue", "white"],
          id: "web-1",
          link: "https://example.com/teamviewer-web",
          query: "파란색 흰색 서비스 아이콘 reference",
          shapeTags: ["round", "arrows"],
          source: "mock",
          tags: ["service", "remote support", "logo"],
          thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
          title: "TeamViewer remote support logo",
        },
      ],
    });

    const result = await searchSketch(
      {
        hasDrawing: true,
        locale: "ko-KR",
        sketchDataUrl: "data:image/png;base64,ZmFrZQ==",
        sketchSummary: {
          aspectBucket: "square",
          complexity: "minimal",
          dominantGeometry: "round",
          elementCount: 2,
          hasClosedShapes: true,
          repeatedMarks: false,
          typeCounts: {
            arrow: 2,
            diamond: 0,
            ellipse: 1,
            freedraw: 0,
            line: 0,
            rectangle: 0,
            text: 0,
          },
        },
        userText: "파란색과 흰색이 보이는 원형 서비스 로고 같아요",
      },
      {
        persistSession: vi.fn().mockResolvedValue(undefined),
        referenceSearch: vi.fn().mockResolvedValue([
          {
            baseScore: 0.91,
            category: "logo_icon",
            dominantColors: ["blue", "white"],
            id: "teamviewer-local",
            imageSimilarity: 0.93,
            link: "https://www.teamviewer.com/",
            ocrTokens: [],
            query: "teamviewer remote support logo",
            shapeTags: ["round", "arrows"],
            source: "local",
            sourceId: "teamviewer-logo",
            sourceUrl: "https://www.teamviewer.com/",
            tags: ["service", "remote support", "logo"],
            textSimilarity: 0.9,
            thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
            title: "TeamViewer logo",
          },
        ]),
        searchAgent,
        visionInterpreter: vi.fn().mockResolvedValue({
          candidates: [],
          reasoning: [],
        }),
      },
    );

    expect(result.naverResults.some((entry) => entry.source === "local")).toBeTruthy();
    expect(result.naverResults.some((entry) => entry.source === "mock")).toBeTruthy();
    expect(result.naverResults[0]?.title).toMatch(/TeamViewer/i);
  });

  it("persists policy decisions with the same generated session id", async () => {
    const persistPolicyDecisions = vi.fn().mockResolvedValue(undefined);
    const persistSession = vi.fn().mockResolvedValue(undefined);
    const searchAgent = vi.fn().mockImplementation(async (_input, candidates, dependencies) => ({
      candidateEntities: candidates,
      engine: "rule-based",
      policyDecisions: [
        {
          actionName: "neutral",
          contextBucket: "unknown|low|unknown|0|unnamed",
          contextFeatures: {
            aspectBucket: "unknown",
            colorHintCount: "0",
            colorTokens: [],
            evidenceStrength: "low",
            hasDrawing: false,
            hasExplicitName: false,
            hasTextHint: true,
            intentSurface: "unknown",
            resultCoherence: "none",
            resultEntityRepeatCount: 0,
            shapeFamily: "unknown",
            visionLabelCount: 0,
          },
          createdAt: new Date("2026-03-14T00:00:00.000Z"),
          directiveText: "Keep it broad.",
          explorationScore: 0,
          id: "policy-plan",
          policyFamily: "plan_policy",
          policyVersion: "neutral-v1",
          sessionId: dependencies.sessionId,
          stage: "plan",
        },
      ],
      providerMode: "mock",
      searchPrompts: ["일반 로고 reference"],
      searchTrace: [],
      topQuery: "일반 로고 reference",
      totalResults: [],
    }));

    const result = await searchSketch(
      {
        hasDrawing: false,
        locale: "ko-KR",
        sketchDataUrl: null,
        sketchSummary: null,
        userText: "파란색과 흰색 로고 같아요",
      },
      {
        persistPolicyDecisions,
        persistSession,
        searchAgent,
        visionInterpreter: vi.fn().mockResolvedValue({
          candidates: [],
          reasoning: [],
        }),
      },
    );

    expect(searchAgent).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      expect.objectContaining({
        sessionId: result.sessionId,
      }),
    );
    expect(persistSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: result.sessionId,
      }),
    );
    expect(persistPolicyDecisions).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: result.sessionId,
        }),
      ]),
    );
  });

  it("uses sketch structure to expand candidate entities", async () => {
    const result = await searchSketch(
      {
        hasDrawing: true,
        locale: "ko-KR",
        sketchDataUrl: "data:image/png;base64,ZmFrZQ==",
        sketchSummary: {
          aspectBucket: "wide",
          complexity: "dense",
          dominantGeometry: "angular",
          elementCount: 6,
          hasClosedShapes: true,
          repeatedMarks: true,
          typeCounts: {
            arrow: 0,
            diamond: 2,
            ellipse: 0,
            freedraw: 0,
            line: 1,
            rectangle: 3,
            text: 0,
          },
        },
        userText: "",
      },
      {
        googleSearch: vi.fn().mockResolvedValue([]),
        naverSearch: vi.fn().mockResolvedValue({
          items: [],
          mode: "mock",
        }),
        persistSession: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(result.imageAssistMode).toBe("sketch-structure");
    expect(
      result.candidateEntities.some((candidate) =>
        candidate.label.includes("반복 패턴"),
      ),
    ).toBeTruthy();
    expect(
      result.queryVariants.some((query) => query.includes("가로형")),
    ).toBeTruthy();
    expect(
      result.searchPrompts.some((query) => query.includes("반복 패턴")),
    ).toBeTruthy();
    expect(result.regenerationPrompt).toContain("스케치 구조");
  });

  it("keeps browser color hints generic until search evidence narrows them", async () => {
    const result = await searchSketch(
      {
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
      },
      {
        googleSearch: vi.fn().mockResolvedValue([]),
        naverSearch: vi.fn().mockResolvedValue({
          items: [],
          mode: "mock",
        }),
        persistSession: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(result.candidateEntities[0]?.label).not.toBe("구글 크롬");
    expect(result.searchPrompts.join(" ")).not.toMatch(/구글 크롬|chrome/i);
    expect(result.searchPrompts.join(" ")).not.toMatch(/손그림|스케치|drawing|sketch/i);
  });

  it("runs a second retrieval pass when the first pass stays ambiguous", async () => {
    const searchAgent = vi
      .fn()
      .mockResolvedValueOnce({
        candidateEntities: [
          {
            confidence: 0.58,
            id: "candidate-generic",
            label: "서비스 아이콘 또는 소프트웨어 심볼",
            query: "파란색 흰색 서비스 아이콘 reference",
            queryVariants: ["서비스 아이콘", "파란색 흰색 서비스 아이콘 reference"],
            rationale: "broad hypothesis",
            source: "heuristic",
          },
        ],
        engine: "rule-based",
        policyDecisions: [],
        providerMode: "mock",
        searchPrompts: ["파란색 흰색 서비스 아이콘 reference"],
        searchTrace: [],
        topQuery: "파란색 흰색 서비스 아이콘 reference",
        totalResults: [
          {
            id: "web-ambiguous-1",
            link: "https://example.com/blue-mark",
            query: "파란색 흰색 서비스 아이콘 reference",
            source: "mock",
            thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
            title: "Blue round service icon examples",
          },
        ],
      })
      .mockResolvedValueOnce({
        candidateEntities: [
          {
            confidence: 0.84,
            id: "candidate-teamviewer",
            label: "TeamViewer",
            query: "TeamViewer logo icon official",
            queryVariants: ["TeamViewer", "TeamViewer logo icon official"],
            rationale: "refined from search evidence",
            source: "agent",
          },
        ],
        engine: "rule-based",
        policyDecisions: [],
        providerMode: "mock",
        searchPrompts: ["TeamViewer logo icon official"],
        searchTrace: [],
        topQuery: "TeamViewer logo icon official",
        totalResults: [
          {
            dominantColors: ["blue", "white"],
            id: "web-teamviewer",
            link: "https://example.com/teamviewer-official",
            query: "TeamViewer logo icon official",
            shapeTags: ["round", "arrows"],
            source: "mock",
            tags: ["service", "remote support", "logo"],
            thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
            title: "TeamViewer remote support logo official",
          },
        ],
      });
    const referenceSearch = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          baseScore: 0.93,
          category: "logo_icon",
          dominantColors: ["blue", "white"],
          id: "teamviewer-local",
          imageSimilarity: 0.94,
          link: "https://www.teamviewer.com/",
          ocrTokens: [],
          query: "TeamViewer logo icon official",
          shapeTags: ["round", "arrows"],
          source: "local",
          sourceId: "teamviewer-logo",
          sourceUrl: "https://www.teamviewer.com/",
          tags: ["service", "remote support", "logo"],
          textSimilarity: 0.92,
          thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
          title: "TeamViewer logo",
        },
      ]);

    const result = await searchSketch(
      {
        hasDrawing: true,
        locale: "ko-KR",
        sketchDataUrl: "data:image/png;base64,ZmFrZQ==",
        sketchSummary: {
          aspectBucket: "square",
          complexity: "minimal",
          dominantGeometry: "round",
          elementCount: 2,
          hasClosedShapes: true,
          repeatedMarks: false,
          typeCounts: {
            arrow: 2,
            diamond: 0,
            ellipse: 1,
            freedraw: 0,
            line: 0,
            rectangle: 0,
            text: 0,
          },
        },
        userText: "원격 지원 프로그램 화면에서 본 파란색 흰색 원형 로고 같아요",
      },
      {
        persistSession: vi.fn().mockResolvedValue(undefined),
        referenceSearch,
        searchAgent,
        visionInterpreter: vi.fn().mockResolvedValue({
          candidates: [],
          reasoning: [],
        }),
      },
    );

    expect(searchAgent).toHaveBeenCalledTimes(2);
    expect(referenceSearch).toHaveBeenCalledTimes(2);
    expect(result.candidateEntities[0]?.label).toMatch(/TeamViewer/i);
  });

  it("excludes rejected entities from the next retry search", async () => {
    const searchAgent = vi.fn().mockImplementation(async (_input, candidates) => ({
      candidateEntities: candidates,
      engine: "rule-based",
      policyDecisions: [],
      providerMode: "mock",
      searchPrompts: candidates.map((candidate: { query: string }) => candidate.query),
      searchTrace: [],
      topQuery: candidates[0]?.query ?? "reference",
      totalResults: [],
    }));

    const result = await searchSketch(
      {
        hasDrawing: false,
        locale: "ko-KR",
        retryContext: {
          previousSessionId: "11111111-1111-4111-8111-111111111111",
          rejectedEntities: ["실제 로고 또는 심볼"],
        },
        sketchDataUrl: null,
        sketchSummary: null,
        userText: "파란색과 흰색 로고 같아요",
      },
      {
        persistSession: vi.fn().mockResolvedValue(undefined),
        searchAgent,
        visionInterpreter: vi.fn().mockResolvedValue({
          candidates: [],
          reasoning: [],
        }),
      },
    );

    const passedCandidates = searchAgent.mock.calls[0]?.[1] ?? [];

    expect(
      passedCandidates.some((candidate: { label: string }) => candidate.label === "실제 로고 또는 심볼"),
    ).toBeFalsy();
    expect(
      result.candidateEntities.some((candidate) => candidate.label === "실제 로고 또는 심볼"),
    ).toBeFalsy();
  });

  it("returns one clarification question after two ambiguous passes and resolves once answered", async () => {
    const searchAgent = vi.fn().mockResolvedValue({
      candidateEntities: [
        {
          confidence: 0.6,
          id: "candidate-1",
          label: "서비스 아이콘 또는 소프트웨어 심볼",
          query: "파란색 흰색 원형 서비스 심볼 reference",
          queryVariants: ["서비스 심볼", "파란색 흰색 원형 서비스 심볼 reference"],
          rationale: "still broad",
          source: "heuristic",
        },
      ],
      engine: "rule-based",
      policyDecisions: [],
      providerMode: "mock",
      searchPrompts: ["파란색 흰색 원형 서비스 심볼 reference"],
      searchTrace: [],
      topQuery: "파란색 흰색 원형 서비스 심볼 reference",
      totalResults: [
        {
          dominantColors: ["blue", "white"],
          id: "ambiguous-web-1",
          link: "https://example.com/ambiguous-1",
          query: "파란색 흰색 원형 서비스 심볼 reference",
          shapeTags: ["round"],
          source: "mock",
          tags: ["service", "logo"],
          thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
          title: "Blue white round service mark",
        },
        {
          dominantColors: ["blue", "white"],
          id: "ambiguous-web-2",
          link: "https://example.com/ambiguous-2",
          query: "파란색 흰색 원형 서비스 심볼 reference",
          shapeTags: ["round"],
          source: "mock",
          tags: ["service", "icon"],
          thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
          title: "Round blue white app icon",
        },
      ],
    });

    const baseInput = {
      hasDrawing: true,
      locale: "ko-KR",
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
      userText: "파란색과 흰색이 보이는 둥근 서비스 마크 같아요",
    } as const;

    const unresolved = await searchSketch(baseInput, {
      persistSession: vi.fn().mockResolvedValue(undefined),
      referenceSearch: vi.fn().mockResolvedValue([]),
      searchAgent,
      visionInterpreter: vi.fn().mockResolvedValue({
        candidates: [],
        reasoning: [],
      }),
    });

    expect(unresolved.resultMode).toBe("needs_clarification");
    expect(unresolved.clarification).not.toBeNull();

    const resolved = await searchSketch(
      {
        ...baseInput,
        clarificationAnswers: [
          {
            answer: "네, 앱 아이콘처럼 단순했어요",
            questionId: unresolved.clarification?.id ?? "app_icon_simple",
          },
        ],
      },
      {
        persistSession: vi.fn().mockResolvedValue(undefined),
        referenceSearch: vi.fn().mockResolvedValue([]),
        searchAgent,
        visionInterpreter: vi.fn().mockResolvedValue({
          candidates: [],
          reasoning: [],
        }),
      },
    );

    expect(resolved.resultMode).toBe("resolved");
    expect(resolved.clarification).toBeNull();
    expect(
      resolved.reasoning.some((item) => item.includes("확인 질문 답변")),
    ).toBeTruthy();
  });

  it("refines prompts after reading first-pass search results", async () => {
    const searchAgent = vi
      .fn()
      .mockResolvedValueOnce({
        candidateEntities: [
          {
            confidence: 0.58,
            id: "candidate-generic",
            label: "제품 비주얼 또는 반복 패턴",
            query: "운동화 제품 이미지",
            queryVariants: ["운동화", "운동화 제품 이미지"],
            rationale: "generic product hypothesis",
            source: "heuristic",
          },
        ],
        engine: "rule-based",
        policyDecisions: [],
        providerMode: "mock",
        searchPrompts: ["운동화 제품 이미지"],
        searchTrace: [],
        topQuery: "운동화 제품 이미지",
        totalResults: [
          {
            id: "nike-1",
            link: "https://example.com/nike-1",
            query: "운동화 제품 이미지",
            source: "mock",
            thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
            title: "NIKE Air Max 97 Sneakers",
          },
          {
            id: "nike-2",
            link: "https://example.com/nike-2",
            query: "운동화 제품 이미지",
            source: "mock",
            thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
            title: "NIKE Air Max official product",
          },
        ],
      })
      .mockResolvedValueOnce({
        candidateEntities: [
          {
            confidence: 0.86,
            id: "candidate-nike",
            label: "NIKE Air Max 97",
            query: "NIKE Air Max 97 official",
            queryVariants: ["NIKE Air Max 97", "NIKE Air Max 97 official"],
            rationale: "refined from repeated search evidence",
            source: "agent",
          },
        ],
        engine: "rule-based",
        policyDecisions: [],
        providerMode: "mock",
        searchPrompts: ["NIKE Air Max 97 official"],
        searchTrace: [],
        topQuery: "NIKE Air Max 97 official",
        totalResults: [
          {
            id: "nike-3",
            link: "https://example.com/nike-3",
            query: "NIKE Air Max 97 official",
            source: "mock",
            thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
            title: "NIKE Air Max 97 official",
          },
        ],
      });

    const result = await searchSketch(
      {
        hasDrawing: false,
        locale: "ko-KR",
        sketchDataUrl: null,
        sketchSummary: null,
        userText: "운동화처럼 보이는 실루엣",
      },
      {
        googleSearch: vi.fn().mockResolvedValue([]),
        persistSession: vi.fn().mockResolvedValue(undefined),
        referenceSearch: vi.fn().mockResolvedValue([]),
        searchAgent,
      },
    );

    expect(searchAgent).toHaveBeenCalledTimes(2);
    expect(
      result.searchPrompts.some((query) => query.toLowerCase().includes("nike")),
    ).toBeTruthy();
    expect(
      result.candidateEntities.some((candidate) =>
        candidate.label.toLowerCase().includes("nike"),
      ),
    ).toBeTruthy();
  });
});
