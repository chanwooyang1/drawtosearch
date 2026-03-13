import { randomUUID } from "crypto";

import { env } from "@/lib/env";

import { buildQueryVariants, dedupeStrings, tokenizeSearchText } from "./query";
import { buildSketchDescriptors } from "./sketch";
import type { InterpretationResult, SearchInput } from "./types";

type VisionModelResponse = {
  candidates?: Array<{
    confidence?: number;
    label?: string;
    query?: string;
    rationale?: string;
  }>;
  reasoning?: string[];
};

const PROMPT = [
  "You analyze rough sketches for image retrieval.",
  "Respond with JSON only.",
  "Return an object with keys reasoning and candidates.",
  "Each candidate should include label, query, rationale, confidence.",
  "Prefer Korean labels when possible, and keep 3 candidates max.",
].join(" ");

const MODEL_FALLBACKS = [
  "CohereLabs/aya-vision-32b:cohere",
  "zai-org/GLM-4.5V:preferred",
];

const VISION_NOISE_TOKENS = new Set([
  "got",
  "let",
  "lets",
  "tackle",
  "user",
  "mentioned",
  "image",
  "shows",
  "showing",
  "first",
  "need",
  "think",
  "about",
  "maybe",
  "possible",
  "candidate",
  "candidates",
  "logo",
  "logos",
  "주어진",
  "스케치와",
  "사용자",
  "힌트를",
  "바탕으로",
  "입니다",
  "같은",
  "가장",
  "가능성",
  "있는",
  "sketch",
  "shapes",
  "shape",
  "badge",
  "like",
  "style",
  "circular",
  "square",
  "closed",
  "curve",
  "curves",
  "based",
  "could",
  "likely",
  "common",
  "identify",
  "possible",
]);

function extractVisionHighlights(text: string, userText: string) {
  const uppercaseTokens = Array.from(
    new Set(text.match(/\b[A-Z0-9][A-Z0-9-]{1,}\b/g) ?? []),
  );
  const lexicalTokens = tokenizeSearchText(text)
    .filter((token) => token.length >= 2)
    .filter((token) => !VISION_NOISE_TOKENS.has(token))
    .filter((token) => !tokenizeSearchText(userText).includes(token))
    .slice(0, 6);

  return dedupeStrings([...uppercaseTokens, ...lexicalTokens]).slice(0, 6);
}

function buildFallbackVisionResult(
  input: SearchInput,
  rawText: string,
): InterpretationResult | null {
  const highlights = extractVisionHighlights(rawText, input.userText);

  if (!highlights.length) {
    return null;
  }

  const label = highlights[0].length <= 24 ? highlights[0] : "비전 보조 후보";
  const query = dedupeStrings([
    input.userText,
    highlights.join(" "),
    "reference image",
  ])
    .join(" ")
    .trim();

  return {
    candidates: [
      {
        confidence: 0.44,
        id: randomUUID(),
        label,
        query: query || highlights.join(" "),
        queryVariants: buildQueryVariants({
          label,
          query: query || highlights.join(" "),
          userText: input.userText,
        }),
        rationale: `외부 비전 추론이 ${highlights.join(", ")} 단서를 추가로 포착했습니다.`,
        source: "vision" as const,
      },
    ],
    reasoning: [
      `외부 비전 추론이 ${highlights.join(", ")} 같은 시각 단서를 텍스트 검색에 보조 신호로 추가했습니다.`,
    ],
  };
}

function supportsStructuredOutput(model: string) {
  return !model.includes(":cohere");
}

export async function interpretWithVision(
  input: SearchInput,
): Promise<InterpretationResult | null> {
  if (!env.HUGGINGFACE_API_KEY || !input.sketchDataUrl) {
    return null;
  }

  const sketchSummaryText = input.sketchSummary
    ? `Sketch structure: ${buildSketchDescriptors(input.sketchSummary).join(", ")}.`
    : "Sketch structure: unavailable.";

  const models = dedupeStrings([env.HUGGINGFACE_VISION_MODEL, ...MODEL_FALLBACKS]);
  let content: string | null = null;
  let rawVisionText: string | null = null;
  let lastError: Error | null = null;

  for (const model of models) {
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      body: JSON.stringify({
        max_tokens: 600,
        messages: [
          {
            content: supportsStructuredOutput(model)
              ? PROMPT
              : "Analyze the sketch-like image and user hint. Give a short Korean description of the most visible clues and likely identity. Mention visible text, colors, and shape cues when present.",
            role: "system",
          },
          {
            content: [
              {
                text: `User hint: ${input.userText || "No extra text."}\n${sketchSummaryText}`,
                type: "text",
              },
              {
                image_url: {
                  url: input.sketchDataUrl,
                },
                type: "image_url",
              },
            ],
            role: "user",
          },
        ],
        model,
        ...(supportsStructuredOutput(model)
          ? {
              response_format: {
                type: "json_object" as const,
              },
            }
          : {}),
        temperature: 0.2,
      }),
      headers: {
        Authorization: `Bearer ${env.HUGGINGFACE_API_KEY}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string };
      };
      const message = errorPayload.error?.message ?? `Vision provider failed with ${response.status}`;

      if (
        response.status === 400 &&
        (errorPayload.error?.code === "model_not_supported" ||
          message.includes("not supported"))
      ) {
        lastError = new Error(message);
        continue;
      }

      throw new Error(message);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: {
          content?: string;
          reasoning_content?: string;
        };
      }>;
    };

    content = payload.choices?.[0]?.message?.content ?? null;
    rawVisionText =
      payload.choices?.[0]?.message?.content ??
      payload.choices?.[0]?.message?.reasoning_content ??
      null;

    if (content) {
      break;
    }

    if (rawVisionText) {
      const fallback = buildFallbackVisionResult(input, rawVisionText);

      if (fallback) {
        return fallback;
      }
    }
  }

  if (!content) {
    if (rawVisionText) {
      return buildFallbackVisionResult(input, rawVisionText);
    }

    if (lastError) {
      throw lastError;
    }

    return null;
  }

  if (!content.trim().startsWith("{")) {
    return buildFallbackVisionResult(input, content);
  }

  const parsed = JSON.parse(content) as VisionModelResponse;
  const candidates =
    parsed.candidates?.flatMap((candidate) => {
      if (!candidate.label || !candidate.query) {
        return [];
      }

      return [
        {
          confidence: Math.max(0.35, Math.min(candidate.confidence ?? 0.58, 0.9)),
          id: randomUUID(),
          label: candidate.label,
          query: candidate.query,
          queryVariants: buildQueryVariants({
            label: candidate.label,
            query: candidate.query,
            userText: input.userText,
          }),
          rationale:
            candidate.rationale ??
            "외부 비전 추론이 스케치의 시각 패턴을 바탕으로 제안한 후보입니다.",
          source: "vision" as const,
        },
      ];
    }) ?? [];

  return candidates.length
    ? {
        candidates,
        reasoning: parsed.reasoning ?? [
          "무료 외부 비전 추론으로 추가 후보를 생성했습니다.",
        ],
      }
    : null;
}
