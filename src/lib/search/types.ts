export type CandidateSource = "agent" | "heuristic" | "sketch" | "vision" | "merged";
export type ProviderMode = "live" | "mock";
export type ImageAssistMode = "text-only" | "sketch-structure" | "hybrid-vision";
export type ResultMode = "resolved" | "needs_clarification";
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

export type SearchRetryContext = {
  previousSessionId: string | null;
  rejectedEntities: string[];
};

export type SearchClarificationAnswer = {
  answer: string;
  questionId: string;
};

export type SearchInput = {
  clarificationAnswers?: SearchClarificationAnswer[] | null;
  hasDrawing: boolean;
  locale: string;
  retryContext?: SearchRetryContext | null;
  sketchDataUrl: string | null;
  sketchSummary: SketchSummary | null;
  userText: string;
};

export type ClarificationPrompt = {
  id: string;
  options: string[];
  question: string;
};

export type EvidenceBundle = {
  binaryDescriptorText: string;
  clarificationTokens: string[];
  colorTokens: string[];
  contextTokens: string[];
  ocrTokens: string[];
  rasterDescriptorText: string;
  shapeTokens: string[];
  sketchDescriptorText: string;
  textDescriptorText: string;
};

export type ReferenceCategory = "logo_icon" | "product_visual" | "object_reference";

export type ReferenceCorpusItem = {
  aliases: string[];
  category: ReferenceCategory;
  dominantColors: string[];
  id: string;
  license: string;
  ocrTokens: string[];
  shapeTags: string[];
  sourceUrl: string;
  tags: string[];
  thumbnailUrl: string;
  title: string;
};

export type RerankFeatureVector = {
  colorMatch: number;
  contextMatch: number;
  sketchImageSimilarity: number;
  sourceConsensus: number;
  textImageSimilarity: number;
  titleQueryOverlap: number;
  totalScore: number;
  shapeMatch: number;
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
  category?: ReferenceCategory;
  dominantColors?: string[];
  height?: number;
  id: string;
  link: string;
  ocrTokens?: string[];
  query: string;
  rerankFeatures?: RerankFeatureVector;
  shapeTags?: string[];
  source: "naver" | "mock" | "google" | "local";
  sourceId?: string;
  sourceUrl?: string;
  tags?: string[];
  thumbnailUrl: string;
  title: string;
  width?: number;
};

export type RetrievalCandidate = SearchImageResult & {
  baseScore: number;
  imageSimilarity: number;
  textSimilarity: number;
};

export type RerankedResult = RetrievalCandidate & {
  rank: number;
};

export type SearchHandoffUrls = {
  googleImages: string;
  googleWeb: string;
  naverImages: string;
};

export type SearchResponse = {
  candidateEntities: EntityCandidate[];
  feedbackTargets: string[];
  handoffUrls: SearchHandoffUrls;
  imageAssistMode: ImageAssistMode;
  naverResults: SearchImageResult[];
  providerMode: ProviderMode;
  queryVariants: string[];
  clarification: ClarificationPrompt | null;
  referenceResults: SearchImageResult[];
  regenerationPrompt: string | null;
  resultMode: ResultMode;
  reasoning: string[];
  searchPrompts: string[];
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
