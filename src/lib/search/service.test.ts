import { beforeEach, describe, expect, it, vi } from "vitest";

import { searchSketch } from "./service";

describe("searchSketch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns mock results without provider keys", async () => {
    const result = await searchSketch({
      hasDrawing: true,
      locale: "ko-KR",
      sketchDataUrl: "data:image/png;base64,ZmFrZQ==",
      sketchSummary: null,
      userText: "갈색 바탕에 반복 무늬가 있는 명품 로고 같아요.",
    });

    expect(result.imageAssistMode).toBe("sketch-structure");
    expect(result.providerMode).toBe("mock");
    expect(result.candidateEntities[0]?.label).toBe("루이비통");
    expect(result.searchPrompts[0]).toContain("루이비통");
    expect(result.regenerationPrompt).toContain("루이비통");
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

    expect(result.naverResults[0]?.title).toBe("운동화 결과");
    expect(result.searchPrompts[0]).toContain("운동화");
    expect(naverSearch).toHaveBeenCalled();
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

  it("identifies chrome-like browser icon hints early", async () => {
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

    expect(result.candidateEntities[0]?.label).toBe("구글 크롬");
    expect(result.searchPrompts[0]).toContain("구글 크롬");
    expect(result.searchPrompts.join(" ")).not.toMatch(/손그림|스케치|drawing|sketch/i);
  });

  it("refines prompts after reading first-pass search results", async () => {
    const naverSearch = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
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
        mode: "mock",
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "nike-3",
            link: "https://example.com/nike-3",
            query: "스니커즈 NIKE reference image",
            source: "mock",
            thumbnailUrl: "data:image/svg+xml;base64,ZmFrZQ==",
            title: "NIKE Air Max 97 official",
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

    expect(naverSearch).toHaveBeenCalledTimes(2);
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
