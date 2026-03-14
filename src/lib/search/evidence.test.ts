import { describe, expect, it } from "vitest";

import { buildEvidenceBundle } from "./evidence";
import type { EntityCandidate, SearchInput } from "./types";

function createInput(): SearchInput {
  return {
    clarificationAnswers: [
      {
        answer: "네, 앱 아이콘처럼 단순했어요",
        questionId: "app_icon_simple",
      },
    ],
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
        arrow: 1,
        diamond: 0,
        ellipse: 1,
        freedraw: 0,
        line: 0,
        rectangle: 0,
        text: 1,
      },
    },
    userText: "흰색이랑 파란색이 보이는 앱 아이콘 같은 마크예요",
  };
}

function createVisionCandidates(): EntityCandidate[] {
  return [
    {
      confidence: 0.52,
      id: "vision-1",
      label: "TV",
      query: "TV logo mark",
      queryVariants: ["TV", "TV logo mark"],
      rationale: "OCR-like hint",
      source: "vision",
    },
  ];
}

describe("evidence bundle", () => {
  it("stabilizes raster, binary, and sketch descriptors from the same sketch input", () => {
    const evidence = buildEvidenceBundle({
      input: createInput(),
      visionCandidates: createVisionCandidates(),
    });

    expect(evidence.colorTokens).toEqual(["white", "blue"]);
    expect(evidence.shapeTokens).toEqual(
      expect.arrayContaining(["원형", "폐곡선 형태", "arrows", "text-like marks", "simple icon"]),
    );
    expect(evidence.clarificationTokens).toEqual(
      expect.arrayContaining(["service", "icon", "simple"]),
    );
    expect(evidence.ocrTokens).toEqual(expect.arrayContaining(["TV"]));
    expect(evidence.rasterDescriptorText).toContain("rough raster");
    expect(evidence.binaryDescriptorText).toContain("text-like marks");
    expect(evidence.sketchDescriptorText).toContain("simple");
    expect(evidence.textDescriptorText).toContain("white");
  });
});
