import { randomUUID } from "crypto";

import { env } from "@/lib/env";

import { buildQueryVariants } from "./query";
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

export async function interpretWithVision(
  input: SearchInput,
): Promise<InterpretationResult | null> {
  if (!env.HUGGINGFACE_API_KEY || !input.sketchDataUrl) {
    return null;
  }

  const sketchSummaryText = input.sketchSummary
    ? `Sketch structure: ${buildSketchDescriptors(input.sketchSummary).join(", ")}.`
    : "Sketch structure: unavailable.";

  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    body: JSON.stringify({
      messages: [
        {
          content: PROMPT,
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
      model: env.HUGGINGFACE_VISION_MODEL,
      response_format: {
        type: "json_object",
      },
      temperature: 0.2,
    }),
    headers: {
      Authorization: `Bearer ${env.HUGGINGFACE_API_KEY}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Vision provider failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    return null;
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
