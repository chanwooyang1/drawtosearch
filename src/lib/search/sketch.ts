import type {
  SketchAspectBucket,
  SketchComplexity,
  SketchElementType,
  SketchGeometry,
  SketchSummary,
} from "./types";

const TRACKED_TYPES = [
  "arrow",
  "diamond",
  "ellipse",
  "freedraw",
  "line",
  "rectangle",
  "text",
] as const satisfies readonly SketchElementType[];

type SketchElementLike = {
  height: number;
  type: string;
  width: number;
  x: number;
  y: number;
};

function createEmptyTypeCounts() {
  return {
    arrow: 0,
    diamond: 0,
    ellipse: 0,
    freedraw: 0,
    line: 0,
    rectangle: 0,
    text: 0,
  } satisfies Record<SketchElementType, number>;
}

function clampAspectBucket(aspectRatio: number): SketchAspectBucket {
  if (aspectRatio >= 1.35) {
    return "wide";
  }

  if (aspectRatio <= 0.74) {
    return "tall";
  }

  return "square";
}

function pickDominantGeometry(
  typeCounts: Record<SketchElementType, number>,
): SketchGeometry {
  const geometryScores = {
    angular: typeCounts.arrow + typeCounts.rectangle + typeCounts.diamond,
    organic: typeCounts.freedraw * 1.3 + typeCounts.line,
    round: typeCounts.ellipse * 1.35,
  } as const;

  const entries = Object.entries(geometryScores).sort((left, right) => right[1] - left[1]);
  const [winner, topScore] = entries[0] ?? ["round", 0];
  const secondScore = entries[1]?.[1] ?? 0;

  if (topScore <= 0 || topScore - secondScore < 0.6) {
    return "mixed";
  }

  return winner as SketchGeometry;
}

function pickComplexity(
  elementCount: number,
  repeatedMarks: boolean,
): SketchComplexity {
  if (elementCount <= 2) {
    return "minimal";
  }

  if (elementCount >= 7 || repeatedMarks) {
    return "dense";
  }

  return "medium";
}

function coefficientOfVariation(values: number[]) {
  if (values.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

  if (mean === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance) / mean;
}

export function summarizeSketchElements(
  elements: readonly SketchElementLike[],
): SketchSummary | null {
  const drawableElements = elements.filter((element) => TRACKED_TYPES.includes(element.type as SketchElementType));

  if (!drawableElements.length) {
    return null;
  }

  const typeCounts = createEmptyTypeCounts();
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const element of drawableElements) {
    if (TRACKED_TYPES.includes(element.type as SketchElementType)) {
      typeCounts[element.type as SketchElementType] += 1;
    }

    const width = Math.max(Math.abs(element.width), 1);
    const height = Math.max(Math.abs(element.height), 1);
    const x = Math.min(element.x, element.x + element.width);
    const y = Math.min(element.y, element.y + element.height);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  const boundsWidth = Math.max(maxX - minX, 1);
  const boundsHeight = Math.max(maxY - minY, 1);
  const boundsArea = Math.max(boundsWidth * boundsHeight, 1);
  const normalizedAreas = drawableElements
    .map((element) => {
      const width = Math.max(Math.abs(element.width), 1);
      const height = Math.max(Math.abs(element.height), 1);
      return (width * height) / boundsArea;
    })
    .filter((value) => value >= 0.004 && value <= 0.35);

  const repeatedClosedShapes =
    typeCounts.rectangle + typeCounts.diamond + typeCounts.ellipse >= 4;
  const repeatedMarks =
    repeatedClosedShapes ||
    (normalizedAreas.length >= 4 && coefficientOfVariation(normalizedAreas) < 0.75);

  return {
    aspectBucket: clampAspectBucket(boundsWidth / boundsHeight),
    complexity: pickComplexity(drawableElements.length, repeatedMarks),
    dominantGeometry: pickDominantGeometry(typeCounts),
    elementCount: drawableElements.length,
    hasClosedShapes: typeCounts.rectangle + typeCounts.diamond + typeCounts.ellipse > 0,
    repeatedMarks,
    typeCounts,
  };
}

export function buildSketchDescriptors(summary: SketchSummary): string[] {
  const descriptors: string[] = [];

  if (summary.repeatedMarks) {
    descriptors.push("반복 패턴");
  }

  if (summary.complexity === "minimal") {
    descriptors.push("단순 심볼");
  } else if (summary.complexity === "dense") {
    descriptors.push("복합 구도");
  }

  if (summary.aspectBucket === "wide") {
    descriptors.push("가로형");
  } else if (summary.aspectBucket === "tall") {
    descriptors.push("세로형");
  } else {
    descriptors.push("정방형");
  }

  if (summary.dominantGeometry === "round") {
    descriptors.push("원형");
  } else if (summary.dominantGeometry === "angular") {
    descriptors.push("기하학");
  } else if (summary.dominantGeometry === "organic") {
    descriptors.push("손그림 윤곽");
  }

  if (summary.hasClosedShapes && !descriptors.includes("기하학")) {
    descriptors.push("폐곡선 형태");
  }

  return descriptors;
}
