import type {
  SearchAgentDependencies,
  SearchAgentResult,
} from "./agent-types";
import { runRuleBasedSearchAgent } from "./rule-agent";
import type {
  EntityCandidate,
  SearchInput,
} from "./types";
import { runLangGraphSearchAgent } from "./upstage-agent";

export type {
  SearchAgentDependencies,
  SearchAgentResult,
  SearchAgentTrace,
  SearchReasoningAgent,
} from "./agent-types";

export async function runSearchAgent(
  input: SearchInput,
  seedCandidates: EntityCandidate[],
  dependencies: SearchAgentDependencies,
): Promise<SearchAgentResult> {
  try {
    return await runLangGraphSearchAgent(input, seedCandidates, dependencies);
  } catch (error) {
    const fallbackResult = await runRuleBasedSearchAgent(input, seedCandidates, dependencies);

    fallbackResult.searchTrace.unshift({
      detail: {
        error:
          error instanceof Error
            ? error.message
            : "Unknown LangGraph agent error",
      },
      stage: "fallback",
      summary: "Upstage LangGraph 에이전트가 준비되지 않았거나 실패해 규칙 기반 검색으로 전환했습니다.",
    });

    return fallbackResult;
  }
}
