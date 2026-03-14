import { randomUUID } from "crypto";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

import { env } from "@/lib/env";
import { buildPolicyBucket, createPolicyContext } from "@/lib/policy/context";
import type { PolicyDecisionRecord, PolicyDecisionStage, SearchPolicyContext } from "@/lib/policy/types";

import { buildPromptPlan } from "./prompt";
import { buildQueryVariants, dedupeStrings, normalizeSearchText, scoreTokenOverlap } from "./query";
import { buildSketchDescriptors } from "./sketch";
import type {
  ReasoningCandidate,
  SearchAgentDependencies,
  SearchAgentResult,
  SearchAgentTrace,
  SearchAssessment,
  SearchAssessmentContext,
  SearchPlan,
  SearchPlanningContext,
  SearchReasoningAgent,
  SearchSelectionContext,
} from "./agent-types";
import type {
  EntityCandidate,
  SearchImageResult,
  SearchInput,
} from "./types";

type ReasoningGateway = {
  apiKey: string;
  baseURL: string;
  engine: SearchAgentResult["engine"];
  model: string;
};

type ReasoningGatewayEnv = {
  LITELLM_API_BASE?: string;
  LITELLM_API_KEY?: string;
  LITELLM_MODEL: string;
  UPSTAGE_API_KEY?: string;
  UPSTAGE_MODEL: string;
};

const DISALLOWED_QUERY_TERMS = [
  "손그림",
  "스케치",
  "낙서",
  "드로잉",
  "그린",
  "drawing",
  "sketch",
  "doodle",
  "hand drawn",
  "illustration",
];

const candidateSchema = z.object({
  confidence: z.number().min(0).max(1),
  label: z.string().trim().min(1).max(80),
  query: z.string().trim().min(1).max(140),
  rationale: z.string().trim().min(1).max(240),
});

const planSchema = z.object({
  candidateEntities: z.array(candidateSchema).min(1).max(4),
  observations: z.array(z.string().trim().min(1).max(160)).max(6),
  searchIntent: z.string().trim().min(1).max(180),
  searchQueries: z.array(z.string().trim().min(1).max(140)).min(2).max(4),
});

const assessmentSchema = z.object({
  candidateEntities: z.array(candidateSchema).min(1).max(4),
  observations: z.array(z.string().trim().min(1).max(160)).max(6),
  outcome: z.enum(["confident", "refine"]),
  resultFocus: z.array(z.string().trim().min(1).max(80)).max(6),
  searchQueries: z.array(z.string().trim().min(1).max(140)).min(1).max(4),
});

const selectionSchema = z.object({
  candidateEntities: z.array(candidateSchema).min(1).max(4),
  observations: z.array(z.string().trim().min(1).max(160)).max(6),
  resultFocus: z.array(z.string().trim().min(1).max(80)).max(6),
  summary: z.string().trim().min(1).max(240),
  topQuery: z.string().trim().min(1).max(140),
});

const replaceState = <T,>(fallback: () => T) =>
  Annotation<T>({
    default: fallback,
    reducer: (_left, right) => right,
  });

const appendTraceState = Annotation<SearchAgentTrace[]>({
  default: () => [],
  reducer: (left, right) => left.concat(right),
});

const AgentGraphState = Annotation.Root({
  candidateEntities: replaceState<EntityCandidate[]>(() => []),
  firstPassResults: replaceState<SearchImageResult[]>(() => []),
  input: Annotation<SearchInput>(),
  promptPlan: replaceState<{
    regenerationPrompt: string | null;
    searchPrompts: string[];
  }>(() => ({
    regenerationPrompt: null,
    searchPrompts: [],
  })),
  providerMode: replaceState<"live" | "mock">(() => "mock"),
  searchAssessment: replaceState<SearchAssessment | null>(() => null),
  searchPlan: replaceState<SearchPlan | null>(() => null),
  refinedPrompts: replaceState<string[]>(() => []),
  searchPrompts: replaceState<string[]>(() => []),
  searchTrace: appendTraceState,
  planPolicyDecision: replaceState<PolicyDecisionRecord | null>(() => null),
  refinePolicyDecision: replaceState<PolicyDecisionRecord | null>(() => null),
  secondPassResults: replaceState<SearchImageResult[]>(() => []),
  seedCandidates: replaceState<EntityCandidate[]>(() => []),
  shouldRefine: replaceState<boolean>(() => false),
  topQuery: replaceState<string>(() => "스케치 이미지 검색"),
  totalResults: replaceState<SearchImageResult[]>(() => []),
});

