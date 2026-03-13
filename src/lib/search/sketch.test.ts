import { describe, expect, it } from "vitest";

import { buildSketchDescriptors, summarizeSketchElements } from "./sketch";

describe("sketch helpers", () => {
  it("summarizes repeated wide geometry from sketch elements", () => {
    const summary = summarizeSketchElements([
      { height: 64, type: "rectangle", width: 64, x: 0, y: 0 },
      { height: 64, type: "rectangle", width: 64, x: 84, y: 0 },
      { height: 64, type: "rectangle", width: 64, x: 168, y: 0 },
      { height: 64, type: "rectangle", width: 64, x: 252, y: 0 },
      { height: 24, type: "line", width: 300, x: 0, y: 90 },
    ]);

    expect(summary).toMatchObject({
      aspectBucket: "wide",
      dominantGeometry: "angular",
      repeatedMarks: true,
    });
  });

  it("builds human-friendly sketch descriptors", () => {
    const descriptors = buildSketchDescriptors({
      aspectBucket: "square",
      complexity: "minimal",
      dominantGeometry: "round",
      elementCount: 1,
      hasClosedShapes: true,
      repeatedMarks: false,
      typeCounts: {
        arrow: 0,
        diamond: 0,
        ellipse: 1,
        freedraw: 0,
        line: 0,
        rectangle: 0,
        text: 0,
      },
    });

    expect(descriptors).toEqual(
      expect.arrayContaining(["단순 심볼", "정방형", "원형", "폐곡선 형태"]),
    );
  });
});
