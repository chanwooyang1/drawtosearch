export type CandidateSource = "heuristic" | "vision" | "merged";
export type ProviderMode = "live" | "mock";

export type SearchInput = {
  hasDrawing: boolean;
  locale: string;
  sketchDataUrl: string | null;
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
