"use client";

import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import { LoaderCircle, Search, Sparkles, ExternalLink } from "lucide-react";

import type { SearchResponse } from "@/lib/search/types";

import { SketchCanvas, type SketchCanvasHandle } from "./sketch-canvas";

type SearchState = "idle" | "loading" | "success" | "error";
type FeedbackState = "match" | "miss" | null;

async function postJson<T>(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }

  return (await response.json()) as T;
}

function getImageAssistLabel(mode: SearchResponse["imageAssistMode"]) {
  switch (mode) {
    case "hybrid-vision":
      return "스케치+비전";
    case "sketch-structure":
      return "스케치 구조 반영";
    default:
      return "텍스트 중심";
  }
}

export function SearchExperience() {
  const canvasRef = useRef<SketchCanvasHandle>(null);
  const resultSectionRef = useRef<HTMLElement | null>(null);
  const [userText, setUserText] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [feedbackState, setFeedbackState] = useState<FeedbackState>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const deferredText = useDeferredValue(userText);

  const runSearch = async () => {
    setSearchState("loading");
    setErrorMessage(null);

    try {
      const sketch = await canvasRef.current?.exportSketch();
      const payload = {
        locale: "ko-KR",
        sketchDataUrl: sketch?.dataUrl ?? null,
        hasDrawing: sketch?.hasDrawing ?? false,
        sketchSummary: sketch?.summary ?? null,
        userText,
      };

      const nextResult = await postJson<SearchResponse>("/api/search", payload);
      startTransition(() => {
        setResult(nextResult);
        setFeedbackState(null);
        setSearchState("success");
      });
    } catch (error) {
      setSearchState("error");
      setErrorMessage(
        error instanceof Error ? error.message : "검색을 진행하지 못했습니다.",
      );
    }
  };

  const primaryCandidate = result?.candidateEntities[0] ?? null;

  useEffect(() => {
    if (!result) {
      return;
    }

    resultSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [result]);

  const trackEvent = async (
    eventType: "result_click" | "handoff_click",
    target: string,
    targetRank?: number,
  ) => {
    if (!result?.sessionId) {
      return;
    }

    try {
      await postJson("/api/events/click", {
        eventType,
        sessionId: result.sessionId,
        target,
        targetRank,
      });
    } catch {
      // Non-blocking analytics.
    }
  };

  const submitFeedback = async (value: FeedbackState) => {
    if (!result?.sessionId || !value) {
      return;
    }

    setFeedbackState(value);

    try {
      await postJson("/api/events/feedback", {
        feedback: value,
        sessionId: result.sessionId,
      });
    } catch {
      // Non-blocking analytics.
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 px-4 py-6 text-[15px] text-foreground sm:px-5">
      <section className="paper-panel overflow-hidden rounded-[28px]">
        <div className="border-b border-[color:var(--surface-border)] bg-[color:var(--surface-strong)] px-5 py-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="rounded-full border border-[color:var(--surface-border)] bg-white/65 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-[color:var(--ink-soft)]">
              Mobile-first sketch search
            </span>
            <div className="rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-medium text-[color:var(--accent-deep)]">
              MVP
            </div>
          </div>
          <h1 className="ink-title text-[2.2rem] leading-none text-[color:var(--foreground)]">
            Draw,
            <br />
            hint, search.
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-[color:var(--ink-soft)]">
            어렴풋이 본 이미지를 손그림과 한 줄 설명으로 바꿔서 검색 가능한
            후보와 이미지 결과로 연결합니다.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-px bg-[color:var(--surface-border)]">
          {[
            "스케치 입력",
            "후보 정체 추론",
            "이미지 결과 연결",
          ].map((item) => (
            <div
              key={item}
              className="bg-[color:var(--surface-strong)] px-3 py-3 text-center text-xs font-medium text-[color:var(--ink-soft)]"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="paper-panel rounded-[28px] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="ink-title text-xl">1. 기억나는 모양을 그려보세요</h2>
            <p className="mt-1 text-sm text-[color:var(--ink-soft)]">
              대충 그려도 됩니다. 로고, 제품, 물체 윤곽처럼 핵심만 담아주세요.
            </p>
          </div>
          <button
            className="rounded-full border border-[color:var(--surface-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink-soft)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent-deep)]"
            onClick={() => canvasRef.current?.clear()}
            type="button"
          >
            캔버스 지우기
          </button>
        </div>
        <SketchCanvas ref={canvasRef} />
      </section>

      <section className="paper-panel rounded-[28px] p-4">
        <h2 className="ink-title text-xl">2. 어떤 장면인지 힌트를 적어주세요</h2>
        <p className="mt-1 text-sm text-[color:var(--ink-soft)]">
          색, 재질, 상황, 떠오르는 단어를 짧게 적을수록 후보를 잘 넓힐 수
          있어요.
        </p>
        <textarea
          className="mt-3 h-32 w-full resize-none rounded-[24px] border border-[color:var(--surface-border)] bg-white/70 px-4 py-3 text-sm text-[color:var(--foreground)] outline-none transition placeholder:text-[color:var(--ink-soft)] focus:border-[color:var(--accent)] focus:bg-white"
          onChange={(event) => setUserText(event.target.value)}
          placeholder="예: 갈색 바탕에 반복 무늬가 있고 명품 브랜드 로고 같아요. 여행가방이나 지갑에서 본 것 같아요."
          value={userText}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-medium text-[color:var(--accent-deep)]">
            미리보기
          </span>
          <span className="rounded-full border border-[color:var(--surface-border)] px-3 py-1 text-xs text-[color:var(--ink-soft)]">
            {deferredText.trim() || "힌트가 없으면 텍스트 없는 검색으로 진행됩니다."}
          </span>
        </div>
      </section>

      <section className="paper-panel rounded-[28px] p-4">
        <button
          className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-[color:var(--accent)] px-4 py-4 text-sm font-semibold text-white transition hover:bg-[color:var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={searchState === "loading"}
          onClick={runSearch}
          type="button"
        >
          {searchState === "loading" ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              검색 가능 후보를 추론하는 중
            </>
          ) : (
            <>
              <Search className="size-4" />
              검색 시작
            </>
          )}
        </button>
        <div className="mt-3 rounded-[20px] border border-dashed border-[color:var(--surface-border)] px-4 py-3 text-sm text-[color:var(--ink-soft)]">
          손그림과 설명을 바탕으로 내부적으로 여러 번 검색어를 조정해 가장 가까운
          결과를 다시 모읍니다.
        </div>
        {errorMessage ? (
          <p className="mt-3 rounded-[18px] bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}
      </section>

      {result ? (
        <section
          className="paper-panel rounded-[28px] p-4"
          ref={resultSectionRef}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="ink-title text-xl">3. 이게 맞는지 확인해보세요</h2>
              <p className="mt-1 text-sm text-[color:var(--ink-soft)]">
                내부적으로 몇 차례 검색을 조정한 뒤 가장 가까운 결과부터 보여드립니다.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <div className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-[color:var(--ink-soft)]">
                {getImageAssistLabel(result.imageAssistMode)}
              </div>
              <div className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-[color:var(--ink-soft)]">
                {result.providerMode === "live" ? "NAVER live" : "Demo fallback"}
              </div>
            </div>
          </div>

          {primaryCandidate ? (
            <div className="mt-4 rounded-[24px] border border-[color:var(--surface-border)] bg-white/70 p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 size-4 text-[color:var(--accent)]" />
                <div>
                  <h3 className="font-semibold text-[color:var(--foreground)]">
                    가장 가까운 추정: {primaryCandidate.label}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--ink-soft)]">
                    손그림, 설명, 검색 결과를 함께 읽어 지금 단계에서 가장 유력한
                    대상을 우선 정리했습니다.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex gap-3">
            <button
              className={`flex-1 rounded-[20px] border px-4 py-3 text-sm font-semibold transition ${
                feedbackState === "match"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-[color:var(--surface-border)] bg-white/70 text-[color:var(--foreground)] hover:border-emerald-300"
              }`}
              onClick={() => void submitFeedback("match")}
              type="button"
            >
              맞아요
            </button>
            <button
              className={`flex-1 rounded-[20px] border px-4 py-3 text-sm font-semibold transition ${
                feedbackState === "miss"
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-[color:var(--surface-border)] bg-white/70 text-[color:var(--foreground)] hover:border-amber-300"
              }`}
              onClick={() => void submitFeedback("miss")}
              type="button"
            >
              아직 아니에요
            </button>
          </div>

          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="ink-title text-lg">인앱 이미지 결과</h3>
              <div className="text-xs text-[color:var(--ink-soft)]">
                {result.providerMode === "live"
                  ? "NAVER 검색 결과"
                  : "API 키가 없어서 데모 카드가 표시됩니다."}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {result.naverResults.map((imageResult, index) => (
                <a
                  key={imageResult.id}
                  className="group overflow-hidden rounded-[24px] border border-[color:var(--surface-border)] bg-white/75 transition hover:-translate-y-0.5 hover:border-[color:var(--accent)]"
                  href={imageResult.link}
                  onClick={() =>
                    void trackEvent("result_click", imageResult.link, index + 1)
                  }
                  rel="noreferrer"
                  target="_blank"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={imageResult.title}
                    className="aspect-square w-full object-cover"
                    src={imageResult.thumbnailUrl}
                  />
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-2 text-sm font-medium text-[color:var(--foreground)]">
                      {imageResult.title}
                    </p>
                    <p className="text-xs text-[color:var(--ink-soft)]">
                      탭해서 원본 이미지 보기
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              {
                href: result.handoffUrls.googleImages,
                label: "Google 이미지로 더 찾기",
                target: "google-images",
              },
              {
                href: result.handoffUrls.naverImages,
                label: "네이버 이미지로 더 찾기",
                target: "naver-images",
              },
            ].map((item) => (
              <a
                key={item.target}
                className="flex items-center justify-center gap-2 rounded-[20px] border border-[color:var(--surface-border)] bg-white/70 px-4 py-3 text-sm font-semibold text-[color:var(--foreground)] transition hover:border-[color:var(--accent)]"
                href={item.href}
                onClick={() => void trackEvent("handoff_click", item.target)}
                rel="noreferrer"
                target="_blank"
              >
                {item.label}
                <ExternalLink className="size-4" />
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
