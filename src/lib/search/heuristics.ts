import { randomUUID } from "crypto";

import { buildQueryVariants, dedupeStrings, normalizeSearchText, scoreTokenOverlap } from "./query";
import { buildSketchDescriptors } from "./sketch";
import type { EntityCandidate, InterpretationResult, SearchInput } from "./types";

type PatternSeed = {
  hints: string[];
  label: string;
  query?: string;
  rationale: string;
  score: number;
};

const CURATED_PATTERNS: PatternSeed[] = [
  {
    hints: [
      "lv",
      "엘브이",
      "모노그램",
      "갈색",
      "명품",
      "반복 무늬",
      "브랜드 로고",
      "꽃무늬",
      "luxury logo",
    ],
    label: "루이비통",
    query: "루이비통 로고 모노그램",
    rationale: "모노그램, 명품, 갈색 패턴 힌트가 루이비통 계열을 강하게 시사합니다.",
    score: 0.82,
  },
  {
    hints: ["두 개의 c", "더블 c", "샤넬", "black luxury"],
    label: "샤넬",
    query: "샤넬 로고",
    rationale: "겹쳐진 문자 로고와 럭셔리 맥락이 샤넬 후보와 가깝습니다.",
    score: 0.76,
  },
  {
    hints: ["swoosh", "체크 표시", "나이키", "운동 브랜드"],
    label: "나이키",
    query: "나이키 로고",
    rationale: "스우시 형태나 스포츠 브랜드 설명이 나이키와 잘 맞습니다.",
    score: 0.79,
  },
  {
    hints: ["세 줄", "아디다스", "삼선", "sports brand"],
    label: "아디다스",
    query: "아디다스 로고",
    rationale: "삼선이나 세 잎 형태 설명이 아디다스 후보를 강화합니다.",
    score: 0.75,
  },
  {
    hints: ["운동화", "스니커즈", "shoe", "sneaker"],
    label: "스니커즈",
    query: "운동화 제품 이미지",
    rationale: "형태가 브랜드보다 제품군 인지에 가깝기 때문에 스니커즈 범주를 우선 제안합니다.",
    score: 0.67,
  },
  {
    hints: ["가방", "핸드백", "bag", "tote"],
    label: "가방",
    query: "가방 제품 이미지",
    rationale: "실루엣이 액세서리 제품 탐색에 더 적합해 보입니다.",
    score: 0.64,
  },
  {
    hints: ["컵", "머그", "cup", "mug"],
    label: "컵",
    query: "컵 제품 이미지",
    rationale: "손잡이나 원통형 실루엣 설명이 컵 범주와 맞닿아 있습니다.",
    score: 0.58,
  },
  {
    hints: ["고양이", "cat", "귀", "수염"],
    label: "고양이",
    query: "고양이 사진",
    rationale: "귀와 얼굴 윤곽 힌트가 동물 범주 중 고양이와 가깝습니다.",
    score: 0.6,
  },
];

function buildFreeformCandidate(userText: string) {
  const normalized = normalizeSearchText(userText);

  if (!normalized) {
    return null;
  }

  const label = userText.trim().slice(0, 40);
  const query = userText.trim();

  return {
    confidence: 0.55,
    id: randomUUID(),
    label,
    query,
    queryVariants: buildQueryVariants({ label, query, userText }),
    rationale:
      "명시적으로 적어준 설명이 가장 강한 단서라서 텍스트 자체를 첫 검색어로 사용합니다.",
    source: "heuristic" as const,
  };
}

function buildPatternCandidates(userText: string) {
  const normalized = normalizeSearchText(userText);

  return CURATED_PATTERNS.map((pattern) => {
    const overlap = Math.max(
      ...pattern.hints.map((hint) => scoreTokenOverlap(normalized, hint)),
      0,
    );

    if (overlap < 0.34 && !pattern.hints.some((hint) => normalized.includes(hint))) {
      return null;
    }

    const confidence = Math.min(0.92, pattern.score + overlap * 0.12);
    return {
      confidence,
      id: randomUUID(),
      label: pattern.label,
      query: pattern.query ?? pattern.label,
      queryVariants: buildQueryVariants({
        label: pattern.label,
        query: pattern.query ?? pattern.label,
        userText,
      }),
      rationale: pattern.rationale,
      source: "heuristic" as const,
    };
  }).filter(Boolean) as EntityCandidate[];
}

function hasPatternFriendlyText(userText: string) {
  const normalized = normalizeSearchText(userText);
  return [
    "명품",
    "브랜드",
    "로고",
    "패턴",
    "모노그램",
    "가방",
    "지갑",
    "luxury",
    "logo",
    "brand",
  ].some((token) => normalized.includes(token));
}

