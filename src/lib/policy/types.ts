export type PolicyFamily = "plan_policy" | "refine_policy";
export type PolicyDecisionStage = "plan" | "refine";

export type PlanPolicyAction =
  | "broad_reference"
  | "logo_symbol"
  | "service_icon"
  | "product_visual"
  | "object_reference"
  | "literal_text";

export type RefinePolicyAction =
  | "accept_first_pass"
  | "refine_by_context"
  | "refine_by_visual_tokens"
  | "refine_by_result_entity";

export type PolicyActionName = PlanPolicyAction | RefinePolicyAction | "neutral";

export type IntentSurface =
  | "logo_symbol"
  | "service_icon"
  | "product_visual"
  | "generic_object"
  | "unknown";

export type EvidenceStrength = "low" | "medium" | "high";
export type ShapeFamily = "round" | "angular" | "mixed" | "unknown";
export type ColorHintCount = "0" | "1" | "2" | "3_plus";
export type ResultCoherence = "none" | "noisy" | "mixed" | "coherent";
export type PolicySnapshotStatus = "draft" | "approved";
export type SessionOutcomeLabel = "match" | "miss" | "weak_positive" | "neutral";

export type SearchPolicyContext = {
  aspectBucket: "wide" | "tall" | "square" | "unknown";
  colorHintCount: ColorHintCount;
  colorTokens: string[];
  evidenceStrength: EvidenceStrength;
  hasDrawing: boolean;
  hasExplicitName: boolean;
  hasTextHint: boolean;
  intentSurface: IntentSurface;
  resultCoherence: ResultCoherence;
  resultEntityRepeatCount: number;
  shapeFamily: ShapeFamily;
  visionLabelCount: number;
};

export type PosteriorParams = {
  alpha: number;
  beta: number;
};

export type PolicySnapshotParameters<TAction extends string = string> = {
  bucketPriors: Record<string, Partial<Record<TAction, PosteriorParams>>>;
  defaultPriors: Record<TAction, PosteriorParams>;
};

export type PolicySnapshot<TAction extends string = string> = {
  createdAt: Date;
  id: string;
  offlineMetrics: Record<string, number | string | boolean | null>;
  parameters: PolicySnapshotParameters<TAction>;
  policyFamily: PolicyFamily;
  status: PolicySnapshotStatus;
  trainingWindowEnd: Date;
  trainingWindowStart: Date;
  version: string;
};

export type PolicyDecisionRecord = {
  actionName: PolicyActionName;
  contextBucket: string;
  contextFeatures: SearchPolicyContext;
  createdAt: Date;
  directiveText: string;
  explorationScore: number;
  id: string;
  policyFamily: PolicyFamily;
  policyVersion: string;
  sessionId: string;
  stage: PolicyDecisionStage;
};

export type RewardBreakdown = {
  candidateClicks: number;
  cappedClickReward: number;
  explicitFeedback: "match" | "miss" | null;
  feedbackReward: number;
  handoffClicks: number;
  handoffReward: number;
  lowerRankClicks: number;
  resultClickReward: number;
  topRankClicks: number;
  totalReward: number;
  uncappedClickReward: number;
  windowMinutes: number;
};

export type PolicyRewardRecord = {
  finalizedAt: Date;
  id: string;
  outcomeLabel: SessionOutcomeLabel;
  rewardBreakdown: RewardBreakdown;
  rewardValue: number;
  sessionId: string;
};

export type PolicySelectionResult<TAction extends PolicyActionName = PolicyActionName> = {
  actionName: TAction;
  contextBucket: string;
  directiveText: string;
  explorationScore: number;
  policyVersion: string;
};

export type CompletedPolicyTrainingSample = {
  decision: PolicyDecisionRecord;
  reward: PolicyRewardRecord;
};

export type PolicySnapshotStore = {
  getActiveSnapshot: <TAction extends string = string>(
    policyFamily: PolicyFamily,
  ) => Promise<PolicySnapshot<TAction>>;
};

export type SearchPolicyEngine = {
  selectPlanPolicy: (input: {
    context: SearchPolicyContext;
    sessionId: string;
  }) => Promise<PolicySelectionResult<PlanPolicyAction | "neutral">>;
  selectRefinePolicy: (input: {
    context: SearchPolicyContext;
    sessionId: string;
  }) => Promise<PolicySelectionResult<RefinePolicyAction | "neutral">>;
};