function sanitizeSearchQuery(query: string) {
  let next = query.trim();

  for (const token of DISALLOWED_QUERY_TERMS) {
    next = next.replace(new RegExp(token, "giu"), " ");
  }

  return next.replace(/\s+/g, " ").trim();
}

function mergeSearchQueries(candidateQueries: string[], fallbackQueries: string[]) {
  return dedupeStrings(
    [...candidateQueries, ...fallbackQueries]
      .map((query) => sanitizeSearchQuery(query))
      .filter(Boolean),
  ).slice(0, 6);
}

function dedupeCandidates(candidates: EntityCandidate[]) {
  return Array.from(
    new Map(
      candidates.map((candidate) => [
        normalizeSearchText(candidate.label || candidate.query),
        candidate,
      ]),
    ).values(),
  );
}

function materializeCandidates(
  plannedCandidates: ReasoningCandidate[],
  input: SearchInput,
  fallbackCandidates: EntityCandidate[],
) {
  const llmCandidates = plannedCandidates.map((candidate) => {
    const query = sanitizeSearchQuery(candidate.query) || candidate.label;

    return {
      confidence: Math.min(0.98, Math.max(0.24, candidate.confidence)),
      id: randomUUID(),
      label: candidate.label.trim(),
      query,
      queryVariants: buildQueryVariants({
        label: candidate.label.trim(),
        query,
        userText: input.userText,
      }),
      rationale: candidate.rationale.trim(),
      source: "agent" as const,
    };
  });

  const merged = dedupeCandidates([...llmCandidates, ...fallbackCandidates]).slice(0, 6);

  if (merged.length) {
    return merged;
  }

  return fallbackCandidates.slice(0, 6);
}

function dedupeResults(results: SearchImageResult[]) {
  return Array.from(new Map(results.map((result) => [result.link, result])).values());
}

function rankResults(
  results: SearchImageResult[],
  candidates: EntityCandidate[],
  focusTokens: string[],
) {
  const anchor = candidates[0];
  const focusPhrase = focusTokens.join(" ");

  return [...results].sort((left, right) => {
    const leftScore =
      scoreTokenOverlap(`${anchor?.label ?? ""} ${anchor?.query ?? ""} ${focusPhrase}`, left.title) +
      scoreTokenOverlap(focusPhrase, left.title) +
      scoreTokenOverlap(`${anchor?.label ?? ""} ${focusPhrase}`, left.query);
    const rightScore =
      scoreTokenOverlap(`${anchor?.label ?? ""} ${anchor?.query ?? ""} ${focusPhrase}`, right.title) +
      scoreTokenOverlap(focusPhrase, right.title) +
      scoreTokenOverlap(`${anchor?.label ?? ""} ${focusPhrase}`, right.query);

    return rightScore - leftScore;
  });
}

function summarizeSketch(input: SearchInput) {
  const descriptors = input.sketchSummary
    ? buildSketchDescriptors(input.sketchSummary)
    : [];

  if (!input.hasDrawing) {
    return "No drawing provided.";
  }

  if (!descriptors.length) {
    return "A rough sketch was provided, but structural descriptors are limited.";
  }

  return descriptors.join(", ");
}

function summarizeClarificationAnswers(input: SearchInput) {
  if (!input.clarificationAnswers?.length) {
    return "(none)";
  }

  return input.clarificationAnswers
    .map((answer) => `${answer.questionId}: ${answer.answer}`)
    .join(" | ");
}

function formatSeedCandidates(candidates: EntityCandidate[]) {
  if (!candidates.length) {
    return "- none";
  }

  return candidates
    .slice(0, 6)
    .map(
      (candidate, index) =>
        `${index + 1}. ${candidate.label} | query=${candidate.query} | confidence=${candidate.confidence.toFixed(2)} | rationale=${candidate.rationale}`,
    )
    .join("\n");
}

