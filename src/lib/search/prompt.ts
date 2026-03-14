import { buildSketchDescriptors } from "./sketch";
import { dedupeStrings, tokenizeSearchText } from "./query";
import type { EntityCandidate, SearchInput } from "./types";

type PromptPlan = {
  promptReasoning: string[];
  regenerationPrompt: string | null;
  searchPrompts: string[];
};

function canAnchorPrompt(candidate?: EntityCandidate) {
  if (!candidate) {
    return false;
  }

  return candidate.source === "agent" || candidate.source === "vision";
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
  const clarificationText = (input.clarificationAnswers ?? [])
    .map((answer) => answer.answer)
    .join(" ");

  return tokenizeSearchText(`${input.userText} ${clarificationText}`)
    .filter((token) => !reserved.has(token))
    .slice(0, 5);
}

function formatClarificationPhrase(input: SearchInput) {
  return (input.clarificationAnswers ?? [])
    .map((answer) => answer.answer.trim())
    .filter(Boolean)
    .join(" ");
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
  const anchoredCandidate = candidates.find((candidate) => canAnchorPrompt(candidate));
  const clarificationPhrase = formatClarificationPhrase(input);
  const genericEvidencePhrase = compactPhrase([
    input.userText,
    clarificationPhrase,
    detailPhrase,
    sketchPhrase,
  ]);

  const searchPrompts = dedupeStrings([
    compactPhrase([
      input.userText,
      clarificationPhrase,
      sketchPhrase,
      "실제 reference image",
    ]),
    compactPhrase([
      detailPhrase,
      sketchPhrase,
      "실제 로고 또는 아이콘 reference",
    ]),
    compactPhrase([
      input.userText,
      "official logo icon reference",
    ]),
    compactPhrase([
      detailPhrase,
      sketchPhrase,
      "제품 또는 심볼 reference image",
    ]),
    compactPhrase([
      sketchPhrase,
      "실제 심볼 또는 사물 이미지",
    ]),
    anchoredCandidate?.query
      ? compactPhrase([
          anchoredCandidate.query,
          clarificationPhrase,
          detailPhrase,
          sketchPhrase,
          "reference image",
        ])
      : "",
    anchoredCandidate?.label
      ? compactPhrase([
          anchoredCandidate.label,
          input.userText,
          "official reference",
        ])
      : "",
    !input.userText && !sketchPhrase
      ? "실제 물체 또는 로고 reference image"
      : "",
    compactPhrase([
      genericEvidencePhrase,
      "reference image",
    ]),
  ]).slice(0, 6);

  const regenerationPrompt = (anchoredCandidate ?? topCandidate)
    ? compactPhrase([
        `${(anchoredCandidate ?? topCandidate)?.label} 관련 가능성이 있는 대상.`,
        input.userText ? `사용자 힌트: ${input.userText}.` : "",
        clarificationPhrase ? `추가 확인 답변: ${clarificationPhrase}.` : "",
        detailPhrase ? `핵심 디테일: ${detailPhrase}.` : "",
        sketchPhrase ? `스케치 구조: ${sketchPhrase}.` : "",
        "검색용 참조 이미지를 만든다고 가정하고, 실제 로고나 사물의 증거를 확인하기 쉬운 단순한 reference 스타일.",
      ])
    : input.userText
      ? compactPhrase([
          `사용자 힌트: ${input.userText}.`,
          clarificationPhrase ? `추가 확인 답변: ${clarificationPhrase}.` : "",
          sketchPhrase ? `스케치 구조: ${sketchPhrase}.` : "",
          "형태와 색 조합이 또렷한 실제 reference 이미지 스타일.",
        ])
      : null;

  const promptReasoning = dedupeStrings([
    detailPhrase
      ? `사용자 설명에서 ${detailPhrase} 같은 디테일 단어를 추출해 검색 프롬프트를 확장했습니다.`
      : "",
    sketchPhrase
      ? `스케치 구조를 ${sketchPhrase} 표현으로 바꿔 텍스트 검색어에 섞었습니다.`
      : "",
    anchoredCandidate?.label
      ? `${anchoredCandidate.label}처럼 이미지 해석에서 직접 나온 후보만 보조 anchor로 사용했습니다.`
      : "",
    !anchoredCandidate
      ? "특정 브랜드를 미리 가정하지 않고 입력 증거만으로 첫 검색 프롬프트를 만들었습니다."
      : "",
    clarificationPhrase
      ? `확인 질문 답변에서 ${clarificationPhrase} 단서를 추가해 검색 프롬프트를 좁혔습니다.`
      : "",
    input.retryContext?.rejectedEntities?.length
      ? `이전 실패 시도에서 ${input.retryContext.rejectedEntities.join(", ")} 후보를 제외해야 한다는 피드백을 반영했습니다.`
      : "",
  ]);

  return {
    promptReasoning,
    regenerationPrompt,
    searchPrompts: searchPrompts.length ? searchPrompts : ["스케치 유사 이미지 검색"],
  };
}
