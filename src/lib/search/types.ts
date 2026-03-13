export type CandidateSource = "heuristic" | "sketch" | "vision" | "merged";
export type ProviderMode = "live" | "mock";
export type ImageAssistMode = "text-only" | "sketch-structure" | "hybrid-vision";
export type SketchAspectBucket = "wide" | "tall" | "square";
export type SketchComplexity = "minimal" | "medium" | "dense";
export type SketchGeometry = "round" | "angular" | "organic" | "mixed";
export type SketchElementType =
  | "arrow"
  | "diamond"
  | "ellipse"
  | "freedraw"
  | "line"
  | "rectangle"
  | "text";

export type SketchSummary = {
  aspectBucket: SketchAspectBucket;
  complexity: SketchComplexity;
  dominantGeometry: SketchGeometry;
  elementCount: number;
  hasClosedShapes: boolean;
  repeatedMarks: boolean;
  typeCounts: Record<SketchElementType, number>;
};

export type SearchInput = {
  hasDrawing: boolean;
  locale: string;
  sketchDataUrl: string | null;
  sketchSummary: SketchSummary | null;
  userText: string;
};

export type EntityCandidate = {
  confidence: number;
  id: string;
  label: string;
  query: string;
  queryVariants: string[];
  rationale: string;
  source: CandidateSource;
};

export type SearchImageResult = {
  height?: number;
  id: string;
  link: string;
  query: string;
  source: "naver" | "mock" | "google";
  thumbnailUrl: string;
  title: string;
  width?: number;
};

export type SearchHandoffUrls = {
  googleImages: string;
  googleWeb: string;
  naverImages: string;
};

export type SearchResponse = {
  candidateEntities: EntityCandidate[];
  handoffUrls: SearchHandoffUrls;
  imageAssistMode: ImageAssistMode;
  naverResults: SearchImageResult[];
  providerMode: ProviderMode;
  queryVariants: string[];
  reasoning: string[];
  sessionId: string;
};

export type InterpretationResult = {
  candidates: EntityCandidate[];
  reasoning: string[];
};

export type SearchProviderResult = {
  items: SearchImageResult[];
  mode: ProviderMode;
};