function formatResults(results: SearchImageResult[]) {
  if (!results.length) {
    return "- no results";
  }

  return results
    .slice(0, 8)
    .map(
      (result, index) =>
        `${index + 1}. title=${result.title} | query=${result.query} | source=${result.source}`,
    )
    .join("\n");
}

function buildNeutralDirective(stage: PolicyDecisionStage) {
  if (stage === "plan") {
    return "Keep the initial search strategy broad and evidence-first. Treat named entities as temporary hypotheses until search evidence confirms them.";
  }

  return "Refine only from observed evidence. Reject current hypotheses when colors, geometry, or viewing context do not match the search results.";
}

function materializePolicyDecision(input: {
  context: SearchPolicyContext;
  directiveText: string;
  explorationScore: number;
  policyVersion: string;
  sessionId: string;
  stage: PolicyDecisionStage;
  actionName: PolicyDecisionRecord["actionName"];
}) {
  return {
    actionName: input.actionName,
    contextBucket: buildPolicyBucket(input.context),
    contextFeatures: input.context,
    createdAt: new Date(),
    directiveText: input.directiveText,
    explorationScore: input.explorationScore,
    id: randomUUID(),
    policyFamily: input.stage === "plan" ? "plan_policy" : "refine_policy",
    policyVersion: input.policyVersion,
    sessionId: input.sessionId,
    stage: input.stage,
  } satisfies PolicyDecisionRecord;
}

async function selectPolicyDecision(input: {
  context: SearchPolicyContext;
  dependencies: SearchAgentDependencies;
  stage: PolicyDecisionStage;
}) {
  if (!input.dependencies.policyEngine) {
    return materializePolicyDecision({
      actionName: "neutral",
      context: input.context,
      directiveText: buildNeutralDirective(input.stage),
      explorationScore: 0,
      policyVersion: "neutral-v1",
      sessionId: input.dependencies.sessionId,
      stage: input.stage,
    });
  }

  const selection =
    input.stage === "plan"
      ? await input.dependencies.policyEngine.selectPlanPolicy({
          context: input.context,
          sessionId: input.dependencies.sessionId,
        })
      : await input.dependencies.policyEngine.selectRefinePolicy({
          context: input.context,
          sessionId: input.dependencies.sessionId,
        });

  return materializePolicyDecision({
    actionName: selection.actionName,
    context: input.context,
    directiveText: selection.directiveText,
    explorationScore: selection.explorationScore,
    policyVersion: selection.policyVersion,
    sessionId: input.dependencies.sessionId,
    stage: input.stage,
  });
}

export function resolveReasoningGateway(
  config: ReasoningGatewayEnv = env,
): ReasoningGateway | null {
  if (config.LITELLM_API_BASE) {
    return {
      apiKey: config.LITELLM_API_KEY ?? "anything",
      baseURL: config.LITELLM_API_BASE,
      engine: "langgraph-litellm",
      model: config.LITELLM_MODEL,
    };
  }

  if (!config.UPSTAGE_API_KEY) {
    return null;
  }

  return {
    apiKey: config.UPSTAGE_API_KEY,
    baseURL: "https://api.upstage.ai/v1/solar",
    engine: "langgraph-upstage",
    model: config.UPSTAGE_MODEL,
  };
}

