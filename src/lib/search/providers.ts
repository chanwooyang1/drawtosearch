import { randomUUID } from "crypto";

import { env } from "@/lib/env";

import type {
  EntityCandidate,
  SearchHandoffUrls,
  SearchImageResult,
  SearchProviderResult,
} from "./types";

function encode(text: string) {
  return encodeURIComponent(text.trim());
}

function stripHtml(input: string) {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function createMockThumbnail(label: string, query: string, index: number) {
  const accent = ["#f16d26", "#ffb066", "#783314"][index % 3];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fff9f2" />
          <stop offset="100%" stop-color="${accent}" />
        </linearGradient>
      </defs>
      <rect width="640" height="640" rx="44" fill="url(#bg)" />
      <circle cx="156" cy="156" r="64" fill="rgba(255,255,255,0.48)" />
      <path d="M132 204c88-92 196-92 304 0" fill="none" stroke="#21120b" stroke-width="18" stroke-linecap="round"/>
      <rect x="84" y="392" width="472" height="112" rx="28" fill="rgba(255,255,255,0.78)" />
      <text x="96" y="438" fill="#21120b" font-family="Arial, sans-serif" font-size="32" font-weight="700">${label}</text>
      <text x="96" y="476" fill="#5a3d2c" font-family="Arial, sans-serif" font-size="22">${query}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function buildHandoffUrls(query: string): SearchHandoffUrls {
  return {
    googleImages: `https://www.google.com/search?tbm=isch&q=${encode(query)}`,
    googleWeb: `https://www.google.com/search?q=${encode(query)}`,
    naverImages: `https://search.naver.com/search.naver?where=image&query=${encode(query)}`,
  };
}

export async function fetchNaverResults(
  queries: string[],
  candidates: EntityCandidate[],
): Promise<SearchProviderResult> {
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    return {
      items: buildMockResults(queries, candidates),
      mode: "mock",
    };
  }

  const allItems: SearchImageResult[] = [];

  for (const query of queries.slice(0, 2)) {
    const url = new URL("https://openapi.naver.com/v1/search/image.json");
    url.searchParams.set("display", "8");
    url.searchParams.set("query", query);
    url.searchParams.set("sort", "sim");

    const response = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": env.NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": env.NAVER_CLIENT_SECRET,
      },
      signal: AbortSignal.timeout(6_000),
    });

    if (!response.ok) {
      throw new Error(`Naver image search failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      items?: Array<{
        link: string;
        sizeheight?: string;
        sizewidth?: string;
        thumbnail: string;
        title: string;
      }>;
    };

    for (const item of payload.items ?? []) {
      allItems.push({
        height: item.sizeheight ? Number(item.sizeheight) : undefined,
        id: randomUUID(),
        link: item.link,
        query,
        source: "naver",
        thumbnailUrl: item.thumbnail,
        title: stripHtml(item.title) || query,
        width: item.sizewidth ? Number(item.sizewidth) : undefined,
      });
    }
  }

  if (!allItems.length) {
    return {
      items: buildMockResults(queries, candidates),
      mode: "mock",
    };
  }

  const uniqueItems = Array.from(
    new Map(allItems.map((item) => [item.link, item])).values(),
  );

  return {
    items: uniqueItems.slice(0, 8),
    mode: "live",
  };
}

export async function fetchGoogleCustomSearch(query: string) {
  if (!env.GOOGLE_CUSTOM_SEARCH_API_KEY || !env.GOOGLE_CUSTOM_SEARCH_CX) {
    return [];
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("cx", env.GOOGLE_CUSTOM_SEARCH_CX);
  url.searchParams.set("key", env.GOOGLE_CUSTOM_SEARCH_API_KEY);
  url.searchParams.set("num", "6");
  url.searchParams.set("q", query);
  url.searchParams.set("searchType", "image");

  const response = await fetch(url, {
    signal: AbortSignal.timeout(6_000),
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    items?: Array<{
      image?: { height?: number; thumbnailLink?: string; width?: number };
      link: string;
      title: string;
    }>;
  };

  return (
    payload.items?.map((item) => ({
      height: item.image?.height,
      id: randomUUID(),
      link: item.link,
      query,
      source: "google" as const,
      thumbnailUrl: item.image?.thumbnailLink ?? item.link,
      title: item.title,
      width: item.image?.width,
    })) ?? []
  );
}

function buildMockResults(queries: string[], candidates: EntityCandidate[]) {
  const topQueries = queries.slice(0, 4);
  const seeds = candidates.length
    ? candidates
    : [
        {
          confidence: 0.4,
          id: randomUUID(),
          label: "이미지 후보",
          query: topQueries[0] ?? "스케치 이미지",
          queryVariants: topQueries,
          rationale: "데모 결과",
          source: "heuristic" as const,
        },
      ];

  return seeds.flatMap((candidate, candidateIndex) =>
    topQueries.slice(0, 2).map((query, queryIndex) => {
      const index = candidateIndex * 2 + queryIndex;
      return {
        id: randomUUID(),
        link: buildHandoffUrls(query).googleImages,
        query,
        source: "mock" as const,
        thumbnailUrl: createMockThumbnail(candidate.label, query, index),
        title:
          candidateIndex === 0
            ? `${candidate.label} 관련 시각 후보`
            : `${candidate.label} 탐색 예시`,
      };
    }),
  );
}
