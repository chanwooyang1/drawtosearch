import { tokenizeSearchText } from "@/lib/search/query";
import type { EntityCandidate, SearchImageResult, SearchInput } from "@/lib/search/types";

import type {
  ColorHintCount,
  EvidenceStrength,
  IntentSurface,
  ResultCoherence,
  SearchPolicyContext,
  ShapeFamily,
} from "./types";

const COLOR_ALIASES: Record<string, string> = {
  black: "black",
  blue: "blue",
  brown: "brown",
  gold: "gold",
  gray: "gray",
  green: "green",
  grey: "gray",
  navy: "navy",
  orange: "orange",
  pink: "pink",
  purple: "purple",
  red: "red",
  silver: "silver",
  white: "white",
  yellow: "yellow",
  검정: "black",
  검은색: "black",
  골드: "gold",
  그레이: "gray",
  남색: "navy",
  노란색: "yellow",
  노랑: "yellow",
  보라: "purple",
  보라색: "purple",
  분홍: "pink",
  분홍색: "pink",
  빨간색: "red",
  빨강: "red",
  브라운: "brown",
  파란색: "blue",
  파랑: "blue",
  하늘색: "blue",
  하얀색: "white",
  하양: "white",
  흑백: "black",
  흰색: "white",
  회색: "gray",
  황금: "gold",
  초록: "green",
  초록색: "green",
  초록빛: "green",
  주황: "orange",
  주황색: "orange",
  청색: "blue",
  청록: "green",
};

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

const PRODUCT_TOKENS = new Set([
  "bag",
  "brand",
  "package",
  "packaging",
  "product",
  "shoe",
  "브랜드",
  "상품",
  "제품",
  "포장",
  "패키지",
]);

const OBJECT_TOKENS = new Set([
  "device",
  "object",
  "tool",
  "물건",
  "사물",
  "실물",
  "장비",
  "도구",
]);

const GENERIC_NAME_TOKENS = new Set([
  ...SERVICE_TOKENS,
  ...LOGO_TOKENS,
  ...PRODUCT_TOKENS,
  ...OBJECT_TOKENS,
  "actual",
  "badge",
  "blue",
  "green",
  "image",
  "logo",
  "mark",
  "object",
  "official",
  "product",
  "reference",
  "service",
  "symbol",
  "white",
  "yellow",
  "각형",
  "로고",
  "마크",
  "모양",
  "반복",
  "사물",
  "서비스",
  "실제",
  "심볼",
  "아이콘",
  "원형",
  "제품",
  "정방형",
  "직선",
  "형태",
  "화면",
]);

const RESULT_STOPWORDS = new Set([
  "official",
  "logo",
  "icon",
  "image",
  "images",
  "photo",
  "photos",
  "brand",
  "product",
  "store",
  "news",
  "review",
  "사진",
  "이미지",
  "브랜드",
  "로고",
  "아이콘",
  "제품",
  "상품",
  "공식",
]);

function uniq<T>(values: T[]) {
  return Array.from(new Set(values));
}

export function extractColorTokens(text: string) {
  const aliases = Object.entries(COLOR_ALIASES).sort(
    (left, right) => right[0].length - left[0].length,
  );

  return uniq(
    tokenizeSearchText(text)
      .map((token) => {
        const direct = COLOR_ALIASES[token];

        if (direct) {
          return direct;
        }

        const partial = aliases.find(([alias]) => token.startsWith(alias));
        return partial?.[1];
      })
      .filter((value): value is string => Boolean(value)),
  ).slice(0, 4);
}

function toColorHintCount(length: number): ColorHintCount {
  if (length <= 0) {
    return "0";
  }

  if (length === 1) {
    return "1";
  }

  if (length === 2) {
    return "2";
  }

  return "3_plus";
}

function detectIntentSurface(tokens: string[]): IntentSurface {
  const hasService = tokens.some((token) => SERVICE_TOKENS.has(token));
  const hasLogo = tokens.some((token) => LOGO_TOKENS.has(token));
  const hasProduct = tokens.some((token) => PRODUCT_TOKENS.has(token));
  const hasObject = tokens.some((token) => OBJECT_TOKENS.has(token));

  if (hasService) {
    return "service_icon";
  }

  if (hasLogo) {
    return "logo_symbol";
  }

  if (hasProduct) {
    return "product_visual";
  }

  if (hasObject) {
    return "generic_object";
  }

  return "unknown";
}