function createReasoningAgent(): SearchReasoningAgent | null {
  const gateway = resolveReasoningGateway();

  if (!gateway) {
    return null;
  }

  const model = new ChatOpenAI({
    apiKey: gateway.apiKey,
    configuration: {
      baseURL: gateway.baseURL,
    },
    maxTokens: 900,
    model: gateway.model,
    temperature: 0.1,
    timeout: 20_000,
  });

  const planner = model.withStructuredOutput(planSchema, {
    name: "draw_to_search_plan",
  });
  const assessor = model.withStructuredOutput(assessmentSchema, {
    name: "draw_to_search_assessment",
  });
  const selector = model.withStructuredOutput(selectionSchema, {
    name: "draw_to_search_selection",
  });

  return {
    engine: gateway.engine,
    async assessResults(context: SearchAssessmentContext) {
      return assessor.invoke([
        new SystemMessage([
          "You are the internal retrieval critic for DrawToSearch.",
          "The user wants the real target behind a rough sketch, not the sketch itself.",
          "Decide if the first image search results are on-track.",
          "Treat earlier candidates as temporary hypotheses, not facts.",
          "Check whether colors, geometry, and where the user saw it match the observed results.",
          "If the result colors or usage context drift away from the user evidence, reject the current hypothesis and refine.",
          "If not, rewrite the queries toward the real-world target such as official logo, icon, product photo, or object reference.",
          "If a previous attempt explicitly rejected certain entities, do not return them again unless the observed results provide strong contradictory evidence.",
          "Ignore seller noise, model numbers, and unrelated retail clutter unless they strongly identify the target.",
          "Do not overfit to famous brands or apps from one generic clue like a color or the word browser.",
          "Do not use drawing, sketch, doodle, or illustration terms in search queries.",
          "Return concise Korean observations when possible.",
        ].join(" ")),
        new HumanMessage([
          `User hint: ${context.input.userText || "(none)"}`,
          `Sketch summary: ${summarizeSketch(context.input)}`,
          `Clarification answers: ${summarizeClarificationAnswers(context.input)}`,
          `Refine strategy directive: ${context.strategyDirective}`,
          context.rejectedEntities.length
            ? `Previously rejected hypotheses: ${context.rejectedEntities.join(" | ")}`
            : "Previously rejected hypotheses: (none)",
          `Initial search intent: ${context.previousPlan.searchIntent}`,
          `Initial observations: ${context.previousPlan.observations.join(" | ") || "(none)"}`,
          "Seed candidates (coarse hypotheses only, safe to reject):",
          formatSeedCandidates(context.seedCandidates),
          "Initial planned candidates:",
          context.previousPlan.candidateEntities
            .map(
              (candidate, index) =>
                `${index + 1}. ${candidate.label} | query=${candidate.query} | confidence=${candidate.confidence.toFixed(2)} | rationale=${candidate.rationale}`,
            )
            .join("\n"),
          `Initial queries: ${context.previousPlan.searchQueries.join(" | ")}`,
          "Observed search results:",
          formatResults(context.firstPassResults),
          `Fallback query ideas: ${context.promptPlan.searchPrompts.join(" | ")}`,
        ].join("\n")),
      ]);
    },
    async planSearch(context: SearchPlanningContext) {
      return planner.invoke([
        new SystemMessage([
          "You are the internal search strategist for DrawToSearch.",
          "Infer the actual entity the user wants from text plus sketch structure hints.",
          "The goal is to search real-world references, never the hand-drawn image itself.",
          "Start from evidence, not from any fixed list of brands or apps.",
          "Generate multiple competing hypotheses from scratch and keep them diverse when evidence is weak.",
          "Only commit to an exact entity like a brand, app, product line, or object when the evidence really supports it.",
          "A famous brand should not win from generic clues alone such as one color, one shape, or the place where it was seen.",
          "If a previous attempt explicitly rejected certain entities, avoid returning them again unless new evidence strongly overturns that rejection.",
          "Use color combinations, geometry, repeated marks, and viewing context as evidence.",
          "Search queries must be short, concrete, and good for image search.",
          "Do not use drawing, sketch, doodle, or illustration terms in the search queries.",
          "Return concise Korean observations when possible.",
        ].join(" ")),
        new HumanMessage([
          `User hint: ${context.input.userText || "(none)"}`,
          `Sketch summary: ${summarizeSketch(context.input)}`,
          `Clarification answers: ${summarizeClarificationAnswers(context.input)}`,
          `Plan strategy directive: ${context.strategyDirective}`,
          context.rejectedEntities.length
            ? `Previously rejected hypotheses: ${context.rejectedEntities.join(" | ")}`
            : "Previously rejected hypotheses: (none)",
          `Fallback prompt plan: ${context.promptPlan.searchPrompts.join(" | ")}`,
          context.promptPlan.regenerationPrompt
            ? `Reference-style prompt: ${context.promptPlan.regenerationPrompt}`
            : "Reference-style prompt: (none)",
          "Seed candidates (broad starting points only, not trusted answers):",
          formatSeedCandidates(context.seedCandidates),
        ].join("\n")),
      ]);
    },
    async selectBest(context: SearchSelectionContext) {
      return selector.invoke([
        new SystemMessage([
          "You are the final selector for DrawToSearch.",
          "Pick the most likely real-world target based on the search evidence.",
          "Earlier candidates are tentative and may be wrong.",
          "Favor concrete entities over generic categories when the evidence is strong.",
          "If the evidence is still mixed, prefer an honest broader category over a confident but famous wrong answer.",
          "Pay attention to color consistency and where the user said they saw the target.",
          "Choose a topQuery that is best for the next image search or external handoff.",
          "Do not use drawing, sketch, doodle, or illustration terms in topQuery.",
          "Return concise Korean observations when possible.",
        ].join(" ")),
        new HumanMessage([
          `User hint: ${context.input.userText || "(none)"}`,
          `Sketch summary: ${summarizeSketch(context.input)}`,
          `Clarification answers: ${summarizeClarificationAnswers(context.input)}`,
          `Initial plan queries: ${context.plan.searchQueries.join(" | ")}`,
          context.assessment
            ? `Assessment outcome: ${context.assessment.outcome}`
            : "Assessment outcome: (none)",
          context.assessment?.observations.length
            ? `Assessment observations: ${context.assessment.observations.join(" | ")}`
            : "Assessment observations: (none)",
          context.assessment?.resultFocus.length
            ? `Assessment focus: ${context.assessment.resultFocus.join(" | ")}`
            : "Assessment focus: (none)",
          "Candidate pool:",
          formatSeedCandidates(context.seedCandidates),
          "Observed results:",
          formatResults(context.allResults),
          `Fallback prompt plan: ${context.promptPlan.searchPrompts.join(" | ")}`,
        ].join("\n")),
      ]);
    },
  };
}

