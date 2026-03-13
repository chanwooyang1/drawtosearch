import { describe, expect, it } from "vitest";

import { buildPolicyBucket, createPolicyContext, extractColorTokens } from "./context";

describe("policy context", () => {
  it("extracts normalized color tokens in a stable order", () => {
    expect(
      extractColorTokens("흰색 파란색 초록색 파란색 yellow"),
    ).toEqual(["white", "blue", "green", "yellow"]);
  });

  it("builds deterministic context buckets from search input and result evidence", () => {
    const context = createPolicyContext({
      input: {
        hasDrawing: true,
        locale: "ko-KR",
        sketchDataUrl: null,
        sketchSummary: {
          aspectBucket: "square",
          complexity: "medium",
          dominantGeometry: "round",
          elementCount: 5,
          hasClosedShapes: true,
          repeatedMarks: false,
          typeCounts: {
            arrow: 0,
            diamond: 0,
            ellipse: 2,
            freedraw: 1,
            line: 0,
            rectangle: 2,
            text: 0,
          },
        },
        userText: "원격 지원 서비스 화면에서 봤고 흰색 파란색 로고 같아요",
      },
      results: [
        {
          id: "1",
          link: "https://example.com/1",
          query: "teamviewer logo",
          source: "mock",
          thumbnailUrl: "data:image/png;base64,ZmFrZQ==",
          title: "TeamViewer logo official",
        },
        {
          id: "2",
          link: "https://example.com/2",
          query: "teamviewer icon",
          source: "mock",
          thumbnailUrl: "data:image/png;base64,ZmFrZQ==",
          title: "TeamViewer remote support icon",
        },
      ],
      visionCandidates: [
        {
          confidence: 0.6,
          id: "vision-1",
          label: "TeamViewer-like mark",
          query: "teamviewer mark",
          queryVariants: ["teamviewer mark"],
          rationale: "vision hint",
          source: "vision",
        },
      ],
    });

    expect(context).toMatchObject({
      aspectBucket: "square",
      colorHintCount: "2",
      colorTokens: ["white", "blue"],
      evidenceStrength: "high",
      hasDrawing: true,
      hasTextHint: true,
      intentSurface: "service_icon",
      resultCoherence: "mixed",
      resultEntityRepeatCount: 2,
      shapeFamily: "round",
      visionLabelCount: 1,
    });
    expect(buildPolicyBucket(context)).toBe("service_icon|high|round|2|named");
  });
});

