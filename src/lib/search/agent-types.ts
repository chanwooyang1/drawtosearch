import type {
  EntityCandidate,
  ProviderMode,
  SearchImageResult,
  SearchInput,
  SearchProviderResult,
} from "./types";

export type SearchAgentTrace = {
  detail?: Record<string, unknown>;
  stage: string;
  summary: string;
};

export type SearchAgentDependencies = {
  googleSearch: (query: string) => Promise<SearchImageResult[]>;
  naverSearch: (
    queries: string[],
    candidates: EntityCandidate[],
  ) => Promise<SearchProviderResult>;
  reasoningAgent?: SearchReasoningAgent | null;
};

export type SearchAgentResult = {
  candidateEntities: EntityCandidate[];
  engine: "langgraph-litellm" | "langgraph-upstage" | "rule-based";
  providerMode: ProviderMode;
  searchPrompts: string[];
  searchTrace: SearchAgentTrace[];
  topQuery: string;
  totalResults: SearchImageResult[];
};

export type ReasoningCandidate = {
  confidence: number;
  label: string;
  query: string;
  rationale: string;
};

export type SearchPlanningContext = {
  input: SearchInput;
  promptPlan: {
    regenerationPrompt: string | null;
    searchPrompts: string[];
  };
  seedCandidates: EntityCandidate[];
};

export type SearchAssessmentContext = {
  firstPassResults: SearchImageResult[];
  input: SearchInput;
  previousPlan: SearchPlan;
  promptPlan: {
    regenerationPrompt: string | null;
    searchPrompts: string[];
  };
  seedCandidates: EntityCandidate[];
};

export type SearchSelectionContext = {
  allResults: SearchImageResult[];
  assessment: SearchAssessment | null;
  input: SearchInput;
  plan: SearchPlan;
  promptPlan: {
    regenerationPrompt: string | null;
    searchPrompts: string[];
  };
  seedCandidates: EntityCandidate[];
};

export type SearchPlan = {
  candidateEntities: ReasoningCandidate[];
  observations: string[];
  searchIntent: string;
  searchQueries: string[];
};

export type SearchAssessment = {
  candidateEntities: ReasoningCandidate[];
  observations: string[];
  outcome: "confident" | "refine";
  resultFocus: string[];
  searchQueries: string[];
};

export type SearchSelection = {
  candidateEntities: ReasoningCandidate[];
  observations: string[];
  resultFocus: string[];
  summary: string;
  topQuery: string;
};

export type SearchReasoningAgent = {
  engine?: SearchAgentResult["engine"];
  assessResults: (
    context: SearchAssessmentContext,
  ) => Promise<SearchAssessment>;
  planSearch: (context: SearchPlanningContext) => Promise<SearchPlan>;
  selectBest: (
    context: SearchSelectionContext,
  ) => Promise<SearchSelection>;
};
