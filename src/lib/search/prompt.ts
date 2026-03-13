import { buildSketchDescriptors } from "./sketch";
import { dedupeStrings, tokenizeSearchText } from "./query";
import type { EntityCandidate, SearchInput } from "./types";

type PromptPlan = {
  promptReasoning: string[];
  regenerationPrompt: string | null;
  searchPrompts: string[];
};

function isBrowserIconContext(input: SearchInput, topCandidate?: EntityCandidate) {
  const combined = `${input.userText} ${topCandidate?.label ?? ""} ${topCandidate?.query ?? ""}`.toLowerCase();
  return [
    "브라우저",
    "browser",
    "인터넷",
    "web",
    "chrome",
    "크롬",
    "edge",
    "엣지",
    "firefox",
    "파이어폭스",
    "safari",
    "사파리",
  ].some((token) => combined.includes(token));
}

function isIconContext(input: SearchInput, topCandidate?: EntityCandidate) {
  const combined = `${input.userText} ${topCandidate?.label ?? ""} ${topCandidate?.query ?? ""}`.toLowerCase();
  return [
    "아이콘",
    "icon",
    "로고",
    "logo",
    "마크",
    "mark",
    "앱",
    "app",
  ].some((token) => combined.includes(token));
}

function compactPhrase(parts: Array<string | null | undefined>) {
  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDetailTokens(input: SearchInput, candidates: EntityCandidate[]) {
  const anchorCandidate = candidates[0];
  const reserved = new Set(
    tokenizeSearchText(`${anchorCandidate?.label ?? ""} ${anchorCandidate?.query ?? ""}`),
  );

  return tokenizeSearchText(input.userText)
    .filter((token) => !reserved.has(token))
    .slice(0, 5);
}

export function buildPromptPlan(
  input: SearchInput,
  candidates: EntityCandidate[],
): PromptPlan {
  const topCandidate = candidates[0];
  const sketchDescriptors = input.sketchSummary
    ? buildSketchDescriptors(input.sketchSummary)
    : [];
  const detailTokens = extractDetailTokens(input, candidates);
  const detailPhrase = detailTokens.join(" ");
  const sketchPhrase = sketchDescriptors.join(" ");
  const browserIconContext = isBrowserIconContext(input, topCandidate);
  const iconContext = browserIconContext || isIconContext(input, topCandidate);

  const searchPrompts = dedupeStrings([
    browserIconContext ? `${topCandidate?.label ?? ""} 브라우저 로고 아이콘` : "",
    browserIconContext ? `${topCandidate?.label ?? ""} 앱 아이콘` : "",
    browserIconContext ? `${topCandidate?.label ?? ""} logo icon` : "",
    !browserIconContext && iconContext ? `${topCandidate?.label ?? ""} 로고 아이콘` : "",
    compactPhrase([
      topCandidate?.query,
      detailPhrase,
      sketchPhrase,
      "이미지",
    ]),
    compactPhrase([
      topCandidate?.label,
      detailPhrase,
      "제품 사진",
    ]),
    compactPhrase([
      input.userText,
      sketchPhrase,
      "유사 이미지",
    ]),
    compactPhrase([
      detailPhrase,
      sketchPhrase,
      "브랜드 로고 이미지",
    ]),
    compactPhrase([
      topCandidate?.label,
      sketchPhrase,
      "reference image",
    ]),
  ]).slice(0, 6);

  const regenerationPrompt = topCandidate
    ? compactPhrase([
        `${topCandidate.label} 관련 가능성이 있는 대상.`,
        input.userText ? `사용자 힌트: ${input.userText}.` : "",
        detailPhrase ? `핵심 디테일: ${detailPhrase}.` : "",
        sketchPhrase ? `스케치 구조: ${sketchPhrase}.` : "",
        "검색용 참조 이미지를 만든다고 가정하고, 배경은 단순하고 형태와 패턴이 분명한 제품 사진 스타일.",
      ])
    : input.userText
      ? compactPhrase([
          `사용자 힌트: ${input.userText}.`,
          sketchPhrase ? `스케치 구조: ${sketchPhrase}.` : "",
          "형태와 재질이 잘 보이는 참조 이미지 스타일.",
        ])
      : null;

  const promptReasoning = dedupeStrings([
    detailPhrase
      ? `사용자 설명에서 ${detailPhrase} 같은 디테일 단어를 추출해 검색 프롬프트를 확장했습니다.`
      : "",
    sketchPhrase
      ? `스케치 구조를 ${sketchPhrase} 표현으로 바꿔 텍스트 검색어에 섞었습니다.`
      : "",
    topCandidate?.label
      ? `${topCandidate.label} 후보를 중심으로 텍스트 검색 프롬프트를 조합했습니다.`
      : "",
  ]);

  return {
    promptReasoning,
    regenerationPrompt,
    searchPrompts: searchPrompts.length ? searchPrompts : ["스케치 유사 이미지 검색"],
  };
}