export async function runLangGraphSearchAgent(
  input: SearchInput,
  seedCandidates: EntityCandidate[],
  dependencies: SearchAgentDependencies,
): Promise<SearchAgentResult> {
  const reasoningAgent = dependencies.reasoningAgent ?? createReasoningAgent();
  const reasoningEngine = reasoningAgent?.engine ?? "langgraph-upstage";

  if (!reasoningAgent) {
    throw new Error("No reasoning gateway is configured. Set LITELLM_API_BASE or UPSTAGE_API_KEY.");
  }

  const promptPlan = buildPromptPlan(input, seedCandidates);

  const graph = new StateGraph(AgentGraphState)
    .addNode("selectPlanPolicy", async (state) => {
      const context = createPolicyContext({
        input: state.input,
        visionCandidates: dependencies.visionCandidates,
      });
      const planPolicyDecision = await selectPolicyDecision({
        context,
        dependencies,
        stage: "plan",
      });

      return {
        planPolicyDecision,
        searchTrace: [
          {
            detail: {
              action: planPolicyDecision.actionName,
              bucket: planPolicyDecision.contextBucket,
              explorationScore: planPolicyDecision.explorationScore,
              policyVersion: planPolicyDecision.policyVersion,
            },
            stage: "policy-plan",
            summary: "컨텍스트 밴딧이 초반 탐색 전략을 선택했습니다.",
          },
        ],
      };
    })
    .addNode("plan", async (state) => {
      const plan = await reasoningAgent.planSearch({
        input: state.input,
        promptPlan: state.promptPlan,
        rejectedEntities: state.input.retryContext?.rejectedEntities ?? [],
        seedCandidates: state.seedCandidates,
        strategyDirective:
          state.planPolicyDecision?.directiveText ?? buildNeutralDirective("plan"),
      });
      const candidateEntities = materializeCandidates(
        plan.candidateEntities,
        state.input,
        state.seedCandidates,
      );
      const searchPrompts = mergeSearchQueries(plan.searchQueries, state.promptPlan.searchPrompts);

      return {
        candidateEntities,
        searchPlan: plan,
        searchPrompts,
        searchTrace: [
          {
            detail: {
              candidates: candidateEntities.slice(0, 3).map((candidate) => candidate.label),
              observations: plan.observations,
              searchIntent: plan.searchIntent,
              searchPrompts: searchPrompts.slice(0, 3),
            },
            stage: "plan",
            summary: "추론 에이전트가 실제 대상을 찾기 위한 검색 계획과 초기 검색어를 구성했습니다.",
          },
        ],
      };
    })
    .addNode("searchPrimary", async (state) => {
      const firstPass = await dependencies.naverSearch(
        state.searchPrompts,
        state.candidateEntities.length ? state.candidateEntities : state.seedCandidates,
      );
      const firstPassResults = firstPass.items.slice(0, 8);

      return {
        firstPassResults,
        providerMode: firstPass.mode,
        searchTrace: [
          {
            detail: {
              prompts: state.searchPrompts.slice(0, 2),
              resultCount: firstPassResults.length,
              titles: firstPassResults.slice(0, 4).map((result) => result.title),
            },
            stage: "search",
            summary: "LangGraph 1차 검색을 실행해 실제 결과 제목을 수집했습니다.",
          },
        ],
      };
    })
    .addNode("selectRefinePolicy", async (state) => {
      const context = createPolicyContext({
        input: state.input,
        results: state.firstPassResults,
        visionCandidates: dependencies.visionCandidates,
      });
      const refinePolicyDecision = await selectPolicyDecision({
        context,
        dependencies,
        stage: "refine",
      });

      return {
        refinePolicyDecision,
        searchTrace: [
          {
            detail: {
              action: refinePolicyDecision.actionName,
              bucket: refinePolicyDecision.contextBucket,
              explorationScore: refinePolicyDecision.explorationScore,
              policyVersion: refinePolicyDecision.policyVersion,
              resultCoherence: context.resultCoherence,
            },
            stage: "policy-refine",
            summary: "컨텍스트 밴딧이 1차 결과를 바탕으로 재탐색 전략을 선택했습니다.",
          },
        ],
      };
    })
    .addNode("assess", async (state) => {
      const assessment = await reasoningAgent.assessResults({
        firstPassResults: state.firstPassResults,
        input: state.input,
        previousPlan: state.searchPlan ?? {
          candidateEntities: [],
          observations: [],
          searchIntent: "",
          searchQueries: state.searchPrompts,
        },
        promptPlan: state.promptPlan,
        rejectedEntities: state.input.retryContext?.rejectedEntities ?? [],
        seedCandidates: state.candidateEntities.length ? state.candidateEntities : state.seedCandidates,
        strategyDirective:
          state.refinePolicyDecision?.directiveText ?? buildNeutralDirective("refine"),
      });
      const candidateEntities = materializeCandidates(
        assessment.candidateEntities,
        state.input,
        state.candidateEntities.length ? state.candidateEntities : state.seedCandidates,
      );
      const refinedPrompts = mergeSearchQueries(assessment.searchQueries, state.searchPrompts);
      const shouldRefine =
        assessment.outcome === "refine" &&
        normalizeSearchText(refinedPrompts[0] ?? "") !==
          normalizeSearchText(state.searchPrompts[0] ?? "");

      return {
        searchAssessment: assessment,
        candidateEntities,
        refinedPrompts,
        shouldRefine,
        searchTrace: [
          {
            detail: {
              observations: assessment.observations,
              outcome: assessment.outcome,
              refinedPrompts: refinedPrompts.slice(0, 3),
              resultFocus: assessment.resultFocus,
            },
            stage: "assess",
            summary: shouldRefine
              ? "추론 에이전트가 1차 결과를 검토한 뒤 검색어를 더 구체적으로 좁혔습니다."
              : "추론 에이전트가 1차 결과만으로도 충분히 방향이 맞는다고 판단했습니다.",
          },
        ],
      };
    })
    .addNode("searchRefined", async (state) => {
      const secondPass = await dependencies.naverSearch(
        state.refinedPrompts,
        state.candidateEntities.length ? state.candidateEntities : state.seedCandidates,
      );
      const secondPassResults = secondPass.items.slice(0, 8);

      return {
        providerMode: secondPass.mode === "live" ? "live" : state.providerMode,
        secondPassResults,
        searchTrace: [
          {
            detail: {
              prompts: state.refinedPrompts.slice(0, 2),
              resultCount: secondPassResults.length,
              titles: secondPassResults.slice(0, 4).map((result) => result.title),
            },
            stage: "refine",
            summary: "Upstage가 다듬은 검색어로 2차 검색을 수행했습니다.",
          },
        ],
      };
    })
    .addNode("select", async (state) => {
      const activePrompts = state.shouldRefine ? state.refinedPrompts : state.searchPrompts;
      const googleResults = await dependencies.googleSearch(activePrompts[0] ?? "");
      const mergedResults = dedupeResults([
        ...state.firstPassResults,
        ...state.secondPassResults,
        ...googleResults,
      ]);
      const selection = await reasoningAgent.selectBest({
        allResults: mergedResults,
        assessment: state.searchAssessment,
        input: state.input,
        plan: state.searchPlan ?? {
          candidateEntities: [],
          observations: [],
          searchIntent: "",
          searchQueries: activePrompts,
        },
        promptPlan: state.promptPlan,
        seedCandidates: state.candidateEntities.length ? state.candidateEntities : state.seedCandidates,
      });
      const candidateEntities = materializeCandidates(
        selection.candidateEntities,
        state.input,
        state.candidateEntities.length ? state.candidateEntities : state.seedCandidates,
      );
      const searchPrompts = mergeSearchQueries([selection.topQuery], activePrompts);
      const focusTokens = dedupeStrings([
        selection.topQuery,
        ...selection.resultFocus,
        ...selection.observations,
        ...candidateEntities.flatMap((candidate) => [candidate.label, candidate.query]),
      ]).slice(0, 8);
      const totalResults = rankResults(mergedResults, candidateEntities, focusTokens).slice(0, 8);
      const topQuery =
        sanitizeSearchQuery(selection.topQuery) ||
        searchPrompts[0] ||
        state.promptPlan.searchPrompts[0] ||
        "스케치 이미지 검색";

      return {
        candidateEntities,
        searchPrompts,
        searchTrace: [
          {
            detail: {
              observations: selection.observations,
              resultFocus: selection.resultFocus,
              summary: selection.summary,
              topEntity: candidateEntities[0]?.label ?? null,
              topQuery,
            },
            stage: "select",
            summary: "추론 에이전트가 가장 유력한 대상을 고르고 결과를 최종 정렬했습니다.",
          },
        ],
        topQuery,
        totalResults,
      };
    })
    .addEdge(START, "selectPlanPolicy")
    .addEdge("selectPlanPolicy", "plan")
    .addEdge("plan", "searchPrimary")
    .addEdge("searchPrimary", "selectRefinePolicy")
    .addEdge("selectRefinePolicy", "assess")
    .addConditionalEdges("assess", (state) => (state.shouldRefine ? "searchRefined" : "select"))
    .addEdge("searchRefined", "select")
    .addEdge("select", END);

  const compiledGraph = graph.compile();
  const state = await compiledGraph.invoke({
    input,
    promptPlan,
    searchPrompts: promptPlan.searchPrompts,
    seedCandidates,
  });

  const searchPrompts = state.searchPrompts.length
    ? state.searchPrompts
    : promptPlan.searchPrompts;
  const topQuery =
    state.topQuery ||
    searchPrompts[0] ||
    promptPlan.searchPrompts[0] ||
    "스케치 이미지 검색";
  const policyDecisions = [
    state.planPolicyDecision,
    state.refinePolicyDecision,
  ].filter((decision): decision is PolicyDecisionRecord => Boolean(decision));

  return {
    candidateEntities: state.candidateEntities.length ? state.candidateEntities : seedCandidates,
    engine: reasoningEngine,
    policyDecisions,
    providerMode: state.providerMode,
    searchPrompts,
    searchTrace: state.searchTrace,
    topQuery,
    totalResults: state.totalResults.length ? state.totalResults : state.firstPassResults,
  };
}