function buildSketchCandidates(input: SearchInput) {
  if (!input.hasDrawing) {
    return [];
  }

  const userText = input.userText.trim();
  const baseConfidence = userText ? 0.56 : 0.63;
  const sketchSummary = input.sketchSummary;

  if (!sketchSummary) {
    const label = userText ? "스케치와 설명 조합" : "스케치 윤곽 기반 검색";
    const query = userText ? `${userText} 관련 이미지` : "손그림으로 찾는 물체 이미지";

    return [
      {
        confidence: userText ? 0.51 : 0.46,
        id: randomUUID(),
        label,
        query,
        queryVariants: buildQueryVariants({ label, query, userText: input.userText }),
        rationale:
          "손그림이 있으므로 실루엣 자체를 하나의 힌트로 간주해 범용 검색어를 추가합니다.",
        source: "sketch" as const,
      } satisfies EntityCandidate,
    ];
  }

  const descriptors = buildSketchDescriptors(sketchSummary);
  const candidates: EntityCandidate[] = [];

  const addCandidate = (
    label: string,
    query: string,
    rationale: string,
    confidenceOffset = 0,
  ) => {
    candidates.push({
      confidence: Math.min(0.76, baseConfidence + confidenceOffset),
      id: randomUUID(),
      label,
      query,
      queryVariants: buildQueryVariants({ label, query, userText: input.userText }),
      rationale,
      source: "sketch" as const,
    });
  };

  if (sketchSummary.repeatedMarks) {
    addCandidate(
      hasPatternFriendlyText(userText)
        ? "반복 패턴 또는 모노그램"
        : "반복 패턴 심볼",
      userText ? `${userText} 반복 패턴 이미지` : "반복 패턴 로고 이미지",
      "손그림에 비슷한 마크가 여러 번 반복되어 보여 패턴이나 모노그램 계열 검색어를 추가했습니다.",
      userText ? 0.08 : 0.04,
    );
  }

  if (sketchSummary.dominantGeometry === "round") {
    addCandidate(
      "원형 심볼 또는 배지형 로고",
      userText ? `${userText} 원형 로고 이미지` : "원형 로고 이미지",
      "스케치에서 둥근 폐곡선 비중이 높아 원형 심볼이나 배지형 로고 검색어를 확장했습니다.",
      0.04,
    );
  }

  if (sketchSummary.dominantGeometry === "angular") {
    addCandidate(
      "기하학 심볼 또는 로고",
      userText ? `${userText} 기하학 로고 이미지` : "기하학 로고 이미지",
      "직선과 각진 도형 비중이 높아 기하학 심볼 계열 검색어를 함께 시도합니다.",
      0.03,
    );
  }

  if (sketchSummary.aspectBucket === "wide") {
    addCandidate(
      "가로형 로고 또는 워드마크",
      userText ? `${userText} 가로형 로고 이미지` : "가로형 로고 이미지",
      "스케치의 전체 비율이 가로로 넓어 워드마크나 가로형 로고 가능성을 함께 탐색합니다.",
      0.02,
    );
  }

  if (sketchSummary.aspectBucket === "tall") {
    addCandidate(
      "세로형 심볼 또는 패키지",
      userText ? `${userText} 세로형 심볼 이미지` : "세로형 심볼 이미지",
      "세로로 긴 비율이 두드러져 세로형 심볼이나 패키지 형태 검색어를 추가했습니다.",
      0.02,
    );
  }

  if (!candidates.length) {
    addCandidate(
      descriptors.join(" ") || "스케치 기반 시각 후보",
      userText ? `${userText} 스케치 유사 이미지` : "손그림 유사 이미지 검색",
      "손그림 구조를 요약한 특징을 일반 검색어에 섞어 비슷한 이미지를 찾습니다.",
      0,
    );
  }

  return dedupeByLabel(candidates).slice(0, 3);
}

export function interpretWithHeuristics(input: SearchInput): InterpretationResult {
  const candidates = dedupeByLabel([
    buildFreeformCandidate(input.userText),
    ...buildPatternCandidates(input.userText),
    ...buildSketchCandidates(input),
  ].filter(Boolean) as EntityCandidate[]);

  const fallbackCandidate =
    candidates[0] ??
    ({
      confidence: 0.35,
      id: randomUUID(),
      label: "이미지 후보",
      query: "유사 이미지 검색",
      queryVariants: ["유사 이미지 검색", "스케치 이미지 검색"],
      rationale: "입력이 적어서 범용 이미지 탐색 후보를 기본값으로 사용합니다.",
      source: "heuristic" as const,
    } satisfies EntityCandidate);

  const nextCandidates = [fallbackCandidate, ...candidates]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  const reasoning = dedupeStrings([
    input.userText.trim()
      ? "사용자 설명 텍스트를 1차 신호로 사용했습니다."
      : "",
    input.sketchSummary
      ? `스케치 구조 분석으로 ${buildSketchDescriptors(input.sketchSummary).join(", ")} 특징을 검색어에 반영했습니다.`
      : input.hasDrawing
        ? "스케치 존재 여부를 반영해 범용 실루엣 검색어를 추가했습니다."
        : "",
    nextCandidates[0]?.label
      ? `가장 먼저 ${nextCandidates[0].label} 후보를 검토합니다.`
      : "",
  ]);

  return {
    candidates: nextCandidates,
    reasoning,
  };
}

export function mergeCandidates(candidates: EntityCandidate[]) {
  return dedupeByLabel(candidates)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 6)
    .map((candidate, index) => ({
      ...candidate,
      confidence: Math.max(0.34, candidate.confidence - index * 0.02),
    }));
}

function dedupeByLabel(candidates: EntityCandidate[]) {
  const seen = new Map<string, EntityCandidate>();

  for (const candidate of candidates) {
    const key = normalizeSearchText(candidate.label || candidate.query);
    const existing = seen.get(key);

    if (!existing || candidate.confidence > existing.confidence) {
      seen.set(key, {
        ...candidate,
        queryVariants: dedupeStrings(candidate.queryVariants),
      });
    }
  }

  return Array.from(seen.values());
}
