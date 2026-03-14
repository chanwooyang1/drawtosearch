import type { ClarificationPrompt, EvidenceBundle, RerankedResult } from "./types";
import type { SearchHypothesis } from "./hypotheses";

function hasRoundArrowSignal(results: RerankedResult[]) {
  return results.some(
    (result) =>
      result.shapeTags?.includes("arrows") &&
      result.shapeTags?.includes("round"),
  );
}

export function buildClarificationPrompt(input: {
  evidence: EvidenceBundle;
  hypotheses: SearchHypothesis[];
  results: RerankedResult[];
}): ClarificationPrompt {
  const serviceVsLogo =
    input.hypotheses.some((hypothesis) => hypothesis.surface === "service_icon") &&
    input.hypotheses.some((hypothesis) => hypothesis.surface === "logo_symbol");

  if (hasRoundArrowSignal(input.results)) {
    return {
      id: "arrows_mark",
      options: ["네, 양쪽 화살표처럼 보였어요", "아니요, 그런 느낌은 아니었어요", "잘 모르겠어요"],
      question: "가운데나 양옆에 마주보는 화살표처럼 보이는 모양이 있었나요?",
    };
  }

  if (input.evidence.ocrTokens.length || input.evidence.shapeTokens.includes("text-like marks")) {
    return {
      id: "text_in_mark",
      options: ["네, 글자나 이니셜이 있었어요", "아니요, 글자는 없었어요", "잘 모르겠어요"],
      question: "원 안이나 마크 안쪽에 글자처럼 보이는 요소가 있었나요?",
    };
  }

  if (
    input.evidence.shapeTokens.includes("반복 패턴") ||
    input.hypotheses.some((hypothesis) => hypothesis.surface === "product_visual")
  ) {
    return {
      id: "pattern_repeat",
      options: ["네, 반복 무늬가 계속 이어졌어요", "아니요, 하나의 로고에 가까웠어요", "잘 모르겠어요"],
      question: "하나의 심볼보다는 여러 번 반복되는 패턴에 가까웠나요?",
    };
  }

  if (serviceVsLogo) {
    return {
      id: "app_icon_simple",
      options: ["네, 앱 아이콘처럼 단순했어요", "아니요, 로고/마크 쪽이었어요", "잘 모르겠어요"],
      question: "전체 느낌이 앱 아이콘처럼 단순하고 작은 심볼에 가까웠나요?",
    };
  }

  return {
    id: "app_icon_simple",
    options: ["네, 앱 아이콘처럼 단순했어요", "아니요, 로고/마크 쪽이었어요", "잘 모르겠어요"],
    question: "전체 형태가 단순한 앱 아이콘에 더 가까웠나요?",
  };
}

