import type { EntityCandidate } from "./types";

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "that",
  "this",
  "these",
  "those",
  "같아요",
  "같은",
  "것",
  "이미지",
  "사진",
  "찾고",
  "싶어요",
  "느낌",
  "아마",
  "어떤",
  "뭔가",
  "처럼",
  "maybe",
]);

export function normalizeSearchText(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchText(input: string) {
  return normalizeSearchText(input)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token));
}

export function dedupeStrings(values: string[]) {
  return Array.from(
    new Map(values.map((value) => [normalizeSearchText(value), value.trim()])).values(),
  ).filter(Boolean);
}

export function buildQueryVariants(candidate: {
  label: string;
  query?: string;
  userText?: string;
}) {
  const variants = dedupeStrings([
    candidate.label,
    candidate.query ?? "",
    candidate.userText ? `${candidate.label} ${candidate.userText}` : "",
    candidate.userText ?? "",
  ]);

  return variants.slice(0, 5);
}

export function scoreTokenOverlap(a: string, b: string) {
  const tokensA = tokenizeSearchText(a);
  const tokensB = new Set(tokenizeSearchText(b));

  if (tokensA.length === 0 || tokensB.size === 0) {
    return 0;
  }

  const matches = tokensA.filter((token) => tokensB.has(token)).length;
  return matches / Math.max(tokensA.length, tokensB.size);
}

export function summarizeTopQuery(
  candidates: EntityCandidate[],
  userText: string,
) {
  return (
    candidates[0]?.queryVariants[0] ??
    dedupeStrings([userText, "스케치 이미지 검색"])[0] ??
    "스케치 이미지 검색"
  );
}
