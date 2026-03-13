import { describe, expect, it } from "vitest";

import { buildPromptPlan } from "./prompt";

describe("prompt plan", () => {
  it("creates evidence-first prompts without hard-coded brand assumptions", () => {
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
        userText: "흰색과 파란색이 보이는 원형 마크 같아요",
      },
      [
        {
          confidence: 0.68,
          id: "candidate-1",
          label: "앱 아이콘 또는 서비스 심볼",
          query: "앱 아이콘 또는 서비스 로고 reference",
          queryVariants: ["앱 아이콘 또는 서비스 심볼", "서비스 로고 reference"],
          rationale: "generic context",
          source: "heuristic",
        },
      ],
    );

    expect(result.searchPrompts.some((prompt) => prompt.includes("실제 로고 또는 아이콘"))).toBeTruthy();
    expect(result.searchPrompts.join(" ")).not.toMatch(/크롬|chrome|edge|firefox/i);
    expect(result.searchPrompts.some((prompt) => prompt.includes("가로형"))).toBeTruthy();
    expect(result.promptReasoning.some((item) => item.includes("디테일 단어"))).toBeTruthy();
    expect(result.promptReasoning.some((item) => item.includes("특정 브랜드를 미리 가정하지 않고"))).toBeTruthy();
    expect(result.regenerationPrompt).toContain("흰색");
  });
});
