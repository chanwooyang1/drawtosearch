import { describe, expect, it } from "vitest";

import { trainPolicySnapshot } from "./trainer";

describe("policy trainer", () => {
  it("updates posterior parameters from positive and negative rewards", () => {
    const snapshot = trainPolicySnapshot({
      now: new Date("2026-03-14T09:00:00.000Z"),
      policyFamily: "plan_policy",
      samples: [
        {
          decision: {
            actionName: "service_icon",
            contextBucket: "service_icon|high|round|2|unnamed",
            contextFeatures: {
              aspectBucket: "square",
              colorHintCount: "2",
              colorTokens: ["blue", "white"],
              evidenceStrength: "high",
              hasDrawing: true,
              hasExplicitName: false,
              hasTextHint: true,
              intentSurface: "service_icon",
              resultCoherence: "mixed",
              resultEntityRepeatCount: 2,
              shapeFamily: "round",
              visionLabelCount: 1,
            },
            createdAt: new Date("2026-03-13T23:00:00.000Z"),
            directiveText: "Prioritize service icons.",
            explorationScore: 0.8,
            id: "decision-1",
            policyFamily: "plan_policy",
            policyVersion: "plan-v1",
            sessionId: "aaaa",
            stage: "plan",
          },
          reward: {
            finalizedAt: new Date("2026-03-14T00:00:00.000Z"),
            id: "reward-1",
            outcomeLabel: "match",
            rewardBreakdown: {
              candidateClicks: 0,
              cappedClickReward: 0.15,
              explicitFeedback: "match",
              feedbackReward: 1,
              handoffClicks: 0,
              handoffReward: 0,
              lowerRankClicks: 0,
              resultClickReward: 0.15,
              topRankClicks: 1,
              totalReward: 1.15,
              uncappedClickReward: 0.15,
              windowMinutes: 30,
            },
            rewardValue: 1.15,
            sessionId: "aaaa",
          },
        },
        {
          decision: {
            actionName: "literal_text",
            contextBucket: "service_icon|high|round|2|unnamed",
            contextFeatures: {
              aspectBucket: "square",
              colorHintCount: "2",
              colorTokens: ["blue", "white"],
              evidenceStrength: "high",
              hasDrawing: true,
              hasExplicitName: false,
              hasTextHint: true,
              intentSurface: "service_icon",
              resultCoherence: "mixed",
              resultEntityRepeatCount: 2,
              shapeFamily: "round",
              visionLabelCount: 1,
            },
            createdAt: new Date("2026-03-13T23:10:00.000Z"),
            directiveText: "Stay literal.",
            explorationScore: 0.2,
            id: "decision-2",
            policyFamily: "plan_policy",
            policyVersion: "plan-v1",
            sessionId: "bbbb",
            stage: "plan",
          },
          reward: {
            finalizedAt: new Date("2026-03-14T00:10:00.000Z"),
            id: "reward-2",
            outcomeLabel: "miss",
            rewardBreakdown: {
              candidateClicks: 0,
              cappedClickReward: 0,
              explicitFeedback: "miss",
              feedbackReward: -1,
              handoffClicks: 0,
              handoffReward: 0,
              lowerRankClicks: 0,
              resultClickReward: 0,
              topRankClicks: 0,
              totalReward: -1,
              uncappedClickReward: 0,
              windowMinutes: 30,
            },
            rewardValue: -1,
            sessionId: "bbbb",
          },
        },
      ],
    });

    expect(snapshot.status).toBe("draft");
    expect(snapshot.offlineMetrics.sampleCount).toBe(2);
    expect(
      snapshot.parameters.bucketPriors["service_icon|high|round|2|unnamed"]?.service_icon,
    ).toMatchObject({
      alpha: 2,
      beta: 1,
    });
    expect(
      snapshot.parameters.bucketPriors["service_icon|high|round|2|unnamed"]?.literal_text,
    ).toMatchObject({
      alpha: 1,
      beta: 2,
    });
  });
});

