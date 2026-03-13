import { describe, expect, it } from "vitest";

import { buildPromptPlan } from "./prompt";

describe("prompt plan", () => {
  it("creates enriched text prompts from candidate, user hint, and sketch descriptors", () => {
    const result = buildPromptPlan(
      {
        hasDrawing: true,
        locale: "ko-KR",
        sketchDataUrl: "data:image/png;base64,ZmFrZQ==",
        sketchSummary: {
          aspectBucket: "wide",
          complexity: "dense",
          dominantGeometry: "angular",
          elementCount: 5,
          hasClosedShapes: true,
          repeatedMarks: true,
          typeCounts: {
            arrow: 0,
            diamond: 2,
            ellipse: 0,
            freedraw: 0,
            line: 1,
            rectangle: 2,
            text: 0,
          },
        },
        userText: "갈색 캔버스 질감의 명품 로고 같아요",
      },
      [
        {
          confidence: 0.88,
          id: "candidate-1",
          label: "루이비통",
          query: "루이비통 로고 모노그램",
          queryVariants: ["루이비통", "루이비통 로고 모노그램"],
          rationale: "pattern match",
          source: "heuristic",
        },
      ],
    );

    expect(result.searchPrompts[0]).toContain("루이비통");
    expect(result.searchPrompts.some((prompt) => prompt.includes("가로형"))).toBeTruthy();
    expect(result.promptReasoning.some((item) => item.includes("디테일 단어"))).toBeTruthy();
    expect(result.regenerationPrompt).toContain("갈색");
  });
});