function detectShapeFamily(input: SearchInput): ShapeFamily {
  const geometry = input.sketchSummary?.dominantGeometry;

  if (geometry === "round") {
    return "round";
  }

  if (geometry === "angular") {
    return "angular";
  }

  if (geometry === "mixed" || geometry === "organic") {
    return "mixed";
  }

  return "unknown";
}

function detectHasExplicitName(tokens: string[]) {
  return tokens.some((token) => token.length >= 2 && !GENERIC_NAME_TOKENS.has(token));
}

function detectEvidenceStrength(input: {
  colorTokens: string[];
  hasDrawing: boolean;
  hasExplicitName: boolean;
  hasTextHint: boolean;
  resultEntityRepeatCount: number;
  shapeFamily: ShapeFamily;
  visionLabelCount: number;
}) : EvidenceStrength {
  let score = 0;

  if (input.hasTextHint) {
    score += 1;
  }

  if (input.hasDrawing) {
    score += 1;
  }

  if (input.colorTokens.length) {
    score += 1;
  }

  if (input.shapeFamily !== "unknown") {
    score += 1;
  }

  if (input.visionLabelCount > 0) {
    score += 1;
  }

  if (input.hasExplicitName) {
    score += 2;
  }

  if (input.resultEntityRepeatCount >= 2) {
    score += 1;
  }

  if (score <= 2) {
    return "low";
  }

  if (score <= 4) {
    return "medium";
  }

  return "high";
}

function extractRepeatedResultTokens(results: SearchImageResult[]) {
  const counts = new Map<string, number>();

  for (const result of results) {
    for (const token of tokenizeSearchText(result.title)) {
      if (token.length < 2 || RESULT_STOPWORDS.has(token)) {
        continue;
      }

      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  const repeated = Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1]);

  return {
    maxRepeatCount: repeated[0]?.[1] ?? 0,
    repeatedTokens: repeated.map(([token]) => token).slice(0, 6),
  };
}

function detectResultCoherence(results: SearchImageResult[]): {
  coherence: ResultCoherence;
  entityRepeatCount: number;
} {
  if (!results.length) {
    return {
      coherence: "none",
      entityRepeatCount: 0,
    };
  }

  const repeated = extractRepeatedResultTokens(results);

  if (repeated.maxRepeatCount >= 3) {
    return {
      coherence: "coherent",
      entityRepeatCount: repeated.maxRepeatCount,
    };
  }

  if (repeated.maxRepeatCount >= 2) {
    return {
      coherence: "mixed",
      entityRepeatCount: repeated.maxRepeatCount,
    };
  }

  return {
    coherence: "noisy",
    entityRepeatCount: 0,
  };
}

export function createPolicyContext(input: {
  input: SearchInput;
  results?: SearchImageResult[];
  visionCandidates?: EntityCandidate[];
}) : SearchPolicyContext {
  const tokens = tokenizeSearchText(input.input.userText);
  const colorTokens = extractColorTokens(input.input.userText);
  const resultSignals = detectResultCoherence(input.results ?? []);
  const shapeFamily = detectShapeFamily(input.input);
  const hasTextHint = tokens.length > 0;
  const hasExplicitName = detectHasExplicitName(tokens);
  const visionLabelCount = input.visionCandidates?.length ?? 0;

  return {
    aspectBucket: input.input.sketchSummary?.aspectBucket ?? "unknown",
    colorHintCount: toColorHintCount(colorTokens.length),
    colorTokens,
    evidenceStrength: detectEvidenceStrength({
      colorTokens,
      hasDrawing: input.input.hasDrawing,
      hasExplicitName,
      hasTextHint,
      resultEntityRepeatCount: resultSignals.entityRepeatCount,
      shapeFamily,
      visionLabelCount,
    }),
    hasDrawing: input.input.hasDrawing,
    hasExplicitName,
    hasTextHint,
    intentSurface: detectIntentSurface(tokens),
    resultCoherence: resultSignals.coherence,
    resultEntityRepeatCount: resultSignals.entityRepeatCount,
    shapeFamily,
    visionLabelCount,
  };
}

export function buildPolicyBucket(context: SearchPolicyContext) {
  return [
    context.intentSurface,
    context.evidenceStrength,
    context.shapeFamily,
    context.colorHintCount,
    context.hasExplicitName ? "named" : "unnamed",
  ].join("|");
}
