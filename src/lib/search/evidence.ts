import { extractColorTokens } from "@/lib/policy/context";

import { tokenizeSearchText } from "./query";
import { buildSketchDescriptors } from "./sketch";
import type {
  EntityCandidate,
  EvidenceBundle,
  SearchClarificationAnswer,
  SearchInput,
} from "./types";

const SERVICE_TOKENS = new Set([
  "app",
  "browser",
  "icon",
  "program",
  "service",
  "software",
  "web",
  "사이트",
  "서비스",
  "소프트웨어",
  "앱",
  "웹",
  "인터넷",
  "프로그램",
  "브라우저",
  "화면",
]);

const PRODUCT_TOKENS = new Set([
  "bag",
  "brand",
  "fashion",
  "luxury",
  "monogram",
  "package",
  "pattern",
  "product",
  "shoe",
  "가방",
  "럭셔리",
  "명품",
  "모노그램",
  "브랜드",
  "상품",
  "제품",
  "패턴",
  "포장",
]);

const OBJECT_TOKENS = new Set([
  "cup",
  "device",
  "object",
  "remote",
  "tool",
  "controller",
  "device",
  "도구",
  "리모컨",
  "물건",
  "사물",
  "실물",
  "장비",
]);

const LOGO_TOKENS = new Set([
  "badge",
  "emblem",
  "icon",
  "logo",
  "mark",
  "symbol",
  "로고",
  "마크",
  "문양",
  "배지",
  "심볼",
  "엠블럼",
  "아이콘",
]);

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractVisionTokens(candidates: EntityCandidate[]) {
  return dedupe(
    candidates.flatMap((candidate) => {
      const uppercase = candidate.label.match(/\b[A-Z0-9][A-Z0-9-]{1,}\b/g) ?? [];
      const lexical = tokenizeSearchText(`${candidate.label} ${candidate.query}`).slice(0, 3);
      return [...uppercase, ...lexical];
    }),
  ).slice(0, 6);
}

function mapClarificationTokens(answers: SearchClarificationAnswer[] | null | undefined) {
  if (!answers?.length) {
    return [];
  }

  return dedupe(
    answers.flatMap(({ answer, questionId }) => {
      const base = tokenizeSearchText(answer);

      switch (questionId) {
        case "app_icon_simple":
          return answer.includes("앱") || answer.includes("단순")
            ? [...base, "service", "icon", "simple"]
            : [...base, "logo", "symbol"];
        case "color_palette":
          return answer.includes("적은 색") || answer.includes("파란색") || answer.includes("흰색")
            ? [...base, "blue", "white", "limited palette", "icon"]
            : [...base, "multicolor"];
        case "directional_shape":
          return answer.includes("방향성") || answer.includes("화살표") || answer.includes("삼각형")
            ? [...base, "arrows", "directional", "remote support"]
            : [...base, "not arrows"];
        case "geometry_round":
          return answer.includes("원형") || answer.includes("배지") || answer.includes("감싸")
            ? [...base, "round", "circle", "closed shapes"]
            : [...base, "angular", "open shape"];
        case "arrows_mark":
          return answer.includes("네")
            ? [...base, "arrows", "remote support", "service"]
            : [...base, "not arrows"];
        case "text_in_mark":
          return answer.includes("네")
            ? [...base, "text mark", "wordmark"]
            : [...base, "no text"];
        case "pattern_repeat":
          return answer.includes("네")
            ? [...base, "pattern", "repeated marks", "product"]
            : [...base, "not pattern"];
        default:
          return base;
      }
    }),
  ).slice(0, 8);
}

function buildShapeTokens(input: SearchInput) {
  const summary = input.sketchSummary;
  const descriptors = summary ? buildSketchDescriptors(summary) : [];
  const tokens = [...descriptors];

  if (!summary) {
    return tokens;
  }

  if (summary.typeCounts.arrow > 0) {
    tokens.push("arrows");
  }

  if (summary.typeCounts.text > 0) {
    tokens.push("text-like marks");
  }

  if (summary.hasClosedShapes) {
    tokens.push("closed shapes");
  }

  if (summary.repeatedMarks) {
    tokens.push("repeated marks");
  }

  if (summary.elementCount <= 2) {
    tokens.push("simple icon");
  }

  return dedupe(tokens);
}

function extractContextTokens(input: SearchInput, clarificationTokens: string[]) {
  const tokens = tokenizeSearchText(
    `${input.userText} ${clarificationTokens.join(" ")}`,
  );
  const contextTokens = [
    ...tokens.filter((token) => SERVICE_TOKENS.has(token)),
    ...tokens.filter((token) => PRODUCT_TOKENS.has(token)),
    ...tokens.filter((token) => OBJECT_TOKENS.has(token)),
    ...tokens.filter((token) => LOGO_TOKENS.has(token)),
  ];

  if (!contextTokens.length) {
    if (input.sketchSummary?.repeatedMarks) {
      contextTokens.push("pattern");
    } else if (input.hasDrawing) {
      contextTokens.push("object");
    }
  }

  return dedupe(contextTokens);
}

export function buildEvidenceBundle(input: {
  input: SearchInput;
  visionCandidates: EntityCandidate[];
}): EvidenceBundle {
  const clarificationTokens = mapClarificationTokens(input.input.clarificationAnswers);
  const colorTokens = dedupe(
    extractColorTokens(`${input.input.userText} ${clarificationTokens.join(" ")}`),
  );
  const shapeTokens = buildShapeTokens(input.input);
  const contextTokens = extractContextTokens(input.input, clarificationTokens);
  const ocrTokens = extractVisionTokens(input.visionCandidates);
  const rasterDescriptorText = dedupe([
    ...shapeTokens,
    ...colorTokens,
    ...ocrTokens,
    input.input.hasDrawing ? "rough raster" : "",
  ]).join(" ");
  const binaryDescriptorText = dedupe([
    ...shapeTokens,
    input.input.sketchSummary?.dominantGeometry ?? "",
    input.input.sketchSummary?.repeatedMarks ? "repeated edges" : "",
    input.input.sketchSummary?.typeCounts.text ? "text-like marks" : "",
  ]).join(" ");
  const sketchDescriptorText = dedupe([
    ...shapeTokens,
    ...ocrTokens,
    ...clarificationTokens,
  ]).join(" ");
  const textDescriptorText = dedupe([
    input.input.userText,
    ...colorTokens,
    ...contextTokens,
    ...clarificationTokens,
    ...ocrTokens,
  ]).join(" ");

  return {
    binaryDescriptorText,
    clarificationTokens,
    colorTokens,
    contextTokens,
    ocrTokens,
    rasterDescriptorText,
    shapeTokens,
    sketchDescriptorText,
    textDescriptorText,
  };
}
