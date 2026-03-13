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
      userText: "갈색 바탕에 반복 무늬가 있는 명품 로고 같아요.",
    });

    expect(result.providerMode).toBe("mock");
    expect(result.candidateEntities[0]?.label).toBe("루이비통");
    expect(result.naverResults.length).toBeGreaterThan(0);
  });

  it("falls back cleanly when vision inference throws", async () => {
    const result = await searchSketch(
      {
        hasDrawing: false,
        locale: "ko-KR",
        sketchDataUrl: null,
        userText: "운동화처럼 보이는 실루엣",
      },
      {
        visionInterpreter: vi.fn().mockRejectedValue(new Error("timeout")),
      },
    );

    expect(
      result.reasoning.some((item) => item.includes("fallback")),
    ).toBeTruthy();
    expect(result.queryVariants.length).toBeGreaterThan(0);
  });

  it("supports injected providers for deterministic ranking", async () => {
    const result = await searchSketch(
      {
        hasDrawing: false,
        locale: "ko-KR",
        sketchDataUrl: null,
        userText: "운동화처럼 보이는 실루엣",
      },
      {
        googleSearch: vi.fn().mockResolvedValue([]),
        naverSearch: vi.fn().mockResolvedValue({
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
        }),
        persistSession: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(result.naverResults[0]?.title).toBe("운동화 결과");
  });
});
