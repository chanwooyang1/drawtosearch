"use client";

import dynamic from "next/dynamic";
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { summarizeSketchElements } from "@/lib/search/sketch";
import type { SketchSummary } from "@/lib/search/types";

type ExcalidrawProps = ComponentProps<typeof import("@excalidraw/excalidraw").Excalidraw>;

const Excalidraw = dynamic<ExcalidrawProps>(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  {
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-[color:var(--ink-soft)]">
        캔버스를 불러오는 중...
      </div>
    ),
    ssr: false,
  },
);

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export type SketchCanvasHandle = {
  clear: () => void;
  exportSketch: () => Promise<{
    dataUrl: string | null;
    hasDrawing: boolean;
    summary: SketchSummary | null;
  }>;
};

export const SketchCanvas = forwardRef<SketchCanvasHandle>(function SketchCanvas(
  _props,
  ref,
) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [hasDrawing, setHasDrawing] = useState(false);

  useImperativeHandle(ref, () => ({
    clear() {
      apiRef.current?.resetScene();
      setHasDrawing(false);
    },
    async exportSketch() {
      const api = apiRef.current;

      if (!api) {
        return { dataUrl: null, hasDrawing: false, summary: null };
      }

      const elements = api.getSceneElements();
      const nextHasDrawing = elements.length > 0;
      setHasDrawing(nextHasDrawing);

      if (!nextHasDrawing) {
        return { dataUrl: null, hasDrawing: false, summary: null };
      }

      const summary = summarizeSketchElements(elements);

      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const blob = await exportToBlob({
        appState: {
          ...api.getAppState(),
          exportBackground: true,
          viewBackgroundColor: "#fff8ee",
        },
        elements,
        exportPadding: 24,
        files: api.getFiles(),
        getDimensions: (width: number, height: number) => {
          const longestSide = Math.max(width, height, 1);
          const scale = Math.min(1, 768 / longestSide);
          return {
            height: Math.max(320, Math.round(height * scale)),
            scale,
            width: Math.max(320, Math.round(width * scale)),
          };
        },
        mimeType: "image/png",
      });

      return {
        dataUrl: await blobToDataUrl(blob),
        hasDrawing: true,
        summary,
      };
    },
  }));

  return (
    <div className="excalidraw-wrapper overflow-hidden rounded-[26px] border border-[color:var(--surface-border)] bg-white/80">
      <div className="flex items-center justify-between border-b border-[color:var(--surface-border)] px-4 py-3 text-xs text-[color:var(--ink-soft)]">
        <span>{hasDrawing ? "스케치가 준비됐어요." : "대략적인 형태만 그려도 괜찮아요."}</span>
        <span>손가락/펜 입력 가능</span>
      </div>
      <div className="h-[24rem] w-full">
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api;
          }}
          initialData={{
            appState: {
              currentItemFontFamily: 1,
              currentItemRoughness: 2,
              currentItemStrokeColor: "#1f130d",
              currentItemStrokeWidth: 3,
              defaultSidebarDockedPreference: false,
              exportBackground: true,
              viewBackgroundColor: "#fff8ee",
              zenModeEnabled: false,
            },
          }}
          onChange={(elements) => {
            setHasDrawing(elements.length > 0);
          }}
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: false,
              loadScene: false,
              saveAsImage: false,
              toggleTheme: false,
            },
          }}
        />
      </div>
    </div>
  );
});
